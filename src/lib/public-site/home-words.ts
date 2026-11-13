/**
 * Every word the home page draws, as constants, so the page that draws
 * them and the guards that read them (`positioning.test.ts`,
 * `home-page.test.ts`) read one source.
 *
 * ── The founder's brief, 2026-11-13 ──────────────────────────────────
 *
 * "The current page has a strong story but no way to act." So the home
 * page is rebuilt for conversion, in the brief's order and nothing else:
 * the header with one button, Start free; the hero (the category, the
 * question, the locked positioning line, who it is for, what it sits
 * beside, Start free with the line under it, See it work); the Ask Etyme
 * demo, drawn in the page from the seed; the CFO view, closed behind one
 * button; one heading and three proof cards; the strip; price and
 * security; the last call. Every line the brief marks verbatim is here
 * verbatim, punctuation included, with one exception, the complement
 * line, below.
 *
 * This replaces the home page of 2026-10-27 (the map with four role
 * tabs, the Northbend panel that played by itself, the two drawings and
 * the four lines). The four party doors, the product pages and every
 * other public page are unchanged.
 */

import { CATEGORY } from './skeleton-words'

/** The hero's eyebrow: the category, from the one constant every selling page draws. */
export const HOME_EYEBROW = CATEGORY

/** The question, word for word since 2026-10-09. */
export const HOME_HEADLINE = 'Know what every contractor costs, across every supplier.'

/** The locked positioning line, verbatim from the brief. */
export const HOME_SUBHEAD =
  'Not clever automation. Intelligent control — one explainable record for every contingent worker, supplier, timesheet, and invoice, so every decision can be defended, not just done.'

/** Who it is for, with no size of buyer (never a range, anywhere on the page). */
export const HOME_FIT = 'For firms that run contractors across many suppliers and sites.'

/**
 * The complement line. The brief's own line names two enterprise
 * software vendors; the founder ruled on 2026-09-20 and 2026-09-28 that
 * no page names a company or an enterprise incumbent, with no exception,
 * and `lib/positioning` refuses one. Until he reverses that rule in his
 * own words, the line names the kinds of system, not the vendors. His
 * two names are a one-line change here.
 */
export const COMPLEMENT_LINE = 'Sits alongside your HR and finance systems. No rip-and-replace.'

/**
 * Start free: the sign-up that exists, the page "Create your account"
 * opens (`signUpWith` in `lib/login-doors`). A link, drawn as the filled
 * button.
 */
export const START_FREE = { t: 'Start free', href: '/signup' } as const

/** The line directly under Start free, verbatim. */
export const UNDER_START = 'Free for the first five firms. No card, no contract — we set it up with you.'

/** The outline button that scrolls to the demo and moves focus there. */
export const SEE_IT_WORK = { t: 'See it work', href: '#demo' } as const

/** The demo's label: Northbend Athletic is a sample company. */
export const DEMO_COMPANY = 'Northbend Athletic'
export const DEMO_LABEL = 'Demo — not a customer'

/** What Send and Not now show in place of the buttons: the demo never sends. */
export const DEMO_SENT = 'This is a demo, so nothing was sent. Start free to send a real job to your own suppliers.'
/** The way back to the buttons. */
export const DEMO_BACK = 'Back'
export const DEMO_NOT_NOW = 'Not now'

/** The CFO view's one button, whose words change. */
export const CFO_SHOW = 'See the CFO view'
export const CFO_HIDE = 'Hide the CFO view'
/** The CFO view's label, verbatim. */
export const CFO_LABEL = 'Corvane Packaging is a sample company, not a customer. Figures use sample rates.'

/** One heading and three proof cards, verbatim. */
export const PROOF_HEADING = 'Every contractor. Every supplier. One record.'
export const PROOF_CARDS: readonly string[] = [
  '$42 held — an invoice receipt over the signed hours, held until the hours agree.',
  'Nothing is paid on hours nobody signed — the order, the signed week and the invoice must agree.',
  'Nobody starts without papers — documents are asked for, sent and checked before day one. A lapsed insurance certificate blocks the supplier the same way.',
]

/** The strip, verbatim. */
export const STRIP =
  'In it: Jobs · Submissions · Timesheets · Invoices · Papers · Suppliers. Suppliers and contractors join at no cost. Signs in with your work account. Exports to your accounting system.'

/** Price and security, short, verbatim; security links the one-page position. */
export const PRICE_LINE = 'Price: free while we test. Founding firms keep their terms.'
export const SECURITY_LINE = 'Security: no SOC 2 yet; it is next.'
export const SECURITY_LINK = { t: 'Read the security position', href: '/security' } as const

/** The last call, verbatim. */
export const FINAL_HEADING = 'Start free with your own contractors.'
export const FINAL_LINE = 'Etyme is free while we test it with our first firms. The first five pay nothing and keep their terms when pricing starts.'
/** The fallback line; the address in it is a mail link. */
export const FALLBACK_LEAD = 'Prefer to talk first? Email'
export const FALLBACK_ADDRESS = 'support@etyme.com'
export const FALLBACK_TAIL = '— one sentence is enough.'
export const FALLBACK_LINE = `${FALLBACK_LEAD} ${FALLBACK_ADDRESS} ${FALLBACK_TAIL}`

/** The header on the home page: the wordmark, a plain Sign in, and Start free. */
export const HOME_HEADER_BUTTON = START_FREE

/** How many of `homeCopy`'s lines are the hero, from the category to See it work. */
export const HOME_HERO_LINES = 8

/**
 * Every word the page's own text shows, in the order a reader meets it,
 * without the demo and the CFO view (their words are the seed's,
 * `homeDemoCopy` and the CFO lines the page computes).
 */
export function homeCopy(): string[] {
  return [
    HOME_EYEBROW, HOME_HEADLINE, HOME_SUBHEAD, HOME_FIT, COMPLEMENT_LINE,
    START_FREE.t, UNDER_START, SEE_IT_WORK.t,
    DEMO_COMPANY, DEMO_LABEL,
    CFO_SHOW, CFO_LABEL,
    PROOF_HEADING, ...PROOF_CARDS,
    STRIP,
    PRICE_LINE, SECURITY_LINE, SECURITY_LINK.t,
    FINAL_HEADING, FINAL_LINE, START_FREE.t, FALLBACK_LINE,
  ]
}

/**
 * The most words the home page may carry between its header and its
 * footer: the brief's own lines, the seed's demo and CFO lines, and no
 * more. Measured at 394 on 2026-11-13, the CFO view counted although it
 * opens closed. Counted by `positioning.test.ts`.
 */
export const MOST_HOME_WORDS = 395
