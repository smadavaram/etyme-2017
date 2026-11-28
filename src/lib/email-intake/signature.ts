/**
 * Whether a delivery was signed by the mail provider, recently, over
 * exactly these bytes. Nothing in a delivery is read until this says yes.
 *
 * Resend signs its webhooks the Svix way: an id, a unix timestamp and one
 * or more "v1,<base64>" signatures, HMAC-SHA256 over
 * "<id>.<timestamp>.<raw body>" under the endpoint's signing secret
 * ("whsec_" then base64). Written here in a few lines rather than taken as
 * a dependency. The secret is this endpoint's own
 * (`RESEND_EMAIL_INTAKE_SECRET`), never shared with the reply webhook.
 *
 * No secret configured refuses everything: an unset check that waves
 * deliveries through is the hole this closes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const INTAKE_SECRET_ENV = 'RESEND_EMAIL_INTAKE_SECRET'

/** Older or newer than this is a replay, refused. */
export const TOLERANCE_SECONDS = 5 * 60

export interface SignedDelivery {
  secret: string | null | undefined
  id: string | null
  timestamp: string | null
  signature: string | null
  /** The body exactly as it arrived, before any parsing. */
  body: string
  now: Date
}

export type SignatureVerdict =
  | { ok: true }
  | { ok: false; status: 503 | 401; code: 'NOT_SET_UP' | 'UNSIGNED' | 'STALE' | 'BAD_SIGNATURE'; says: string }

function keyOf(secret: string): Buffer {
  return Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
}

/** The signature the provider would send for this body. Exported for tests that sign a delivery. */
export function signDelivery(secret: string, id: string, timestamp: string, body: string): string {
  return 'v1,' + createHmac('sha256', keyOf(secret)).update(`${id}.${timestamp}.${body}`).digest('base64')
}

export function verifyDelivery(d: SignedDelivery): SignatureVerdict {
  const secret = (d.secret ?? '').trim()
  if (!secret || keyOf(secret).length === 0) {
    return {
      ok: false,
      status: 503,
      code: 'NOT_SET_UP',
      says: `Forwarded email is not set up on this deployment (${INTAKE_SECRET_ENV} is not set), so nothing was read.`,
    }
  }
  if (!d.id || !d.timestamp || !d.signature) {
    return { ok: false, status: 401, code: 'UNSIGNED', says: 'This delivery was not signed by the mail provider, so nothing in it was read.' }
  }
  const sent = Number(d.timestamp)
  if (!/^\d+$/.test(d.timestamp) || !Number.isFinite(sent) || Math.abs(d.now.getTime() / 1000 - sent) > TOLERANCE_SECONDS) {
    return { ok: false, status: 401, code: 'STALE', says: 'This delivery was signed more than five minutes from now, so it is treated as a replay and nothing in it was read.' }
  }
  const expected = Buffer.from(signDelivery(secret, d.id, d.timestamp, d.body).slice(3), 'base64')
  const matches = d.signature
    .split(' ')
    .map((e) => e.trim())
    .filter((e) => e.startsWith('v1,'))
    .some((e) => {
      const given = Buffer.from(e.slice(3), 'base64')
      return given.length === expected.length && timingSafeEqual(given, expected)
    })
  if (!matches) {
    return { ok: false, status: 401, code: 'BAD_SIGNATURE', says: 'This delivery’s signature does not match, so nothing in it was read.' }
  }
  return { ok: true }
}
