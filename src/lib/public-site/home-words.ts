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

/**
 * Who it is for, with no size of buyer (never a range, anywhere on the
 * page). Since 2026-11-13, on the founder's reference page, it is a
 * ticked line with "For:" in bold, as the reference draws it.
 */
export const HOME_FIT_LEAD = 'For:'
export const HOME_FIT_REST = 'firms running contractors across many suppliers and sites.'
export const HOME_FIT = `${HOME_FIT_LEAD} ${HOME_FIT_REST}`

/**
 * The brief's section heading, "Every contractor. Every supplier. One
 * record.", verbatim. The founder's reference page (2026-11-13) draws it
 * in the hero as its own serif line under the locked line, and heads the
 * proof cards "Held until it agrees" instead; the page follows the
 * reference's structure.
 */
export const RECORD_LINE = 'Every contractor. Every supplier. One record.'

/** The four in-page links in the header, from 760 wide; each scrolls to its section. */
export const HOME_NAV: readonly { t: string; href: string }[] = [
  { t: 'Demo', href: '#demo' },
  { t: 'CFO view', href: '#cfo' },
  { t: 'How it holds', href: '#proof' },
  { t: 'Price & security', href: '#pricing' },
]

/**
 * The hero's right column, "At a glance". The two figures are the seed's,
 * worked out by the page (`homeGlance` in `./home-cfo` for the held $42,
 * `homeDemo().watch` for Lucía Fernández's 14 of 18 months); only their
 * words are here.
 */
export const GLANCE_TITLE = 'At a glance — held, not hidden'
export const GLANCE_HELD = 'held on one invoice over signed hours'
export const GLANCE_MONTHS = 'months — one worker, two suppliers, one limit'
export const GLANCE_LINES: readonly string[] = [
  'An invoice is held until the signed hours and the invoice agree. A person clears it — nothing is paid automatically.',
  'A start waits when papers are missing. No papers, no day one.',
]
export const GLANCE_NOTE = 'Examples below are from demo and sample companies — not customers.'

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

/** The outline button that scrolls to the demo and moves focus there; the arrow is drawn beside it, hidden from a screen reader. */
export const SEE_IT_WORK = { t: 'See it work', href: '#demo' } as const
/** The same, in the last call. */
export const SEE_IT_AGAIN = 'See it work again'

/** The demo's heading is Ask Etyme (`ASK_ETYME` in `./story`); this is the line under it. */
export const DEMO_INTRO = 'Ask in plain words. Get an answer you can check, with the record behind it.'
/** The demo's label: Northbend Athletic is a sample company, drawn as a small tag. */
export const DEMO_COMPANY = 'Northbend Athletic'
export const DEMO_LABEL = 'Demo — not a customer'
/** Over the question. */
export const DEMO_ASKED = 'You asked'
/**
 * The table's four headings. The columns are the story's (`STORY[0]` in
 * `./story`), named the way the reference page names them; the months
 * cell reads "6 months" rather than "6" under "Time here".
 */
export const DEMO_HEAD: readonly string[] = ['Contractor', 'Supplier', 'Rate / hr', 'Time here']
/** The tag beside the contractor whose months are near the limit. */
export const DEMO_WATCH = 'Watch limit'
/** The send card's last words, and its button. */
export const DEMO_READY = 'Ready to send to suppliers'
export const DEMO_YES = 'Send to suppliers'
export const DEMO_NOT_NOW = 'Not now'

/** What Send and Not now show in place of the buttons, the reference's words: the demo never sends. */
export const DEMO_SENT = 'Ready to send — in this demo, nothing is sent. In Etyme, you approve before anything goes to suppliers.'
export const DEMO_SAVED = 'Saved as draft. Nothing was sent.'
/** The way back to the buttons. The reference has none; ours keeps a plain Back. */
export const DEMO_BACK = 'Back'

/** The CFO view's card: its heading and the sentence beside the button. */
export const CFO_TITLE = 'Corvane Packaging — the CFO view'
export const CFO_INTRO = 'Corvane is a sample company, not a customer. The full picture is here when you want it — not in your face when you don’t.'
/** The CFO view's one button, whose words change. */
export const CFO_SHOW = 'See the CFO view'
export const CFO_HIDE = 'Hide the CFO view'
/**
 * The CFO view's label, verbatim from the brief, under the figures. The
 * reference page words its note "All Corvane figures use sample rates.
 * Corvane Packaging is a sample company, not a customer."; the brief marks
 * this label verbatim, so the brief's stands.
 */
export const CFO_LABEL = 'Corvane Packaging is a sample company, not a customer. Figures use sample rates.'

/**
 * The proof section's heading, the reference's, and the small label over
 * each card (drawn in capitals by the page). The cards themselves are the
 * brief's sentences, verbatim: the reference shortens two of them, and the
 * brief marks them verbatim, so the brief's stand.
 */
export const PROOF_HEADING = 'Held until it agrees'
export const PROOF_LABELS: readonly string[] = ['01 — Held', '02 — Signed', '03 — Papers']
export const PROOF_CARDS: readonly string[] = [
  '$42 held — an invoice receipt over the signed hours, held until the hours agree.',
  'Nothing is paid on hours nobody signed — the order, the signed week and the invoice must agree.',
  'Nobody starts without papers — documents are asked for, sent and checked before day one. A lapsed insurance certificate blocks the supplier the same way.',
]

/** The strip, verbatim. */
export const STRIP =
  'In it: Jobs · Submissions · Timesheets · Invoices · Papers · Suppliers. Suppliers and contractors join at no cost. Signs in with your work account. Exports to your accounting system.'

/**
 * Price and security, two cards: a small heading, the brief's line in
 * bold, and one line more. Security links the one-page position, which
 * exists (`/security`). The reference says "ask and we will send it"; the
 * brief says to link it, so the page links it.
 */
export const PRICE_TITLE = 'Price'
export const PRICE_LINE = 'Price: free while we test. Founding firms keep their terms.'
export const PRICE_MORE = 'Free for the first five firms. No cost for suppliers and contractors to join.'
export const SECURITY_TITLE = 'Security'
export const SECURITY_LINE = 'Security: no SOC 2 yet; it is next.'
export const SECURITY_LINK = { t: 'Read the security position', href: '/security' } as const
export const SECURITY_MORE = 'Signs in with your work account.'

/** The last call, verbatim. */
export const FINAL_HEADING = 'Start free with your own contractors.'
export const FINAL_LINE = 'Etyme is free while we test it with our first firms. The first five pay nothing and keep their terms when pricing starts.'
/** The fallback line; the address in it is a mail link. */
export const FALLBACK_LEAD = 'Prefer to talk first? Email'
export const FALLBACK_ADDRESS = 'support@etyme.com'
export const FALLBACK_TAIL = '— one sentence is enough.'
export const FALLBACK_LINE = `${FALLBACK_LEAD} ${FALLBACK_ADDRESS} ${FALLBACK_TAIL}`
/**
 * The reference's footer note, at the end of the last section: the shared
 * footer is one row on every public page, and a line in it would change
 * them all. American spelling.
 */
export const SAMPLE_NOTE = 'Demo and sample companies are labeled as such. They are not customers.'

/** The header on the home page: the wordmark, a plain Sign in, and Start free. */
export const HOME_HEADER_BUTTON = START_FREE

/** How many of `homeCopy`'s lines are the hero, from the category to the note under the glance. */
export const HOME_HERO_LINES = 15

/**
 * Every word the page's own text shows, in the order a reader meets it,
 * without the figures and the seed's lines (the demo's are `homeDemoCopy`,
 * the CFO view's and the glance's figures the page computes; see
 * `./home-copy`). The header's four links are counted with the header,
 * not here.
 */
export function homeCopy(): string[] {
  return [
    HOME_EYEBROW, HOME_HEADLINE, HOME_SUBHEAD, RECORD_LINE, HOME_FIT, COMPLEMENT_LINE,
    START_FREE.t, SEE_IT_WORK.t, UNDER_START,
    GLANCE_TITLE, GLANCE_HELD, GLANCE_MONTHS, ...GLANCE_LINES, GLANCE_NOTE,
    CFO_TITLE, CFO_INTRO, CFO_SHOW, CFO_LABEL,
    PROOF_HEADING, ...PROOF_LABELS, ...PROOF_CARDS,
    STRIP,
    PRICE_TITLE, PRICE_LINE, PRICE_MORE, SECURITY_TITLE, SECURITY_LINE, SECURITY_LINK.t, SECURITY_MORE,
    FINAL_HEADING, FINAL_LINE, START_FREE.t, SEE_IT_AGAIN, FALLBACK_LINE, SAMPLE_NOTE,
  ]
}

/**
 * The most words the home page may carry between its header and its
 * footer: the brief's own lines, the seed's demo and CFO lines, and no
 * more. Measured at 394 on 2026-11-13, the CFO view counted although it
 * opens closed. Raised the same day to the founder's reference page,
 * which adds the glance panel, the demo's heading line and labels, the
 * CFO card's sentence, the proof labels, the price and security cards'
 * second lines and the sample note. The reference page's own words, read
 * between its header and its footer by the same counter (`countWords`),
 * are 541; this page measures 537. The ceiling is the reference's 541.
 */
export const MOST_HOME_WORDS = 541
