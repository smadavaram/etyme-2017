import type { CompanyKind } from '@/components/session-provider'
import { getNavForKind } from '@/lib/nav-table'

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
  | 'interviews'
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
    title: 'Job requests',
    subtitle: 'Open demand. Match consultants, distribute to your network, and track submissions.',
    // Every desk that reads this page can raise one: `POST
    // /api/requirements` has always existed and the button above the
    // list has never been gated. This said null for a commit, which
    // would have taken a working control off the screen — the opposite
    // failure to the contracts button, and the same rule settles both:
    // the framing says what the route actually does.
    create: 'New job request',
  },
  submissions: {
    title: 'Submissions',
    subtitle: 'Consultants you have put forward. Track them from submitted through to placement.',
    create: 'Submit',
  },
  interviews: {
    title: 'Interviews',
    subtitle: 'Rounds your clients asked for. Nothing is booked until the client, you and the consultant have all said yes.',
    // A supplier confirms a time; it never books a round. The client
    // proposes from the candidate's row.
    create: null,
  },
  rolloff: {
    title: 'Rolloff',
    subtitle: 'Contracts approaching their end date. Claim one to own the offboarding and redeployment.',
    create: null,
  },
  timesheets: {
    title: 'Timesheets',
    // Plain words for a page of hours, not the line they are filed on
    // (sign-up walk, round one, item 27).
    subtitle: 'Hours your people worked for your clients. Check them, approve them and bill them. Flagged weeks are shown first.',
    create: 'New',
  },
  invoices: {
    // The firm issues these to its client, so they are its bills.
    // CLAUDE.md, "Bill, invoice receipt, payroll": the party who issues
    // a document names it. The route stays /dashboard/invoices.
    title: 'Bills',
    subtitle: 'What you have billed and what is outstanding. Track aging and record payments.',
    create: 'Generate',
  },
  expenses: {
    title: 'Expenses',
    subtitle: 'Travel, equipment, and training. Client-billable items flow through to bills.',
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
    subtitle: 'Everyone working at your sites, across every supplier. Rates, end dates, and where they sit.',
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
    subtitle: 'Everyone working at your sites, across every supplier.',
    create: null,
  },
  requirements: {
    title: 'Job requests',
    subtitle: 'Jobs you have opened to your suppliers. Track how many candidates each has drawn.',
    // A client opens jobs to its vendors, so the button stands here
    // too, and a seated program office inherits it. It says "New job
    // request" because the document is the client's own and that is its
    // word on the client's menu; a supplier's "requirement" is its record
    // of a client's job, and keeps its word.
    create: 'New job request',
  },
  submissions: {
    // "Submissions", the word on the client's own menu. The page said
    // "Candidates" under a menu entry that said Submissions, so the
    // tester clicked one word and landed on another (2026-10-03).
    title: 'Submissions',
    subtitle: 'People your suppliers have put forward. Shortlist, interview, and place.',
    // A client's vendors put people forward; a client does not submit to
    // itself, and the route refuses it.
    create: null,
  },
  interviews: {
    title: 'Interviews',
    subtitle: 'Rounds with people your suppliers put forward. Nothing is booked until you, the supplier and the candidate have all said yes.',
    // Rounds are proposed from the candidate's row on Submissions, so
    // there is nothing to raise from here.
    create: null,
  },
  rolloff: {
    title: 'Ending soon',
    subtitle: 'Contractors whose assignments end shortly. Decide to extend, backfill, or release.',
    create: null,
  },
  timesheets: {
    title: 'Timesheets',
    subtitle: 'Hours worked at your sites, waiting for your approval. Flagged weeks are shown first.',
    // Station 6 of the client program: the worker files their own week,
    // nobody else may. A client signs hours; it does not enter them.
    create: null,
  },
  invoices: {
    // What a supplier sends is its invoice: the supplier issues it, so
    // the supplier names it. What the client holds is that invoice
    // received and matched, so its list is its invoice receipts
    // (CLAUDE.md, "Bill, invoice receipt, payroll").
    title: 'Invoice receipts',
    subtitle: 'What your suppliers sent you, and what is still to pay.',
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
  requirements: 'job requests',
  submissions: 'submissions',
  interviews: 'interviews',
  rolloff: 'contractors ending soon',
  timesheets: 'hours',
  invoices: 'invoice receipts',
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
  interviews: '/dashboard/interviews',
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
    // Interviews left the client's menu: a client opens a round from the
    // candidate's row on Submissions, so the page is headed by the
    // section that holds Submissions. It read "Operate", a word typed
    // into the page, until 2026-10-03.
    interviews: '/dashboard/submissions',
  },
}

/** A nav href without its query — `/dashboard/contracts?side=buy` is the
 *  contracts page whichever tab it opens on. */
function path(href: string): string {
  const q = href.indexOf('?')
  return q === -1 ? href : href.slice(0, q)
}

/**
 * The sub-headings that head a page in place of the section above them.
 *
 * Sign-up walk, round three, item 11. Most sub-headings in a menu are
 * steps of one job — "Contracts & time", "Money", "Source", "Offboard" —
 * and the section over them is the job, so a page under one is headed by
 * the section: a vendor's timesheets read Operate, a client's read
 * Workforce, as CLAUDE.md says they do.
 *
 * Two are not steps. **Network** is the register of who the firm trades
 * with, and **Compliance** is the paperwork that stops work when it
 * lapses. Each is printed as a heading of its own on every menu that has
 * it, and a reader who clicks Contacts under "Network" and lands on a page
 * headed "Operate" — or Paperwork under "Compliance" and lands on
 * "Governance" — has been sent somewhere the menu did not say. So a page
 * listed under one of these two is headed by it.
 *
 * Kept as a short named list rather than "every sub-heading", because
 * heading every page by its sub-heading would rename every contracts,
 * hours and money page for every party, and that is a decision about the
 * whole menu, not a repair to two of its headings.
 */
export const REGISTER_HEADINGS: ReadonlySet<string> = new Set(['Network', 'Compliance'])

/**
 * The heading this party's own menu prints over a page, or null where its
 * menu does not offer the page at all.
 *
 * That is the section, unless the link sits under one of the register
 * sub-headings above, in which case it is that sub-heading.
 *
 * Null rather than a guess: a heading that names a section the reader
 * has no way to click is what this file is here to stop, and a blank is
 * honest where a word would not be. The same goes for a reader whose
 * company is not known yet — null kind, null heading — so a page that
 * passes the kind only once the session has it draws no heading until
 * then, rather than a supplier's.
 *
 * The seat goes to `getNavForKind` rather than being resolved to a kind
 * here, because the shell already decides what a seated reader's menu is
 * (`seatedAtClient` in components/shell/sidebar) and one decision is the
 * point: the heading over a page and the section in the sidebar cannot
 * disagree if only one of them is ever computed.
 */
export function sectionOfHref(
  kind: CompanyKind | null | undefined,
  href: string,
  reading?: Reading | null
): string | null {
  if (!kind) return null
  const seat = seated(reading)
    // The name is only a label on the seat here; the menu turns on the
    // fact of one. Where the route did not name the client, the seat is
    // still a seat.
    ? { seatedAtClient: bookOwner(reading) ?? 'a client' }
    : {}
  return headingIn(getNavForKind(kind, false, seat), href)
}

/** Every heading a menu can put over a page: its sections, and the
 *  register sub-headings it prints. */
export function headingsOf(menu: { label: string; items: { group?: string }[] }[]): string[] {
  const out = new Set<string>()
  for (const section of menu) {
    out.add(section.label)
    for (const item of section.items) {
      if (item.group && REGISTER_HEADINGS.has(item.group)) out.add(item.group)
    }
  }
  return [...out]
}

function headingIn(
  menu: { label: string; items: { href: string; group?: string }[] }[],
  href: string
): string | null {
  for (const section of menu) {
    const item = section.items.find((i) => path(i.href) === path(href))
    if (item) return item.group && REGISTER_HEADINGS.has(item.group) ? item.group : section.label
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
  kind: CompanyKind | null | undefined,
  page: PageKey,
  reading?: Reading | null
): PageFraming {
  if (!kind) return unknownReader(page)
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

/**
 * The heading while the reader's company is not known yet.
 *
 * Sign-up walk, round two, item 8: a client's pages flashed the
 * supplier's words while the session loaded — "Hours your people worked
 * for your clients… bill them" over a client's own timesheets — because
 * the pages fell back to VENDOR. A page that does not yet know who is
 * reading says nothing about whose business it is: no section, no
 * subtitle, no button. The title stays only where both sides already use
 * the same word, so the heading never changes meaning when the session
 * lands.
 */
function unknownReader(page: PageKey): PageFraming {
  const same = SUPPLIER[page].title === CLIENT[page].title
  return { eyebrow: '', title: same ? CLIENT[page].title : '', subtitle: '', create: null, whose: null }
}

/** "Cavanaugh Glassworks'" — and "Auralis Software's". */
function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`
}

// ── The Notifications page ──────────────────────────────────────────

/** One filter on the Notifications page: a notice type and its word. */
export interface NoticeKind {
  key: string
  label: string
}

export interface NotificationsFraming {
  eyebrow: string
  title: string
  subtitle: string
  /** The filters this reader is offered, after "All". */
  kinds: NoticeKind[]
}

/**
 * What a firm's desk filters its notices by. Every one is work a firm
 * does: it puts people forward, signs hours, bills, pays.
 */
const FIRM_KINDS: NoticeKind[] = [
  { key: 'SUBMISSION', label: 'Submissions' },
  { key: 'INTERVIEW', label: 'Interviews' },
  { key: 'BENCH', label: 'Bench' },
  { key: 'TIMESHEET', label: 'Timesheets' },
  { key: 'INVOICE', label: 'Bills and invoices' },
  { key: 'EXPENSE', label: 'Expenses' },
  { key: 'CONTRACT', label: 'Contracts' },
  { key: 'ROLLOFF', label: 'Rolloff' },
  { key: 'CONVERSATION', label: 'Messages' },
  { key: 'SYSTEM', label: 'System' },
]

/** A client receives its suppliers' invoices and bills nobody. */
const CLIENT_KINDS: NoticeKind[] = FIRM_KINDS.map((k) =>
  k.key === 'INVOICE' ? { key: k.key, label: 'Invoice receipts' }
    : k.key === 'ROLLOFF' ? { key: k.key, label: 'Ending soon' }
    : k
).filter((k) => k.key !== 'BENCH')

/**
 * What a worker's own notices are about: her own work, in her own words.
 *
 * Sign-up walk, round two, item 22: a candidate whose menu is only "You"
 * opened Notifications and read "Today" over a list about bills,
 * invoices and contracts — a firm's desk, shown to the person the work
 * is about. She bills nobody and pays nobody, so those filters are not
 * offered; a filter with nothing behind it is not offered.
 */
const WORKER_KINDS: NoticeKind[] = [
  { key: 'SUBMISSION', label: 'Put forward' },
  { key: 'INTERVIEW', label: 'Interviews' },
  { key: 'TIMESHEET', label: 'Your hours' },
  { key: 'EXPENSE', label: 'Your expenses' },
  { key: 'CONTRACT', label: 'Your contracts' },
  { key: 'BENCH', label: 'Your bench listing' },
  { key: 'CONVERSATION', label: 'Messages' },
]

const NOTIFICATIONS_HREF = '/dashboard/notifications'

/**
 * How the Notifications page is headed for the person reading it.
 *
 * `consultantSeat` is the consultant seat (context type CONSULTANT), the
 * same fact the shell uses to draw the "You" menu. A firm's staffer who
 * is also a worker keeps the firm's menu and so the firm's words here.
 *
 * The eyebrow is the section the reader's own menu files the page under:
 * "Today" for a firm, "You" for a worker. While the company is not known
 * yet the page says only its title, never a firm's words.
 */
export function notificationsFraming(
  kind: CompanyKind | null | undefined,
  consultantSeat: boolean
): NotificationsFraming {
  if (consultantSeat) {
    return {
      eyebrow: sectionOfMenu(getNavForKind(kind, true), NOTIFICATIONS_HREF) ?? '',
      title: 'Notifications',
      subtitle: 'What happened on your own work: where you were put forward, your interviews, your hours and your contracts.',
      kinds: WORKER_KINDS,
    }
  }
  if (!kind) return { eyebrow: '', title: 'Notifications', subtitle: '', kinds: [] }
  const client = kind === 'CLIENT'
  return {
    eyebrow: sectionOfHref(kind, NOTIFICATIONS_HREF) ?? '',
    title: 'Notifications',
    subtitle: client
      ? 'What happened across submissions, timesheets, invoice receipts, expenses and contracts.'
      : 'What happened across your submissions, timesheets, bills and invoices, expenses and contracts.',
    kinds: client ? CLIENT_KINDS : FIRM_KINDS,
  }
}

function sectionOfMenu(menu: { label: string; items: { href: string; group?: string }[] }[], href: string): string | null {
  return headingIn(menu, href)
}
