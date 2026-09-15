/**
 * Who a demo visitor is, without asking them to sign up.
 *
 * A prospect clicking "try it" from the homepage will not create an
 * account first. They will look at the form and leave, and we will never
 * know whether the product was any good.
 *
 * So a demo gets an identity the moment it is created: a signed cookie
 * naming a Person row that exists only for this. Signed rather than
 * plain, because a cookie that names a person id and nothing else is an
 * invitation to type somebody else's id into it.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const DEMO_COOKIE = 'etyme_demo'

/** How long the cookie lasts. The workspace outlives it and is reaped. */
export const COOKIE_DAYS = 14

function secret(): string {
  // NEXTAUTH_SECRET is already required for the real sign-in path, so the
  // demo path does not add a second thing to configure.
  const s = process.env.NEXTAUTH_SECRET ?? process.env.DEMO_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set, so demo sessions cannot be signed')
  return s
}

export function sign(email: string): string {
  const mac = createHmac('sha256', secret()).update(email).digest('base64url')
  return `${Buffer.from(email).toString('base64url')}.${mac}`
}

/**
 * The email in a demo cookie, or null.
 *
 * Returns null on anything it does not like rather than throwing — a
 * mangled cookie is a signed-out visitor, not a server error.
 */
export function read(value: string | undefined | null): string | null {
  if (!value) return null

  const [body, mac] = value.split('.')
  if (!body || !mac) return null

  let email: string
  try {
    email = Buffer.from(body, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const expected = createHmac('sha256', secret()).update(email).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)

  // Length-checked before the constant-time compare, which throws on a
  // mismatch rather than returning false.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  // Only ever a demo address. A valid signature over a real customer's
  // email would otherwise be a way in.
  return email.endsWith('@demo.etyme.local') ? email : null
}

/** The address a demo person is given. */
export function addressFor(handle: string): string {
  return `${handle}@demo.etyme.local`
}
