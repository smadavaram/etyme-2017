/**
 * The ways forward, said the same on every public page.
 *
 * ── Why one ladder ───────────────────────────────────────────────────
 *
 * The founder, 2026-09-27: "create a high-impact page and lead funnel."
 * Until then the site had five doors under five names, and a reader who
 * met two of them on two pages could not tell they were the same door. A
 * funnel a buyer can follow is one ladder, named once, in the same order
 * everywhere:
 *
 *   1. See it     the example program, a month of data, no sign-up. It
 *                 is what made the CTO understand the product: a buyer
 *                 understands by seeing it used.
 *   2. A person   the "ask a person" form, for anybody who would rather
 *                 talk first.
 *
 * The contractor spend audit was the second rung from 2026-09-27 and the
 * primary call from 2026-10-09. It left every page on 2026-10-14 (see
 * `GET_THE_AUDIT` below for why the constant is still here).
 *
 * ── What the first rung may not say ──────────────────────────────────
 *
 * The marketing thread's button said "Start free". Sign-in for a real
 * tenant is not configured on production — `/ready` says the only way
 * in is the demo — so there is nothing to start, and a button that
 * leads to a demo while promising an account is exactly the kind of
 * claim `lib/positioning` exists to stop. `promisesAnAccount` there
 * refuses it, and the test reads every button on the site against it.
 *
 */

export interface Way {
  /** The words on the button or link. */
  t: string
  /**
   * The same door in fewer words, where the phone header has no room for
   * the whole label. Said only where `t` cannot fit; never a different
   * promise.
   */
  short?: string
  /** One line under it, where there is room for one. */
  d: string
  href: string
}

/**
 * The first rung: the example program. The primary button everywhere
 * until 2026-10-09, when the founder's brief made the audit the primary
 * call to action and this the secondary; the ladder's order is unchanged.
 */
export const SEE_IT: Way = {
  // The founder's words for the secondary button, 2026-10-09.
  t: 'Explore the Live Demo',
  short: 'See the demo',
  d: 'A demo company — not a customer — with a month of contractors, suppliers, timesheets and bills. No card. No sign-up.',
  href: '/demo',
}

/**
 * The contractor census, which was the spend audit. Retired from every
 * public page on 2026-10-14 (the founder: "Does anyone need the audit
 * form? I think it's useless."). Nobody had used it, and a second call on
 * every page is a decision the buyer has to make before the one that
 * matters. `/census` stays reachable, linked from nowhere on this site,
 * until November 13, 2026, and is then deleted with its form and route
 * (`KNOWN-LIMITS.md`, the market's section).
 *
 * Kept as a constant for one reason: `/demo` (platform's,
 * `src/app/demo/page.tsx`) still links it at its foot, and removing the
 * export would break a file this domain may not edit. The test
 * `public-funnel.test.ts` names that file as the one place left, and the
 * list may only shrink. Nothing in `lib/public-site` draws it.
 */
export const GET_THE_AUDIT: Way = {
  t: 'Get a Free Contractor Spend Audit',
  short: 'Free audit',
  d: 'Ask on the audit page, then upload your contractor list — a spreadsheet is fine — or the invoice receipts you hold. ' +
    'A named person sends back one page inside five working days.',
  href: '/census',
}

/** The third rung: a person. The form sits on the contact page. */
export const ASK_A_PERSON: Way = {
  t: 'Ask a person',
  d: 'An email and a sentence. A person reads it and writes back.',
  // The top of the contact page, whose form is on its first screen: no
  // link on the site lands in the middle of another page (2026-09-30).
  href: '/contact',
}

/** The ladder, in order: see it, then a person. The audit left it on 2026-10-14. */
export const WAYS_FORWARD: Way[] = [SEE_IT, ASK_A_PERSON]

/**
 * The band every public page ends in. The heading is a sentence with a
 * verb, like every other headline on the site.
 *
 * Cards since 2026-09-28 (night), on the founder reading it on his phone
 * as too big and too wordy: everything the band does is send a reader to
 * the demo or a person, so each rung is a card with one line and one
 * button, and the ask form waits behind its button. Two cards since
 * 2026-10-14, when the audit left every page. The line on each card is
 * `CLOSE_BAND.cards`, a rung's own `d` being the longer line the menus
 * carry.
 */
export const CLOSE_BAND = {
  heading: 'See it working before you talk to anybody',
  cards: {
    see: 'A month of work in a demo company — not a customer. No card. No sign-up.',
    ask: 'An email and a sentence. A person reads it and writes back.',
  },
} as const

/** Every word the close band shows, for the guard. */
export function closeBandCopy(): string[] {
  return [CLOSE_BAND.heading, ...Object.values(CLOSE_BAND.cards), ...WAYS_FORWARD.map((w) => w.t)]
}
