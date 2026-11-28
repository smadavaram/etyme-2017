import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * The authenticator app's six-digit code, on node's own crypto (RFC 6238
 * over RFC 4226): SHA-1, a 30-second step, six digits. These are the
 * settings every authenticator app reads from an `otpauth://` link, so
 * nothing else is offered.
 *
 * Pure. No database, no clock of its own: the caller hands in `now`.
 * The one rule this file keeps that the RFC does not: a step already used
 * is never accepted again (`lastUsedStep`), so a code read over a
 * shoulder is worth nothing once its owner has typed it.
 */

export const STEP_SECONDS = 30
export const DIGITS = 6
/** One step either side of now, for a phone clock a little off. Never more. */
export const DRIFT_STEPS = 1

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Base32 (RFC 4648), no padding: how every authenticator app takes a key. */
export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** Base32 back to bytes; spaces, dashes and case are ignored. Null for a letter base32 has no place for. */
export function base32Decode(text: string): Buffer | null {
  const clean = String(text ?? '').toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch)
    if (i < 0) return null
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new key: 20 random bytes, as base32 (RFC 4226's recommended length). */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** The 30-second step a moment falls in. */
export function stepAt(now: Date): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS)
}

/** The code for one step (RFC 4226's HOTP over the step number). */
export function codeAt(secret: Buffer, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', secret).update(counter).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export type TotpVerdict = { ok: true; step: number } | { ok: false; why: 'SHAPE' | 'WRONG' | 'USED' }

/**
 * Does this code match a step within one of now, newer than the last step
 * accepted? `USED` where it matches a step already spent: the same code,
 * or an older one, typed again. Compared in constant time.
 */
export function checkTotp(input: { secret: Buffer; code: unknown; now: Date; lastUsedStep: number | null }): TotpVerdict {
  const code = typeof input.code === 'string' ? input.code.replace(/\s/g, '') : ''
  if (!/^\d{6}$/.test(code)) return { ok: false, why: 'SHAPE' }
  const here = stepAt(input.now)
  let used = false
  for (let d = -DRIFT_STEPS; d <= DRIFT_STEPS; d++) {
    const step = here + d
    const want = Buffer.from(codeAt(input.secret, step))
    if (!timingSafeEqual(want, Buffer.from(code))) continue
    if (input.lastUsedStep !== null && step <= input.lastUsedStep) {
      used = true
      continue
    }
    return { ok: true, step }
  }
  return { ok: false, why: used ? 'USED' : 'WRONG' }
}

/**
 * The link an authenticator app reads: the issuer, the account's label,
 * and the key. Shown once, on the screen that adds the app, and never
 * stored, logged or sent anywhere else.
 */
export function otpauthUri(secretBase32: string, account: string, issuer = 'Etyme'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const q = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) })
  return `otpauth://totp/${label}?${q.toString()}`
}
