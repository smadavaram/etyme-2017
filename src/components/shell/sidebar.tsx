'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { EtymeMark } from '@/components/logo'
import type { Permission } from '@/lib/permissions'
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

type NavSection = {
  label: string
  items: NavItem[]
}

type NavItem = {
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
}

type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

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
  { label: 'Suppliers', href: '/dashboard/suppliers', icon: '⬡', group: 'Network' },
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
  { label: 'Invoices', href: '/dashboard/invoices', icon: '▧', group: 'Money', needs: ['invoices.read'] },
  // Next to Invoices deliberately: same money, different question. One
  // is what we sent, the other is what came back.
  // Deliberately unannotated, and it is not an oversight. /api/ar and
  // /api/ap gate their GET on margin.read or pnl.read, which the
  // Accounts Receivable and AP & Payroll roles do not hold — so the two
  // desks named after these pages are refused by them today. Hiding the
  // link would turn a wrong gate on somebody else's route into a missing
  // desk in the menu, which is the worse of the two. Reported to
  // etyme-money; the annotation goes on when the gate is right.
  { label: 'AR', href: '/dashboard/ar', icon: '◧', group: 'Money' },
  // The other half of the same question — who is funding whom while
  // everybody waits.
  { label: 'AP', href: '/dashboard/ap', icon: '◨', group: 'Money' },
  { label: 'Payroll', href: '/dashboard/payroll', icon: '▩', group: 'Money', needs: ['payroll.read'] },
  // What a recruiter earned on a placement. The run has been there since
  // commissions were built; nothing in the nav reached it.
  { label: 'Commissions', href: '/dashboard/payroll/commissions', icon: '◈', group: 'Money', needs: ['payroll.run', 'invoices.read'] },
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
  { label: 'Compliance', href: '/dashboard/compliance', icon: '◆', group: 'Compliance' },
  { label: 'Paperwork', href: '/dashboard/documents', icon: '▪', group: 'Compliance' },
  { label: 'Document requests', href: '/dashboard/packets', icon: '◱', group: 'Compliance' },
  // The two directions belong adjacent. A supplier spends as much time
  // being screened as screening.
  { label: 'Screening packs', href: '/dashboard/outbound-pack', icon: '◲', group: 'Compliance' },
  { label: 'Check queue', href: '/dashboard/checks', icon: '⊙', group: 'Compliance' },
  // Unannotated for the same reason as AR and AP: /api/blacklist gates a
  // read on consultants.write, which a Compliance Officer does not hold,
  // and a do-not-return list is compliance's own screen.
  { label: 'DNR list', href: '/dashboard/blacklist', icon: '⊘', group: 'Compliance' },
]

/** Done once, by one person, and never on a Friday afternoon. */
const ADMIN: NavItem[] = [
  { label: 'Users & permissions', href: '/dashboard/access', icon: '⚿', group: 'Admin' },
  { label: 'Settings', href: '/dashboard/settings', icon: '⚙', group: 'Admin' },
  { label: 'Automation', href: '/dashboard/automation', icon: '⚙', group: 'Admin' },
  // The journal out to their books, and the statement back against ours.
  { label: 'Integrations', href: '/dashboard/integrations', icon: '⇄', group: 'Admin' },
  { label: 'Import', href: '/dashboard/data', icon: '⤓', group: 'Admin' },
  // Five onboardings, derived live from what exists.
  { label: 'Setup', href: '/dashboard/onboarding', icon: '☑', group: 'Admin' },
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
  return { label: 'Governance', items: [...COMPLIANCE, ...ADMIN] }
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
      { label: 'Requirements', href: '/dashboard/requirements', icon: '◈', needs: ['requirements.read'] },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠' },
    ],
  },
  {
    // Where the people come from. "Talent" was the label and it named a
    // department, not a job; CLAUDE.md's table says Procure, which is
    // what a firm is doing when it signs somebody to a bench.
    label: 'Procure',
    items: [
      { label: 'Bench', href: '/dashboard/bench', icon: '◎', needs: ['consultants.read'] },
      { label: 'Consultants', href: '/dashboard/consultants', icon: '◌', needs: ['consultants.read'] },
      { label: 'Bench check-ins', href: '/dashboard/texts', icon: '✆' },
      { label: 'Training', href: '/dashboard/training', icon: '◪' },
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
      { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻' },
      // A scorecard the supplier cannot see is a blacklist with better
      // manners. It decides who gets the next role, so it is not a
      // secret from the firm it is about.
      { label: 'Your scorecard', href: '/dashboard/my-standing', icon: '◈' },
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
      { label: 'Requirements', href: '/dashboard/requirements', icon: '◈', needs: ['requirements.read'] },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠' },
    ],
  },
  {
    // The GSI's own roster — checked first, on the requirement detail
    // page, before a role ever reaches a sub-vendor. See match-engine.ts:
    // that check is scoped to this company's own bench and nobody else's.
    label: 'Supply',
    items: [
      { label: 'Bench', href: '/dashboard/bench', icon: '◎', needs: ['consultants.read'] },
      { label: 'Consultants', href: '/dashboard/consultants', icon: '◌', needs: ['consultants.read'] },
      { label: 'Bench check-ins', href: '/dashboard/texts', icon: '✆' },
      { label: 'Training', href: '/dashboard/training', icon: '◪' },
    ],
  },
  operateSection(NETWORK, MONEY),
  {
    label: 'Grow',
    items: [
      { label: 'Profitability', href: '/dashboard/profitability', icon: '◑', needs: ['margin.read', 'pnl.read'] },
      { label: 'Reports', href: '/dashboard/reports', icon: '▨' },
      { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻' },
      { label: 'Your scorecard', href: '/dashboard/my-standing', icon: '◈' },
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
      { label: 'Requirements', href: '/dashboard/requirements', icon: '◈', needs: ['requirements.read'] },
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇' },
      { label: 'Interviews', href: '/dashboard/interviews', icon: '◷' },
      { label: 'Rolloff', href: '/dashboard/rolloff', icon: '⚠' },
    ],
  },
  {
    label: 'Supply',
    items: [
      { label: 'Suppliers', href: '/dashboard/suppliers', icon: '⬡' },
      // Only computable where somebody buys from several firms for one
      // program, which is the whole of what an MSP is for.
      { label: 'Supplier scorecards', href: '/dashboard/scorecards', icon: '◈' },
      { label: 'Bench', href: '/dashboard/bench', icon: '◎', needs: ['consultants.read'] },
      { label: 'Consultants', href: '/dashboard/consultants', icon: '◌', needs: ['consultants.read'] },
      { label: 'Bench check-ins', href: '/dashboard/texts', icon: '✆' },
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
      { label: 'Rate history', href: '/dashboard/rate-history', icon: '↻' },
    ],
  },
  governanceSection(),
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
 * The three pages that belong to a person rather than to a firm.
 *
 * Kept apart from CONSULTANT_NAV because they are read by two different
 * people. Somebody on a bench has nothing else and reads only these. A
 * GSI's own billable engineer reads them **and** his employer's menu,
 * because he is both — Teleworld's payroll and the person the work is
 * about. Nothing here asks a permission: they are his own record, and
 * the routes behind them answer him because he is him.
 */
const YOURS: NavItem[] = [
  { label: 'Your work', href: '/dashboard/my-work', icon: '◉' },
  // Not a separate "Your profile" link to /dashboard/consultants —
  // that is the vendor staff's bench-management screen, gated on
  // consultants.read, and a consultant hitting it saw a red
  // "You need consultants.read permission" where their own profile
  // should have been. /dashboard/my-page already IS the self-service
  // editor (headline, intro, skills) plus the public-page toggle;
  // having a second, broken link to a different page was the bug,
  // not a missing feature.
  { label: 'Your page', href: '/dashboard/my-page', icon: '◐' },
  { label: 'Who has you', href: '/dashboard/my-benches', icon: '◈' },
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
// changed — the "Hire" group below says what they actually are, in
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
      { label: 'Requirements', href: '/dashboard/requisitions', icon: '⊞', group: 'Hire' },
      // The step where people actually arrive.
      //
      // Hire read Requirements → Interviews → Placements, which skips
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
      { label: 'Submissions', href: '/dashboard/submissions', icon: '◇', group: 'Hire' },
      // What this desk said to a supplier and what came back — the ask
      // for a starred person, a question on a candidate — in one list,
      // newest first. A client could reach it from the search box and
      // nowhere else, so the founder asked whether it existed.
      { label: 'Conversations', href: '/dashboard/conversations', icon: '💬', group: 'Hire' },
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
      { label: 'Suppliers', href: '/dashboard/suppliers', icon: '⬡', group: 'Network' },
      // The rolodex — the one thing this whole nav was missing. Vendor
      // has had it for a while as "Who we work with"; a client asks the
      // same question about the people at their own suppliers just as
      // often, and had no way in.
      { label: 'Contacts', href: '/dashboard/contacts', icon: '☎', group: 'Network' },
      // The contracts list, under the name a client uses for it. It sat
      // under Hire, which is where the trail that produces a placement
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
      { label: 'Invoices', href: '/dashboard/invoices', icon: '▧', group: 'Money', needs: ['invoices.read'] },
      { label: 'AP', href: '/dashboard/ap', icon: '◨', group: 'Money' },
      { label: 'Budget', href: '/dashboard/program/budget', icon: '◱', group: 'Money' },
      { label: 'Ending soon', href: '/dashboard/rolloff', icon: '⚠', group: 'Offboard' },
      { label: 'Past contractors', href: '/dashboard/alumni', icon: '◎', group: 'Offboard' },
    ],
  },
  {
    label: 'Governance',
    items: [
      // Who runs the program: approvers, the lead, and who is
      // answerable for each budget. Three facts that were in three
      // places, none of which showed the result as one picture.
      { label: 'Program team', href: '/dashboard/program/team', icon: '⌸', group: 'Oversight' },
      { label: 'Org view', href: '/dashboard/program/org', icon: '⬢', group: 'Oversight' },
      { label: 'Compliance', href: '/dashboard/compliance', icon: '◆', group: 'Oversight' },
      { label: 'Document requests', href: '/dashboard/packets', icon: '◱', group: 'Oversight' },
      { label: 'Tenure', href: '/dashboard/tenure', icon: '▩', group: 'Oversight' },
      // Only computable here. No supplier can work these out about
      // themselves — they cannot see what the other eleven did with the
      // same role — and no supplier's own numbers are ever bad.
      { label: 'Supplier scorecards', href: '/dashboard/scorecards', icon: '◈', group: 'Oversight' },
      // Where a chain we can only see part of makes one person look like
      // two, and the tenure number quietly goes wrong.
      { label: 'Duplicate check', href: '/dashboard/identity', icon: '⧉', group: 'Oversight' },
      { label: 'Users & permissions', href: '/dashboard/access', icon: '⚿', group: 'Setup' },
      { label: 'Settings', href: '/dashboard/settings', icon: '⚙', group: 'Setup' },
      { label: 'Import', href: '/dashboard/data', icon: '⤓', group: 'Setup' },
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
}

/** Whether this seat can open the page behind a link at all. */
export function mayReach(item: NavItem, permissions: readonly string[] | null | undefined): boolean {
  if (!item.needs || permissions == null) return true
  return item.needs.some((p) => permissions.includes(p))
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
  for (const nav of [VENDOR_NAV, GSI_NAV, MSP_NAV, CLIENT_NAV]) {
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
  const sections = (!isConsultant && kind && seat.worker)
    ? [...base, { label: 'You', items: YOURS }]
    : base

  if (seat.permissions == null) return sections
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => mayReach(i, seat.permissions)) }))
    .filter((s) => s.items.length > 0)
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
    // A company of one is a vendor with one person on the bench. It
    // sells, so it gets the seller's nav rather than a fifth shell
    // nobody asked for.
    case 'CONSULTANT_CORP':
    case 'VENDOR':
    default:       return VENDOR_NAV
  }
}

export function Sidebar({
  companyKind,
  companyName,
  companyLabel,
  isConsultant = false,
  worker = false,
  permissions,
  pending = false,
  sheet = false,
  onDismiss,
  footer,
}: {
  /** Absent for a consultant, who has no company. */
  companyKind?: CompanyKind | null
  companyName?: string
  companyLabel?: string
  /** True when this person is on a bench rather than of the company. */
  isConsultant?: boolean
  /** True when this person is also somebody the work is about — a GSI's
   *  own billable engineer holds a seat AND is the subject of a
   *  placement. They get their firm's menu and "You" both. */
  worker?: boolean
  /** What this seat holds. Undefined while the session loads, which
   *  shows the menu unfiltered rather than flashing a short one. */
  permissions?: readonly string[] | null
  /** Session still loading — render the frame without nav items so the
   *  wrong company's navigation never flashes on screen. */
  pending?: boolean
  /** The phone's slide-in sheet rather than the desktop rail: fills
   *  whatever holds it instead of pinning itself to the viewport, and
   *  gives every row a thumb-sized target. */
  sheet?: boolean
  /** The reader is done with the sheet — a destination tapped, or the
   *  close button, which only renders when this is given. */
  onDismiss?: () => void
  /** Below the company block. The sheet puts the account here. */
  footer?: ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sections = pending ? [] : getNavForKind(companyKind, isConsultant, { worker, permissions })

  // For client view, the "dashboard" link is /dashboard/program
  const dashboardHref = isConsultant
    ? '/dashboard/my-work'
    : companyKind === 'CLIENT' ? '/dashboard/program' : '/dashboard'

  return (
    <aside
      className={
        sheet
          ? 'w-full h-full flex flex-col bg-etyme-surface'
          : 'w-[220px] flex-shrink-0 h-screen sticky top-0 flex flex-col bg-etyme-surface border-r border-etyme-rule'
      }
    >
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <EtymeMark size={28} />
        <span className="font-semibold text-sm tracking-[-0.02em] text-etyme-ink">
          etyme
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close menu"
            className="ml-auto -mr-2 w-9 h-9 rounded-md flex items-center justify-center
                       text-etyme-muted hover:text-etyme-ink hover:bg-etyme-canvas transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-1">
            <div className="eyebrow px-2 pt-5 pb-1.5">
              {section.label}
            </div>
            {section.items.map((item, i) => {
              // A sub-group header prints once, the moment its name first
              // differs from the item before it — not for every item that
              // carries it. This is what turns 22 flat links into three
              // named clusters without inventing a new top-level section.
              const priorGroup = i > 0 ? section.items[i - 1].group : undefined
              const showGroup = item.group !== undefined && item.group !== priorGroup

              // Handle hrefs with query params (e.g. /dashboard/contracts?side=sell)
              const [itemPath, itemQuery] = item.href.split('?')
              const active = item.href === dashboardHref
                ? pathname === dashboardHref
                : itemQuery
                  ? pathname.startsWith(itemPath) && searchParams.get(itemQuery.split('=')[0]) === itemQuery.split('=')[1]
                  : pathname.startsWith(item.href)
              return (
                <div key={item.label}>
                  {showGroup && (
                    <div className="px-2.5 pt-3 pb-1 text-[10px] font-medium uppercase
                                    tracking-[0.06em] text-etyme-faint">
                      {item.group}
                    </div>
                  )}
                  <Link
                    href={item.href as any}
                    onClick={onDismiss}
                    className={`
                      flex items-center gap-2.5 px-2.5 rounded-md
                      ${sheet ? 'py-2.5 text-[14px]' : 'py-[7px] text-[13px]'}
                      transition-colors
                      ${active
                        ? 'bg-etyme-canvas text-etyme-ink font-medium'
                        : 'text-etyme-muted hover:text-etyme-ink hover:bg-etyme-canvas/60'
                      }
                    `}
                  >
                    <span className="w-4 text-center text-[11px] opacity-60">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="ml-auto text-[10px] font-semibold text-etyme-attention
                                       bg-etyme-attention/10 px-1.5 py-0.5 rounded-full tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom — company info */}
      <div className="px-4 py-3 border-t border-etyme-rule">
        {pending ? (
          <>
            <div className="h-3 w-24 rounded bg-etyme-rule/60 animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-etyme-rule/40 animate-pulse mt-1.5" />
          </>
        ) : (
          <>
            <div className="text-[11px] font-medium text-etyme-ink truncate">
              {companyName ?? 'Cloudepa Inc.'}
            </div>
            <div className="text-[10px] text-etyme-faint">
              {companyLabel ?? (companyKind === 'CLIENT' ? 'Client · Enterprise' : 'Vendor · US IT')}
            </div>
          </>
        )}
      </div>

      {footer}
    </aside>
  )
}
