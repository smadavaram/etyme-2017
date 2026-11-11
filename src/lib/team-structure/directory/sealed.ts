import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * The directory's two secrets, kept with node's own crypto and nothing else.
 *
 * 1. A company's refresh token is sealed before it is written (AES-256-GCM,
 *    a fresh nonce per seal) with a key that lives only in the deployment's
 *    environment. The database holds "v1.<iv>.<tag>.<ciphertext>" and never
 *    the token. With no key, or a key that is not 32 bytes, nothing is
 *    sealed and the connection refuses in a sentence: a token we cannot
 *    lock is a token we do not keep.
 * 2. The `state` handed to Google is signed with a key derived from the
 *    same secret and bound to the seat and the company that asked, with a
 *    ten-minute life, so a consent finished in somebody else's browser, at
 *    another company, or an hour later is refused.
 *
 * Nothing here logs, and nothing here returns the token to a caller other
 * than the route that reads the directory with it.
 */

export const TOKEN_KEY_ENV = 'ETYME_DIRECTORY_TOKEN_KEY'

type Env = Record<string, string | undefined>

/** The 32-byte key, read as base64 (or 64 hex characters); null when it is missing or the wrong length. */
export function sealingKey(env: Env = process.env): Buffer | null {
  const raw = String(env[TOKEN_KEY_ENV] ?? '').trim()
  if (!raw) return null
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return key.length === 32 ? key : null
}

const b64u = (b: Buffer) => b.toString('base64url')

/** Seal a secret for the database. Throws where there is no key; callers check `sealingKey` first. */
export function seal(plain: string, env: Env = process.env): string {
  const key = sealingKey(env)
  if (!key) throw new Error('There is no key to lock the directory access with.')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', b64u(iv), b64u(c.getAuthTag()), b64u(body)].join('.')
}

/** Open a sealed secret; null where the key is gone or changed, or the value was tampered with. */
export function unseal(sealed: string, env: Env = process.env): string | null {
  const key = sealingKey(env)
  const parts = String(sealed ?? '').split('.')
  if (!key || parts.length !== 4 || parts[0] !== 'v1') return null
  // Only the exact text `seal` wrote opens: base64url's last character
  // carries spare bits a lenient decoder ignores, so a value with one of
  // them changed would otherwise open as if untouched.
  const [iv, tag, body] = parts.slice(1).map((p) => Buffer.from(p, 'base64url'))
  if (b64u(iv) !== parts[1] || b64u(tag) !== parts[2] || b64u(body) !== parts[3]) return null
  if (iv.length !== 12 || tag.length !== 16) return null
  try {
    const d = createDecipheriv('aes-256-gcm', key, iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(body), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ── The signed state ─────────────────────────────────────────────────

export interface ConsentState {
  /** The company the consent is for. */
  companyId: string
  /** The person who pressed Connect. */
  personId: string
  /** The verified domain to connect. */
  domain: string
  /** Seconds since the epoch after which the state is refused. */
  exp: number
  nonce: string
}

export const STATE_LIFE_SECONDS = 10 * 60

function stateKey(env: Env): Buffer | null {
  const key = sealingKey(env)
  return key ? createHmac('sha256', key).update('etyme directory consent state v1').digest() : null
}

export function signState(s: Omit<ConsentState, 'exp' | 'nonce'>, now = Date.now(), env: Env = process.env): string {
  const key = stateKey(env)
  if (!key) throw new Error('There is no key to sign the consent with.')
  const payload: ConsentState = { ...s, exp: Math.floor(now / 1000) + STATE_LIFE_SECONDS, nonce: b64u(randomBytes(12)) }
  const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${body}.${b64u(createHmac('sha256', key).update(body).digest())}`
}

/** The state Google sent back, if this deployment signed it and it is still in date; null otherwise. */
export function readState(state: string, now = Date.now(), env: Env = process.env): ConsentState | null {
  const key = stateKey(env)
  const [body, mac, extra] = String(state ?? '').split('.')
  if (!key || !body || !mac || extra !== undefined) return null
  const want = createHmac('sha256', key).update(body).digest()
  const got = Buffer.from(mac, 'base64url')
  if (b64u(got) !== mac || got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ConsentState
    if (typeof s.companyId !== 'string' || typeof s.personId !== 'string' || typeof s.domain !== 'string' || typeof s.exp !== 'number') return null
    if (s.exp * 1000 < now) return null
    return s
  } catch {
    return null
  }
}
