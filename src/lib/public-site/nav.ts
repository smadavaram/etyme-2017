/**
 * The public site's header and its footer, as data. Every public page
 * draws this header, the home page included.
 *
 * ── No menu, decided by the founder 2026-10-19 ───────────────────────
 *
 * "Even the menu has very [little] value, it can be on the footer." So
 * the header is the logo and Sign in, nothing else, at every width, and
 * the sheet behind the menu icon is gone with the icon. What the sheet
 * carried that the footer did not — the demo and About — is on the
 * footer's one row now (`FOOTER_LINKS`). The four steps stay reachable
 * through Documentation, whose home is the four steps in order, and Sign
 * up stays in the band on every page. What follows is the history of the
 * sheet, kept so nobody rebuilds it from an older drawing.
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

import { FOOTER_LINKS } from './skeleton-words'

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

/** Every href the header and the footer draw, for the test. */
export function everyFrameLink(): string[] {
  return [HEADER.signIn.href, ...FOOTER.flatMap((g) => g.links.map((l) => l.href))]
}

/** Every word the header and the footer show. */
export function frameCopy(): string[] {
  return [
    HEADER.signIn.t,
    ...FOOTER.flatMap((g) => [g.heading, ...g.links.map((l) => l.label), g.note ?? '']),
  ].filter(Boolean)
}

/**
 * Every label on something a reader presses in the header, for the guard
 * that refuses a button promising an account. The header is the logo and
 * Sign in (2026-10-19).
 */
export function frameButtons(): string[] {
  return [HEADER.signIn.t]
}

/**
 * The header, as the founder decided it on 2026-10-19 ("it can be on the
 * footer"): the logo and Sign in, at every width. Read by the test, so
 * the header cannot grow a menu or a second button again.
 */
export const HEADER = {
  signIn: { t: 'Sign in', href: '/login' },
} as const
