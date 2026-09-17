import type { CompanyKind } from '@/components/session-provider'
import { getNavForKind } from '@/components/shell/sidebar'

/**
 * Page framing per company type.
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
 */

export interface PageFraming {
  eyebrow: string
  title: string
  subtitle: string
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

/** The words on the page, with no section name among them. */
type Words = Omit<PageFraming, 'eyebrow'>

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
  },
  'contracts.buy': {
    title: 'Buy Contracts',
    subtitle: 'What you pay for talent. Bench payments, internal contracts, and vendor agreements.',
  },
  requirements: {
    title: 'Requirements',
    subtitle: 'Open demand. Match consultants, distribute to your network, and track submissions.',
  },
  submissions: {
    title: 'Submissions',
    subtitle: 'Consultants you have put forward. Track them from submitted through to placement.',
  },
  rolloff: {
    title: 'Rolloff',
    subtitle: 'Contracts approaching their end date. Claim one to own the offboarding and redeployment.',
  },
  timesheets: {
    title: 'Timesheets',
    subtitle: 'Billable hours against sell contracts. Submit, review, and approve — with anomaly detection for flagged entries.',
  },
  invoices: {
    title: 'Invoices',
    subtitle: 'What you have billed and what is outstanding. Track aging and record payments.',
  },
  expenses: {
    title: 'Expenses',
    subtitle: 'Travel, equipment, and training. Client-billable items flow through to invoices.',
  },
  consultants: {
    title: 'Candidates',
    subtitle: 'Your talent pool. Skills, availability, work authorization, and bench tier.',
  },
}

const CLIENT: Record<PageKey, Words> = {
  'contracts.sell': {
    title: 'Contracts',
    subtitle: 'Everyone working at your sites, across every vendor. Rates, end dates, and where they sit.',
  },
  'contracts.buy': {
    title: 'Contracts',
    subtitle: 'Everyone working at your sites, across every vendor.',
  },
  requirements: {
    title: 'Open roles',
    subtitle: 'Roles you have opened to your vendors. Track how many candidates each has drawn.',
  },
  submissions: {
    title: 'Candidates',
    subtitle: 'People your vendors have put forward. Shortlist, interview, and place.',
  },
  rolloff: {
    title: 'Ending soon',
    subtitle: 'Contractors whose assignments end shortly. Decide to extend, backfill, or release.',
  },
  timesheets: {
    title: 'Timesheets',
    subtitle: 'Hours worked at your sites, awaiting your approval. Flagged entries are shown first.',
  },
  invoices: {
    title: 'Invoices',
    subtitle: 'What your vendors have billed you, and what is outstanding.',
  },
  expenses: {
    title: 'Expenses',
    subtitle: 'Billable expenses raised against work at your sites, awaiting your approval.',
  },
  consultants: {
    title: 'Contractors',
    subtitle: 'People working at your sites. Skills, work authorization, and tenure.',
  },
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
 */
export function sectionOfHref(kind: CompanyKind, href: string): string | null {
  for (const section of getNavForKind(kind, false)) {
    if (section.items.some((item) => path(item.href) === path(href))) return section.label
  }
  return null
}

/** The same question asked about a shared page rather than a raw href. */
export function sectionFor(kind: CompanyKind, page: PageKey): string | null {
  return sectionOfHref(kind, MENU_ENTRY[kind]?.[page] ?? ROUTE[page])
}

/**
 * How a page is headed for the person reading it.
 *
 * The words come from which side of the trade they sit on; the section
 * over them comes from their own navigation, so the two can never say
 * different things again. Where a page is reachable from more than one
 * party's menu, the eyebrow follows the viewer's.
 */
export function pageFraming(kind: CompanyKind, page: PageKey): PageFraming {
  const words = kind === 'CLIENT' ? CLIENT[page] : SUPPLIER[page]
  return { eyebrow: sectionFor(kind, page) ?? '', ...words }
}
