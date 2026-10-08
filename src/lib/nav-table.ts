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
import { readsOnlyOwnWork } from '@/lib/console-home'
import { IMPORT_PERMISSIONS } from '@/lib/importable'
import { SETS_UP_A_PARTY } from '@/lib/party-onboarding'
import { ENDING_SOON_READERS, CHECK_IN_READERS } from '@/lib/releasing-soon'

/**
 * Sidebar navigation — from CLAUDE.md design system.
 *
 * Navigation per company type, and this file and CLAUDE.md's table are
 * held together by a test rather than by anybody remembering:
 *
 *   Vendor     → Today → Sell → Procure → Operate → Grow → Governance
 *   GSI        → Today → Deliver → Supply → Operate → Grow → Governance
 *   MSP        → Today → Demand → Supply → Operate → Grow → Governance
 *   Client     → Workforce → Governance
 *   Consultant → You
 *
 * Phase 1 ships Vendor and Client. GSI and MSP are Phase 3/4 by that same
 * rule — built ahead of it on explicit instruction, not by drift.
 */

export type NavSection = {
  label: string
  items: NavItem[]
}

export type NavItem = {
  label: string
  href: string
  icon: string  // emoji for now; SVG icons later
  badge?: number
  /**
   * Optional sub-heading inside a section. Operate had grown to 22 flat
   * links with nothing between them — a founder note ("too many
   * organized links") traced to exactly this section, and a second one
   * ("all over the place") to the same shape on the integrator's.
   *
   * A section is either short enough to read as a list — seven links at
   * the outside — or every link in it carries one of these.
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
}

export type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

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
} satisfies Pick<NavItem, 'needs' | 'api'>

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
} satisfies Pick<NavItem, 'needs' | 'api'>

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
  'No one permission opens it: it scopes itself to your company, and a seat holding no desk that reads it is refused, or shown only the weeks and lines that name you.'
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
  '/dashboard/notifications': ADDRESSED,
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
  '/dashboard/requisitions': SCOPED,
  '/dashboard/people': SCOPED,
  '/dashboard/program/budget': SCOPED_TO_A_DESK,
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
 * ── One scheme, five parties ─────────────────────────────────────────
 *
 * The founder walked the app and said it: "System integrator is all over
 * the place. Network on left navigation is missing, contracts are all
 * over the place... contracts buy sell timesheets should be under
 * operate — overall make all level 1 navigation as organized as client
 * party is."
 *
 * Three things were true. Contracts were split by which side of the
 * trade they sat on — "Sell contracts" under Sell, "Buy contracts" under
 * Talent — so the same table was reached from two unrelated places and
 * neither was where somebody administering a placement would look. The
 * Network group the client got on 2026-09-13 never reached anybody else,
 * and a supplier has counterparties too. And the integrator's Operate
 * was a seventeen-item run with two sub-headings in it.
 *
 * So there is one scheme now, and every party is cut to it:
 *
 *   Today       the queue — what needs somebody this morning
 *   <trade>     what this firm does with the outside world, named in its
 *               own words: Sell, Deliver, Demand, Workforce
 *   <supply>    where its people come from: Procure, Supply
 *   Operate     the week: the network it trades with, the contracts and
 *               the hours under them, and the money either way
 *   Grow        what it earned and how it looks to a buyer
 *   Governance  compliance, and the things set up once
 *
 * Two rules hold it together, and `__tests__/invariants/sidebar-nav.test.ts`
 * fails when either is broken:
 *
 *   · **Seven.** No run of links is longer than seven without a named
 *     sub-heading, and no sub-heading holds more than seven. Seven is
 *     where a person stops scanning and starts searching, and it is the
 *     length of the client's own longest group — the nav the founder
 *     called organized.
 *   · **Contracts and timesheets are Operate's, for everybody.** Both
 *     sides of a contract and the hours under them are one job — the
 *     administration of a placement — whoever is doing it.
 *
 * `href` is typed as `string` because a few destinations carry a query
 * (`?side=sell`) and Next.js typedRoutes would reject them.
 */

/** The queue every firm opens on. Four items, so it needs no headings. */
const TODAY: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '◉' },
  { label: 'Needs attention', href: '/dashboard/decisions', icon: '⬡' },
  { label: 'Conversations', href: '/dashboard/conversations', icon: '💬' },
  { label: 'Notifications', href: '/dashboard/notifications', icon: '⦿' },
]

/**
 * Network — the registers of who this firm deals with.
 *
 * The client's version is Contractors · Suppliers · Contacts: the people
 * it uses, the firms it buys from, the humans to call. A supplier's is
 * the same question asked from the other chair — the firms it buys from,
 * the register of every counterparty, and the rolodex. Its own people
 * are not counterparties, so they stay under Procure or Supply where the
 * bench screens are.
 *
 * Suppliers is new on this side and it is not a stub: `/api/suppliers`
 * is scoped to the caller as the buyer, which is exactly what a prime
 * with sub-vendors under it has been unable to reach from the menu.
 */
const NETWORK: NavItem[] = [
  { label: 'Suppliers', href: '/dashboard/suppliers', icon: '⬡', group: 'Network', needs: ['vendors.read', 'requirements.read', 'payments.record'] },
  { label: 'Companies', href: '/dashboard/companies', icon: '▣', group: 'Network' },
  { label: 'Contacts', href: '/dashboard/contacts', icon: '☎', group: 'Network' },
]

/**
 * The administration of a placement, in the order it happens: the paper
 * that agreed it, the ceiling it draws down, the week worked, what it
 * cost on the road. Both sides of the contract are here and adjacent —
 * the founder's own instruction — because "sell" and "buy" are two tabs
 * of one table and a person filing a week does not think in sides.
 */
const CONTRACTS_AND_TIME: NavItem[] = [
  { label: 'Sell contracts', href: '/dashboard/contracts?side=sell', icon: '▤', group: 'Contracts & time' },
  { label: 'Buy contracts', href: '/dashboard/contracts?side=buy', icon: '▥', group: 'Contracts & time' },
  { label: 'POs', href: '/dashboard/purchase-orders', icon: '▤', group: 'Contracts & time', needs: ['invoices.read'] },
  { label: 'Timesheets', href: '/dashboard/timesheets', icon: '▦', group: 'Contracts & time' },
  { label: 'Expenses', href: '/dashboard/expenses', icon: '◫', group: 'Contracts & time', needs: ['invoices.read'] },
]

/** What was billed, what came back, what went out. */
const MONEY: NavItem[] = [
  { label: 'Bills', href: '/dashboard/invoices', icon: '▧', group: 'Money', needs: ['invoices.read'] },
  // "Bills", not "Invoices": the firm is the one billing here, and the
  // party who issues a document names it (CLAUDE.md, "Bill, invoice
  // receipt, payroll"). A client's own menu reads "Invoice receipts",
  // because what reaches a client is its suppliers' invoices, received.
  //
  // Next to Bills deliberately: same money, different question. One
  // is what we sent, the other is what came back.
  // /api/ar and /api/ap open for invoices.read (RECEIVABLE and PAYABLE
  // in lib/money/desks), which the Accounts Receivable, AP & Payroll and
  // Finance desks all hold. Annotated since 2026-09-30, once money
  // corrected the gate that used to refuse the desks named after them.
  { label: 'AR', href: '/dashboard/ar', icon: '◧', group: 'Money', needs: ['invoices.read'] },
  // The other half of the same question — who is funding whom while
  // everybody waits.
  { label: 'AP', href: '/dashboard/ap', icon: '◨', group: 'Money', needs: ['invoices.read'] },
  { label: 'Payroll', href: '/dashboard/payroll', icon: '▩', group: 'Money', needs: ['payroll.read'] },
  // What a recruiter earned on a placement. The run has been there since
  // commissions were built; nothing in the nav reached it.
  { label: 'Commissions', href: '/dashboard/payroll/commissions', icon: '◈', group: 'Money', needs: ['payroll.read'] },
]

/**
 * A queue, not a report, and a report is something somebody has to think
 * to ask for. It sits above the headings rather than inside one.
 */
const MISSING_PAPERWORK: NavItem = {
  label: 'Missing paperwork', href: '/dashboard/loose-ends', icon: '⛓',
}

/**
 * Compliance is business continuity, not filing — a lapsed certificate
 * stops a supplier working and neither fails loudly on its own. It is
 * its own heading, never mixed into the week's work, and never mixed
 * into the things set up once.
 */
const COMPLIANCE: NavItem[] = [
  { label: 'Compliance', href: '/dashboard/compliance', icon: '◆', group: 'Compliance', needs: ['governance.read'] },
  { label: 'Paperwork', href: '/dashboard/documents', icon: '▪', group: 'Compliance', ...PAPERWORK_READS },
  { label: 'Document requests', href: '/dashboard/packets', icon: '◱', group: 'Compliance' },
  // The two directions belong adjacent. A supplier spends as much time
  // being screened as screening.
  { label: 'Screening packs', href: '/dashboard/outbound-pack', icon: '◲', group: 'Compliance' },
  { label: 'Check queue', href: '/dashboard/checks', icon: '⊙', group: 'Compliance', needs: ['submissions.read'], api: 'checks/queue' },
  // /api/blacklist opens for any desk that deals with people or suppliers
  // (MAY_READ in its own desks file), the compliance officer included.
  { label: 'DNR list', href: '/dashboard/blacklist', icon: '⊘', group: 'Compliance', needs: ['consultants.read', 'vendors.read', 'governance.read'] },
]

/**
 * What is held about a person, and what they may ask for.
 *
 * Its own heading rather than a line in Compliance, for two reasons.
 * A compliance officer chasing a lapsed certificate and a compliance
 * officer answering "send me everything you hold about me" are the same
 * desk on two different mornings, and "Data requests" sitting next to
 * "Document requests" with nothing between them is exactly the pair of
 * near-identical labels this menu has been corrected for three times.
 *
 * The desk's queue and the reader's own record sit together on purpose:
 * everybody signed in has data held about them — a client's AP clerk as
 * much as a consultant — and "Your data" was reachable only from the
 * consultant's own menu, which is a right nobody else could find.
 * Somebody who already reads it under "You" is not shown it twice; see
 * getNavForKind.
 */
const PRIVACY: NavItem[] = [
  // Requests soonest-due first, the holds this company placed, and any
  // incident its records were in. Both reads are governance.read, read
  // off the three GET handlers behind the page rather than guessed.
  {
    label: 'Data requests', href: '/dashboard/privacy', icon: '⚖', group: 'Privacy',
    needs: ['governance.read'], api: 'data-requests',
  },
  // No permission beside it on purpose: the route behind it asks for
  // none, because it answers this person about this person.
  { label: 'Your data', href: '/dashboard/my-data', icon: '⛁', group: 'Privacy' },
]

/** Done once, by one person, and never on a Friday afternoon. */
const ADMIN: NavItem[] = [
  // Who is seated here and what each desk may do. `/api/access` gates
  // its read on governance.read since 2026-09-21, so an AP clerk is no
  // longer shown a link that answers them with a refusal.
  { label: 'Users & permissions', href: '/dashboard/access', icon: '⚿', group: 'Admin', needs: ['governance.read'] },
  // The page is the company's own setup — its roles and what each may
  // do, its wall, its calendar, its cost centers — and the route asks
  // settings.manage for the read as well as the write since 2026-09-21.
  { label: 'Settings', href: '/dashboard/settings', icon: '⚙', group: 'Admin', needs: ['settings.manage'] },
  // What the system did on the company's behalf, read by the desks that
  // read the rules it ran under.
  { label: 'Automation', href: '/dashboard/automation', icon: '⚙', group: 'Admin', needs: ['governance.read'] },
  // The journal out to their books, and the statement back against ours.
  // Money, so read by the desks that read money.
  { label: 'Integrations', href: '/dashboard/integrations', icon: '⇄', group: 'Admin', needs: ['invoices.read'], api: 'integrations/export' },
  // Any one kind of sheet this seat may load opens it.
  { label: 'Import', href: '/dashboard/data', icon: '⤓', group: 'Admin', needs: IMPORT_PERMISSIONS, api: 'imports/sheets' },
  // Five onboardings, derived live from what exists, read by the desks
  // that bring each party on.
  { label: 'Setup', href: '/dashboard/onboarding', icon: '☑', group: 'Admin', needs: SETS_UP_A_PARTY, api: 'onboarding/readiness' },
]

/**
 * Operate, for any firm that both sells and buys. The queue first, then
 * who we trade with, then what we agreed with them, then the money.
 *
 * `network` and `money` are arguments rather than constants because an
 * MSP's supplier base is its product and lives under Supply, and because
 * a program office pays no recruiter commission. Everything else is
 * identical across the three by construction, which is what stops one
 * of them drifting the next time somebody adds a link.
 */
function operateSection(network: NavItem[], money: NavItem[]): NavSection {
  return {
    label: 'Operate',
    items: [MISSING_PAPERWORK, ...network, ...CONTRACTS_AND_TIME, ...money],
  }
}

/** Compliance and the things set up once — never the week's work. */
function governanceSection(): NavSection {
  return { label: 'Governance', items: [...COMPLIANCE, ...PRIVACY, ...ADMIN] }
}

/**
 * A staffing vendor: Today → Sell → Procure → Operate → Grow →
 * Governance.
 *
 * The first four are CLAUDE.md's own table, which the code had drifted
 * from — what shipped was "Talent" where the table says Procure, and
 * there was no Procure and no Grow at the time the table was written
 * down. Governance is the sixth, added rather than stuffed into Operate:
 * Operate held twenty-five links, of which thirteen were compliance and
 * administration nobody opens on a Friday.
 */
const VENDOR_NAV: NavSection[] = [
  { label: 'Today', items: TODAY },
  {
    // The sequence of a deal, left to right: a lead, a role somebody
    // sent you, the roles you are working, who you put up, the rounds
    // they sit, and the end of a placement — which for a bench firm is
    // the start of the next one.
    label: 'Sell',
    items: [
      { label: 'Leads', href: '/dashboard/leads', icon: '⌁' },
      { label: 'Shared with you', href: '/dashboard/invitations', icon: '✉' },
      { label: 'Job requests', href: '/dashboard/requirements', icon: '◈', needs: ['requirements.read'] },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠', needs: ENDING_SOON_READERS },
    ],
  },
  {
    // Where the people come from. "Talent" was the label and it named a
    // department, not a job; CLAUDE.md's table says Procure, which is
    // what a firm is doing when it signs somebody to a bench.
    label: 'Procure',
    items: [
      { label: 'Bench', href: '/dashboard/bench', icon: '◎', ...BENCH_READS },
      BENCH_PAY,
      { label: 'Consultants', href: '/dashboard/consultants', icon: '◌', needs: ['consultants.read'] },
      { label: 'Bench check-ins', href: '/dashboard/texts', icon: '✆', needs: CHECK_IN_READERS },
      TRAINING,
    ],
  },
  operateSection(NETWORK, MONEY),
  {
    label: 'Grow',
    items: [
      // Gated on margin.read — a Recruiter role deliberately cannot see
      // what a placement earns.
      { label: 'Profitability', href: '/dashboard/profitability', icon: '◑', needs: ['margin.read', 'pnl.read'] },
      { label: 'Reports', href: '/dashboard/reports', icon: '▨' },
      // Rate progression is how trust is carried where markup is not
      // disclosed (Addendum D), so it reads as analysis rather than as
      // an audit trail, and sits with the rest of the analysis.
      { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻', needs: ['rates.read'] },
      // A scorecard the supplier cannot see is a blacklist with better
      // manners. It decides who gets the next role, so it is not a
      // secret from the firm it is about.
      { label: 'Our scorecard', href: '/dashboard/my-standing', icon: '◈' },
    ],
  },
  governanceSection(),
]

/**
 * A GSI: Today → Deliver → Supply → Operate → Grow → Governance.
 *
 * Deliver and Supply are CLAUDE.md's words and they stay, because a GSI
 * holds both hats on one deal — prime to the client, buyer from its own
 * bench and its sub-vendors. What changes is that Operate is no longer
 * seventeen links in a row, and that the network it buys from is finally
 * reachable from the menu.
 *
 * No Leads: a GSI's demand arrives through the client relationship it
 * already has, not through a capture form, and a menu entry with nothing
 * behind it is worse than none.
 */
const GSI_NAV: NavSection[] = [
  { label: 'Today', items: TODAY },
  {
    label: 'Deliver',
    items: [
      // What the end client sent — a GSI is prime here, the same seat a
      // vendor sits in when it receives a role.
      { label: 'Shared with you', href: '/dashboard/invitations', icon: '✉' },
      { label: 'Job requests', href: '/dashboard/requirements', icon: '◈', needs: ['requirements.read'] },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠', needs: ENDING_SOON_READERS },
    ],
  },
  {
    // The GSI's own roster — checked first, on the requirement detail
    // page, before a role ever reaches a sub-vendor. See match-engine.ts:
    // that check is scoped to this company's own bench and nobody else's.
    label: 'Supply',
    items: [
      { label: 'Bench', href: '/dashboard/bench', icon: '◎', ...BENCH_READS },
      BENCH_PAY,
      { label: 'Consultants', href: '/dashboard/consultants', icon: '◌', needs: ['consultants.read'] },
      { label: 'Bench check-ins', href: '/dashboard/texts', icon: '✆', needs: CHECK_IN_READERS },
      TRAINING,
    ],
  },
  operateSection(NETWORK, MONEY),
  {
    label: 'Grow',
    items: [
      { label: 'Profitability', href: '/dashboard/profitability', icon: '◑', needs: ['margin.read', 'pnl.read'] },
      { label: 'Reports', href: '/dashboard/reports', icon: '▨' },
      { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻', needs: ['rates.read'] },
      { label: 'Our scorecard', href: '/dashboard/my-standing', icon: '◈' },
    ],
  },
  governanceSection(),
]

/**
 * An MSP: Today → Demand → Supply → Operate → Grow → Governance.
 *
 * It had no navigation at all. `getNavForKind` fell an MSP through to
 * the vendor's, under a comment saying CLAUDE.md specified none — and
 * then a seat appeared on `/demo` (Aptiva Workforce) that sells to its
 * client and buys below it, including its own W2 with no purchase order.
 * A firm that runs somebody else's program was reading a bench firm's
 * menu.
 *
 * Demand and Supply are the words the trade uses for the two halves of
 * an MSP's job — demand intake from the client, and the supply base it
 * manages on the client's behalf. Which is why Suppliers and the
 * scorecards sit under Supply here and under Network everywhere else:
 * for a vendor the list of firms it buys from is a register, and for an
 * MSP it is the product.
 *
 * What is deliberately not here, because nothing behind it is the MSP's
 * yet: the client's own program screens. An MSP acts inside a client's
 * program office through a seat the client grants it, and that seat is
 * Phase 2 (`lib/resolve-client-company` refuses in words until it
 * exists). This nav is what an MSP can do today, and no more.
 */
const MSP_NAV: NavSection[] = [
  { label: 'Today', items: TODAY },
  {
    label: 'Demand',
    items: [
      { label: 'Shared with you', href: '/dashboard/invitations', icon: '✉' },
      { label: 'Job requests', href: '/dashboard/requirements', icon: '◈', needs: ['requirements.read'] },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠', needs: ENDING_SOON_READERS },
    ],
  },
  {
    label: 'Supply',
    items: [
      { label: 'Suppliers', href: '/dashboard/suppliers', icon: '⬡', needs: ['vendors.read', 'requirements.read', 'payments.record'] },
      // Only computable where somebody buys from several firms for one
      // program, which is the whole of what an MSP is for.
      { label: 'Supplier scorecards', href: '/dashboard/scorecards', icon: '◈' },
      { label: 'Bench', href: '/dashboard/bench', icon: '◎', needs: ['consultants.read'] },
      { label: 'Consultants', href: '/dashboard/consultants', icon: '◌', needs: ['consultants.read'] },
      { label: 'Bench check-ins', href: '/dashboard/texts', icon: '✆', needs: CHECK_IN_READERS },
    ],
  },
  operateSection(
    // Suppliers is already above, under Supply. A firm appears in one
    // place in one menu or the reader has to work out which one is real.
    NETWORK.filter((i) => i.href !== '/dashboard/suppliers'),
    // No commissions: a program office is paid a fee on the program, not
    // a recruiter's split on a placement, and there is no run behind it.
    MONEY.filter((i) => i.href !== '/dashboard/payroll/commissions'),
  ),
  {
    label: 'Grow',
    items: [
      { label: 'Profitability', href: '/dashboard/profitability', icon: '◑', needs: ['margin.read', 'pnl.read'] },
      { label: 'Reports', href: '/dashboard/reports', icon: '▨' },
      { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻', needs: ['rates.read'] },
    ],
  },
  governanceSection(),
]

/**
 * A company of one: Today → Operate → Governance (→ You).
 *
 * Colleen Byrne is an ICU travel nurse paid corp-to-corp through Byrne
 * Critical Care LLC, and she was handed a staffing agency's
 * forty-nine-link menu — Leads, Bench, Consultants, Bench check-ins,
 * Training, Rolloff, Payroll commissions, Profitability — because
 * CONSULTANT_CORP fell through to VENDOR. Seen on the browser walk of
 * 2026-09-21; it is the "Candidate Karthik is all buggy" bug wearing a
 * different hat, and the fix is the same one: read the menu off what
 * the person actually does.
 *
 * She is the person **and** the firm, so she gets both halves and
 * neither is padded out:
 *
 *   · the firm's week — the contracts she is on, the order behind one,
 *     the hours, what she billed and what came back. Every one of those
 *     is a real row in her book.
 *   · her own record under "You", appended by `getNavForKind` the way
 *     it is for any other worker, because a solo corporation's owner is
 *     always somebody the work is about.
 *
 * Nothing about a bench, a pipeline or a recruiter's commission. She
 * has one consultant, herself, and a screen offering to add another is
 * a screen asking her about herself in the third person.
 */
const SOLO_NAV: NavSection[] = [
  {
    label: 'Today',
    // No Dashboard link: `/dashboard` sends a company of one to the
    // first page here (`SOLO_TODAY` in lib/console-home), so a Dashboard
    // link would be a second door onto the same page. Two doors onto one
    // page is a question the reader has to answer before they can click.
    items: TODAY.filter((i) => i.href !== '/dashboard'),
  },
  {
    label: 'Operate',
    items: [
      { label: 'Contracts', href: '/dashboard/contracts', icon: '▤' },
      { label: 'POs', href: '/dashboard/purchase-orders', icon: '▤', needs: ['invoices.read'] },
      { label: 'Timesheets', href: '/dashboard/timesheets', icon: '▦' },
      { label: 'Bills', href: '/dashboard/invoices', icon: '▧', needs: ['invoices.read'] },
      { label: 'Expenses', href: '/dashboard/expenses', icon: '◫', needs: ['invoices.read'] },
      // What came back and what is late. For somebody invoicing one or
      // two firms this is the whole of finance, and chasing it is the
      // thing an independent actually spends their Friday on.
      { label: 'AR', href: '/dashboard/ar', icon: '◧', needs: ['invoices.read'] },
    ],
  },
  {
    label: 'Governance',
    items: [
      // Her own standing as a supplier: insurance, license, the
      // certificate somebody will ask for before she starts.
      { label: 'Compliance', href: '/dashboard/compliance', icon: '◆', needs: ['governance.read'] },
      // "Company paperwork" on this menu alone, because on this menu
      // alone the firm and the person are the same human. Every other
      // party reads "Paperwork" under a heading that already says whose
      // it is; a one-person corporation reading "Paperwork" beside
      // "Your paperwork" is being asked to guess which of her two hats
      // a link belongs to.
      { label: 'Company paperwork', href: '/dashboard/documents', icon: '▪', ...PAPERWORK_READS },
      // Filtered out of here and shown under "You" for a reader who is
      // also a worker, which she always is. See getNavForKind.
      { label: 'Your data', href: '/dashboard/my-data', icon: '⛁' },
      { label: 'Settings', href: '/dashboard/settings', icon: '⚙', needs: ['settings.manage'] },
    ],
  },
]

// A consultant is a person, not a company. CLAUDE.md gives them
// "You → Grow" — their own work first, then what they could become.
//
// Grow is empty for now, on purpose. It used to point at "Training" —
// /dashboard/training — which is the vendor's own skill-gap analysis
// across a whole bench ("demand from open requirements vs supply from
// bench listings"), not a candidate's page. A consultant landing there
// saw every number at zero, because none of it was about them. A wrong
// link is worse than a missing section; this comes back once there is
// a real, candidate-scoped training screen to put here.
/**
 * The pages that belong to a person rather than to a firm.
 *
 * Kept apart from CONSULTANT_NAV because they are read by two different
 * people. Somebody on a bench has nothing else and reads only these. A
 * GSI's own billable engineer reads them **and** his employer's menu,
 * because he is both — Teleworld's payroll and the person the work is
 * about. Nothing here asks a permission: they are his own record, and
 * the routes behind them answer him because he is him.
 */
/**
 * The routes a worker's own pages call, named on each link with `api`.
 *
 * Here because a seat with no desk is let through to nothing else
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
] as const
/**
 * The routes behind "Your terms", which has no fixed address to carry
 * them: the page is keyed on the submission waiting on its terms.
 */
export const YOUR_TERMS_READS = ['submissions/*/terms'] as const

const MY_PAPERWORK_READS = ['me', 'me/papers', 'documents/*/sign', 'documents/*/upload'] as const

const YOURS: NavItem[] = [
  { label: 'Your work', href: '/dashboard/my-work', icon: '◉', api: MY_WORK_READS },
  // Not a separate "Your profile" link to /dashboard/consultants —
  // that is the vendor staff's bench-management screen, gated on
  // consultants.read, and a consultant hitting it saw a red
  // "You need consultants.read permission" where their own profile
  // should have been. /dashboard/my-page already IS the self-service
  // editor (headline, intro, skills) plus the public-page toggle;
  // having a second, broken link to a different page was the bug,
  // not a missing feature.
  { label: 'Your page', href: '/dashboard/my-page', icon: '◐', api: ['me', 'me/portfolio', 'me/portfolio/write'] },
  { label: 'Who has you', href: '/dashboard/my-benches', icon: '◈', api: ['me', 'me/benches', 'me/benches/*/respond'] },
  // What is held about them, and the two things they can ask for: a
  // copy of it, or to be forgotten. The page was built with no door on
  // to it, which is the same bug as a column nothing writes to — a
  // right nobody can find is a right nobody has. No permission beside
  // it on purpose: the route behind it asks for none, because it
  // answers this person about this person.
  { label: 'Your data', href: '/dashboard/my-data', icon: '⛁', api: ['me', 'me/data', 'me/papers', 'data-requests/*/withdraw'] },
  // What is still being asked of her, with the day each runs out. Every
  // chase letter names this page and until now the only way to it was
  // the letter itself, which makes a reminder a dead end for anybody
  // who read it on Tuesday and came looking on Thursday. No permission
  // beside it, for the same reason as "Your data": /api/me/papers asks
  // for nothing except being the person it is about.
  //
  // "Your paperwork", never "Paperwork" — a firm's own documents live
  // under Compliance or Governance and a reader who is both a worker
  // and staff at a firm sees both menus at once. Two entries reading
  // the same word is the bug the nav table exists to catch.
  { label: 'Your paperwork', href: '/dashboard/my-work/paperwork', icon: '▫', api: MY_PAPERWORK_READS },
]

const CONSULTANT_NAV: NavSection[] = [
  {
    label: 'You',
    // Notifications only here. A firm's menu already carries it under
    // Today, and two doors onto one page is a question the reader has to
    // answer before they can click.
    items: [...YOURS, { label: 'Notifications', href: '/dashboard/notifications', icon: '⦿' }],
  },
]

// Streamlined on a founder note: "so many duplicates... Contacts almost
// missing... mixed admin setup to daily operational activity... should
// reflect sequence of steps." Four real, separate problems, all fixed
// the same way this session fixed vendor's Operate section — group,
// don't rename or delete.
//
// Requisitions and Open roles read as duplicates because they sat flat
// and adjacent with no signal they were two STEPS, not two competing
// entry points: a requisition is the need before it's approved, an open
// role is the same need after it's released to suppliers. Neither page
// changed — the "Source" group below says what they actually are, in
// order. Same for the rest: every group is a real phase of the
// lifecycle this product tracks (raise → source → evaluate → engage →
// operate week to week → offboard), and the one thing done rarely
// — Settings, access, a spreadsheet import — is its own group at the
// bottom, not mixed into the middle of a page a client opens every
// Friday to approve timesheets.
const CLIENT_NAV: NavSection[] = [
  {
    // "Program" was the label and it names nothing.
    //
    // There is no Program model — /api/program is an aggregate view of
    // this client's contractors, suppliers and spend. So a client read a
    // section header that looked like a countable noun and reasonably
    // asked which one, and how many they could have. None: it is not a
    // thing you can have.
    //
    // Their workforce is. The countable things under it — agreements,
    // engagements, milestones, org units — are all real models, and this
    // is the word that covers them without inventing an entity.
    label: 'Workforce',
    items: [
      { label: 'Dashboard', href: '/dashboard/program', icon: '◉' },
      // One entry, not two.
      //
      // "Requisitions" and "Open roles" were the same Requirement row at
      // two stages — before approval and after release — and no amount of
      // grouping stopped them reading as competing entry points. A client
      // thinks in one list of roles it is hiring for, with a status on
      // each, so that is what it gets: the stage is a filter on the
      // screen rather than a fork in the menu.
      //
      // "Job requests", the founder's word on 2026-09-28: a buyer asks
      // for a job to be filled; "requirement" and "requisition" are the
      // trade's words for the same row and not the reader's.
      { label: 'Job requests', href: '/dashboard/requisitions', icon: '⊞', group: 'Source' },
      // The step where people actually arrive.
      //
      // Source (it was "Hire" until the founder's 2026-09-30 word: a
      // contingent worker is sourced from a supplier, not hired) read
      // Requirements → Interviews → Placements, which skips
      // the highest-volume screen a program office has: the
      // candidates suppliers put forward, waiting to be looked at. Not
      // "applications" — nobody applies to you here, your suppliers
      // submit — and the list already defaults to what was sent TO the
      // caller, so a client sees its inbox rather than a vendor's
      // outbox.
      // Interviews are reached from the candidate they are about, not
      // from a menu of everybody's rounds. A program office does not
      // think "show me all interviews"; it opens a submission and asks
      // what happened to that person. The page still exists and the
      // submissions list links into it — removing the entry without that
      // link would have orphaned it, since nothing else pointed there.
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇', group: 'Source' },
      // What this desk said to a supplier and what came back — the ask
      // for a starred person, a question on a candidate — in one list,
      // newest first. A client could reach it from the search box and
      // nowhere else, so the founder asked whether it existed.
      { label: 'Conversations', href: '/dashboard/conversations', icon: '💬', group: 'Source' },
      // The one entry point for people, deliberately. This used to sit
      // next to a "Candidates" link to /dashboard/submissions — the raw,
      // one-row-per-submission feed — which is exactly what made the
      // same person look duplicated: four vendors submitting one human
      // rendered as four separate rows with four separate names. That
      // link is gone; every submission is still here, merged onto the
      // one person it belongs to and expandable per row.
      { label: 'Contractors', href: '/dashboard/people', icon: '◍', group: 'Network' },
      // The growth loop. A client arrives with twelve suppliers already
      // and an MSA with each; until those are reachable in here, none of
      // the rest of this nav has anything to work on.
      { label: 'Suppliers', href: '/dashboard/suppliers', icon: '⬡', group: 'Network', needs: ['vendors.read', 'requirements.read', 'payments.record'] },
      // The rolodex — the one thing this whole nav was missing. Vendor
      // has had it for a while as "Who we work with"; a client asks the
      // same question about the people at their own suppliers just as
      // often, and had no way in.
      { label: 'Contacts', href: '/dashboard/contacts', icon: '☎', group: 'Network' },
      // The contracts list, under the name a client uses for it. It sat
      // under Source, which is where the trail that produces a placement
      // ends — but the record itself is the parent of everything below
      // it here: a timesheet, an invoice, a PO and an expense each draw
      // on one contract. First in Operate, because the rest of the
      // section is what happens to it.
      // ── Two desks, two groups ──────────────────────────────────
      //
      // Operate and Money were one section, and they are not one job.
      // HR and indirect procurement administer the workforce — the
      // contract, the purchase order behind it, the weeks worked and
      // what was spent on the road. Finance pays for it. The same
      // person does both only at a small client; at a real one they sit
      // in different buildings and neither wants the other's screens in
      // the way.
      { label: 'Contracts', href: '/dashboard/contracts', icon: '▤', group: 'Operate' },
      { label: 'POs', href: '/dashboard/purchase-orders', icon: '▤', group: 'Operate', needs: ['invoices.read'] },
      { label: 'Timesheets', href: '/dashboard/timesheets', icon: '▦', group: 'Operate' },
      { label: 'Expenses', href: '/dashboard/expenses', icon: '◫', group: 'Operate', needs: ['invoices.read'] },
      // Money is finance's. A client buys, so its whole money side is
      // payable: the bills its suppliers send, what is owed and aging,
      // and the budget all of it draws down.
      //
      // No AR and no payroll here, deliberately. Nobody owes a client
      // money for contract labor, and the supplier employs the
      // contractor — so both would be a menu entry with nothing behind
      // it, which this nav already has a rule against.
      // What a firm receives from below is an invoice receipt; what it
      // issues upward is a bill (founder, 2026-09-28). A client only
      // receives, so it reads Invoice receipts; a firm that bills reads Bills.
      { label: 'Invoice receipts', href: '/dashboard/invoices', icon: '▧', group: 'Money', needs: ['invoices.read'] },
      { label: 'AP', href: '/dashboard/ap', icon: '◨', group: 'Money', needs: ['invoices.read'] },
      { label: 'Budget', href: '/dashboard/program/budget', icon: '◱', group: 'Money' },
      { label: 'Ending soon', href: '/dashboard/rolloff', icon: '⚠', group: 'Offboard', needs: ENDING_SOON_READERS },
      { label: 'Past contractors', href: '/dashboard/alumni', icon: '◎', group: 'Offboard' },
    ],
  },
  {
    label: 'Governance',
    items: [
      // Who runs the program: approvers, the lead, and who is
      // answerable for each budget. Three facts that were in three
      // places, none of which showed the result as one picture.
      // Read by whoever raises a job request, sets the program up, or
      // seats people — the three its own GET handler asks for. It was
      // listed as asking nothing, and the HR partner opened it to a
      // refusal (chain audit, 2026-10-05): the test that reads gates
      // missed one written across two lines.
      { label: 'Program team', href: '/dashboard/program/team', icon: '⌸', group: 'Who runs it', needs: ['requirements.write', 'settings.manage', 'team.manage'] },
      // Who runs the program when it is not this client's own people. A
      // firm that runs somebody's program places nobody, so nothing ties
      // it to the client the way a placement ties a supplier — the
      // client grants it a desk here, at one of its own roles, and takes
      // it back here too. Gated on the governance read its own route
      // asks for, which every oversight desk already holds: a standing
      // grant that only the person who made it can see is not a control.
      { label: 'Program office', href: '/dashboard/program/seats', icon: '⌂', group: 'Who runs it', needs: ['governance.read'] },
      { label: 'Org view', href: '/dashboard/program/org', icon: '⬢', group: 'Who runs it' },
      { label: 'Compliance', href: '/dashboard/compliance', icon: '◆', group: 'Oversight', needs: ['governance.read'] },
      { label: 'Document requests', href: '/dashboard/packets', icon: '◱', group: 'Oversight' },
      { label: 'Tenure', href: '/dashboard/tenure', icon: '▩', group: 'Oversight' },
      // Only computable here. No supplier can work these out about
      // themselves — they cannot see what the other eleven did with the
      // same role — and no supplier's own numbers are ever bad.
      { label: 'Supplier scorecards', href: '/dashboard/scorecards', icon: '◈', group: 'Oversight' },
      // Where a chain we can only see part of makes one person look like
      // two, and the tenure number quietly goes wrong.
      { label: 'Duplicate check', href: '/dashboard/identity', icon: '⧉', group: 'Oversight' },
      // The same two links every other party gets, from the same
      // description of them. A client has a compliance officer holding
      // the same governance read, and an AP clerk with data held about
      // them, and neither had a door: the desk's queue was in nobody's
      // menu at all, and "Your data" was the consultant's alone.
      ...PRIVACY,
      { label: 'Users & permissions', href: '/dashboard/access', icon: '⚿', group: 'Setup', needs: ['governance.read'] },
      { label: 'Settings', href: '/dashboard/settings', icon: '⚙', group: 'Setup', needs: ['settings.manage'] },
      { label: 'Import', href: '/dashboard/data', icon: '⤓', group: 'Setup', needs: IMPORT_PERMISSIONS, api: 'imports/sheets' },
    ],
  },
]

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
  // (lib/console-home), so the firm's Dashboard link would be a second
  // door onto the same page. It gives way, the way "Your data" does.
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
  // (CLAUDE.md, "A one-person corporation reads its own short menu"), so
  // she reads "You" from her first day, before any placement says so.
  const worker = Boolean(seat.worker) || kind === 'CONSULTANT_CORP' || deskless
  const sections = (!isConsultant && kind && worker)
    ? [
        ...base
          .map((s) => ({
            ...s,
            items: s.items.filter((i) =>
              !ownHrefs.has(i.href)
              && !(ownFrontDoor && i.href === '/dashboard')
              && !(deskless && openBecause(i.href) !== ADDRESSED)),
          }))
          .filter((s) => s.items.length > 0),
        { label: 'You', items: YOURS },
      ]
    : base

  // "Your terms", right after "Your work", for as long as a placement of
  // theirs waits on terms. Only where a "You" section is drawn: a seat
  // that is neither a consultant nor a worker has no terms of its own.
  const withTerms = seat.termsHref
    ? sections.map((s) => s.label !== 'You' ? s : {
        ...s,
        items: [s.items[0], { label: 'Your terms', href: seat.termsHref!, icon: '◇', api: YOUR_TERMS_READS }, ...s.items.slice(1)],
      })
    : sections

  if (seat.permissions == null) return withTerms
  return withTerms
    .map((s) => ({ ...s, items: s.items.filter((i) => mayReach(i, seat.permissions)) }))
    .filter((s) => s.items.length > 0)
}

/**
 * A seat that holds no permission at all: known, and empty. Null is "not
 * known yet" and is never read as deskless.
 */
export function isDeskless(permissions: readonly string[] | null | undefined): boolean {
  return Array.isArray(permissions) && permissions.length === 0
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
        for (const r of routesOf(i)) {
          if (!routeMatches(apiPath, r)) continue
          const weight = r.replace(/\*\*$/, '').length * 2 + (r.endsWith('**') ? 0 : 1)
          if (!best || weight > best.weight) best = { label: i.label, weight }
        }
      }
    }
    if (best) return best.label
  }
  return null
}
