/**
 * The three ways forward, said the same on every public page.
 *
 * ── Why one ladder ───────────────────────────────────────────────────
 *
 * The founder, 2026-09-27: "create a high-impact page and lead funnel."
 * Until then the site had five doors under five names — "Open an
 * example program", "Pick a client desk", "Start with a census", "Free
 * contractor spend audit", "Ask us something" — and a reader who met
 * two of them on two pages could not tell they were the same door. A
 * funnel a buyer can follow is one ladder, named once, in the same order
 * everywhere:
 *
 *   1. See it     the example program, a month of data, no sign-up. It
 *                 is what made the CTO understand the product: a buyer
 *                 understands by seeing it used.
 *   2. The audit  the contractor census. It asks for the prospect's own
 *                 data, which is a far stronger signal than an address,
 *                 and it is the door to the program office service.
 *   3. A person   the "ask a person" form, for anybody who would rather
 *                 talk first.
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
 * ── What the audit may promise ───────────────────────────────────────
 *
 * The census page promises one page back "inside five working days"
 * from a named person (`lib/census-copy`). The header's audit line said
 * "Ten minutes, no card. Your numbers back in 24 hours" — two figures
 * nobody measured, one of them faster than the page it led to. Every
 * line here says what the census page says, and the test holds them to
 * it.
 */

export interface Way {
  /** The words on the button or link. */
  t: string
  /** One line under it, where there is room for one. */
  d: string
  href: string
}

/** The first rung: the example program. The primary button, everywhere. */
export const SEE_IT: Way = {
  t: 'See it with a month of data',
  d: 'A demo company — not a customer — with a month of contractors, suppliers, timesheets and bills. No card. No sign-up.',
  href: '/demo',
}

/**
 * The second rung: the contractor census, which is the spend audit.
 *
 * The line under it was "Send what you already hold. A named person sends
 * one page back inside five working days." A buyer-side review,
 * 2026-09-27, read it as a riddle: send what, and to where? So it says
 * what the census actually takes, in words a CFO already uses — the
 * contractor list (the template is one row per contractor, and a CSV or
 * an Excel file both open) or the supplier invoices they hold (option B;
 * briefly "bills" on 2026-09-28, until the founder's SAP rule settled
 * that the party who issues a document names it, so a supplier's is its
 * invoice)
 * — and the order it happens in on the page the button leads to: ask
 * first, then upload.
 *
 * The destination is the census form, never a bare address. The form
 * keeps the file with the request it belongs to, puts the asker in the
 * line, and emails the named person at Etyme the moment it is sent
 * (`/api/census/request`); an attachment in an inbox does none of that.
 */
export const GET_THE_AUDIT: Way = {
  t: 'Get your contractor spend audit',
  d: 'Ask on the audit page, then upload your contractor list — a spreadsheet is fine — or the supplier invoices you hold. ' +
    'A named person sends back one page inside five working days.',
  href: '/census',
}

/** The third rung: a person. The form sits on the contact page. */
export const ASK_A_PERSON: Way = {
  t: 'Ask a person',
  d: 'An email and a sentence. A person reads it and writes back.',
  href: '/contact#ask',
}

/** The ladder, in order. */
export const WAYS_FORWARD: Way[] = [SEE_IT, GET_THE_AUDIT, ASK_A_PERSON]

/**
 * The band every public page ends in. The heading is a sentence with a
 * verb, like every other headline on the site, and the line under it
 * says what the first rung actually is before anybody presses it.
 */
export const CLOSE_BAND = {
  heading: 'See it working before you talk to anybody',
  line: 'The example program is a demo company — not a customer — with a month of work in it and no account to open.',
} as const

/** Every word the close band shows, for the guard. */
export function closeBandCopy(): string[] {
  return [CLOSE_BAND.heading, CLOSE_BAND.line, ...WAYS_FORWARD.map((w) => w.t)]
}
