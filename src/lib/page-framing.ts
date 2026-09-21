import type { CompanyKind } from '@/components/session-provider'
import { getNavForKind } from '@/components/shell/sidebar'

/**
 * Page framing per company type — and per seat.
 *
 * CLAUDE.md, design system:
 *   "Eyebrow labels are company-type-specific... A client company would
 *    see the same data under different section labels. The eyebrow, nav
 *    section, and page subtitle must adapt to the viewer's company type —
 *    the underlying data and pages are shared, the framing is not."
 *
 * The pages themselves are shared: the same contracts table serves a
 * vendor tracking what they bill and a client reviewing who is on site.
 * Only the words change. A client reading "What you bill clients" on
 * their own placements list is being shown someone else's business.
 *
 * ── The eyebrow is read off the menu, never typed here ────────────────
 *
 * This file used to hold a second, hand-kept copy of the section names,
 * and it drifted the first time the navigation moved. When every party's
 * menu was cut to the client's two-level shape, a supplier's contracts
 * and timesheets went to Operate and its bench went to Procure — and
 * this table went on saying "Sell" over Buy contracts and **"Talent"**
 * over Candidates, a section no menu had any more. So a supplier clicked
 * Operate → Buy contracts and landed on a page headed Procure, and one
 * of the two words named nothing at all. That is the same class of error
 * as printing an internal state name on a screen.
 *
 * So the eyebrow is now derived: `getNavForKind` is the one description
 * of what each party can reach, and the heading names the section the
 * reader's own menu puts the page under. Rename a section and every page
 * under it renames itself. The only thing kept here is **which menu
 * entry leads to this work for this party** — a client reaches its roles
 * at /dashboard/requisitions and its people at /dashboard/people, where a
 * supplier reaches the same two screens at their own routes — and even
 * that is checked against the menus rather than trusted.
 *
 * The header's search box and the + menu were the same bug and were
 * fixed the same way; this is the third door.
 *
 * ── The company kind is not the whole answer: the seat is ─────────────
 *
 * Added 2026-09-21, from a screen-by-screen walk. Aptiva Workforce is a
 * program office sitting at Cavanaugh Glassworks' Program Manager desk.
 * Since the money routes learned about seats (`lib/money/seated-books`)
 * every figure on those pages has been Cavanaugh's — and the words over
 * them were still read off Aptiva's own company kind, so Cavanaugh's
 * seven buy-side lines were headed "Sell · Sell Contracts — What you
 * bill clients", and its hours read "Billable hours against sell
 * contracts". Cavanaugh bills nobody. Its own program manager, on the
 * identical rows, reads "Workforce · Contracts".
 *
 * Whose book it is decides the words, and the seat is what says whose
 * book it is. A reader in a seat is framed exactly as the client's own
 * desk is framed, with one clause added naming the book, because reading
 * somebody else's record and reading your own are not the same act and a
 * screen that cannot tell you which you are doing is the bug this whole
 * file exists to stop.
 *
 * The framing never goes looking for the seat itself. The page is given
 * it by the route that already resolved it — money's `reading` block,
 * demand's `desk` block — and hands it here. One resolution, one answer:
 * a second lookup could disagree with the rows on the screen, and a
 * heading that disagrees with the table under it is worse than no
 * heading.
 */

export interface PageFraming {
  eyebrow: string
  title: string
  subtitle: string
  /**
   * What the "+" on this page offers, in the reader's own words, or null
   * where this reader raises nothing here.
   *
   * Null is not an oversight and is not a disabled button: a client does
   * not file a contractor's week (the worker files their own and nobody
   * else may), does not generate its suppliers' invoices, and does not
   * raise their expenses. CLAUDE.md: a control the route would refuse is
   * a control that lies.
   */
  create: string | null
  /**
   * The clause naming whose book this is, when it is not the reader's
   * own. Null for everybody reading their own record, which is almost
   * everybody.
   *
   * It is already the last sentence of `subtitle`, so a page that
   * renders the subtitle says it without changing anything else. It is
   * exposed separately for a page that would rather put it somewhere of
   * its own — a chip, a panel beside the switch back to the reader's own
   * book — in which case that page should render the clause once, not
   * twice.
   */
  whose: string | null
}

/** Every page whose framing differs between a supplier and a buyer. */
export type PageKey =
  | 'contracts.sell'
  | 'contracts.buy'
  | 'requirements'
  | 'submissions'
  | 'rolloff'
  | 'timesheets'
  | 'invoices'
  | 'expenses'
  | 'consultants'

/** The words on the page, with no section name and no seat among them. */
type Words = Omit<PageFraming, 'eyebrow' | 'whose'>

/**
 * Whose book the reader is on, as the routes already say it.
 *
 * Three names for one fact, because two routes shipped two of them
 * before this existed: money returns `reading: { company, inASeat,
 * says }` and demand returns `desk: { companyName, seated, says }`.
 * Both are accepted as they stand, so a page passes the block it already
 * holds instead of six pages translating one field each — and a
 * translation is exactly where a screen starts saying a different thing
 * from the rows under it.
 *
 * Absent or unseated means the reader's own book, which is what every
 * caller got before this parameter existed.
 */
export interface Reading {
  /** Demand's word for it. */
  seated?: boolean
  /** Money's word for it. */
  inASeat?: boolean
  /** Whose book. Any of the three names the routes already use. */
  clientName?: string | null
  company?: string | null
  companyName?: string | null
}

/** Is this reader in somebody else's book? */
function seated(reading?: Reading | null): boolean {
  return !!(reading && (reading.seated || reading.inASeat))
}

/** Whose book it is, or null where the route did not name it. */
function bookOwner(reading?: Reading | null): string | null {
  if (!seated(reading)) return null
  return reading?.clientName ?? reading?.company ?? reading?.companyName ?? null
}

/**
 * A supplier — a staffing vendor, an integrator, or a program office
 * that staffs part of the program off its own payroll. The words are the
 * seller's; the section over them is whatever that party's own menu
 * says, which is how an integrator reads "Deliver" where a bench firm
 * reads "Sell" without a second table being kept for it.
 */
const SUPPLIER: Record<PageKey, Words> = {
  'contracts.sell': {
    title: 'Sell Contracts',
    subtitle: 'What you bill clients. Revenue side — track active engagements, pending verifications, and upcoming rolloffs.',
    create: 'Record a placement',
  },
  'contracts.buy': {
    title: 'Buy Contracts',
    subtitle: 'What you pay for talent. Bench payments, internal contracts, and vendor agreements.',
    create: 'Record a placement',
  },
  requirements: {
    title: 'Requirements',
    subtitle: 'Open demand. Match consultants, distribute to your network, and track submissions.',
    // Every desk that reads this page can raise one: `POST
    // /api/requirements` has always existed and the button above the
    // list has never been gated. This said null for a commit, which
    // would have taken a working control off the screen — the opposite
    // failure to the contracts button, and the same rule settles both:
    // the framing says what the route actually does.
    create: 'New requirement',
  },
  submissions: {
    title: 'Submissions',
    subtitle: 'Consultants you have put forward. Track them from submitted through to placement.',
    create: 'Submit',
  },
  rolloff: {
    title: 'Rolloff',
    subtitle: 'Contracts approaching their end date. Claim one to own the offboarding and redeployment.',
    create: null,
  },
  timesheets: {
    title: 'Timesheets',
    subtitle: 'Billable hours against sell contracts. Submit, review, and approve — with anomaly detection for flagged entries.',
    create: 'New',
  },
  invoices: {
    title: 'Invoices',
    subtitle: 'What you have billed and what is outstanding. Track aging and record payments.',
    create: 'Generate',
  },
  expenses: {
    title: 'Expenses',
    subtitle: 'Travel, equipment, and training. Client-billable items flow through to invoices.',
    create: 'New',
  },
  consultants: {
    title: 'Candidates',
    subtitle: 'Your talent pool. Skills, availability, work authorization, and bench tier.',
    create: null,
  },
}

const CLIENT: Record<PageKey, Words> = {
  'contracts.sell': {
    title: 'Contracts',
    subtitle: 'Everyone working at your sites, across every vendor. Rates, end dates, and where they sit.',
    // A client raises no contract by hand: the award writes both sides
    // and their due dates (station 4 of the client program), and the
    // rows on this page are its vendors' lines. The contracts page had
    // this right before the framing did — it hid the button from a
    // client with "A client does not raise contracts here — their
    // vendors do" — and briefly the two disagreed. The page was right.
    create: null,
  },
  'contracts.buy': {
    title: 'Contracts',
    subtitle: 'Everyone working at your sites, across every vendor.',
    create: null,
  },
  requirements: {
    title: 'Open roles',
    subtitle: 'Roles you have opened to your vendors. Track how many candidates each has drawn.',
    // A client opens roles to its vendors, so the button stands here
    // too, and a seated program office inherits it. The word is the
    // page's own — if a client's desk should read "New role" to match
    // "Open roles" above it, that is a change to make on purpose rather
    // than while fixing a missing button.
    create: 'New requirement',
  },
  submissions: {
    title: 'Candidates',
    subtitle: 'People your vendors have put forward. Shortlist, interview, and place.',
    // A client's vendors put people forward; a client does not submit to
    // itself, and the route refuses it.
    create: null,
  },
  rolloff: {
    title: 'Ending soon',
    subtitle: 'Contractors whose assignments end shortly. Decide to extend, backfill, or release.',
    create: null,
  },
  timesheets: {
    title: 'Timesheets',
    subtitle: 'Hours worked at your sites, awaiting your approval. Flagged entries are shown first.',
    // Station 6 of the client program: the worker files their own week,
    // nobody else may. A client signs hours; it does not enter them.
    create: null,
  },
  invoices: {
    title: 'Invoices',
    subtitle: 'What your vendors have billed you, and what is outstanding.',
    // A client receives and matches its suppliers' invoices. Generating
    // one would be raising a bill to itself.
    create: null,
  },
  expenses: {
    title: 'Expenses',
    subtitle: 'Billable expenses raised against work at your sites, awaiting your approval.',
    create: null,
  },
  consultants: {
    title: 'Contractors',
    subtitle: 'People working at your sites. Skills, work authorization, and tenure.',
    create: null,
  },
}

/**
 * What this page holds, in the words a clause about it should use.
 *
 * "Cavanaugh Glassworks' contracts" and not "Cavanaugh Glassworks'
 * Ending soon" — the title is a heading and several of them do not
 * survive being made possessive, which is the whole reason this is a
 * second short list rather than a lowercased title.
 */
const BOOK: Record<PageKey, string> = {
  'contracts.sell': 'contracts',
  'contracts.buy': 'contracts',
  requirements: 'open roles',
  submissions: 'candidates',
  rolloff: 'contractors ending soon',
  timesheets: 'hours',
  invoices: 'invoices',
  expenses: 'expenses',
  consultants: 'contractors',
}

/**
 * The route each shared page lives at — the menu entry a supplier, an
 * integrator or a program office clicks to reach it.
 *
 * Both contract tabs are one route with a query on it (`?side=sell`),
 * and both sit in the same section for every party, so the section is
 * answered by the path alone.
 */
const ROUTE: Record<PageKey, string> = {
  'contracts.sell': '/dashboard/contracts',
  'contracts.buy': '/dashboard/contracts',
  requirements: '/dashboard/requirements',
  submissions: '/dashboard/submissions',
  rolloff: '/dashboard/rolloff',
  timesheets: '/dashboard/timesheets',
  invoices: '/dashboard/invoices',
  expenses: '/dashboard/expenses',
  consultants: '/dashboard/consultants',
}

/**
 * Where a party's own menu sends the reader for this work, when it is
 * not the route above.
 *
 * A client's roles are raised and released from /dashboard/requisitions
 * and its people are the merged register at /dashboard/people — one row
 * per human rather than one per submission. Both are the client's front
 * door to the same work, so both are where the section over it is read
 * from. Every entry here is checked against the menus by
 * `__tests__/invariants/page-framing.test.ts`, so a menu that stops
 * offering one of these fails the build rather than heading a page with
 * a section the reader cannot click.
 *
 * A seated reader reads the client's entries for the same reason they
 * read the client's menu: the seat is at the client, and the book is the
 * client's.
 */
const MENU_ENTRY: Partial<Record<CompanyKind, Partial<Record<PageKey, string>>>> = {
  CLIENT: {
    requirements: '/dashboard/requisitions',
    consultants: '/dashboard/people',
  },
}

/** A nav href without its query — `/dashboard/contracts?side=buy` is the
 *  contracts page whichever tab it opens on. */
function path(href: string): string {
  const q = href.indexOf('?')
  return q === -1 ? href : href.slice(0, q)
}

/**
 * The section this party's own menu puts a page under, or null where its
 * menu does not offer the page at all.
 *
 * Null rather than a guess: a heading that names a section the reader
 * has no way to click is what this file is here to stop, and a blank is
 * honest where a word would not be.
 *
 * The seat goes to `getNavForKind` rather than being resolved to a kind
 * here, because the shell already decides what a seated reader's menu is
 * (`seatedAtClient` in components/shell/sidebar) and one decision is the
 * point: the heading over a page and the section in the sidebar cannot
 * disagree if only one of them is ever computed.
 */
export function sectionOfHref(
  kind: CompanyKind,
  href: string,
  reading?: Reading | null
): string | null {
  const seat = seated(reading)
    // The name is only a label on the seat here; the menu turns on the
    // fact of one. Where the route did not name the client, the seat is
    // still a seat.
    ? { seatedAtClient: bookOwner(reading) ?? 'a client' }
    : {}
  for (const section of getNavForKind(kind, false, seat)) {
    if (section.items.some((item) => path(item.href) === path(href))) return section.label
  }
  return null
}

/** The same question asked about a shared page rather than a raw href. */
export function sectionFor(
  kind: CompanyKind,
  page: PageKey,
  reading?: Reading | null
): string | null {
  const menuKind: CompanyKind = seated(reading) ? 'CLIENT' : kind
  return sectionOfHref(kind, MENU_ENTRY[menuKind]?.[page] ?? ROUTE[page], reading)
}

/**
 * How a page is headed for the person reading it.
 *
 * The words come from whose book is open and which side of the trade
 * that book is on; the section over them comes from the menu that reader
 * is actually shown, so the two can never say different things again.
 * Where a page is reachable from more than one party's menu, the eyebrow
 * follows the viewer's.
 *
 * `reading` is optional and absent means "their own book", so every
 * caller that predates seats keeps the framing it had to the letter.
 */
export function pageFraming(
  kind: CompanyKind,
  page: PageKey,
  reading?: Reading | null
): PageFraming {
  const inSeat = seated(reading)
  const words = inSeat || kind === 'CLIENT' ? CLIENT[page] : SUPPLIER[page]
  const owner = bookOwner(reading)

  // Named, or nothing. A clause that says "somebody else's book" without
  // saying whose is a sentence a reader cannot act on, and a guessed
  // name on a page about two companies' money is worse than a blank.
  const whose = inSeat && owner
    ? `${possessive(owner)} ${BOOK[page]}, read from the seat it granted.`
    : null

  return {
    eyebrow: sectionFor(kind, page, reading) ?? '',
    ...words,
    subtitle: whose ? `${words.subtitle} ${whose}` : words.subtitle,
    whose,
  }
}

/** "Cavanaugh Glassworks'" — and "Auralis Software's". */
function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`
}
