/**
 * The navigation table, with nothing drawn and no browser in it.
 *
 * Moved out of components/shell/sidebar on 2026-10-08 (sign-up walk,
 * round two, item 17): the sidebar is a client component, and a server
 * route that reached the table through it — /api/alumni, by way of
 * lib/page-framing — was handed a client reference instead of a
 * function and died with "getNavForKind is not a function". The table
 * is data and a few pure functions over it, so it lives in lib/, and
 * the sidebar, the header, page framing, the desk a seat lands on and
 * every test read it from here.
 * `__tests__/invariants/server-imports-no-client.test.ts` fails on any
 * server route that reaches a client component.
 */

import { hasAnyPermission, type Permission } from '@/lib/permissions'
import { readsOnlyOwnWork, OWN_WORK_READS, consoleHome, type Reader } from '@/lib/console-home'
import { IMPORT_PERMISSIONS } from '@/lib/importable'
import { SETS_UP_A_PARTY } from '@/lib/party-onboarding'
import { ENDING_SOON_READERS, CHECK_IN_READERS } from '@/lib/releasing-soon'
import { TWIN_FEED_READERS } from '@/lib/twin/readers'

/**
 * Sidebar navigation — from CLAUDE.md, "Navigation per company type".
 *
 * Nine links per party (founder, 2026-10-19), and this file and
 * CLAUDE.md's table are held together by a test rather than by anybody
 * remembering:
 *
 *   Client      Ask Etyme · Today · Jobs · Candidates · Timesheets · Invoice receipts · Contractors · Suppliers · Settings
 *   Supplier,   Ask Etyme · Today · Jobs · Candidates · Timesheets · Bills · People · Companies · Settings
 *   integrator,
 *   MSP
 *   Solo        Ask Etyme · Your work · Timesheets · Bills · Contracts · Paperwork · Settings
 *   Consultant  Ask Etyme · Your work · Your page · Who has you · Your data · Your paperwork
 *
 * Every other page is a tab of one of the nine.
 */

export type NavSection = {
  /** The noun the menu prints, for a tabbed section; the heading over a list, for "You". */
  label: string
  /** Its pages. For a tabbed section, its tabs in order, the noun's own page first. */
  items: NavItem[]
  /**
   * One of the nine (founder, 2026-10-19): the menu prints one link, the
   * label, opening the first of its pages this seat may open, and every
   * page in it carries the tab row. Absent on "You", which is drawn as
   * a list of its own pages under its heading.
   */
  tabbed?: boolean
}

export type NavItem = {
  label: string
  href: string
  icon: string  // emoji for now; SVG icons later
  badge?: number
  /**
   * A sub-heading inside a section. No menu sets one since the nine
   * links (2026-10-19): a page that was a neighbor is a tab now. Kept on
   * the type because lib/page-framing reads it structurally.
   */
  group?: string
  /**
   * The permission the page behind this link actually asks for — any one
   * of them, because several routes accept either of two.
   *
   * Read off the route's own GET handler, never guessed. A link with
   * nothing here opens a page that refuses nobody: it scopes itself to
   * the caller's company and shows what that company has.
   *
   * CLAUDE.md, 2026-09-17: "A button that the route will refuse is a
   * button that lies." A menu entry makes the same promise a button
   * does, and an engineer holding two read permissions was being shown
   * forty links of his employer's administration, fifteen of which
   * answered him with a red error he could not have predicted.
   */
  needs?: readonly Permission[]
  /**
   * Where this page's own reads come from, when the page is not named
   * after the route behind it.
   *
   * The compliance desk at /dashboard/privacy reads three routes —
   * data requests, legal holds and breaches — and there is no
   * /api/privacy to mirror it. Without this, the test that reads a
   * link's permission back out of its own GET handler has nothing to
   * check the claim against, and an unchecked claim is how a menu entry
   * and the route it opens drift apart.
   *
   * Several routes where the page draws several readers' answers — the
   * bench page opens on the people for a seat that reads people, and on
   * bench profit for the finance desk that reads only money. The test
   * reads each route's gate, in this order, against `needs`.
   */
  api?: string | readonly string[]
  /**
   * The rest of what the page calls, read only to name the page when the
   * door refuses one of them. Never a gate and never an opening: the
   * menu's permission is checked against `api` alone, and the door's
   * allowlist is drawn from `api` alone, so nothing here lets anybody in.
   *
   * Sign-up walk, round five: a seat with no desk that typed the bench's
   * address was refused `/api/bench/ours` as "What you opened", because
   * the link named only the two routes its gate is read from. The page
   * calls a dozen more — its own people, holds, releases, what we need,
   * bench burn — and every one of them is the Bench page to its reader.
   */
  pageCalls?: readonly string[]
}

export type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

// What the pages behind two links call beyond the route their gate is
// read from, so a refusal at any of them names the page rather than
// "What you opened" (sign-up walk, round seven, problem 10). Same reason
// as the bench's `pageCalls`.

/** The import page (/dashboard/import), reached from the Import link: every sheet it loads, maps and commits. */
const IMPORT_CALLS = ['imports', 'imports/**'] as const
/** Supplier scorecards: the scorecards, the risk and the concentration it draws. */
const SCORECARD_CALLS = ['vendors/scorecards', 'vendors/risk', 'vendors/concentration'] as const

/**
 * Pages no menu link names, opened by address, and what each is called on
 * its own heading. Read by `pageNameOf` only after every menu, so a link
 * always wins. Hand-kept and short on purpose.
 */
export const UNLINKED_PAGES: Readonly<Record<string, string>> = {
  // /dashboard/governance, headed "What is coming".
  'governance/horizon': 'What is coming',
}

/**
 * The firm's own bench page, as a vendor's Procure and an integrator's
 * Supply name it.
 *
 * Two readers, two routes. Somebody who reads people opens it on the
 * bench (`/api/bench`, consultants.read). The finance desk reads no
 * people and reads bench profit (`/api/bench/profit`), which CLAUDE.md
 * gives the owner, the admin and finance — and was not offered the link
 * at all, because the link asked only for consultants.read (bench tester,
 * 2026-10-03). `pnl.read` is the permission that names that desk: among
 * the shipped roles it is held by Owner and Finance and nobody else, and
 * the sidebar test checks that claim against `BENCH_PROFIT_DESKS` rather
 * than trusting it.
 *
 * The program office's Bench keeps consultants.read alone: an MSP has no
 * finance desk in its shipped set.
 */
const BENCH_READS = {
  needs: ['consultants.read', 'pnl.read'] as const,
  api: ['bench', 'bench/profit'] as const,
  pageCalls: ['bench/**'] as const,
} satisfies Pick<NavItem, 'needs' | 'api' | 'pageCalls'>

/**
 * What the firm pays people waiting for a project, and whether a public
 * holiday on the bench is paid (founder, 2026-10-03). Set by the owner,
 * the admin and the finance desk (`mayChangeBenchPay`), which among the
 * shipped roles are exactly the seats holding settings.manage or
 * pnl.read; the sidebar test checks that rather than trusting it. Beside
 * Bench rather than under Settings, because the finance desk sets it and
 * does not open the company's settings.
 */
/**
 * Training: the firm's skill gaps, open jobs against the bench.
 *
 * The page has a route of its own that asks nothing, and every figure on
 * it is drawn from two that do — the bench and the open jobs. A seat that
 * reads neither was offered the link and read a page of zeros that were
 * not about anything it could see: Karthik Menon, an integrator's own
 * engineer, on the worker tester's walk (2026-10-03). So the link names
 * the two routes the page is drawn from, and the sidebar test reads both
 * gates back out of their GET handlers.
 */
const TRAINING: NavItem = {
  label: 'Training', href: '/dashboard/training', icon: '◪',
  needs: ['consultants.read', 'requirements.read'], api: ['bench', 'requirements'],
  // Its own route, which asks nothing, is still the Training page to its
  // reader when the door refuses it (round seven, problem 10).
  pageCalls: ['training', 'training/**'],
}

/**
 * The firm's paperwork: its templates, and asking somebody on its books
 * for a document. Who may be asked is read off the bench and the payroll
 * (`askTheBooks` in lib/document-request, which reads /api/bench), so a
 * seat that reads neither was offered a page whose one action said
 * "Nobody to ask" — Karthik Menon, an integrator's engineer (supply's
 * worker tester, 2026-10-03). The link names the route the page's work
 * is drawn from.
 */
const PAPERWORK_READS = {
  needs: ['consultants.read'] as const,
  api: 'bench',
  // The page's own list of templates and requests (round seven, problem 10).
  pageCalls: ['documents', 'documents/**'] as const,
} satisfies Pick<NavItem, 'needs' | 'api' | 'pageCalls'>

const BENCH_PAY: NavItem = {
  label: 'Bench pay', href: '/dashboard/settings/bench-pay', icon: '◔',
  needs: ['settings.manage', 'pnl.read'], api: 'settings/bench',
}

/**
 * ── Why a link names no permission ──────────────────────────────────
 *
 * Every link either names the permission the page behind it asks for,
 * or is here with the reason it needs none.
 * `__tests__/invariants/sidebar-nav.test.ts` fails on a link that does
 * neither, and on a reason here whose route has since grown a gate.
 *
 * Four reasons, and the fourth is not a reason but a debt: a page whose
 * route asks nothing today and should. The link stays, because a menu
 * is read off its route and never ahead of it; the route's owner has
 * been told, and the entry moves to `needs` the day the gate lands.
 */
const SCOPED =
  'The route asks for no permission: it scopes itself to your company and shows what that company has.'
/**
 * Scoped, and narrowed for a seat with no desk. Sign-up walk round three
 * (2026-10-08): these routes still name no one permission, so the link
 * cannot be filtered on one, but a seat holding no desk is no longer
 * answered the company's book — tenure, budget and the org view refuse it
 * in a sentence, timesheets and contracts show it only the weeks and
 * lines that name its holder.
 */
const SCOPED_TO_A_DESK =
  'No one permission opens it: it scopes itself to your company, and a seat that sees only its own work is refused, or shown only the weeks and lines that name you.'
const ABOUT_THEM = 'It answers this person about this person.'
const ADDRESSED = 'Everybody reads what is addressed to them.'
const DRAWN_FROM = 'No route of its own: the page is drawn from routes that each check their own reader.'
const OWES_A_GATE = (owner: string) =>
  `The route asks for no permission today and should; reported to ${owner} on 2026-09-30. ` +
  'The link follows the route, so it stays until the gate lands.'

export const OPEN_TO_EVERY_SEAT: Readonly<Record<string, string>> = {
  '/dashboard': ADDRESSED,
  '/dashboard/decisions': ADDRESSED,
  '/dashboard/conversations': ADDRESSED,
  // Ask Etyme, pinned above the sections: the same door as Conversations.
  '/dashboard/conversations/etyme': ADDRESSED,
  '/dashboard/leads': SCOPED,
  '/dashboard/invitations': SCOPED,
  '/dashboard/submissions': SCOPED,
  '/dashboard/interviews': SCOPED,
  '/dashboard/loose-ends': SCOPED,
  '/dashboard/companies': SCOPED,
  '/dashboard/contacts': SCOPED,
  '/dashboard/contracts': SCOPED_TO_A_DESK,
  '/dashboard/timesheets': SCOPED_TO_A_DESK,
  '/dashboard/packets': SCOPED,
  '/dashboard/outbound-pack': SCOPED,
  '/dashboard/program': SCOPED,
  // The program by region (founder, 2026-10-27, the region map): the same
  // page and route, one tab over. A region seat reads its own region only
  // (lib/region-scope); every other seat reads every region.
  '/dashboard/program?view=regions': SCOPED,
  '/dashboard/requisitions': SCOPED,
  '/dashboard/people': SCOPED,
  '/dashboard/program/budget': SCOPED_TO_A_DESK,
  // The client's agreements with its suppliers, a tab of Suppliers since 2026-10-19.
  '/dashboard/program/agreements': SCOPED,
  '/dashboard/alumni': SCOPED,
  '/dashboard/program/org': SCOPED_TO_A_DESK,
  '/dashboard/tenure': SCOPED_TO_A_DESK,
  '/dashboard/identity': SCOPED,
  '/dashboard/reports': DRAWN_FROM,
  '/dashboard/scorecards': DRAWN_FROM,
  '/dashboard/my-standing': DRAWN_FROM,
  '/dashboard/my-work': ABOUT_THEM,
  '/dashboard/my-work/paperwork': ABOUT_THEM,
  '/dashboard/my-page': ABOUT_THEM,
  '/dashboard/my-benches': ABOUT_THEM,
  '/dashboard/my-data': ABOUT_THEM,
  // Every seat reads the lines; what each person is paid is withheld
  // from a seat without consultants.cost (lib/money/pay-visibility).
  '/dashboard/contracts?side=buy': SCOPED_TO_A_DESK,
}

/** Why this link needs no permission, or null where it should name one. */
export function openBecause(href: string): string | null {
  return OPEN_TO_EVERY_SEAT[href] ?? OPEN_TO_EVERY_SEAT[href.split('?')[0]] ?? null
}

/**
 * ── Nine links, and a process step is a tab ──────────────────────────
 *
 * The founder, 2026-10-19 ("Nine links, no flip, and every first screen
 * names a person"): "left navigation is also exhaustive … [it] will
 * scare anyone from our app." The table carried 133 labels and a
 * supplier's owner read about forty. So a menu entry is now a noun on the
 * person's desk — Jobs, Candidates, Timesheets, the money document, the
 * people, the firms, Settings — and every page that was a neighbor is a
 * tab inside that noun's page.
 *
 * In this table each of the nine is a section with `tabbed` set: its
 * `label` is the one link the menu prints, and its `items` are the tabs
 * on its pages, in order, the noun's own page first. The link opens the
 * first tab this seat may open. Tabs are items rather than a list beside
 * them on purpose: every reader of this table — the eyebrow over a page
 * (lib/page-framing), the door for a seat with no desk, `mayOpen`, the +
 * button, ⌘K and a refusal's page name — already reads `items`, so a
 * page folded into a tab keeps its permission, its door and its name,
 * and folding a link opens nothing and closes nothing.
 *
 * Nothing behind the menu is deleted. Every page keeps its address.
 *
 * The worker's "You" is the one section that is not tabbed: it was
 * already five links (founder: "Unchanged") and is drawn as a list under
 * its heading, wherever it is appended.
 *
 * `href` is typed as `string` because a few destinations carry a query
 * (`?side=sell`) and Next.js typedRoutes would reject them.
 */

/**
 * Ask Etyme — the first of the nine on every menu (founder, 2026-10-12,
 * "Ask Etyme is the app"). A chat with the record at
 * /dashboard/conversations/etyme; the chat is conversation's.
 *
 * Ask Etyme and Conversations are one entry (founder, 2026-10-19): the
 * link opens the conversations page with Ask Etyme as its first row and
 * the other threads in the column beside it, so Conversations is Ask
 * Etyme's second page and no longer a link of its own. Neither asks for
 * a permission; everybody reads what is addressed to them.
 */
export const ASK_ETYME_HREF = '/dashboard/conversations/etyme'
/** The icon value the sidebar draws as the Etyme mark (components/logo), not an emoji. */
export const ETYME_MARK_ICON = 'etyme-mark'
// Its page reads the seat's saved thread and its greeting from one route.
export const ASK_ETYME: NavItem = { label: 'Ask Etyme', href: ASK_ETYME_HREF, icon: ETYME_MARK_ICON, api: ['conversations/twin'] }
const CONVERSATIONS: NavItem = { label: 'Conversations', href: '/dashboard/conversations', icon: '💬' }
const ASK_ETYME_SECTION: NavSection = { label: 'Ask Etyme', tabbed: true, items: [ASK_ETYME, CONVERSATIONS] }

/**
 * The Ask Etyme entry on this menu, or nothing: one entry wherever the
 * menu has Ask Etyme, its conversations, or a worker's own work (since
 * 2026-10-19 Ask Etyme answers a worker about her own weeks, papers and
 * chain — conversation's `twin/worker`). Read by the header, the landing
 * and the tests; the sidebar draws it as the first of the nine.
 */
export function pinnedOn(sections: readonly NavSection[]): NavItem[] {
  const has = (href: string) => sections.some((s) => s.items.some((i) => i.href === href))
  return has(ASK_ETYME_HREF) || has('/dashboard/conversations') || has('/dashboard/my-work') ? [ASK_ETYME] : []
}

/**
 * Where a seat lands after signing in and through the demo door (founder,
 * 2026-10-12, "Ask Etyme is the app"): in Ask Etyme, wherever the seat's
 * own menu has it, which since 2026-10-19 is every menu — a firm's,
 * because the greeting there is its work, and a worker's, because the
 * greeting there is her week. Anybody else lands where lib/console-home
 * says. One answer, read by the sign-in landing (components/desk-home)
 * and the demo door (app/api/demo).
 *
 * Today, the second of the nine, still opens the firm's own tables, one
 * click from the chat.
 */
export function landingFor(reader: Reader & { seatedAtClient?: string | null; region?: string | null }): string {
  // A region seat lands on its region: Ask Etyme reads the whole program.
  if (reader.region && reader.kind === 'CLIENT') return BY_REGION_HREF
  const menu = getNavForKind(reader.kind ?? null, Boolean(reader.isConsultant), {
    worker: reader.worker,
    permissions: reader.permissions ?? undefined,
    seatedAtClient: reader.seatedAtClient ?? (reader.seated ? 'a client' : null),
  })
  return pinnedOn(menu).length > 0 ? ASK_ETYME_HREF : consoleHome(reader).href
}

// ── Every page a menu names, once ───────────────────────────────────
//
// Each page is written once and placed under the noun it belongs to on
// each party's menu, so a page's permission is one fact wherever it is
// reached from. The permission beside each is read off the GET handler
// of the route behind it; `__tests__/invariants/sidebar-nav.test.ts`
// reads every one back out of that route.

/**
 * The program by region (founder, 2026-10-27, "go ahead and build this",
 * on the region map). A tab of the client's Today, because it is the
 * program page read a different way, never a second dashboard: one row
 * per region for a reader over the whole program, and the hiring
 * managers of one region for a seat scoped to it. The view is demand's
 * (app/dashboard/program); the scope is lib/region-scope.
 */
export const BY_REGION_HREF = '/dashboard/program?view=regions'
const BY_REGION: NavItem = { label: 'By region', href: BY_REGION_HREF, icon: '◫' }

/**
 * The whole menu of a seat that reads one region. Every other link opens
 * a page whose route reads every region, and the region door refuses
 * those (lib/region-scope), so offering them would be a menu that lies.
 * Grows as routes declare that they narrow to a region.
 */
const REGION_NAV: NavSection[] = [{ label: 'Today', tabbed: true, items: [BY_REGION] }]

/** The firm's own tables. "Needs attention" and "Notifications" left the menu on 2026-10-12 and 10-13: Ask Etyme's greeting is that list, and its mark carries the number. */
const TODAY_PAGE: NavItem = { label: 'Today', href: '/dashboard', icon: '◉' }
const REPORTS: NavItem = { label: 'Reports', href: '/dashboard/reports', icon: '▨' }
// Gated on margin.read — a Recruiter role deliberately cannot see what a placement earns.
const PROFITABILITY: NavItem = { label: 'Profitability', href: '/dashboard/profitability', icon: '◑', needs: ['margin.read', 'pnl.read'] }
// Rate progression is how trust is carried where markup is not disclosed (Addendum D).
const RATE_HISTORY: NavItem = { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻', needs: ['rates.read'] }
// A scorecard the supplier cannot see is a blacklist with better manners.
const OUR_SCORECARD: NavItem = { label: 'Our scorecard', href: '/dashboard/my-standing', icon: '◈', pageCalls: ['me/scorecard'] }

/** The job requests a supplier is working. "Jobs" on the menu, the founder's word of 2026-10-19; the machine name stays requirements. */
const JOBS: NavItem = { label: 'Jobs', href: '/dashboard/requirements', icon: '◈', needs: ['requirements.read'] }
const LEADS: NavItem = { label: 'Leads', href: '/dashboard/leads', icon: '⌁', pageCalls: ['openings', 'openings/**'] }
const SHARED_WITH_YOU: NavItem = { label: 'Shared with you', href: '/dashboard/invitations', icon: '✉' }

/** Who was put forward, and the rounds they sit. */
const CANDIDATES: NavItem = { label: 'Candidates', href: '/dashboard/submissions', icon: '◇' }
const INTERVIEWS: NavItem = { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' }

const TIMESHEETS: NavItem = { label: 'Timesheets', href: '/dashboard/timesheets', icon: '▦' }
const EXPENSES: NavItem = { label: 'Expenses', href: '/dashboard/expenses', icon: '◫', needs: ['invoices.read'] }
const ROLLOFF: NavItem = { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠', needs: ENDING_SOON_READERS }

// "Bills", not "Invoices": the firm is the one billing here, and the
// party who issues a document names it (CLAUDE.md, "Bill, invoice
// receipt, payroll"). A client's own menu reads "Invoice receipts".
const BILLS: NavItem = { label: 'Bills', href: '/dashboard/invoices', icon: '▧', needs: ['invoices.read'] }
// /api/ar and /api/ap open for invoices.read (RECEIVABLE and PAYABLE in
// lib/money/desks), which the Accounts Receivable, AP & Payroll and
// Finance desks all hold.
const AR: NavItem = { label: 'AR', href: '/dashboard/ar', icon: '◧', needs: ['invoices.read'] }
// What a supplier's own sub-vendors sent it: its invoice receipts, and what is owed on them.
const AP: NavItem = { label: 'AP', href: '/dashboard/ap', icon: '◨', needs: ['invoices.read'] }
const PAYROLL: NavItem = { label: 'Payroll', href: '/dashboard/payroll', icon: '▩', needs: ['payroll.read'] }
// What a recruiter earned on a placement.
const COMMISSIONS: NavItem = { label: 'Commissions', href: '/dashboard/payroll/commissions', icon: '◈', needs: ['payroll.read'] }

/** The firm's own people. The register first; the bench beside it. */
const PEOPLE: NavItem = { label: 'People', href: '/dashboard/consultants', icon: '◌', needs: ['consultants.read'] }
const BENCH: NavItem = { label: 'Bench', href: '/dashboard/bench', icon: '◎', ...BENCH_READS }
const CHECK_INS: NavItem = { label: 'Bench check-ins', href: '/dashboard/texts', icon: '✆', needs: CHECK_IN_READERS }

/**
 * The firms it trades with, and what it agreed with them: the register,
 * the firms it buys from, the people at them, both lines of a contract
 * and the order they draw down. `/api/suppliers` is scoped to the caller
 * as the buyer, which is what a prime with sub-vendors under it reads.
 */
const COMPANIES: NavItem = { label: 'Companies', href: '/dashboard/companies', icon: '▣' }
const SUPPLIERS: NavItem = { label: 'Suppliers', href: '/dashboard/suppliers', icon: '⬡', needs: ['vendors.read', 'requirements.read', 'payments.record'] }
const CONTACTS: NavItem = { label: 'Contacts', href: '/dashboard/contacts', icon: '☎' }
const SELL_CONTRACTS: NavItem = { label: 'Sell contracts', href: '/dashboard/contracts?side=sell', icon: '▤' }
const BUY_CONTRACTS: NavItem = { label: 'Buy contracts', href: '/dashboard/contracts?side=buy', icon: '▥' }
const POS: NavItem = { label: 'POs', href: '/dashboard/purchase-orders', icon: '▤', needs: ['invoices.read'] }
// Only computable where somebody buys from several firms for one program.
const SUPPLIER_SCORECARDS: NavItem = { label: 'Supplier scorecards', href: '/dashboard/scorecards', icon: '◈', pageCalls: SCORECARD_CALLS }

/**
 * Settings: the things set up once, the paperwork and the governance
 * (founder: "Paperwork, Governance, Team → Settings"). The page itself
 * asks settings.manage for the read since 2026-09-21; a seat without it
 * opens the first of these tabs it may.
 */
const SETTINGS: NavItem = { label: 'Settings', href: '/dashboard/settings', icon: '⚙', needs: ['settings.manage'] }
// Who is seated here and what each may do; `/api/access` gates its read on governance.read.
const USERS: NavItem = { label: 'Users & permissions', href: '/dashboard/access', icon: '⚿', needs: ['governance.read'] }
// Five onboardings, derived live from what exists, read by the seats that bring each party on.
const SETUP: NavItem = { label: 'Setup', href: '/dashboard/onboarding', icon: '☑', needs: SETS_UP_A_PARTY, api: 'onboarding/readiness' }
// Any one kind of sheet this seat may load opens it.
const IMPORT: NavItem = { label: 'Import', href: '/dashboard/data', icon: '⤓', needs: IMPORT_PERMISSIONS, api: 'imports/sheets', pageCalls: IMPORT_CALLS }
// The journal out to their books, and the statement back against ours. Money, so read by the seats that read money.
const INTEGRATIONS: NavItem = { label: 'Integrations', href: '/dashboard/integrations', icon: '⇄', needs: ['invoices.read'], api: 'integrations/export' }
// What the system did on the company's behalf.
const AUTOMATION: NavItem = { label: 'Automation', href: '/dashboard/automation', icon: '⚙', needs: ['governance.read'] }
const PAPERWORK: NavItem = { label: 'Paperwork', href: '/dashboard/documents', icon: '▪', ...PAPERWORK_READS }
/** A queue, not a report: the loose ends of the firm's placements. */
const MISSING_PAPERWORK: NavItem = { label: 'Missing paperwork', href: '/dashboard/loose-ends', icon: '⛓' }
const DOCUMENT_REQUESTS: NavItem = { label: 'Document requests', href: '/dashboard/packets', icon: '◱' }
// The other direction: a supplier spends as much time being screened as screening.
const SCREENING_PACKS: NavItem = { label: 'Screening packs', href: '/dashboard/outbound-pack', icon: '◲' }
const COMPLIANCE: NavItem = { label: 'Compliance', href: '/dashboard/compliance', icon: '◆', needs: ['governance.read'] }
const CHECK_QUEUE: NavItem = { label: 'Check queue', href: '/dashboard/checks', icon: '⊙', needs: ['submissions.read'], api: 'checks/queue' }
// /api/blacklist opens for anybody who deals with people or suppliers (MAY_READ), the compliance officer included.
const DNR_LIST: NavItem = { label: 'DNR list', href: '/dashboard/blacklist', icon: '⊘', needs: ['consultants.read', 'vendors.read', 'governance.read'] }
/**
 * What is held about a person, and what they may ask for. The compliance
 * officer's queue of requests, holds and incidents (all three reads are
 * governance.read), and the reader's own record, which every signed-in
 * person has: a client's AP clerk as much as a consultant. Somebody who
 * already reads "Your data" under "You" is not shown it twice; see
 * getNavForKind.
 */
const DATA_REQUESTS: NavItem = { label: 'Data requests', href: '/dashboard/privacy', icon: '⚖', needs: ['governance.read'], api: 'data-requests' }
const YOUR_DATA_HERE: NavItem = { label: 'Your data', href: '/dashboard/my-data', icon: '⛁' }

/** A supplier's Settings, every tab in the order a firm reaches for it. */
const FIRM_SETTINGS: NavItem[] = [
  SETTINGS, USERS, SETUP, IMPORT, INTEGRATIONS, AUTOMATION,
  PAPERWORK, MISSING_PAPERWORK, DOCUMENT_REQUESTS, SCREENING_PACKS, COMPLIANCE, CHECK_QUEUE, DNR_LIST,
  DATA_REQUESTS, YOUR_DATA_HERE,
]

const tabbed = (label: string, items: NavItem[]): NavSection => ({ label, tabbed: true, items })

/**
 * A staffing vendor: Ask Etyme · Today · Jobs · Candidates · Timesheets ·
 * Bills · People · Companies · Settings.
 */
const VENDOR_NAV: NavSection[] = [
  ASK_ETYME_SECTION,
  tabbed('Today', [TODAY_PAGE, REPORTS, PROFITABILITY, RATE_HISTORY, OUR_SCORECARD]),
  tabbed('Jobs', [JOBS, LEADS, SHARED_WITH_YOU]),
  tabbed('Candidates', [CANDIDATES, INTERVIEWS]),
  tabbed('Timesheets', [TIMESHEETS, EXPENSES, ROLLOFF]),
  tabbed('Bills', [BILLS, AR, AP, PAYROLL, COMMISSIONS]),
  tabbed('People', [PEOPLE, BENCH, BENCH_PAY, CHECK_INS, TRAINING]),
  tabbed('Companies', [COMPANIES, SUPPLIERS, CONTACTS, SELL_CONTRACTS, BUY_CONTRACTS, POS]),
  tabbed('Settings', FIRM_SETTINGS),
]

/**
 * An integrator: the supplier's nine. No Leads: a GSI's demand arrives
 * through the client relationship it already has, not through a capture
 * form. Its People are its own employees, rolling off one project and
 * onto the next — checked first on a job request before a role reaches a
 * sub-vendor (match-engine.ts: this company's own bench and nobody
 * else's).
 */
const GSI_NAV: NavSection[] = [
  ASK_ETYME_SECTION,
  tabbed('Today', [TODAY_PAGE, REPORTS, PROFITABILITY, RATE_HISTORY, OUR_SCORECARD]),
  tabbed('Jobs', [JOBS, SHARED_WITH_YOU]),
  tabbed('Candidates', [CANDIDATES, INTERVIEWS]),
  tabbed('Timesheets', [TIMESHEETS, EXPENSES, ROLLOFF]),
  tabbed('Bills', [BILLS, AR, AP, PAYROLL, COMMISSIONS]),
  tabbed('People', [PEOPLE, BENCH, BENCH_PAY, CHECK_INS, TRAINING]),
  tabbed('Companies', [COMPANIES, SUPPLIERS, CONTACTS, SELL_CONTRACTS, BUY_CONTRACTS, POS]),
  tabbed('Settings', FIRM_SETTINGS),
]

/**
 * An MSP: the supplier's nine, less People. An MSP runs the program and
 * places nobody (CLAUDE.md, "Etyme runs the program"): it holds no bench
 * and no consultants of its own, and its own setup tells it so (sign-up
 * walk, round five, problem 21), so the menu offers no People with
 * nothing behind it. No payroll and no commission run either: it pays
 * nobody and is paid a fee on the program. The supplier base it manages
 * and how each firm scores are under Companies.
 *
 * What is deliberately not here: the client's own program screens. An
 * MSP acts inside a client's program through a seat the client grants
 * it, and then reads the client's menu (`seatedAtClient`).
 */
const MSP_NAV: NavSection[] = [
  ASK_ETYME_SECTION,
  tabbed('Today', [TODAY_PAGE, REPORTS, PROFITABILITY, RATE_HISTORY]),
  tabbed('Jobs', [JOBS, SHARED_WITH_YOU]),
  tabbed('Candidates', [CANDIDATES, INTERVIEWS]),
  tabbed('Timesheets', [TIMESHEETS, EXPENSES, ROLLOFF]),
  tabbed('Bills', [BILLS, AR, AP]),
  tabbed('Companies', [COMPANIES, SUPPLIERS, SUPPLIER_SCORECARDS, CONTACTS, SELL_CONTRACTS, BUY_CONTRACTS, POS]),
  tabbed('Settings', FIRM_SETTINGS),
]

/**
 * A consultant is a person, not a company: Ask Etyme, and the pages that
 * belong to a person rather than to a firm.
 *
 * The routes a worker's own pages call are named on each link with
 * `api`, because a seat with no desk is let through to nothing else
 * (`lib/deskless-door`, sign-up walk round four): the door reads the
 * routes a desk-less seat may open off the links its menu shows it, and
 * these pages are named after no route of their own. Each entry is a
 * route under src/app/api, a `*` standing for one id;
 * `__tests__/invariants/deskless-one-door.test.ts` fails on one that
 * names no route.
 */
const MY_WORK_READS = [
  'me', 'me/work', 'me/pipeline', 'me/resumes', 'me/benches', 'me/interviews/*/respond',
  'me/papers', 'documents/*/sign', 'documents/*/upload', 'timesheets/*/submit',
  // A worker files their own expense from Your work (2026-10-20). The route
  // scopes a seat with no role at the firm to the caller's own lines.
  'expenses',
] as const
/**
 * The routes behind "Your terms", which has no fixed address to carry
 * them: the page is keyed on the submission waiting on its terms.
 */
export const YOUR_TERMS_READS = ['submissions/*/terms'] as const

const MY_PAPERWORK_READS = ['me', 'me/papers', 'documents/*/sign', 'documents/*/upload'] as const

const YOUR_WORK: NavItem = { label: 'Your work', href: '/dashboard/my-work', icon: '◉', api: MY_WORK_READS }
// /dashboard/my-page IS the self-service editor (headline, intro,
// skills) plus the public-page toggle. Never /dashboard/consultants,
// which is a firm's register gated on consultants.read.
const YOUR_PAGE: NavItem = { label: 'Your page', href: '/dashboard/my-page', icon: '◐', api: ['me', 'me/portfolio', 'me/portfolio/write'] }
const WHO_HAS_YOU: NavItem = { label: 'Who has you', href: '/dashboard/my-benches', icon: '◈', api: ['me', 'me/benches', 'me/benches/*/respond'] }
// What is held about them, and the two things they can ask for: a copy, or to be forgotten.
const YOUR_DATA: NavItem = { label: 'Your data', href: '/dashboard/my-data', icon: '⛁', api: ['me', 'me/data', 'me/papers', 'data-requests/*/withdraw'] }
// What is still being asked of her, with the day each runs out. Every
// chase letter names this page. "Your paperwork", never "Paperwork" — a
// firm's own documents are "Paperwork" and a reader who is both a worker
// and staff at a firm reads both menus at once.
const YOUR_PAPERWORK: NavItem = { label: 'Your paperwork', href: '/dashboard/my-work/paperwork', icon: '▫', api: MY_PAPERWORK_READS }

const YOURS: NavItem[] = [YOUR_WORK, YOUR_PAGE, WHO_HAS_YOU, YOUR_DATA, YOUR_PAPERWORK]

const CONSULTANT_NAV: NavSection[] = [
  // Ask Etyme answers her about her own work (2026-10-19). No
  // Conversations page of her own: a consultant's notices reach her by
  // email, and Ask Etyme is her one thread.
  { label: 'Ask Etyme', tabbed: true, items: [ASK_ETYME] },
  { label: 'You', items: [...YOURS] },
]

/**
 * A company of one: Ask Etyme · Your work · Timesheets · Bills ·
 * Contracts · Paperwork · Settings. Seven: she has no jobs and no
 * candidates.
 *
 * Colleen Byrne is an ICU travel nurse paid corp-to-corp through Byrne
 * Critical Care LLC. She is the person **and** the firm, so her own pages
 * are inside her seven rather than in a "You" appended after them: Your
 * work opens on her week, her page and who has her beside it; her
 * firm's paperwork and her own sit side by side under Paperwork, named
 * apart ("Company paperwork", "Your paperwork") because on this menu
 * alone the firm and the person are the same human. Nothing about a
 * bench, a pipeline or a recruiter's commission.
 */
const SOLO_NAV: NavSection[] = [
  ASK_ETYME_SECTION,
  tabbed('Your work', [YOUR_WORK, YOUR_PAGE, WHO_HAS_YOU]),
  tabbed('Timesheets', [TIMESHEETS, EXPENSES]),
  // What came back and what is late. For somebody invoicing one or two
  // firms this is the whole of finance.
  tabbed('Bills', [BILLS, AR]),
  tabbed('Contracts', [{ label: 'Contracts', href: '/dashboard/contracts', icon: '▤' }, POS]),
  tabbed('Paperwork', [
    { label: 'Company paperwork', href: '/dashboard/documents', icon: '▪', ...PAPERWORK_READS },
    YOUR_PAPERWORK,
    // Her own standing as a supplier: insurance, license, the certificate somebody will ask for before she starts.
    COMPLIANCE,
  ]),
  tabbed('Settings', [SETTINGS, YOUR_DATA]),
]

/**
 * A client: Ask Etyme · Today · Jobs · Candidates · Timesheets · Invoice
 * receipts · Contractors · Suppliers · Settings.
 *
 * A client only buys, so its money noun is what it receives: invoice
 * receipts, what is owed on them, the budget they draw down and the
 * orders that carry the ceiling. No AR and no payroll: nobody owes a
 * client money for contract labor, and the supplier employs the
 * contractor. Its people are Contractors — one row per human across
 * every supplier, never one per submission — with the contracts that
 * place them, who is ending soon, who has gone and the time limit.
 */
const CLIENT_NAV: NavSection[] = [
  ASK_ETYME_SECTION,
  tabbed('Today', [{ label: 'Today', href: '/dashboard/program', icon: '◉' }, BY_REGION]),
  // One entry for a job, at every stage: the stage is a filter on the
  // screen, never a fork in the menu (raised twice by the founder).
  tabbed('Jobs', [{ label: 'Jobs', href: '/dashboard/requisitions', icon: '⊞' }]),
  // What suppliers put forward, waiting to be looked at; the list
  // defaults to what was sent TO the caller.
  tabbed('Candidates', [CANDIDATES, INTERVIEWS]),
  tabbed('Timesheets', [TIMESHEETS, EXPENSES]),
  // What a firm receives from below is an invoice receipt (founder, 2026-09-28).
  tabbed('Invoice receipts', [
    { label: 'Invoice receipts', href: '/dashboard/invoices', icon: '▧', needs: ['invoices.read'] },
    AP,
    { label: 'Budget', href: '/dashboard/program/budget', icon: '◱' },
    POS,
  ]),
  tabbed('Contractors', [
    { label: 'Contractors', href: '/dashboard/people', icon: '◍' },
    { label: 'Contracts', href: '/dashboard/contracts', icon: '▤' },
    { label: 'Ending soon', href: '/dashboard/rolloff', icon: '⚠', needs: ENDING_SOON_READERS },
    { label: 'Past contractors', href: '/dashboard/alumni', icon: '◎' },
    { label: 'Tenure', href: '/dashboard/tenure', icon: '▩' },
    // Where a chain we can only see part of makes one person look like two.
    { label: 'Duplicate check', href: '/dashboard/identity', icon: '⧉' },
  ]),
  tabbed('Suppliers', [
    SUPPLIERS,
    CONTACTS,
    { label: 'Agreements', href: '/dashboard/program/agreements', icon: '▤' },
    // Only computable here: no supplier can work these out about itself.
    SUPPLIER_SCORECARDS,
  ]),
  tabbed('Settings', [
    SETTINGS,
    USERS,
    // Who runs the program: approvers, the lead, and who is answerable
    // for each budget. Read by whoever raises a job request, sets the
    // program up, or seats people — the three its GET handler asks for.
    { label: 'Program team', href: '/dashboard/program/team', icon: '⌸', needs: ['requirements.write', 'settings.manage', 'team.manage'] },
    // The MSP the client seats in its program, granted and taken back here.
    { label: 'MSPs', href: '/dashboard/program/seats', icon: '⌂', needs: ['governance.read'] },
    { label: 'Org view', href: '/dashboard/program/org', icon: '⬢' },
    COMPLIANCE,
    DOCUMENT_REQUESTS,
    // The program manager's twin (2026-10-12): what it did, what it is
    // waiting on a person for, and what it may do.
    { label: 'Program twin', href: '/dashboard/twin', icon: '◎', needs: TWIN_FEED_READERS, api: 'twin/ledger', pageCalls: ['twin/**'] },
    DATA_REQUESTS,
    YOUR_DATA_HERE,
    IMPORT,
  ]),
]

/** The tab row for the page being read: the noun's pages, when it has more than one. */
export function tabsFor(sections: readonly NavSection[], current: string | null): { label: string; tabs: NavItem[] } | null {
  if (!current) return null
  const section = sections.find((s) => s.tabbed && s.items.some((i) => i.href === current))
  // Ask Etyme draws its own column of threads, so it never carries a tab row.
  if (!section || section.items.length < 2 || section.items.some((i) => i.href === ASK_ETYME_HREF)) return null
  return { label: section.label, tabs: section.items }
}

/** The one link a menu prints for a section: the noun, opening its first page; or, for "You", each page. */
export function linksOf(section: NavSection): NavItem[] {
  if (!section.tabbed) return section.items
  const first = section.items[0]
  return first ? [{ ...first, label: section.label }] : []
}

/**
 * Which navigation a seat reads.
 *
 * Exported so that a test can ask whether a landing page a seat is sent
 * to is a page that seat's own navigation offers, and so the header's
 * search can offer a party exactly the pages its own menu does. A demo
 * door that lands somebody on a page with no way back is how the
 * integrator seat was lost for a week.
 */
export type SeatFacts = {
  /**
   * This person is somebody the work is about, as well as somebody's
   * staff — `ownPage()` in lib/consultant-portfolio, read off placements,
   * submissions and contracts rather than off a context type.
   *
   * Their firm's menu gains a "You" section; it never replaces it.
   */
  worker?: boolean
  /**
   * What this seat holds. Undefined means "do not filter" — which is
   * what the structural tests read, and what the shell shows for the
   * moment before /api/me answers.
   */
  permissions?: readonly string[] | null
  /**
   * The client whose program office this firm holds a desk in
   * (`seatFor` in lib/program-seat), if any.
   *
   * A program office with a live seat reads the client's book on every
   * page it opens — `lib/money/seated-books` made sure of that — and was
   * still reading its own menu over it: Aptiva Workforce sat at
   * Cavanaugh Glassworks' desk under the headings "Demand" and "Supply",
   * above seven of Cavanaugh's buy-side contracts. A menu that names a
   * different job from the book underneath it is the same lie a wrong
   * eyebrow is, one layer up.
   *
   * The permissions above come from the seat too, and they are the
   * client's role's, not the office's — which is what makes this safe:
   * the office is shown exactly the desk it was granted.
   */
  seatedAtClient?: string | null
  /**
   * Where this person agrees their own terms while a placement of theirs
   * reads "Awarded, terms pending" (`lib/your-terms`), or null. Offered as
   * "Your terms" in the "You" section and only while it is pending — the
   * page is keyed on a submission, so there is no standing page to link
   * to once the terms are agreed.
   */
  termsHref?: string | null
  /**
   * The region this seat reads, where it sits on a REGION unit
   * (lib/region-scope). Such a seat reads `REGION_NAV` and nothing else.
   */
  region?: string | null
}

/**
 * Whether this seat can open the page behind a link at all.
 *
 * Asked through `hasAnyPermission` rather than by comparing strings,
 * because a seat that holds everything holds it as the single wildcard
 * `*` and not as a list — that is what every seeded owner in the world
 * carries, and what `lib/permissions` has always meant by it. Comparing
 * strings here meant the menu and the routes disagreed for exactly the
 * people who can do the most: Techpeple's owner was shown no
 * Requirements, no Bench, no Invoices and no Payroll, while every one of
 * those routes let him straight in. Found on the browser walk for the
 * privacy desk, 2026-09-19 — the vendor's own owner could not see a link
 * his own company's compliance desk is named for.
 */
export function mayReach(item: NavItem, permissions: readonly string[] | null | undefined): boolean {
  if (!item.needs || permissions == null) return true
  return hasAnyPermission(permissions, item.needs)
}

/**
 * What a page asks for, wherever in the product it is reached from.
 *
 * The + button and ⌘K open the same pages the menu does, and a page's
 * gate is a fact about the page rather than about the menu that names
 * it. Asking "is it on this seat's menu" instead was briefly the rule
 * and it emptied the client's + button: "New role" opens
 * /dashboard/requirements?new=1 while a client's own menu reaches the
 * same roles through /dashboard/requisitions, and "Review approvals"
 * opens a page no client menu names at all. Neither refuses anybody.
 *
 * A path nothing anywhere annotates is a page that refuses nobody, and
 * the answer is yes.
 */
export function mayOpen(href: string, permissions: readonly string[] | null | undefined): boolean {
  if (permissions == null) return true
  const path = href.split('?')[0]
  for (const nav of [VENDOR_NAV, GSI_NAV, MSP_NAV, CLIENT_NAV, SOLO_NAV]) {
    for (const section of nav) {
      for (const item of section.items) {
        if (item.href.split('?')[0] === path && item.needs) return mayReach(item, permissions)
      }
    }
  }
  return true
}

export function getNavForKind(
  kind: CompanyKind | null | undefined,
  isConsultant: boolean,
  seat: SeatFacts = {}
): NavSection[] {
  // A seat that reads one region of a client's program: its region and
  // nothing the region door would refuse.
  if (seat.region && kind === 'CLIENT' && !isConsultant) return REGION_NAV
  // A consultant is a context type, not an absent company. Somebody on a
  // vendor's bench HAS a company — that is what a bench is — and keying on
  // the company would show them their agency's payroll and buy contracts.
  const base = (isConsultant || !kind)
    ? CONSULTANT_NAV
    // A firm acting at a client's desk reads the client's menu, because
    // it is reading the client's book. Its own menu comes back the
    // moment the seat is revoked, because this is read off the seat and
    // never stored.
    : seat.seatedAtClient
      ? CLIENT_NAV
      : kindNav(kind)

  // ── Both, never one or the other ──────────────────────────────────
  //
  // CLAUDE.md, "Who sells and who buys", 2026-09-17: a prime, a GSI or
  // an MSP staffs a client with its own W2, who needs no bench listing
  // because the employment contract already said it. Karthik Menon is
  // that person on the seeded world, and the shell forced a choice it
  // had no business forcing: his only context is EMPLOYEE at Teleworld,
  // so he read Teleworld's whole integrator menu and the four pages
  // that are actually his — his work, his page, who has him — appeared
  // nowhere at all. The demo door dropped him on /dashboard/my-work and
  // nothing in his own navigation pointed back to it.
  //
  // He is an employee of Teleworld with a real seat, and he is the
  // person the work is about. Appending rather than substituting is the
  // only reading that is true of both.
  //
  // "Your data" is the one page both menus name — a firm's Governance
  // carries it because everybody signed in has data held about them,
  // and "You" carries it because it is the reader's own record. Two
  // doors onto one page is a question the reader has to answer before
  // they can click, so the firm's copy gives way to the personal one:
  // somebody who has a "You" section reads it there.
  const ownHrefs = new Set(YOURS.map((i) => i.href))
  // A worker whose seat reads only their own work opens on "Your work"
  // (lib/console-home), so the firm's Today would be a second door onto
  // the same page. It gives way, the way "Your data" does.
  //
  // A seat that holds no permission at all — a colleague seated as Member
  // and not yet given a desk — reads its own work and what is addressed
  // to it, and nothing of the firm's (sign-up walk, round three, item 5).
  // The firm's pages that "scope themselves to your company" open to any
  // seat at the company, which is a desk's reading and not a Member's, so
  // they are not offered until somebody gives the Member a desk.
  const deskless = isDeskless(seat.permissions)
  const ownFrontDoor = (Boolean(seat.worker) || deskless) && readsOnlyOwnWork(seat.permissions)
  // A one-person firm's owner is always somebody the work is about
  // (CLAUDE.md, "A one-person corporation reads its own short menu"), and
  // her own pages are already inside her seven, so nothing is appended.
  const solo = !isConsultant && kind === 'CONSULTANT_CORP' && !seat.seatedAtClient
  const worker = Boolean(seat.worker) || deskless
  const trimmed = (!isConsultant && kind && (worker || solo))
    ? base
        .map((s) => ({
          ...s,
          items: s.items.filter((i) =>
            (solo || !ownHrefs.has(i.href))
            && !(ownFrontDoor && i.href === '/dashboard')
            && !(deskless && openBecause(i.href) !== ADDRESSED && !(solo && ownHrefs.has(i.href)))),
        }))
        .filter((s) => s.items.length > 0)
    : base
  const sections = (!isConsultant && kind && worker && !solo)
    ? [...trimmed, { label: 'You', items: YOURS }]
    : trimmed

  // "Your terms", right after "Your work", for as long as a placement of
  // theirs waits on terms. Only where a reader has a "Your work": a seat
  // that is neither a consultant nor a worker has no terms of its own.
  const terms: NavItem | null = seat.termsHref
    ? { label: 'Your terms', href: seat.termsHref, icon: '◇', api: YOUR_TERMS_READS }
    : null
  const withTerms = terms
    ? sections.map((s) => {
        const at = s.items.findIndex((i) => i.href === YOUR_WORK.href)
        return at < 0 ? s : { ...s, items: [...s.items.slice(0, at + 1), terms, ...s.items.slice(at + 1)] }
      })
    : sections

  if (seat.permissions == null) return withTerms
  return withTerms
    .map((s) => ({ ...s, items: s.items.filter((i) => mayReach(i, seat.permissions)) }))
    .filter((s) => s.items.length > 0)
}

/**
 * ── What a desk is ───────────────────────────────────────────────────
 *
 * A desk is any permission that acts on the firm's book or reads across
 * it: anything that writes, approves, pays, bills, recruits or
 * administers, and every firm-wide read — `consultants.read`,
 * `invoices.read`, `requirements.read` and the rest. The only
 * permissions that are not a desk are the two reads of a worker's own
 * work, `assignments.read` and `timesheets.read` (`OWN_WORK_READS` in
 * lib/console-home), which exist so a delivery engineer can see the
 * placement they are on and file their own week.
 *
 * Sign-up walk, round five (2026-10-08), problems 3–7. The door read
 * "desk-less" as "holds no permission at all", so Karthik Menon —
 * Teleworld's own W2 engineer, seated with exactly those two reads —
 * was treated as a desk: he read every submission his firm made with
 * its rate, the client's rate band, a colleague's placement by id, the
 * firm's counterparties and contacts, and a commercial thread he was
 * not on. The question is whether the seat holds a desk, never whether
 * it holds any permission.
 */
export const NOT_A_DESK: ReadonlySet<string> = OWN_WORK_READS

/** Whether a seat holds a desk: any permission beyond the reads of its own work. */
export function holdsADesk(permissions: readonly string[] | null | undefined): boolean {
  return Array.isArray(permissions) && permissions.some((p) => !NOT_A_DESK.has(p))
}

/**
 * A seat that holds no desk: known, and holding nothing beyond the reads
 * of its own work — a Member with no permission at all, or a worker
 * seated with only `assignments.read` and `timesheets.read`. The menu
 * and every route read it the same way. Null is "not known yet" and is
 * never read as deskless.
 */
export function isDeskless(permissions: readonly string[] | null | undefined): boolean {
  return Array.isArray(permissions) && !holdsADesk(permissions)
}

function kindNav(kind: CompanyKind): NavSection[] {
  switch (kind) {
    case 'CLIENT': return CLIENT_NAV
    case 'GSI': return GSI_NAV
    // A program office runs somebody else's program and staffs part of
    // it off its own payroll. It read the bench firm's menu until this
    // existed, which is how a seat that sells and buys ended up with
    // "Leads" and no way to reach the supplier base it manages.
    case 'MSP': return MSP_NAV
    // A company of one is one person, and reads a menu of what one
    // person's firm actually has: her contracts, her hours, her
    // invoices, her paperwork. She used to fall through to the vendor's
    // and be offered a bench, a pipeline and a commission run.
    case 'CONSULTANT_CORP': return SOLO_NAV
    case 'VENDOR':
    default:       return VENDOR_NAV
  }
}

/**
 * Which link on this menu is the page being read, if any. One answer.
 *
 * Longest match wins, so on /dashboard/my-work/paperwork it is "Your
 * paperwork" and not "Your work" as well — both lit at once was the
 * same page answering twice. A link carrying a query is the page only
 * where the query agrees; the console's own front door only on itself.
 */
export function activeHref(
  sections: readonly NavSection[],
  pathname: string,
  query: { get(name: string): string | null },
  dashboardHref: string
): string | null {
  let best: { href: string; weight: number } | null = null
  for (const section of sections) {
    for (const item of section.items) {
      const [itemPath, itemQuery] = item.href.split('?')
      const hit = item.href === dashboardHref
        ? pathname === dashboardHref
        : itemQuery
          ? pathname.startsWith(itemPath) && query.get(itemQuery.split('=')[0]) === itemQuery.split('=')[1]
          : pathname.startsWith(itemPath)
      if (!hit) continue
      // A query that agrees is more specific than the same path without one.
      const weight = itemPath.length * 2 + (itemQuery ? 1 : 0)
      if (!best || weight > best.weight) best = { href: item.href, weight }
    }
  }
  return best?.href ?? null
}


/** The routes a link's page reads: the ones it names, else its own and those under it. */
export function routesOf(item: Pick<NavItem, 'href' | 'api'>): string[] {
  if (item.api != null) return Array.isArray(item.api) ? [...item.api] : [item.api as string]
  const path = item.href.split('?')[0].replace(/^\/dashboard\/?/, '')
  return path ? [path, `${path}/**`] : []
}

/**
 * What a seat holding no desk may open, read off this table and nothing
 * else (sign-up walk, round four).
 *
 * `menu` — the routes behind every link a desk-less seat is shown, at
 * any kind of company and as a consultant: what is addressed to it, and
 * its own pages. Computed by drawing that seat's menu, so a link that
 * leaves the menu leaves the door with it.
 *
 * `scopesItself` — the routes behind the links this table marks
 * SCOPED_TO_A_DESK: each one already answers a desk-less seat itself,
 * by refusing it in a sentence and logging the read, or by showing only
 * the weeks and lines that name its holder. The declaration is the
 * reason beside the link; the door takes it at its word, and the
 * integration walk checks it.
 */
export function routesOpenToADesklessSeat(): { menu: string[]; scopesItself: string[] } {
  const menu = new Set<string>(YOUR_TERMS_READS)
  const kinds: CompanyKind[] = ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP']
  const navs = [
    ...kinds.map((k) => getNavForKind(k, false, { permissions: [] })),
    getNavForKind(null, true, { permissions: [] }),
  ]
  for (const nav of navs) for (const s of nav) for (const i of s.items) for (const r of routesOf(i)) menu.add(r)
  const scopesItself = Object.entries(OPEN_TO_EVERY_SEAT)
    .filter(([, why]) => why === SCOPED_TO_A_DESK)
    .map(([href]) => href.split('?')[0].replace(/^\/dashboard\/?/, ''))
  return { menu: [...menu].sort(), scopesItself: [...new Set(scopesItself)].sort() }
}

/**
 * Whether a route under /api matches one of these patterns: a segment
 * for a segment, `*` for any one id, and a trailing `**` for anything
 * under it.
 */
export function routeMatches(apiPath: string, pattern: string): boolean {
  const have = apiPath.replace(/^\/?api\/?/, '').replace(/\/$/, '').split('/').filter(Boolean)
  const want = pattern.split('/').filter(Boolean)
  for (let i = 0; i < want.length; i++) {
    if (want[i] === '**') return have.length > i
    if (i >= have.length) return false
    if (want[i] !== '*' && want[i] !== have[i]) return false
  }
  return have.length === want.length
}

/**
 * What the menu calls the page behind a route, read from the reader's
 * own menu first, so a client is told "Contractors" where a supplier
 * would read "Consultants". Null where no link names it.
 */
export function pageNameOf(apiPath: string, kind: CompanyKind | null | undefined): string | null {
  const own = kind ? getNavForKind(kind, false) : []
  const rest = (['CLIENT', 'VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const)
    .filter((k) => k !== kind)
    .map((k) => getNavForKind(k, false))
  for (const nav of [own, ...rest]) {
    let best: { label: string; weight: number } | null = null
    for (const s of nav) {
      for (const i of s.items) {
        for (const r of [...routesOf(i), ...(i.pageCalls ?? [])]) {
          if (!routeMatches(apiPath, r)) continue
          const weight = r.replace(/\*\*$/, '').length * 2 + (r.endsWith('**') ? 0 : 1)
          if (!best || weight > best.weight) best = { label: i.label, weight }
        }
      }
    }
    if (best) return best.label
  }
  for (const [route, name] of Object.entries(UNLINKED_PAGES)) if (routeMatches(apiPath, route)) return name
  return null
}
