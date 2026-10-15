/**
 * The public site's header, its menu sheet and its footer, as data.
 * Every public page draws this header, the home page included.
 *
 * ── The menu tells one story in four steps. Decided 2026-10-15 ───────
 *
 * The founder, on the open menu sheet: "Menu pages almost seem useless
 * and out of context and do not tell their story cleanly — be an
 * American sales guy like Steve Jobs to attract people." The sheet held
 * a Platform group of eight feature names, a Solutions group of six
 * roles, "How It Works" as a second way in, and "Explore the Live Demo".
 * He said "build it" on the drawing that replaced them
 * (https://claude.ai/artifact/Vxb9LoJoEKhramwsnfq9Dc), and its words are
 * used here exactly:
 *
 *   How Etyme works
 *   Four steps. Every contractor, every supplier, one place.
 *   1 Job · 2 Candidates · 3 Timesheets · 4 Invoices, one line each,
 *     each the top of its step page
 *   Security · Documentation · About · Contact, small
 *   "See it working, no account" and "Sign up"
 *
 * On a phone the heading is shorter ("Four steps. Every contractor, one
 * place."), the cards stack, Sign up comes before the demo, and the
 * small row says "Docs". The menu itself is how it works, so there is no
 * "How It Works" link; each role is shown working inside its step, so
 * there is no Solutions group. The four pages that folded into the steps
 * redirect (`./folded`).
 *
 * ── No audit, since 2026-10-14 ───────────────────────────────────────
 *
 * The founder deleted the contractor spend audit from every page. The
 * header, the sheet and the footer carry no link to `/census`, and the
 * test holds that no public page does.
 */

import { SEE_IT } from './funnel'
import { STEPS } from './steps'
import { FOOTER_LINKS, CLIENT_SIGN_UP } from './skeleton-words'

/** One of the four step cards on the menu sheet. */
export interface StepCard {
  n: number
  /** The step's name. */
  t: string
  /** Its one line, as drawn. */
  l: string
  /** The top of its step page. */
  href: string
}

/** A small link on the sheet's bottom row; `short` is what a phone shows, where it differs. */
export interface SmallLink {
  t: string
  short?: string
  href: string
}

/** The menu sheet behind the header's menu icon, word for word as drawn. */
export const MENU = {
  kicker: 'How Etyme works',
  heading: 'Four steps. Every contractor, every supplier, one place.',
  /** The heading on a phone, where the longer one wraps to four lines. */
  headingPhone: 'Four steps. Every contractor, one place.',
  steps: STEPS.map((s): StepCard => ({ n: s.n, t: s.name, l: s.menu, href: s.route })),
  small: [
    { t: 'Security', href: '/security' },
    { t: 'Documentation', short: 'Docs', href: '/docs' },
    { t: 'About', href: '/about' },
    { t: 'Contact', href: '/contact' },
  ] as SmallLink[],
  /** The outlined button: the demo, no account. */
  see: { t: SEE_IT.t, href: SEE_IT.href },
  /** The filled button: the client's sign-up. */
  signUp: { t: CLIENT_SIGN_UP.t, href: CLIENT_SIGN_UP.href },
}

export interface FooterGroup {
  heading: string
  links: { label: string; href: string }[]
  note?: string
}

/**
 * The footer, one for every public page: the home page, the product
 * pages and doors, the documentation, the security position, the legal
 * pages. The one row the founder approved for the home page on
 * 2026-10-14 (`FOOTER_LINKS`), drawn everywhere since 2026-10-15, when
 * he found the security and documentation pages still drawing the older
 * four-column footer: "have footer different from home page site? Is
 * that right". It was not; every public page shares the header and the
 * footer.
 */
export const FOOTER: FooterGroup[] = [
  { heading: 'Etyme', links: FOOTER_LINKS.map((l) => ({ label: l.t, href: l.href })) },
]

/** Where Etyme is, said once, on every page. */
export const ADDRESS = {
  company: 'Etyme Inc.',
  street: '3201 Yorktown Ave, Ste. 110B',
  city: 'Durham, NC 27713',
  phone: '919-228-9961',
  email: 'support@etyme.com',
}

/** Every href the menu sheet draws: the four steps, the small row and the two buttons. */
export function menuLinks(): string[] {
  return [
    ...MENU.steps.map((s) => s.href),
    ...MENU.small.map((l) => l.href),
    MENU.see.href,
    MENU.signUp.href,
  ]
}

/** Every href the header, the sheet and the footer draw, for the test. */
export function everyFrameLink(): string[] {
  return [
    ...menuLinks(),
    '/login',
    ...FOOTER.flatMap((g) => g.links.map((l) => l.href)),
  ]
}

/** Every word the menu sheet shows, at either width. */
export function menuCopy(): string[] {
  return [
    MENU.kicker, MENU.heading, MENU.headingPhone,
    ...MENU.steps.flatMap((s) => [s.t, s.l]),
    ...MENU.small.flatMap((l) => [l.t, l.short ?? '']),
    MENU.see.t, MENU.signUp.t,
  ].filter(Boolean)
}

/** Every word the header, the sheet and the footer show. */
export function frameCopy(): string[] {
  return [
    'Sign in',
    ...menuCopy(),
    ...FOOTER.flatMap((g) => [g.heading, ...g.links.map((l) => l.label), g.note ?? '']),
  ].filter(Boolean)
}

/**
 * Every label on something a reader presses in the header and its sheet,
 * for the guard that refuses a button promising an account. The header
 * is the logo, Sign in and the menu icon, whose accessible name is
 * "Menu" (2026-10-14); the sheet adds the demo button. Its "Sign up" is
 * the client's sign-up (`CLIENT_SIGN_UP`), the one label the guard lets
 * promise an account, and is read there.
 */
export function frameButtons(): string[] {
  return ['Sign in', 'Menu', MENU.see.t]
}

/**
 * The header, as the founder decided it on 2026-10-14 ("Menu into
 * icon"): the logo, Sign in and a menu icon, at every width. Read by the
 * test, so the header cannot grow a second button again.
 */
export const HEADER = {
  signIn: { t: 'Sign in', href: '/login' },
  /** The icon's accessible name. The word is never drawn. */
  menu: 'Menu',
} as const
