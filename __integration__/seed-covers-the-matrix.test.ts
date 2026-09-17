import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

/**
 * Every level of the delivery matrix has something to look at.
 *
 * "All levels need to be in sync in the seed file so I can run
 * simulations on each of the test scripts."
 *
 * CLAUDE.md's first lesson from the client's Network week: *"If a screen
 * is empty on the seeded world, that is the bug, not the seed."* This is
 * that lesson as a test. It seeds the world once and counts every table
 * in the schema. A table with no rows is either
 *
 *   RUNTIME — nothing writes it until a person does something, and a
 *             seeded row would be a lie about what happened; or
 *   GAP     — a screen somewhere opens empty, and the seed owes it a row.
 *
 * Both lists are named below, so the file fails in two directions: a new
 * empty table nobody classified, and a table still listed as a GAP after
 * the seed learned to fill it. A stale entry is as much a failure as a
 * new one — that is what stopped three earlier bug classes in this
 * codebase from coming back.
 *
 * The GAP list is the work. It shrinks; it never grows without a reason
 * written beside it.
 */

/**
 * Written the moment somebody acts, and meaningless before that.
 *
 * Seeding these would be inventing history: an access log with no read
 * behind it, an incident for a failure that never happened, a job run
 * for a night the cron did not run. `/ready` is where these are proven,
 * by the outside world doing it once, and that is the right place.
 */
const RUNTIME: Record<string, string> = {
  accessLog: 'written by a real read of somebody else’s data, including refusals',
  agentRun: 'written when an agent loop actually runs',
  approvalRuleVersion: 'written when a rule is changed, not when it is created',
  classificationCall: 'written when a worker classification is actually decided',
  contractorInvitation: 'an invitation somebody sent; /ready proves the email edge',
  documentShare: 'written when a person shares a document',
  documentShareAccess: 'written when a share link is opened',
  documentShareItem: 'written when a person shares a document',
  dunningSend: 'written when a chase actually goes out',
  erpAccountMap: 'written when a customer wires up their own ERP',
  exemptAssertion: 'written when somebody asserts an exemption, with a reason',
  fxRate: 'fetched from a rate source, not invented',
  governanceEvaluation: 'written at the moment a decision is evaluated',
  identityMatch: 'written when cross-vendor resolution actually runs',
  import: 'a real file somebody imported; /ready proves this edge',
  importRow: 'the rows of a real import',
  incident: 'written when something actually breaks',
  intercompanyPosition: 'written when an intercompany entry posts',
  jobRun: 'written by the nightly job when it runs',
  masterAgreementVersion: 'written when an agreement is amended',
  message: 'a message somebody actually sent',
  overtimeDecision: 'written when somebody decides an overtime case',
  reconciliationRun: 'written when a reconciliation is run',
  serviceAccount: 'created by a customer wiring up an integration',
  subdomainAlias: 'created when a customer claims one',
  customDomain: 'created when a customer claims one',
  supplierInvite: 'an invitation somebody sent',
  textMessage: 'a message somebody actually sent',
  webhookSubscription: 'created when a customer wires one up',
  webhookDelivery: 'written when a webhook actually fires',
}

/**
 * A screen opens empty because of these. Each one is seed work owed.
 *
 * Grouped by the value stream it starves, so the list reads as a plan
 * rather than as an alphabet. Delete a line when the seed fills it — the
 * test fails if you do not.
 */
const GAP: Record<string, string> = {
  // L1.1 Source to contract
  lead: 'nobody has enquired, so the market pages have nothing',
  marketingLead: 'the same, from the public site',
  sourcedContact: 'sourcing at volume has no history',
  opening: 'a seat advertised and waiting; the COLD job has nothing to age',
  match: 'matching with reasons has no scores to show, and a score carries factors, basis, confidence and unknowns',
  resume: 'no consultant has a resume on file',
  representation: 'nobody is represented by anybody',
  doNotSubmit: 'the list that stops a duplicate submission is empty',
  blacklist: 'nobody is blocked anywhere',
  conversation: 'demand opens and supply answers — and there is no thread to open',

  // L1.2 Contract to onboard
  agreementSignature: 'an MSA is countersigned by two firms and no signature is recorded',
  documentType: 'the company-extensible document types ship as defaults and none is seeded',
  documentEdition: 'which edition of a form somebody signed — the audit finding',
  documentBacking: 'an I-9 with nothing behind it is not held, and nothing records what backs one',
  credential: 'a license or certification on a person',
  check: 'a background check with an outcome',
  delegation: 'nobody has delegated their approval authority while away',
  companyContact: 'a named contact at a counterparty',
  companyDomain: 'the domains a company is known by',
  companyLocation: 'where a firm actually sits',
  legalEntity: 'the entity that signs, bills and employs',
  verificationDoc: 'a verification exists with no document behind it, which is the I-9 problem exactly',
  visaPetition: 'the whole visa lifecycle — filed, RFE, approved, stamped, active — has no row to walk',
  visaDocument: 'and nothing behind a petition',
  visaEvent: 'and no history of what happened to one',
  timeOffEntry: 'nobody has taken a day off, so an absent week is never exercised',

  // L1.3 Work to approve
  expense: 'a contractor has never filed an expense, so the approve-and-bill path is unwalked',
  holiday: 'no company calendar, so business-day shifting is never exercised on a real holiday',

  // L1.4 Approve to invoice
  workOrder: 'the order layer merged on 2026-09-17 and nothing seeds one, so every ceiling, milestone and auto-approval setting is unreachable on the seeded world — the award still does not raise one',
  orderMilestone: 'milestone billing has no milestone to accept',
  invoiceMatchOverride: 'the three-way match exception queue is empty',
  creditNote: 'nothing has ever been credited back',
  customerCreditLimit: 'credit management has no limit to test against',
  earlyPaymentDiscount: 'no early-settlement terms anywhere',
  remitTo: 'where a supplier is actually paid',

  // L1.5 Approve to pay
  paymentRun: 'AP has never assembled a run',
  paymentRunItem: 'the lines of that run',
  rateHistory: 'no rate has ever changed, so the approval path for a rise is unwalked',

  // L1.6 Record to report
  ledgerAccount: 'the chart of accounts is empty',
  journalEntry: 'nothing has posted to the ledger',
  journalLine: 'the lines of those entries',
  projectOrder: 'the cost object that accumulates revenue and cost has no rows',
  orderPosting: 'nothing draws down against an order',
  internalOrder: 'the client’s own coding is never carried',

  // L1.7 Govern and protect
  rolloffEvent: 'nobody is rolling off, so the rolloff console is empty',
  course: 'training has no course',
  enrollment: 'and nobody is enrolled on one',
}

const counts: Record<string, number> = {}

describe('the seeded world has something at every level of the matrix', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const name of Object.keys(prisma)) {
      if (name.startsWith('$') || name.startsWith('_')) continue
      const delegate = (prisma as any)[name]
      if (!delegate || typeof delegate.count !== 'function') continue
      try {
        counts[name] = await delegate.count()
      } catch {
        // Not a model delegate.
      }
    }
  }, 600_000)

  it('counts every table in the schema, so nothing is classified by being forgotten', () => {
    expect(Object.keys(counts).length).toBeGreaterThan(110)
  })

  it('every empty table is either written at runtime or named as seed work owed', () => {
    const empty = Object.entries(counts).filter(([, n]) => n === 0).map(([name]) => name)
    const unclassified = empty.filter((name) => !(name in RUNTIME) && !(name in GAP))
    expect(
      unclassified,
      `These tables are empty after a world seed and nobody has said why.\n` +
        `Add each to RUNTIME (nothing writes it until a person acts) or to GAP\n` +
        `(a screen opens empty and the seed owes it a row):\n  ${unclassified.join('\n  ')}`
    ).toEqual([])
  })

  it('a table listed as seed work owed is still empty, so the list cannot go stale', () => {
    const fixed = Object.keys(GAP).filter((name) => (counts[name] ?? 0) > 0)
    expect(
      fixed,
      `The seed now fills these, so take them off the GAP list — a list that\n` +
        `still names solved problems stops being read:\n  ${fixed.join('\n  ')}`
    ).toEqual([])
  })

  it('a table listed as runtime-only is still empty, so the seed never invents history', () => {
    const invented = Object.keys(RUNTIME).filter((name) => (counts[name] ?? 0) > 0)
    expect(
      invented,
      `The seed has started writing these, and each is supposed to mean that a\n` +
        `person did something. Either the seed is inventing history or the entry\n` +
        `belongs somewhere else:\n  ${invented.join('\n  ')}`
    ).toEqual([])
  })

  it('the spine is dense: a placement, both its contracts, its hours and its bills all exist', () => {
    for (const [table, floor] of [
      ['company', 10], ['person', 50], ['context', 50], ['role', 40],
      ['requirement', 20], ['submission', 20], ['interview', 10],
      ['sellContract', 20], ['buyContract', 20], ['contractLink', 20],
      ['timesheet', 40], ['workAssertion', 40],
      ['invoice', 10], ['invoiceLine', 20], ['payment', 10], ['vendorBill', 1],
      ['cycle', 100], ['verification', 20], ['benchListing', 20],
    ] as Array<[string, number]>) {
      expect(counts[table] ?? 0, `${table} should carry at least ${floor} rows on a seeded world`).toBeGreaterThanOrEqual(floor)
    }
  })

  it('both sides of every placement are seeded, never just the side that bills', () => {
    // A sell contract with no buy contract behind it is a placement with
    // nobody being paid, and it is the shape the payroll screens read.
    expect(counts.buyContract).toBe(counts.sellContract)
    expect(counts.contractLink).toBe(counts.sellContract)
  })
})
