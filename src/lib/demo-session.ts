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

  // Only ever a seeded address. A valid signature over a real customer's
  // email would otherwise be a way in.
  //
  // The property this rests on is that the domain cannot be bought.
  // `.invalid` and `.example` are reserved by RFC 2606 and can never be
  // delegated; `.local` is mDNS and can never be registered either. So
  // no signature minted here can name a real inbox, whatever is in
  // front of the @.
  //
  // It used to be two literal domains — `demo.etyme.local` for every
  // seeded company seat and `seed.etyme.invalid` for the seeded world's
  // consultants — and the cost of that was on the screen rather than
  // here: every seeded seat had to be addressed
  // `world-corning-procurement@demo.etyme.local`, and Contacts printed
  // exactly that as a person's email, with a retired company name and a
  // British spelling inside it (the browser walk, 2026-09-21). Widening
  // the rule from two names to the reserved suffixes those two names
  // are instances of lets a seeded person be addressed like a person —
  // `eleanor.vance@cavanaugh-glassworks.example` — and takes nothing
  // away from the guarantee, because the guarantee was never about the
  // second label.
  return reservedAddress(email) ? email : null
}

/**
 * Whether this address is at a domain nobody can register.
 *
 * Checked on the last label so that `somebody@example.com` — a real,
 * buyable domain whose name merely contains the word — is refused. It
 * ends in `.com`.
 */
export function reservedAddress(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  if (!email.includes('@') || domain.length === 0) return false
  return RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix))
}

/** The suffixes a signed demo cookie may name. None of them can be bought. */
export const RESERVED_SUFFIXES = ['.invalid', '.example', '.local'] as const

/** The address a demo person is given. */
export function addressFor(handle: string): string {
  return `${handle}@demo.etyme.local`
}

/**
 * The browser's visit a demo door sent with its seat, or null.
 *
 * The /demo page posts the tab's own visit id (`visitId` in
 * lib/public-site/count, the id every other public-site count carries),
 * so a seat taken there counts once for that visit and the staff summary
 * reads it beside the visit's other clicks. A body with no visit id is
 * not counted at all, rather than counted under an id made up here: the
 * Solutions links count their own seat from the browser after this
 * route answers, and a script taking a seat is not a visitor. Counting
 * either under a minted id would overstate visits.
 *
 * Only the shape is read here — 32 hex characters, a path starting with
 * a slash. Market's own reader (`readMarketEvent`) decides the rest
 * before anything is written.
 */
export function demoVisit(body: unknown): { page: string; visit: string } | null {
  const b = (body ?? {}) as Record<string, unknown>
  const visit = typeof b.visit === 'string' ? b.visit : ''
  if (!/^[a-f0-9]{32}$/.test(visit)) return null
  const page = typeof b.page === 'string' && b.page.startsWith('/') ? b.page : '/demo'
  return { page, visit }
}
