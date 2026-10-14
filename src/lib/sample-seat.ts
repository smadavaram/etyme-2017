/**
 * The shared sample seat: the product inside the home page, read-only.
 *
 * Founder, 2026-10-14 ("The home page is the product, and the slop is
 * gone"): the home page shows the seeded Northbend Athletic program
 * manager's own screens in a frame, to anybody, with no account and no
 * sandbox made for a visitor who only looks. Every write is refused in a
 * sentence that offers the visitor's own demo, and nothing a stranger does
 * can touch the seeded world.
 *
 * ── What this file is ────────────────────────────────────────────────
 *
 * The rules with no database in them, so the middleware (edge) and the
 * caller check (`lib/api-context`) read one copy: the cookie that marks a
 * browser as looking at the sample, which methods the seat may use, the
 * sentence a refused write says, the steps the frame can show, and the
 * headers that let only this site frame it.
 *
 * ── Why the cookie is not signed ─────────────────────────────────────
 *
 * It is the same value for everybody and it grants one thing: reading the
 * sample program the home page already shows to anybody. A forged cookie
 * buys exactly what an honest one does. What makes the seat read-only is
 * not the cookie's content but which door resolved the caller — only
 * `sampleCaller` in `lib/api-context` sets `readOnly`, and nothing on the
 * wire (a header, a body field, a query string) is read when it does.
 *
 * ── Why it is the last identity, never the first ─────────────────────
 *
 * Somebody signed in is that somebody, and a visitor in their own demo is
 * in their own demo; the sample cookie is read only when there is neither.
 * Otherwise a visitor who had looked at the home page would find their own
 * sandbox's API calls answered as the sample, read-only.
 */

/** The cookie marking a browser as looking at the shared sample. */
export const SAMPLE_COOKIE = 'etyme_sample'

/** Its one value. Anything else is not the sample. */
export const SAMPLE_COOKIE_VALUE = 'northbend-program-manager'

/**
 * Where the cookie is sent: the frame and the API calls the frame makes.
 * Never `/dashboard` — a visitor who opens the app proper is not seated
 * as the sample by having looked at the home page.
 */
export const SAMPLE_COOKIE_PATHS = ['/embed', '/api'] as const

/** A day: the frame sets it again on every load. */
export const SAMPLE_COOKIE_SECONDS = 24 * 60 * 60

/** The seeded company and desk the sample seat sits at. */
export const SAMPLE_WORLD = 'world-nike'
export const SAMPLE_DESK = 'programme' as const

/**
 * The person the sample seat is: a seeded person of its own, never the
 * program manager who works at Northbend.
 *
 * Measured 2026-10-14 by etyme-regulatory: the seat used to be the seeded
 * program manager's own, and ninety-four routes write `caller.person.id`
 * into the access log, so one look at the home page's frame was filed
 * under her name and her access review read strangers as her. The fix is
 * the seat, not the routes: the sample holds the program manager's role
 * at its own Context, so every row the existing code writes names this
 * person. Seeded in `lib/seed-programmes` beside the Northbend desks.
 *
 * At a domain nobody can register, like every seeded person
 * (`docs/demo-names.md`). The address is the one flag this person
 * carries: nothing in the schema marks a person as not a person, and a
 * column for one seat is not worth a migration.
 */
export const SAMPLE_PERSON_NAME = 'Shared sample'
export const SAMPLE_PERSON_EMAIL = 'world-nike-sample@demo.etyme.local'

/** Whether an address is the sample's person. */
export function isSamplePerson(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === SAMPLE_PERSON_EMAIL
}

/**
 * A `Context` filter that leaves the sample's seat out.
 *
 * The one place a list of seats, or a lookup by role, says "not the
 * sample". The seat holds the Program Manager role so it reads what she
 * reads; without this a lookup by that role could hand a visitor her
 * desk as the sample, or the sample her decisions. Spread it inside an
 * `AND` where the query already filters on `person`.
 */
export const NOT_THE_SAMPLE_SEAT = {
  person: { primaryEmail: { not: SAMPLE_PERSON_EMAIL } },
} as const

/** Whether a cookie value is the sample's. */
export function isSampleCookie(value: string | null | undefined): boolean {
  return value === SAMPLE_COOKIE_VALUE
}

/** The methods that read. Everything else is a write and is refused. */
export const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Whether the sample seat may make this request.
 *
 * No method at all — a caller resolved with no request, which is a page
 * drawing a menu rather than a route — is not a read either: the seat
 * fails closed, so a new caller of the check cannot forget it.
 */
export function sampleMay(method: string | null | undefined): boolean {
  return !!method && READ_METHODS.has(method.toUpperCase())
}

/** The code a refused write carries, for the frame to recognize. */
export const SAMPLE_REFUSED_CODE = 'SAMPLE_READ_ONLY'

/** The one sentence a refused write says. */
export const SAMPLE_REFUSAL =
  'This is a shared sample, so nothing here can be changed: open your own demo to try it, or sign up.'

/** The two doors the sentence offers, in its order. */
export const SAMPLE_DOORS = [
  { label: 'Open your own demo', href: '/demo' },
  { label: 'Sign up', href: '/signup' },
] as const

/** The body a refused write is answered with. */
export function sampleRefusalBody(): {
  error: { code: string; message: string; actions: { label: string; href: string }[] }
} {
  return {
    error: {
      code: SAMPLE_REFUSED_CODE,
      message: SAMPLE_REFUSAL,
      actions: SAMPLE_DOORS.map((d) => ({ ...d })),
    },
  }
}

/**
 * The screens the frame shows. `overview` is the program dashboard — the
 * answer to the home page's question, what every contractor costs across
 * every supplier — and the default. The other four are the four chips.
 */
export const EMBED_STEPS = ['overview', 'source', 'submit', 'approve', 'pay'] as const
export type EmbedStep = (typeof EMBED_STEPS)[number]
export const DEFAULT_EMBED_STEP: EmbedStep = 'overview'

/** A step from the address, or null where it is not one of ours. */
export function embedStep(asked: string | null | undefined): EmbedStep | null {
  return (EMBED_STEPS as readonly string[]).includes(String(asked)) ? (asked as EmbedStep) : null
}

/**
 * Who may frame the embed: this site and nobody else.
 *
 * Both headers, because `frame-ancestors` is the standard and
 * `X-Frame-Options` is what an older browser reads; where both are sent a
 * modern browser obeys the first. `'self'` is the page's own origin, which
 * is the home page's: the frame is served from the same deployment.
 */
export const EMBED_FRAME_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "frame-ancestors 'self'",
  'X-Frame-Options': 'SAMEORIGIN',
}

/** Whether a path is the embed's. */
export function isEmbedPath(path: string): boolean {
  return path === '/embed' || path.startsWith('/embed/')
}
