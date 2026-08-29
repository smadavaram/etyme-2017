/**
 * The delivery matrix, as data.
 *
 * ── Why this is code and not a document ──────────────────────────────
 *
 * It was an HTML page, and within two agent runs it was wrong: accounts
 * receivable still read "not started" after it had been built and tested,
 * and the outbound screening pack had no row at all. Nobody noticed,
 * because a page cannot notice.
 *
 * This codebase has a rule about that, learned the expensive way with the
 * positioning of the home page: **a page describing what is true is wrong
 * within a month; a test is wrong for exactly one commit.**
 *
 * So the matrix is data, and `__tests__/invariants/matrix.test.ts` checks
 * the claims it makes:
 *
 *   · an L3 claiming BUILT must name files, and they must exist;
 *   · an L3 claiming BUILT must name tests, and they must exist;
 *   · every L2 an agent domain claims to answer for must be here;
 *   · every L3 must have an owner who is a real agent.
 *
 * That last set is what makes "update the matrix" a step rather than an
 * intention. An agent that builds something and does not record it here
 * breaks the build, on its own commit, while it is still the cheapest
 * moment to fix.
 *
 * ── What the levels mean ─────────────────────────────────────────────
 *
 * L1 — the value stream. L2 — the process group. L3 — the process, which
 * has an owner and a service level. L4 — the task somebody or something
 * actually picks up.
 */

import type { DomainKey } from '@/lib/domains'

export type Status =
  /** Exists, has tests, and there is a screen somebody can click. */
  | 'BUILT'
  /** The arithmetic or the model is there and something downstream is not. */
  | 'PARTIAL'
  /** Written down, nothing coded. */
  | 'SPEC'
  | 'NONE'

export interface L3 {
  code: string
  name: string
  /** What somebody actually does. */
  tasks: string[]
  /** The role that owns the process, not the agent that codes it. */
  owner: string
  status: Status
  /** Repo-relative paths. Required where status is BUILT or PARTIAL. */
  implementedBy?: string[]
  /** Repo-relative test paths. Required where status is BUILT. */
  testedBy?: string[]
}

export interface L2 {
  code: string
  name: string
  /** The domain whose agent codes this group. */
  domain: DomainKey
  processes: L3[]
}

export interface L1 {
  code: string
  stream: string
  blurb: string
  groups: L2[]
}

const B = 'BUILT' as const
const P = 'PARTIAL' as const
const S = 'SPEC' as const
const N = 'NONE' as const

export const MATRIX: L1[] = [
  {
    code: 'L1.1', stream: 'Source to contract',
    blurb: 'From somebody needing a person to somebody being chosen.',
    groups: [
      { code: 'L2.1.1', name: 'Demand intake', domain: 'DEMAND', processes: [
        { code: 'L3.1.1.1', name: 'Requisition raise and approve', owner: 'Hiring manager', status: B,
          tasks: ['Draft the role', 'Route the approval chain', 'Auto-clear inside policy'],
          implementedBy: ['src/lib/requisition-approval.ts', 'src/app/api/requisitions/route.ts'],
          testedBy: ['__tests__/invariants/requisition-approval.test.ts'] },
        { code: 'L3.1.1.2', name: 'Budget and rate band', owner: 'Program manager', status: B,
          tasks: ['Check the cost object has money', 'Set the band per invitation'],
          implementedBy: ['src/lib/contract-rate.ts', 'src/lib/invitation-visibility.ts'],
          testedBy: ['__tests__/invariants/contract-rate.test.ts', '__tests__/invariants/invitation-visibility.test.ts'] },
        { code: 'L3.1.1.3', name: 'Supplier release', owner: 'Program manager', status: B,
          tasks: ['Choose who sees it', 'Stagger by tier', 'Set the response window'],
          implementedBy: ['src/app/api/requisitions/[id]/distribute/route.ts', 'src/lib/invitation-visibility.ts'],
          testedBy: ['__tests__/invariants/invitation-visibility.test.ts'] },
      ]},
      { code: 'L2.1.2', name: 'Supply response', domain: 'SUPPLY', processes: [
        { code: 'L3.1.2.1', name: 'Bench matching', owner: 'Recruiter', status: B,
          tasks: ['Rules filter first', 'One model pass on what survives', 'Factors, basis, confidence, unknowns'],
          implementedBy: ['src/lib/match-engine.ts', 'src/lib/bench-filter.ts', 'src/lib/candidate-fit.ts'],
          testedBy: ['__tests__/invariants/match-engine.test.ts', '__tests__/invariants/bench-filter.test.ts', '__tests__/invariants/candidate-fit.test.ts'] },
        { code: 'L3.1.2.2', name: 'Submission assembly', owner: 'Recruiter', status: B,
          tasks: ['Point-in-time CV', 'Rate and availability', 'Batch with per-item errors'],
          implementedBy: ['src/lib/resumes.ts', 'src/app/api/submissions/route.ts'],
          testedBy: ['__tests__/invariants/submission.test.ts', '__tests__/invariants/resumes.test.ts'] },
        { code: 'L3.1.2.3', name: 'Right to represent', owner: 'Recruiter', status: B,
          tasks: ['Take the hold', 'Refuse a duplicate at source', 'Release on award'],
          implementedBy: ['src/lib/representation.ts', 'src/lib/holds.ts'],
          testedBy: ['__tests__/invariants/representation.test.ts'] },
      ]},
      { code: 'L2.1.4', name: 'Reaching the market, and moving work between firms', domain: 'MARKET', processes: [
        { code: 'L3.1.4.1', name: 'What we say we are', owner: 'Etyme', status: B,
          tasks: [
            'Category before cleverness, the way Concur says travel and expense',
            'Never one module describing itself',
            'Never lead with AI, and never claim we place anybody',
          ],
          implementedBy: ['src/lib/positioning.ts', 'src/app/page.tsx'],
          testedBy: ['__tests__/invariants/positioning.test.ts'] },
        { code: 'L3.1.4.2', name: 'A requirement going down a chain', owner: 'Account manager', status: B,
          tasks: [
            'The end client described, not named, where the agreement forbids it',
            'The band travels, the sender’s own rate never does',
            'A blind key so two rivals find a collision without naming the chain',
          ],
          implementedBy: ['src/lib/distribution.ts'],
          testedBy: ['__tests__/invariants/distribution.test.ts'] },
        { code: 'L3.1.4.3', name: 'A consultant going up a chain', owner: 'Bench operator', status: B,
          tasks: [
            'Unnamed until a right to represent is on file',
            'Current employer withheld, because naming it identifies them anyway',
            'Nothing sent at all rather than a full CV where no redacted one exists',
          ],
          implementedBy: ['src/lib/distribution.ts'],
          testedBy: ['__tests__/invariants/distribution.test.ts'] },
        { code: 'L3.1.4.4', name: 'The disclosure record', owner: 'Compliance', status: B,
          tasks: [
            'What was sent, to whom, under which agreement',
            'What was withheld, and the reason in the words you would use',
            'Says where the chain leaves the platform and the guarantee stops',
          ],
          implementedBy: ['src/lib/distribution.ts'],
          testedBy: ['__tests__/invariants/distribution.test.ts'] },
        { code: 'L3.1.4.5', name: 'Lead capture and nurture', owner: 'Etyme', status: N,
          tasks: [
            'Only people who asked to hear from us',
            'Cold outbound at volume trains a market to filter you',
          ] },
      ]},
      { code: 'L2.1.3', name: 'Evaluation', domain: 'DEMAND', processes: [
        { code: 'L3.1.3.1', name: 'Screening loop', owner: 'Client screener', status: B,
          tasks: ['Nine rule checks', 'Attempt cap and fix list', 'Human sample review'],
          implementedBy: ['src/lib/screening.ts', 'src/lib/checks.ts', 'src/lib/loop.ts'],
          testedBy: ['__tests__/invariants/screening.test.ts', '__tests__/invariants/checks.test.ts', '__tests__/invariants/loop.test.ts'] },
        { code: 'L3.1.3.2', name: 'Interview', owner: 'Hiring manager', status: B,
          tasks: ['Three-party acceptance', 'Chase after 24 hours', 'Flag a fourth round'],
          implementedBy: ['src/lib/interviews.ts'],
          testedBy: ['__tests__/invariants/interviews.test.ts'] },
        { code: 'L3.1.3.3', name: 'Award and seat close', owner: 'Program manager', status: B,
          tasks: ['Governance checks', 'Seat arithmetic', 'Raise both sides of the deal', 'Stand down the rest'],
          implementedBy: ['src/lib/award.ts', 'src/app/api/submissions/[id]/award/route.ts'],
          testedBy: ['__tests__/invariants/award.test.ts'] },
      ]},
    ],
  },
  {
    code: 'L1.2', stream: 'Contract to onboard',
    blurb: 'Papering the deal, clearing the person, getting them on site. Onboarding lives here — five times.',
    groups: [
      { code: 'L2.2.1', name: 'Commercial papering', domain: 'DEMAND', processes: [
        { code: 'L3.2.1.1', name: 'Master agreement and SOW', owner: 'Account manager', status: P,
          tasks: ['Terms, margin floor, payment days', 'Statement of work scope'],
          implementedBy: ['src/lib/contract-rate.ts'] },
        { code: 'L3.2.1.2', name: 'Sell contract', owner: 'Account manager', status: B,
          tasks: ['Bill rate, term, end client', 'Cost object and PO attached at award'],
          implementedBy: ['src/app/api/submissions/[id]/award/route.ts', 'src/app/api/contracts/route.ts'],
          testedBy: ['__tests__/invariants/contracts.test.ts', '__tests__/invariants/award.test.ts'] },
        { code: 'L3.2.1.3', name: 'Buy contract or employment agreement', owner: 'Delivery manager', status: B,
          tasks: ['Pay model, share basis, burden', 'Raised at award, never after'],
          implementedBy: ['src/lib/award.ts', 'src/lib/pay-model.ts'],
          testedBy: ['__tests__/invariants/pay-model.test.ts', '__tests__/invariants/award.test.ts'] },
        { code: 'L3.2.1.4', name: 'Purchase order and ceiling', owner: 'Procurement', status: B,
          tasks: ['Issue to the sub-vendor', 'Draw down and stop at the ceiling'],
          implementedBy: ['src/lib/purchase-order.ts'],
          testedBy: ['__tests__/invariants/purchase-order.test.ts'] },
      ]},
      { code: 'L2.2.2', name: 'Party onboarding — five processes, one word', domain: 'PLATFORM', processes: [
        { code: 'L3.2.2.1', name: 'Client onboarding', owner: 'Account manager', status: P,
          tasks: ['Sales handover', 'Approval chain, cost objects, calendars', 'Rate policy and governance rules'],
          implementedBy: ['src/lib/company-defaults.ts'] },
        { code: 'L3.2.2.2', name: 'Supplier onboarding', owner: 'Procurement', status: P,
          tasks: ['Due diligence and insurance', 'Bank and tax details', 'Tier and rate agreement'],
          implementedBy: ['src/lib/packets.ts'] },
        { code: 'L3.2.2.3', name: 'Consultant onboarding', owner: 'Delivery manager', status: P,
          tasks: ['Employment or C2C papers', 'Bank, tax, emergency contact', 'Pay model explained and agreed'],
          implementedBy: ['src/lib/onboarding.ts'] },
        { code: 'L3.2.2.4', name: 'Assignment onboarding', owner: 'Hiring manager', status: S,
          tasks: ['Badge, laptop, system access', 'Site induction and start confirmation', 'First timesheet expectation set'] },
        { code: 'L3.2.2.6', name: 'Counterparty register', owner: 'Account manager', status: B,
          tasks: [
            'Who we work with and as what — client, supplier, prime, MSP',
            'Derived from agreements, plus prospects no paper covers yet',
            'Nothing removable while contracts or invoices are live between you',
          ],
          implementedBy: ['src/lib/counterparty.ts', 'src/app/api/counterparties/route.ts', 'src/app/dashboard/contacts/page.tsx'],
          testedBy: ['__tests__/invariants/counterparty.test.ts'] },
        { code: 'L3.2.2.7', name: 'Contact book', owner: 'Account manager', status: B,
          tasks: [
            'Who at each counterparty to call, and about what',
            'Duplicates refused on email or phone, never merged on a name',
            'Links to a real account when the contact joins, instead of drifting beside it',
          ],
          implementedBy: ['src/lib/contacts.ts', 'src/app/api/contacts/route.ts', 'src/app/dashboard/contacts/page.tsx'],
          testedBy: ['__tests__/invariants/contacts.test.ts'] },
        { code: 'L3.2.2.5', name: 'Tenant onboarding', owner: 'Etyme', status: B,
          tasks: ['Company formation and domain', 'Roles, seats, notification channel', 'Generated public site'],
          implementedBy: ['src/lib/onboarding.ts', 'src/lib/company-defaults.ts', 'src/lib/public-site.ts'],
          testedBy: ['__tests__/invariants/onboarding.test.ts', '__tests__/invariants/company-defaults.test.ts'] },
      ]},
      { code: 'L2.2.3', name: 'Compliance clearance', domain: 'REGULATORY', processes: [
        { code: 'L3.2.3.1', name: 'Work authorisation', owner: 'Compliance', status: B,
          tasks: ['Visa class and expiry', 'Petition and transfer events', 'Blocks, never warns'],
          implementedBy: ['src/lib/document-stages.ts', 'src/app/api/cron/visa-watch/route.ts'],
          testedBy: ['__tests__/invariants/document-stages.test.ts'] },
        { code: 'L3.2.3.2', name: 'What may be asked, and when', owner: 'Compliance', status: B,
          tasks: ['Questions at application, documents at award', 'Per-jurisdiction rule table', 'Moves an item rather than dropping it'],
          implementedBy: ['src/lib/document-stages.ts', 'src/lib/packets.ts', 'src/lib/packet-derivation.ts'],
          testedBy: ['__tests__/invariants/document-stages.test.ts', '__tests__/invariants/packets.test.ts'] },
        { code: 'L3.2.3.3', name: 'Insurance and indemnity', owner: 'Compliance', status: P,
          tasks: ['Certificate on file and in date', 'Lapse blocks new submissions'],
          implementedBy: ['src/lib/packets.ts'] },
        { code: 'L3.2.3.4', name: 'Attestation of a check', owner: 'Compliance', status: B,
          tasks: ['Records that a check happened, never a verdict', 'Says no on statutory checks however fresh', 'Counts how many firms hold a copy'],
          implementedBy: ['src/lib/attestation.ts'],
          testedBy: ['__tests__/invariants/attestation.test.ts'] },
        { code: 'L3.2.3.5', name: 'Being screened — the outbound pack', owner: 'Compliance', status: B,
          tasks: ['Assemble our own documents for a client', 'Refuse anything expired, with no force flag', 'Readiness before a bid'],
          implementedBy: ['src/lib/outbound-pack.ts', 'src/app/api/outbound-pack/route.ts', 'src/app/dashboard/outbound-pack/page.tsx'],
          testedBy: ['__tests__/invariants/outbound-pack.test.ts'] },
      ]},
    ],
  },
  {
    code: 'L1.3', stream: 'Work to approve',
    blurb: 'Hours are a fact. Approvals are opinions about that fact.',
    groups: [
      { code: 'L2.3.1', name: 'Capture', domain: 'DEMAND', processes: [
        { code: 'L3.3.1.1', name: 'Time capture', owner: 'Consultant', status: B,
          tasks: ['Daily entry against the assignment', 'Overtime and on-call as elements'],
          implementedBy: ['src/lib/work-ledger.ts', 'src/lib/timesheet-authority.ts'],
          testedBy: ['__tests__/invariants/work-ledger.test.ts', '__tests__/invariants/timesheet-authority.test.ts'] },
        { code: 'L3.3.1.2', name: 'Expense capture', owner: 'Consultant', status: B,
          tasks: ['Receipt, policy check, staleness', 'Billable versus absorbed'],
          implementedBy: ['src/lib/expense-approval.ts'],
          testedBy: ['__tests__/invariants/expense-approval.test.ts'] },
        { code: 'L3.3.1.3', name: 'Milestone capture', owner: 'Delivery manager', status: P,
          tasks: ['Deliverable submitted for acceptance'],
          implementedBy: ['src/lib/billing-plan.ts'] },
      ]},
      { code: 'L2.3.2', name: 'Approval', domain: 'CONVERSATION', processes: [
        { code: 'L3.3.2.1', name: 'Client approval', owner: 'Hiring manager', status: B,
          tasks: ['One assertion per party, per date range', 'Partial approval is ordinary'],
          implementedBy: ['src/lib/work-ledger.ts', 'src/app/api/timesheets/[id]/assert/route.ts'],
          testedBy: ['__tests__/invariants/work-ledger.test.ts'] },
        { code: 'L3.3.2.2', name: 'Employer acceptance', owner: 'Delivery manager', status: B,
          tasks: ['Accepts the basis for pay', 'A different number needs a reason'],
          implementedBy: ['src/lib/work-ledger.ts', 'src/lib/timesheet-signatures.ts'],
          testedBy: ['__tests__/invariants/timesheet-signatures.test.ts'] },
        { code: 'L3.3.2.3', name: 'Auto-approval', owner: 'Rules', status: B,
          tasks: ['Window per contract', 'Anomaly holds it back'],
          implementedBy: ['src/lib/auto-approval.ts'],
          testedBy: ['__tests__/invariants/auto-approval.test.ts'] },
        { code: 'L3.3.2.4', name: 'Reversal and correction', owner: 'Payroll', status: B,
          tasks: ['Supersede, never edit', 'Posts to the month it belonged to'],
          implementedBy: ['src/lib/timesheet-reversal.ts'],
          testedBy: ['__tests__/invariants/timesheet-reversal.test.ts'] },
      ]},
    ],
  },
  {
    code: 'L1.4', stream: 'Approve to invoice',
    blurb: 'Order to cash. Earning, invoicing and collecting are three separate facts.',
    groups: [
      { code: 'L2.4.1', name: 'Billing', domain: 'MONEY', processes: [
        { code: 'L3.4.1.1', name: 'Invoice generation', owner: 'AR clerk', status: B,
          tasks: ['From approvals, not a rate card', 'Cycle, straddle and holiday calendar'],
          implementedBy: ['src/lib/invoice-loop.ts', 'src/lib/periods.ts', 'src/lib/cycle-generator.ts'],
          testedBy: ['__tests__/invariants/invoice-loop.test.ts', '__tests__/invariants/periods.test.ts', '__tests__/invariants/cycles.test.ts'] },
        { code: 'L3.4.1.2', name: 'Partner functions', owner: 'AR clerk', status: P,
          tasks: ['Sold-to, bill-to, ship-to, payer', 'Consolidated and self-billing'],
          implementedBy: ['src/lib/billing-cascade.ts'] },
        { code: 'L3.4.1.3', name: 'Tax determination', owner: 'Controller', status: S,
          tasks: ['Place of supply and rate', 'Withholding where it applies'] },
      ]},
      { code: 'L2.4.2', name: 'Accounts receivable', domain: 'MONEY', processes: [
        { code: 'L3.4.2.1', name: 'AR ageing and dunning', owner: 'AR clerk', status: B,
          tasks: ['Buckets from the due date, not the invoice date', 'Four letters and then a person', 'One letter per customer, not per invoice'],
          implementedBy: ['src/lib/ar-ageing.ts', 'src/app/api/ar/route.ts',
            'src/app/api/ar/book.ts', 'src/app/api/ar/dunning/route.ts',
            'src/app/dashboard/ar/page.tsx'],
          testedBy: ['__tests__/invariants/ar-ageing.test.ts'] },
        { code: 'L3.4.2.2', name: 'Cash application', owner: 'AR clerk', status: P,
          tasks: ['Match receipts to invoices', 'Short pays are a dispute, not arrears', 'Unapplied cash queue'],
          implementedBy: ['src/lib/ar-ageing.ts'],
          testedBy: ['__tests__/invariants/ar-ageing.test.ts'] },
        { code: 'L3.4.2.3', name: 'Disputes and credit notes', owner: 'Account manager', status: N,
          tasks: ['Reason coded, not free text', 'Credit note reverses in period'] },
      ]},
      { code: 'L2.4.3', name: 'Credit management', domain: 'MONEY', processes: [
        { code: 'L3.4.3.1', name: 'Exposure, not a credit score', owner: 'Controller', status: P,
          tasks: ['Unpaid plus unbilled plus committed', 'Open-ended assignments held outside the headline'],
          implementedBy: ['src/lib/credit.ts'],
          testedBy: ['__tests__/invariants/credit.test.ts'] },
        { code: 'L3.4.3.2', name: 'Limit and breach', owner: 'Controller', status: B,
          tasks: ['Limit per vendor and client pair', 'Warns, names an approver, demands a reason — never blocks'],
          implementedBy: ['src/lib/credit.ts', 'src/app/api/ar/credit-limit/route.ts'],
          testedBy: ['__tests__/invariants/credit.test.ts'] },
        { code: 'L3.4.3.3', name: 'Collections and escalation', owner: 'Controller', status: N,
          tasks: ['Escalation ladder to legal', 'Factoring or insurance decision'] },
      ]},
    ],
  },
  {
    code: 'L1.5', stream: 'Approve to pay',
    blurb: 'Procure to pay, and paying the person. What is owed and what is paid are two numbers.',
    groups: [
      { code: 'L2.5.1', name: 'Worker pay', domain: 'MONEY', processes: [
        { code: 'L3.5.1.1', name: 'Payroll instruction', owner: 'Payroll', status: B,
          tasks: ['Export to ADP, Paychex or a file', 'From acceptance, never from a rate card'],
          implementedBy: ['src/lib/payroll-export.ts'],
          testedBy: ['__tests__/invariants/payroll-export.test.ts'] },
        { code: 'L3.5.1.2', name: 'Pay model application', owner: 'Payroll', status: B,
          tasks: ['Fixed, share of bill, share of margin', 'Working shown line by line'],
          implementedBy: ['src/lib/pay-model.ts'],
          testedBy: ['__tests__/invariants/pay-model.test.ts'] },
        { code: 'L3.5.1.3', name: 'Bench and reserve', owner: 'Payroll', status: P,
          tasks: ['Hold back, draw down, carry limit', 'What happens on exit'],
          implementedBy: ['src/lib/bench-policy.ts'],
          testedBy: ['__tests__/invariants/bench-policy.test.ts'] },
        { code: 'L3.5.1.4', name: 'Off-cycle and corrections', owner: 'Payroll', status: P,
          tasks: ['Short pay carried, never a negative payslip'],
          implementedBy: ['src/lib/pay-model.ts'] },
      ]},
      { code: 'L2.5.2', name: 'Accounts payable', domain: 'MONEY', processes: [
        { code: 'L3.5.2.1', name: 'Vendor bill intake', owner: 'AP clerk', status: P,
          tasks: ['Bill against the PO and the approvals', 'Duplicate and over-bill refusal'],
          implementedBy: ['src/app/api/ap/bills/route.ts'] },
        { code: 'L3.5.2.2', name: 'Three-way match', owner: 'AP clerk', status: P,
          tasks: ['PO, receipt of work, invoice', 'Tolerance and exception queue'],
          implementedBy: ['src/lib/three-way-match.ts'],
          testedBy: ['__tests__/invariants/three-way-match.test.ts'] },
        { code: 'L3.5.2.3', name: 'Payment run and remittance', owner: 'AP clerk', status: N,
          tasks: ['Batch by terms and currency', 'Remittance advice out'] },
        { code: 'L3.5.2.4', name: 'Chain payment behaviour', owner: 'Controller', status: B,
          implementedBy: ['src/lib/ap-delay.ts', 'src/app/api/ap/route.ts',
            'src/app/api/ap/bills/route.ts', 'src/app/dashboard/ap/page.tsx'],
          testedBy: ['__tests__/invariants/ap-delay.test.ts'],
          tasks: [
            'Agreed terms against actual days, per party, both directions',
            'Chain float — who is financing whom, and for how many days',
            'Pay-when-paid detection, because that clause pushes the float down',
            'Say where the chain leaves the platform and the guarantee stops',
          ] },
      ]},
      { code: 'L2.5.3', name: 'Statutory', domain: 'MONEY', processes: [
        { code: 'L3.5.3.1', name: 'Payroll tax and filings', owner: 'Payroll bureau', status: N,
          tasks: ['Federal, state and local deposits', 'Quarterly and annual returns'] },
        { code: 'L3.5.3.2', name: 'Worker tax documents', owner: 'Payroll bureau', status: N,
          tasks: ['W-2, 1099-NEC and equivalents', 'Corrections and reissues'] },
      ]},
    ],
  },
  {
    code: 'L1.6', stream: 'Record to report',
    blurb: 'The project order accumulates. The journal balances. Their ERP reads it in their own language.',
    groups: [
      { code: 'L2.6.1', name: 'The ledger', domain: 'MONEY', processes: [
        { code: 'L3.6.1.1', name: 'Journal and balance', owner: 'Controller', status: B,
          tasks: ['Debits equal credits before writing', 'One entry per source event'],
          implementedBy: ['src/lib/gl.ts'],
          testedBy: ['__tests__/invariants/gl.test.ts'] },
        { code: 'L3.6.1.2', name: 'The project order', owner: 'Controller', status: B,
          tasks: ['Collects revenue and cost for one piece of work', 'Allocations per head', 'Basis stated on every line'],
          implementedBy: ['src/lib/order.ts', 'src/lib/order-postings.ts'],
          testedBy: ['__tests__/invariants/order.test.ts'] },
        { code: 'L3.6.1.3', name: 'Settlement and close', owner: 'Controller', status: P,
          tasks: ['Balance out to the cost centre', 'Settled orders refuse new postings'],
          implementedBy: ['src/lib/order-postings.ts'] },
        { code: 'L3.6.1.4', name: 'Loose ends', owner: 'Controller', status: B,
          tasks: ['Seven kinds of broken link', 'Worst first, then oldest', 'Cold trails past ninety days'],
          implementedBy: ['src/lib/loose-ends.ts', 'src/app/api/loose-ends/route.ts', 'src/app/dashboard/loose-ends/page.tsx'],
          testedBy: ['__tests__/invariants/loose-ends.test.ts'] },
      ]},
      { code: 'L2.6.2', name: 'Profitability', domain: 'MONEY', processes: [
        { code: 'L3.6.2.1', name: 'By contract, person, customer, order', owner: 'Controller', status: B,
          tasks: ['Same postings, four questions', 'Refuses a margin with no cost behind it'],
          implementedBy: ['src/lib/profitability.ts', 'src/app/dashboard/profitability/page.tsx'],
          testedBy: ['__tests__/invariants/profitability.test.ts'] },
        { code: 'L3.6.2.2', name: 'Earned against cash', owner: 'Controller', status: B,
          tasks: ['To collect and still owed to people', 'Side by side, never merged'],
          implementedBy: ['src/lib/order.ts'],
          testedBy: ['__tests__/invariants/order.test.ts'] },
        { code: 'L3.6.2.3', name: 'Currency', owner: 'Controller', status: B,
          tasks: ['Converted once, rate stamped', 'Parallel valuation kept alongside', 'Two currencies in one total throws'],
          implementedBy: ['src/lib/order.ts', 'src/lib/order-postings.ts'],
          testedBy: ['__tests__/invariants/order.test.ts'] },
      ]},
      { code: 'L2.6.3', name: 'Integration', domain: 'PLATFORM', processes: [
        { code: 'L3.6.3.1', name: 'ERP account mapping', owner: 'Etyme', status: B,
          tasks: ['SAP and Oracle for clients', 'NetSuite and QuickBooks for vendors', 'CSV for the firm with no system'],
          implementedBy: ['src/lib/gl.ts', 'src/lib/erp-profiles.ts'],
          testedBy: ['__tests__/invariants/gl.test.ts', '__tests__/invariants/erp-profiles.test.ts'] },
        { code: 'L3.6.3.2', name: 'Outbound posting', owner: 'Etyme', status: P,
          tasks: ['Export once, stamped as sent', 'Refuses on an unmapped account'],
          implementedBy: ['src/lib/gl.ts'] },
        { code: 'L3.6.3.3', name: 'Reconciliation', owner: 'Controller', status: N,
          tasks: ['Our balance against theirs', 'Break list with a reason each'] },
      ]},
    ],
  },
  {
    code: 'L1.7', stream: 'Govern and protect',
    blurb: 'The exposures nobody bills for. Block where legally grounded, warn and record a reason everywhere else.',
    groups: [
      { code: 'L2.7.1', name: 'Workforce risk', domain: 'REGULATORY', processes: [
        { code: 'L3.7.1.1', name: 'Tenure and co-employment', owner: 'Compliance', status: B,
          tasks: ['Aggregated across every supplier', 'Break in service and eligibility date'],
          implementedBy: ['src/app/api/tenure/route.ts', 'src/app/dashboard/tenure/page.tsx'],
          testedBy: ['__tests__/invariants/tenure.test.ts'] },
        { code: 'L3.7.1.2', name: 'Worker classification', owner: 'Compliance', status: P,
          tasks: ['Test the arrangement, not the label', 'Evidence kept for the position taken'],
          implementedBy: ['src/lib/worker-classification.ts'],
          testedBy: ['__tests__/invariants/worker-classification.test.ts'] },
        { code: 'L3.7.1.3', name: 'Governance and segregation of duties', owner: 'Compliance', status: B,
          tasks: ['Approver is not the beneficiary', 'Blocks, and says whose rule'],
          implementedBy: ['src/lib/governance.ts', 'src/lib/governance-authorship.ts'],
          testedBy: ['__tests__/invariants/governance.test.ts', '__tests__/invariants/governance-authorship.test.ts'] },
      ]},
      { code: 'L2.7.2', name: 'Commercial risk', domain: 'SUPPLY', processes: [
        { code: 'L3.7.2.1', name: 'Supplier financial risk', owner: 'Procurement', status: N,
          tasks: ['Filings, insurance, payment behaviour', 'Watchlist and review cadence'] },
        { code: 'L3.7.2.2', name: 'Concentration risk', owner: 'Controller', status: N,
          tasks: ['One client, one supplier, one person', 'Threshold and named owner'] },
        { code: 'L3.7.2.3', name: 'Bench burn', owner: 'Bench operator', status: B,
          tasks: ['What the gaps cost, daily, by tier', 'Profitable on paper only'],
          implementedBy: ['src/lib/bench-policy.ts', 'src/lib/profitability.ts'],
          testedBy: ['__tests__/invariants/bench-burn.test.ts', '__tests__/invariants/bench-policy.test.ts'] },
      ]},
      { code: 'L2.7.3', name: 'Data and access', domain: 'REGULATORY', processes: [
        { code: 'L3.7.3.1', name: 'Access log', owner: 'Etyme', status: B,
          tasks: ['Every read of another person, refusals too'],
          implementedBy: ['src/lib/access-log.ts'],
          testedBy: ['__tests__/invariants/access-grant.test.ts'] },
        { code: 'L3.7.3.2', name: 'Company walls', owner: 'Etyme', status: B,
          tasks: ['Filtered at the query, not the screen'],
          implementedBy: ['src/lib/walls.ts', 'src/lib/account-walls.ts', 'src/lib/seat.ts'],
          testedBy: ['__tests__/invariants/walls.test.ts', '__tests__/invariants/seat.test.ts'] },
      ]},
    ],
  },
]

// ── Reading it ────────────────────────────────────────────────────────

export function allProcesses(): { l1: L1; l2: L2; l3: L3 }[] {
  return MATRIX.flatMap((l1) =>
    l1.groups.flatMap((l2) => l2.processes.map((l3) => ({ l1, l2, l3 })))
  )
}

export function groupsFor(domain: DomainKey): L2[] {
  return MATRIX.flatMap((l1) => l1.groups).filter((g) => g.domain === domain)
}

export interface Coverage {
  total: number
  built: number
  partial: number
  spec: number
  none: number
  says: string
}

export function coverage(domain?: DomainKey): Coverage {
  const rows = allProcesses().filter((r) => !domain || r.l2.domain === domain)
  const by = (s: Status) => rows.filter((r) => r.l3.status === s).length

  return {
    total: rows.length,
    built: by('BUILT'),
    partial: by('PARTIAL'),
    spec: by('SPEC'),
    none: by('NONE'),
    says:
      `${by('BUILT')} of ${rows.length} processes built, ${by('PARTIAL')} partial, ` +
      `${by('SPEC') + by('NONE')} not started.`,
  }
}
