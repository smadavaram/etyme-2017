import { describe, it, expect, beforeAll } from 'vitest'
import { resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { partiesOf } from '@/lib/money/invoice-parties'

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
 *
 * ── Two left this list on 2026-09-17, and why ────────────────────────
 *
 * `message` — a thread with nothing in it is not a thread. The rule this
 * list keeps is that the seed never claims an edge with the outside world
 * was crossed; a Message row is content in a story, exactly like the 70
 * timesheets seeded people filed and the 43 interviews they sat, and
 * writing one sends no email. The edges stay where they belong: `import`,
 * `contractorInvitation`, `textMessage` and `jobRun` are still here, and
 * `/ready` still proves them.
 *
 * `agentRun` — the seed now runs the real match engine over a bench
 * vendor's own bench, and the engine records its own run and its own
 * cost. That is an agent loop that actually ran, which is precisely what
 * the line said. Nothing was invented; the row is the matcher's receipt.
 */
const RUNTIME: Record<string, string> = {
  accessLog: 'written by a real read of somebody else’s data, including refusals',
  approvalRuleVersion: 'written when a rule is changed, not when it is created',
  // ── Four that must never be seeded, added 2026-09-19 ───────────────
  //
  // These are the strongest case this list has. A seeded DataRequest
  // claims a real person asked to be forgotten; a seeded Breach claims
  // personal data escaped, on a demo a founder walks in front of buyers.
  // Both would be a lie of a different order from an empty screen, and
  // an empty privacy desk is the honest reading of a world where nobody
  // has asked for anything yet.
  breach: 'written when somebody decides personal data went where it should not have — a seeded one would claim a breach that never happened',
  breachCompany: 'written when a breach names the customers it touched',
  dataRequest: 'written when a person actually asks for their data or asks to be forgotten',
  legalHold: 'written when a company places a hold, with a reason and a name on it',
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
  marketingLead: 'nobody has enquired from the public site — and this table is not tenanted, so a seeded enquiry would be a fictional name in the founder\u2019s own sales funnel',
  sourcedContact: 'sourcing at volume has no history; it arrives by import, and an import is a real file somebody loaded',

  // L1.2 Contract to onboard
  credential: 'nobody has signed in through an identity provider yet. NOT a license on a person — that is a Verification, and the line here said otherwise for as long as it existed',
  delegation: 'nobody has delegated their approval authority while away, and nothing reads the table yet either',
  companyDomain: 'every seeded firm admits its people through one shared demo domain, and this column is unique platform-wide — a row per firm would either be a lie or make joining behave differently across the demo',
  timeOffEntry: 'nobody has taken a day off. The only thing that writes one is an overtime decision being banked, which is a person deciding',
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

  it('the layers above and below a placement are seeded too, not just the placement', () => {
    // Added 2026-09-17, when the seed learned to write them. Floors
    // rather than exact counts, so the world can grow — but a layer that
    // silently stops being written fails here rather than on the screen
    // it empties.
    for (const [table, floor] of [
      // The order that authorized the spend, and the ceiling it carries.
      ['workOrder', 10], ['orderMilestone', 3],
      // What the work actually earned and cost, and the books under it.
      ['projectOrder', 10], ['orderPosting', 40],
      ['ledgerAccount', 30], ['journalEntry', 40], ['journalLine', 80],
      // The rest of a finance desk's week.
      ['expense', 3], ['creditNote', 1], ['rateHistory', 10],
      ['paymentRun', 1], ['paymentRunItem', 1], ['invoiceMatchOverride', 1],
      // Where a firm sits, and what it can prove.
      ['companyLocation', 10], ['holiday', 100],
      ['verificationDoc', 20], ['documentBacking', 10],
      ['visaPetition', 3], ['visaEvent', 15], ['visaDocument', 9],
      // Either side of the placement.
      ['resume', 20], ['conversation', 1], ['message', 3],
      ['opening', 3], ['lead', 3], ['match', 1],
      ['course', 3], ['enrollment', 3],
    ] as Array<[string, number]>) {
      expect(counts[table] ?? 0, `${table} should carry at least ${floor} rows on a seeded world`).toBeGreaterThanOrEqual(floor)
    }
  })

  /**
   * The agreement-less placement, walked end to end.
   *
   * `Engagement.msaId` went optional on 2026-09-18 and an invoice
   * learned to say who it was between through the order, else through
   * the lines billed on it. Both new branches had nothing on the seeded
   * world to read, because every other placement here is papered with
   * an MSA. Cavanaugh Glassworks sent Wrenfield Technical a purchase
   * order and one contractor started; that is the sentence below.
   */
  it('a supplier that sent one order and one contractor, and never signed an agreement, is billed and attributed like any other', async () => {
    const engagement = await prisma.engagement.findFirst({
      where: { msaId: null, title: 'Furnace controls technician' },
      select: { id: true },
    })
    expect(engagement, 'the seeded world has an engagement with no agreement above it').not.toBeNull()

    const invoice = await prisma.invoice.findFirst({
      where: { engagementId: engagement!.id },
      select: {
        total: true,
        engagement: { select: { msa: { select: { vendorId: true, clientId: true } } } },
        workOrder: {
          select: {
            id: true, number: true, msaId: true,
            issuedById: true, issuedToId: true,
            issuedBy: { select: { id: true, name: true } },
            issuedTo: { select: { id: true, name: true } },
          },
        },
        invoiceLines: {
          select: {
            hours: true,
            timesheet: { select: { status: true } },
            sellContract: {
              select: {
                msaId: true, workOrderId: true, billRate: true,
                companyId: true, clientCompanyId: true,
                company: { select: { id: true, name: true } },
                clientCompany: { select: { id: true, name: true } },
                buyLinks: { select: { buyContract: { select: { contractType: true, workOrderId: true, vendorCompanyId: true } } } },
              },
            },
          },
        },
      },
    })
    expect(invoice, 'a bill went out on it').not.toBeNull()

    // Nothing above the order, and nothing above the line either.
    expect(invoice!.engagement.msa).toBeNull()
    expect(invoice!.workOrder!.msaId).toBeNull()
    const line = invoice!.invoiceLines[0]
    expect(line.sellContract!.msaId).toBeNull()

    // The week was signed before it was billed.
    expect(line.timesheet!.status).toBe('APPROVED')
    expect(Number(line.hours)).toBe(40)
    expect(Number(invoice!.total)).toBe((40 * line.sellContract!.billRate) / 100)

    // The sell line is on the client's order; the buy line is payroll,
    // and a firm raises no purchase order to its own employee.
    expect(line.sellContract!.workOrderId).toBe(invoice!.workOrder!.id)
    const buy = line.sellContract!.buyLinks[0].buyContract
    expect(buy.contractType).toBe('W2')
    expect(buy.workOrderId).toBeNull()
    expect(buy.vendorCompanyId).toBeNull()

    // And who the bill is between is answered by the order, in words.
    const parties = partiesOf({
      agreement: invoice!.engagement.msa,
      order: invoice!.workOrder,
      lines: invoice!.invoiceLines.map((l) => l.sellContract!),
    })
    expect(parties.basis).toBe('ORDER')
    expect(parties.vendor!.name).toBe('Wrenfield Technical')
    expect(parties.client!.name).toBe('Cavanaugh Glassworks')
    expect(parties.says).toContain('there is no agreement behind this engagement')
  })

  it('both sides of every placement are seeded, never just the side that bills', () => {
    // A sell contract with no buy contract behind it is a placement with
    // nobody being paid, and it is the shape the payroll screens read.
    expect(counts.buyContract).toBe(counts.sellContract)
    expect(counts.contractLink).toBe(counts.sellContract)
  })
})
