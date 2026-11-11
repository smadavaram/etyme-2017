import {
  createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, timingSafeEqual,
  verify as cryptoVerify, type KeyObject,
} from 'node:crypto'

/**
 * OpenID Connect, the parts a company's own directory needs, with node's
 * own crypto and nothing else (founder, 2026-11-11, "Enterprise identity").
 *
 * Pure: no database and no network. lib/identity/directory fetches the
 * discovery document and the keys and passes them in, so every refusal
 * here is a sentence in a test.
 *
 * ── What an id token must prove before anybody is seated ─────────────
 *
 *  1. It is signed, by a key the directory publishes, with an algorithm we
 *     accept. "none" and shared-secret HMAC are refused: an HMAC keyed on
 *     the client secret proves only that somebody held the secret.
 *  2. The issuer is exactly the directory's.
 *  3. The audience is Etyme's client id at that directory, and where the
 *     token names several audiences, it was issued to Etyme (azp).
 *  4. It is in date, a minute's clock difference allowed.
 *  5. Its nonce is the one this browser was sent with, so a token minted
 *     for another sign-in is refused.
 *
 * The email in it is shown, never trusted as who the person is: the
 * person is the issuer and the subject (lib/identity/directory).
 */

export const ALLOWED_ALGS = ['RS256', 'ES256', 'EdDSA'] as const
export type Alg = (typeof ALLOWED_ALGS)[number]

/** One key from a directory's published set. */
export interface Jwk {
  kty: string
  kid?: string
  alg?: string
  use?: string
  n?: string
  e?: string
  crv?: string
  x?: string
  y?: string
}

export interface Jwks { keys: Jwk[] }

/** The fields of a discovery document this build reads. */
export interface Discovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  token_endpoint_auth_methods_supported?: string[]
}

export const CLOCK_SKEW_SECONDS = 60

const b64u = (b: Buffer) => b.toString('base64url')

function json(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A compact token read into its parts, or null where it is not three base64url parts of JSON. */
export function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signingInput: Buffer; signature: Buffer } | null {
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]*$/.test(p))) return null
  const header = json(parts[0])
  const payload = json(parts[1])
  if (!header || !payload) return null
  return { header, payload, signingInput: Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii'), signature: Buffer.from(parts[2], 'base64url') }
}

function keyFor(alg: Alg, jwk: Jwk): KeyObject | null {
  const fits = (alg === 'RS256' && jwk.kty === 'RSA') || (alg === 'ES256' && jwk.kty === 'EC' && jwk.crv === 'P-256') || (alg === 'EdDSA' && jwk.kty === 'OKP' && jwk.crv === 'Ed25519')
  if (!fits) return null
  if (jwk.alg && jwk.alg !== alg) return null
  if (jwk.use && jwk.use !== 'sig') return null
  try {
    // Only the public members, so a published private key can never be imported.
    const { kty, n, e, crv, x, y } = jwk
    return createPublicKey({ key: { kty, n, e, crv, x, y } as any, format: 'jwk' })
  } catch {
    return null
  }
}

/** Whether a signature over the input checks against the key, for the algorithm named. */
export function signatureChecks(alg: Alg, key: KeyObject, input: Buffer, signature: Buffer): boolean {
  try {
    if (alg === 'RS256') return cryptoVerify('sha256', input, key, signature)
    if (alg === 'ES256') return cryptoVerify('sha256', input, { key, dsaEncoding: 'ieee-p1363' }, signature)
    return cryptoVerify(null, input, key, signature)
  } catch {
    return false
  }
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export type TokenVerdict =
  | { ok: true; claims: Record<string, unknown> }
  | { ok: false; code: string; says: string }

const no = (code: string, says: string): TokenVerdict => ({ ok: false, code, says })

/**
 * Verify an id token: signature, issuer, audience, dates and nonce. The
 * first failure wins and says what was wrong in a sentence; none of them
 * names a key or echoes the token.
 */
export function verifyIdToken(a: {
  token: string
  jwks: Jwks
  issuer: string
  audience: string
  nonce: string
  now?: number
}): TokenVerdict {
  const now = Math.floor((a.now ?? Date.now()) / 1000)
  const t = decodeJwt(a.token)
  if (!t) return no('MALFORMED', 'Your company\'s directory sent back something that is not a sign-in token.')
  const alg = String(t.header.alg ?? '')
  if (!(ALLOWED_ALGS as readonly string[]).includes(alg)) {
    return no('ALG', `Your company's directory signed the token with ${alg || 'no algorithm'}, which Etyme does not accept. Ask your IT to use RS256, ES256 or EdDSA.`)
  }
  const kid = typeof t.header.kid === 'string' ? t.header.kid : null
  const candidates = (a.jwks?.keys ?? []).filter((k) => (kid ? k.kid === kid : true))
  const keys = candidates.map((k) => keyFor(alg as Alg, k)).filter((k): k is KeyObject => k !== null)
  if (keys.length === 0) return no('KEY', 'Your company\'s directory signed the token with a key it does not publish.')
  if (!keys.some((k) => signatureChecks(alg as Alg, k, t.signingInput, t.signature))) {
    return no('SIGNATURE', 'The sign-in token\'s signature does not check against your company\'s directory.')
  }
  const c = t.payload
  if (typeof c.iss !== 'string' || c.iss !== a.issuer) return no('ISSUER', 'The sign-in token was issued by a different directory.')
  const aud = Array.isArray(c.aud) ? c.aud.map(String) : typeof c.aud === 'string' ? [c.aud] : []
  if (!aud.includes(a.audience)) return no('AUDIENCE', 'The sign-in token was issued for a different application.')
  if (aud.length > 1 && c.azp !== a.audience) return no('AUDIENCE', 'The sign-in token names several applications and was not issued to Etyme.')
  if (typeof c.exp !== 'number') return no('EXPIRY', 'The sign-in token has no expiry, so Etyme does not accept it.')
  if (c.exp + CLOCK_SKEW_SECONDS < now) return no('EXPIRED', 'The sign-in token has run out. Sign in again.')
  if (typeof c.iat === 'number' && c.iat - CLOCK_SKEW_SECONDS > now) return no('EARLY', 'The sign-in token is dated in the future. Check the directory\'s clock.')
  if (typeof c.nbf === 'number' && c.nbf - CLOCK_SKEW_SECONDS > now) return no('EARLY', 'The sign-in token is not valid yet.')
  if (typeof c.nonce !== 'string' || !a.nonce || !same(c.nonce, a.nonce)) return no('NONCE', 'The sign-in token was made for a different sign-in. Start again.')
  if (typeof c.sub !== 'string' || !c.sub) return no('SUBJECT', 'The sign-in token does not say who you are.')
  return { ok: true, claims: c }
}

/** Who the token says the person is, by the claim names the company set (standard names by default). */
export function claimsOf(claims: Record<string, unknown>, names: { subjectClaim?: string | null; emailClaim?: string | null; groupsClaim?: string | null }): {
  subject: string | null
  email: string | null
  name: string | null
  groups: string[]
} {
  const pick = (k: string | null | undefined, fallback: string) => claims[(k && k.trim()) || fallback]
  const subject = pick(names.subjectClaim, 'sub')
  const email = pick(names.emailClaim, 'email') ?? claims.preferred_username ?? claims.upn
  const groups = pick(names.groupsClaim, 'groups')
  const name = claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(' ')
  return {
    subject: typeof subject === 'string' && subject ? subject : null,
    email: typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null,
    name: typeof name === 'string' && name.trim() ? name.trim() : null,
    groups: Array.isArray(groups) ? groups.map(String).filter(Boolean) : [],
  }
}

// ── PKCE, state and nonce ─────────────────────────────────────────────

export function randomToken(bytes = 32): string {
  return b64u(randomBytes(bytes))
}

export function pkceChallenge(verifier: string): string {
  return b64u(createHash('sha256').update(verifier, 'ascii').digest())
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomToken(48)
  return { verifier, challenge: pkceChallenge(verifier) }
}

/** Whether two random strings are equal, in constant time. */
export function sameToken(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return same(a, b)
}

// ── Sealed blobs: the browser holds them, only this deployment reads them ─

function blobKey(label: string, secret: string): Buffer {
  return createHash('sha256').update(`etyme identity ${label} v1\u0000${secret}`).digest()
}

/** The deployment's own secret, or null where none is set (then nothing is sealed and the door refuses). */
export function deploymentSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = String(env.NEXTAUTH_SECRET ?? '').trim()
  return s.length >= 16 ? s : null
}

/** Seal a small object with AES-256-GCM, for a cookie or a code. It carries its own expiry. */
export function sealBlob(value: Record<string, unknown>, label: string, lifeSeconds: number, secret: string, now = Date.now()): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', blobKey(label, secret), iv)
  const body = Buffer.concat([c.update(JSON.stringify({ ...value, exp: Math.floor(now / 1000) + lifeSeconds }), 'utf8'), c.final()])
  return ['s1', b64u(iv), b64u(c.getAuthTag()), b64u(body)].join('.')
}

/** Open a sealed blob; null where it was sealed for another label, tampered with, or is out of date. */
export function openBlob<T extends Record<string, unknown>>(sealed: string | null | undefined, label: string, secret: string, now = Date.now()): (T & { exp: number }) | null {
  const parts = String(sealed ?? '').split('.')
  if (parts.length !== 4 || parts[0] !== 's1') return null
  try {
    const d = createDecipheriv('aes-256-gcm', blobKey(label, secret), Buffer.from(parts[1], 'base64url'))
    d.setAuthTag(Buffer.from(parts[2], 'base64url'))
    const v = JSON.parse(Buffer.concat([d.update(Buffer.from(parts[3], 'base64url')), d.final()]).toString('utf8'))
    if (!v || typeof v.exp !== 'number' || v.exp * 1000 < now) return null
    return v
  } catch {
    return null
  }
}

// ── Where Etyme will send a browser, or fetch from ────────────────────

/**
 * Whether an address may be fetched or sent to: https always; http only to
 * this machine outside production. Never a literal private or link-local
 * address, never a username in the address. Host names are not resolved
 * (KNOWN-LIMITS, "Identity, pass 1, stage B").
 */
export function safeOutboundUrl(raw: string | null | undefined, env: Record<string, string | undefined> = process.env): URL | null {
  let u: URL
  try {
    u = new URL(String(raw ?? ''))
  } catch {
    return null
  }
  if (u.username || u.password) return null
  const host = u.hostname.toLowerCase()
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  if (u.protocol === 'http:') return local && env.NODE_ENV !== 'production' ? u : null
  if (u.protocol !== 'https:') return null
  if (local) return env.NODE_ENV !== 'production' ? u : null
  if (/^(10\.|127\.|169\.254\.|192\.168\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null
  if (host.startsWith('[')) return null
  return u
}

/** What is wrong with a discovery document for this issuer, or null where it can be used. */
export function discoveryProblem(doc: unknown, issuer: string, env: Record<string, string | undefined> = process.env): string | null {
  const d = doc as Partial<Discovery> | null
  if (!d || typeof d !== 'object') return 'The directory\'s discovery address did not answer with a discovery document.'
  if (d.issuer !== issuer) return `The directory says its issuer is ${String(d.issuer ?? 'nothing')}, not ${issuer}. Check the issuer you entered.`
  for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (!safeOutboundUrl(d[k], env)) return `The directory's ${k.replace(/_/g, ' ')} is missing or not an https address.`
  }
  return null
}
