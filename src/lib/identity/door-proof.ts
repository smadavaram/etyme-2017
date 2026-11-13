import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * A sealed note that an address just proved itself through Google,
 * Microsoft or LinkedIn, and was then refused because its company signs
 * in through its own directory only (founder, 2026-11-12, the sign-in
 * flow: "A company on its own directory is always sent there, whichever
 * button its people press").
 *
 * The sign-in callback puts it on the refusal's address
 * (`/login?error=DirectoryOnly&proof=…`), and the sign-in page hands it to
 * POST /api/auth/doors, which opens it and answers with that company's
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
