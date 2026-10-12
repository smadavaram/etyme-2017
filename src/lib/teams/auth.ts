/**
 * Is this post really from Microsoft Teams, for our bot?
 *
 * Every activity the Bot Framework sends carries a signed token in its
 * Authorization header. This checks it the way the Bot Framework SDK's
 * own channel validation does, written against the protocol directly so
 * the app takes no new runtime dependency (package.json is shared and
 * changes through the architect):
 *
 *   - the signing key is one the Bot Framework publishes
 *     (login.botframework.com), and the key is endorsed for this channel
 *   - the issuer is the Bot Framework
 *   - the audience is our own app id — a token minted for somebody
 *     else's bot is not ours to accept
 *   - it has not expired and is not from the future, five minutes either way
 *   - the serviceUrl inside the token is the one the activity says to
 *     reply to, so a replayed token cannot point our reply elsewhere
 *
 * Nothing in the body is read before this says yes. The checking is
 * pure (`checkToken`) and the key fetch is separate, so the rule can be
 * read without a network.
 */

import { createPublicKey, verify as verifySignature } from 'node:crypto'
import type { TeamsBotConfig } from '@/lib/teams/config'

export const BOT_FRAMEWORK_OPENID = 'https://login.botframework.com/v1/.well-known/openidconfiguration'
export const BOT_FRAMEWORK_ISSUER = 'https://api.botframework.com'
const SKEW_SECONDS = 5 * 60

export interface SigningKey {
  kid: string
  kty: string
  n: string
  e: string
  endorsements?: string[]
}

export interface TokenClaims {
  iss?: string
  aud?: string
  exp?: number
  nbf?: number
  serviceurl?: string
  serviceUrl?: string
  [k: string]: unknown
}

export type TokenVerdict =
  | { ok: true; claims: TokenClaims }
  | { ok: false; says: string }

const NOT_TEAMS = 'This request did not come from Microsoft Teams for this bot, so nothing in it was read.'

function part(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

/**
 * The check itself, given the published keys. Pure: no clock but the one
 * passed, no network.
 */
export function checkToken(
  authorization: string | null | undefined,
  keys: readonly SigningKey[],
  expect: { appId: string; serviceUrl: string | null | undefined; channelId: string | null | undefined; now: Date },
): TokenVerdict {
  const m = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization?.trim() ?? '')
  if (!m) return { ok: false, says: NOT_TEAMS }
  let header: { alg?: string; kid?: string }
  let claims: TokenClaims
  try {
    header = JSON.parse(part(m[1]).toString('utf8'))
    claims = JSON.parse(part(m[2]).toString('utf8'))
  } catch {
    return { ok: false, says: NOT_TEAMS }
  }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, says: NOT_TEAMS }
  const key = keys.find((k) => k.kid === header.kid && k.kty === 'RSA')
  if (!key) return { ok: false, says: NOT_TEAMS }
  // A key the Bot Framework has not endorsed for this channel may not
  // speak for it.
  if (expect.channelId && key.endorsements && !key.endorsements.includes(expect.channelId)) {
    return { ok: false, says: NOT_TEAMS }
  }
  let good = false
  try {
    const pub = createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' })
    good = verifySignature('RSA-SHA256', Buffer.from(`${m[1]}.${m[2]}`), pub, part(m[3]))
  } catch {
    good = false
  }
  if (!good) return { ok: false, says: NOT_TEAMS }
  if (claims.iss !== BOT_FRAMEWORK_ISSUER) return { ok: false, says: NOT_TEAMS }
  if (claims.aud !== expect.appId) return { ok: false, says: NOT_TEAMS }
  const now = Math.floor(expect.now.getTime() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS < now) {
    return { ok: false, says: 'This request from Teams carried an expired token, so nothing in it was read.' }
  }
  if (typeof claims.nbf === 'number' && claims.nbf - SKEW_SECONDS > now) return { ok: false, says: NOT_TEAMS }
  const claimed = claims.serviceurl ?? claims.serviceUrl
  if (!expect.serviceUrl || !claimed || stripSlash(claimed) !== stripSlash(expect.serviceUrl)) {
    return { ok: false, says: NOT_TEAMS }
  }
  return { ok: true, claims }
}

function stripSlash(u: string): string {
  return u.trim().replace(/\/+$/, '').toLowerCase()
}

// ── The published keys, cached for a day ─────────────────────────────

let cached: { at: number; keys: SigningKey[] } | null = null
const DAY = 24 * 60 * 60 * 1000

export async function botFrameworkKeys(fetcher: typeof fetch = fetch): Promise<SigningKey[]> {
  if (cached && Date.now() - cached.at < DAY) return cached.keys
  const meta = await fetcher(BOT_FRAMEWORK_OPENID).then((r) => r.json() as Promise<{ jwks_uri?: string }>)
  if (!meta.jwks_uri || !/^https:\/\/login\.botframework\.com\//.test(meta.jwks_uri)) {
    throw new Error('The Bot Framework did not publish its signing keys where expected.')
  }
  const set = await fetcher(meta.jwks_uri).then((r) => r.json() as Promise<{ keys?: SigningKey[] }>)
  const keys = (set.keys ?? []).filter((k) => k && typeof k.kid === 'string')
  cached = { at: Date.now(), keys }
  return keys
}

/** Check a post against the published keys. Never throws. */
export async function verifyFromTeams(args: {
  authorization: string | null
  serviceUrl: string | null | undefined
  channelId: string | null | undefined
  config: TeamsBotConfig
  now?: Date
  keys?: () => Promise<SigningKey[]>
}): Promise<TokenVerdict> {
  let keys: SigningKey[]
  try {
    keys = await (args.keys ?? (() => botFrameworkKeys()))()
  } catch {
    return { ok: false, says: 'The Bot Framework’s signing keys could not be read, so this request could not be checked and was not read. Teams will send it again.' }
  }
  return checkToken(args.authorization, keys, {
    appId: args.config.appId,
    serviceUrl: args.serviceUrl,
    channelId: args.channelId,
    now: args.now ?? new Date(),
  })
}
