import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * A sealed note that an address just proved itself through Google,
 * Microsoft or LinkedIn, and was then refused because its company signs
 * in through its own directory only (founder, 2026-11-12, the sign-in
 * flow: "A company on its own directory is always sent there, whichever
 * button its people press").
 *
 * The sign-in callback puts it in a short-lived httpOnly cookie read only
 * by POST /api/auth/doors (`DOOR_PROOF_COOKIE`), never on the address: a
 * proof on the address sat in server and CDN logs, the Referer and the
 * browser history for ten minutes (review, 2026-11-13). The sign-in page
 * asks the doors route once, which opens it, deletes the cookie in the
 * same answer and remembers it as used on that instance (best effort; see
 * `takeDoorProof`), and answers with that company's
 * directory. It is sealed with the deployment's own secret (AES-256-GCM,
 * node:crypto, no new dependency), so the address is never readable in
 * the address bar or a log, nobody can mint one for an address that did
 * not prove itself, and it is good for ten minutes. Where the deployment
 * has no secret no proof is made, and the page says the plain sentence.
 */

export const DOOR_PROOF_MINUTES = 10

function keyOf(secret: string): Buffer {
  return createHash('sha256').update(`etyme-door-proof:${secret}`).digest()
}

function secretNow(): string | null {
  const s = process.env.NEXTAUTH_SECRET
  return s && s.length > 0 ? s : null
}

/** Seal an address that just proved itself. Null where the deployment has no secret. */
export function sealDoorProof(email: string, now = Date.now(), secret = secretNow()): string | null {
  if (!secret) return null
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv)
  const body = Buffer.concat([c.update(JSON.stringify({ e: email.trim().toLowerCase(), x: now + DOOR_PROOF_MINUTES * 60_000 }), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url')
}

/** The address a proof was sealed for, or null for one that is forged, altered or out of date. Never throws. */
export function openDoorProof(token: unknown, now = Date.now(), secret = secretNow()): string | null {
  if (!secret || typeof token !== 'string' || token.length < 40 || token.length > 1000) return null
  try {
    const raw = Buffer.from(token, 'base64url')
    const d = createDecipheriv('aes-256-gcm', keyOf(secret), raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    const v = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'))
    if (typeof v?.e !== 'string' || typeof v?.x !== 'number' || v.x < now) return null
    return v.e
  } catch {
    return null
  }
}

/** The cookie the proof travels in: httpOnly, sent only to the doors route. */
export const DOOR_PROOF_COOKIE = 'etyme_door_proof'

/** Where the cookie is read, and nowhere else. */
export const DOOR_PROOF_PATH = '/api/auth/doors'

/** The cookie's settings, set by the sign-in callback and cleared by the doors route. */
export function doorProofCookie(value: string, maxAgeSeconds = DOOR_PROOF_MINUTES * 60) {
  return {
    name: DOOR_PROOF_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: DOOR_PROOF_PATH,
    maxAge: maxAgeSeconds,
  }
}

const used = new Map<string, number>()

/**
 * Open a proof once, as far as one server instance can tell. The record
 * of proofs already used is held in this instance's memory, so on a host
 * running many instances a second presentation that lands on another
 * instance is opened again: single use is best effort, not a guarantee.
 * What bounds it is the rest: the cookie is httpOnly, deleted by the
 * first answer, sealed to one address and good for ten minutes, so a
 * browser never sends it twice. Never throws.
 */
export function takeDoorProof(token: unknown, now = Date.now(), secret = secretNow()): string | null {
  const email = openDoorProof(token, now, secret)
  if (!email || typeof token !== 'string') return null
  for (const [t, until] of used) if (until < now) used.delete(t)
  if (used.has(token)) return null
  used.set(token, now + DOOR_PROOF_MINUTES * 60_000)
  return email
}
