import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { GET as payroll } from '@/app/api/payroll/route'
import { splitByLink, hoursFor } from '@/lib/contract-links'
import { descend, whereHoursLive } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'

/**
 * L4 — one placement, two contract pairs, walked step by step.
 *
 * The chain from the diagram:
 *
 *   Adobe Systems  ←  Computer Futures  ←  CloudEPA  ←  candidate1
 *      (client)          (prime)            (sub)       (the person)
 *
 * Contract 1 belongs to Computer Futures: it sells to Adobe and buys
 * from CloudEPA, corp to corp. Candidate1 appears on it only to submit
 * timesheets — the counterparty is CloudEPA, not the person.
 *
 * Contract 2 belongs to CloudEPA: it sells to Computer Futures and
 * employs candidate1 on W2.
 *
 * Each firm is the "upper" of its own contract and the "lower" of the
 * one above. Every hop carries a margin, and nobody sees the hop beyond
 * their own two neighbours.
 *
 * This is the case the product exists for and the one a two-party demo
 * cannot show. It is walked here in the order it happens, so each step
 * can be read on its own.
 */

const ADOBE = 'procurement@adobe.test'
const CF = 'owner@computerfutures.test'
const CLOUDEPA = 'owner@cloudepa.test'
const CANDIDATE = 'candidate1@person.test'

const ids = {
  adobe: '', cf: '', cloudepa: '', person: '',
  sell1: '', buy1: '', sell2: '', buy2: '', timesheet: '',
}

const money = (c: number) => `$${(c / 100).toFixed(0)}/hr`

beforeAll(async () => {
  await resetDatabase()

  // ── Step 1. The four parties ──────────────────────────────────────
  const mk = async (name: string, slug: string, kind: any, email: string) => {
    const c = await prisma.company.create({
      data: { name, slug, kind, currency: 'USD' },
    })
    const role = await prisma.role.create({
      data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true },
    })
    const p = await prisma.person.create({ data: { name, primaryEmail: email } })
    await prisma.context.create({
      data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'chain' },
    })
    return c.id
  }

  ids.adobe = await mk('Adobe Systems', 'adobe', 'CLIENT', ADOBE)
  ids.cf = await mk('Computer Futures', 'computer-futures', 'VENDOR', CF)
  ids.cloudepa = await mk('CloudEPA', 'cloudepa', 'VENDOR', CLOUDEPA)

  const person = await prisma.person.create({
    data: { name: 'Candidate One', primaryEmail: CANDIDATE },
  })
  ids.person = person.id
  const profile = await prisma.consultantProfile.create({
    data: { personId: person.id, skills: ['SAP FICO'], location: 'San Jose, California', visibility: 'VERIFIED' },
  })

  // ── Step 2. Who trades with whom ──────────────────────────────────
  const link = (a: string, b: string, rel: string) =>
    prisma.counterparty.create({ data: { companyId: a, otherCompanyId: b, relationship: rel } })
  await link(ids.cf, ids.adobe, 'CLIENT')
  await link(ids.adobe, ids.cf, 'SUPPLIER')
  await link(ids.cloudepa, ids.cf, 'CLIENT')
  await link(ids.cf, ids.cloudepa, 'SUPPLIER')

  // ── Step 3. The person is on CloudEPA's bench, and agreed to be ───
  await prisma.benchListing.create({
    data: {
      consultantId: profile.id, companyId: ids.cloudepa, tier: 'RETAINED',
      state: 'GRANTED', invitedAt: new Date('2026-07-01'), respondedAt: new Date('2026-07-02'),
      grantedAt: new Date('2026-07-02'),
    },
  })

  // ── Step 4. Contract 2 — CloudEPA's own pair ──────────────────────
  //
  // They sell to Computer Futures at $110 and employ the person at $85.
  const sell2 = await prisma.sellContract.create({
    data: {
      companyId: ids.cloudepa, personId: ids.person, clientCompanyId: ids.cf,
      billRate: 11000, billCurrency: 'USD', startDate: new Date('2026-08-01'), state: 'IN_PROGRESS',
    },
  })
  ids.sell2 = sell2.id
  const buy2 = await prisma.buyContract.create({
    data: {
      companyId: ids.cloudepa, payCurrency: 'USD', contractType: 'W2',
      startDate: new Date('2026-08-01'), state: 'IN_PROGRESS',
      candidates: { create: { personId: ids.person, payRate: 8500, startDate: new Date('2026-08-01') } },
    },
  })
  ids.buy2 = buy2.id
  await prisma.contractLink.create({
    data: { sellContractId: sell2.id, buyContractId: buy2.id, effectiveFrom: new Date('2026-08-01') },
  })

  // ── Step 5. Contract 1 — Computer Futures' pair ───────────────────
  //
  // They sell to Adobe at $135 and buy from CloudEPA at $110, corp to
  // corp. The person is on this contract to file hours and for nothing
  // else — the counterparty here is CloudEPA.
  const sell1 = await prisma.sellContract.create({
    data: {
      companyId: ids.cf, personId: ids.person, clientCompanyId: ids.adobe,
      billRate: 13500, billCurrency: 'USD', startDate: new Date('2026-08-01'), state: 'IN_PROGRESS',
    },
  })
  ids.sell1 = sell1.id
  const buy1 = await prisma.buyContract.create({
    data: {
      companyId: ids.cf, vendorCompanyId: ids.cloudepa, payCurrency: 'USD', contractType: 'C2C',
      startDate: new Date('2026-08-01'), state: 'IN_PROGRESS',
      candidates: { create: { personId: ids.person, payRate: 11000, startDate: new Date('2026-08-01') } },
    },
  })
  ids.buy1 = buy1.id
  await prisma.contractLink.create({
    data: { sellContractId: sell1.id, buyContractId: buy1.id, effectiveFrom: new Date('2026-08-01') },
  })

  // The rung below. Computer Futures buys from CloudEPA, and this says
  // which of CloudEPA's contracts — the edge that lets the hours filed
  // at the bottom be found from the top.
  await prisma.buyContract.update({
    where: { id: buy1.id }, data: { supplierSellContractId: sell2.id },
  })
}, 240_000)

describe('Step 1–2 — the chain exists, and nobody sees past their neighbours', () => {
  it('has four parties, three of them companies', async () => {
    const n = await prisma.company.count()
    expect(n).toBe(3)
  })

  it('lets Computer Futures see Adobe above and CloudEPA below', async () => {
    const seen = await prisma.counterparty.findMany({ where: { companyId: ids.cf } })
    expect(seen.map((c) => c.otherCompanyId).sort()).toEqual([ids.adobe, ids.cloudepa].sort())
  })

  it('does not let Adobe see CloudEPA at all', async () => {
    // The client buys from Computer Futures and has no relationship with
    // the firm that actually found the person. That is the whole reason
    // a chain exists, and the reason tenure cannot be computed by asking.
    const seen = await prisma.counterparty.findMany({ where: { companyId: ids.adobe } })
    expect(seen.map((c) => c.otherCompanyId)).toEqual([ids.cf])
    expect(seen.map((c) => c.otherCompanyId)).not.toContain(ids.cloudepa)
  })
})

describe('Step 3 — the person agreed to be marketed, and by whom', () => {
  it('is on CloudEPA’s bench with consent actually recorded', async () => {
    const l = await prisma.benchListing.findFirstOrThrow({ where: { companyId: ids.cloudepa } })
    expect(l.state).toBe('GRANTED')
    // Granted after being invited, not at the moment the row was made.
    expect(l.grantedAt.getTime()).toBeGreaterThan(l.invitedAt!.getTime())
  })

  it('is on nobody else’s bench, including the firms that will bill for them', async () => {
    const others = await prisma.benchListing.count({ where: { companyId: { not: ids.cloudepa } } })
    expect(others).toBe(0)
  })
})

describe('Step 4–5 — two contract pairs, one person, a margin at each hop', () => {
  it('has CloudEPA selling at $110 and paying $85', async () => {
    const s = await prisma.sellContract.findUniqueOrThrow({ where: { id: ids.sell2 } })
    const c = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: ids.buy2 } })
    expect(money(s.billRate)).toBe('$110/hr')
    expect(money(c.payRate)).toBe('$85/hr')
  })

  it('has Computer Futures selling at $135 and paying CloudEPA $110', async () => {
    const s = await prisma.sellContract.findUniqueOrThrow({ where: { id: ids.sell1 } })
    const c = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: ids.buy1 } })
    expect(money(s.billRate)).toBe('$135/hr')
    expect(money(c.payRate)).toBe('$110/hr')
  })

  it('joins at the price — one firm’s cost is the other’s revenue', async () => {
    // The invariant that makes a chain a chain. If these two numbers
    // ever disagree, one of the pair is invoicing something the other is
    // not paying.
    const cfBuys = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: ids.buy1 } })
    const cloudSells = await prisma.sellContract.findUniqueOrThrow({ where: { id: ids.sell2 } })
    expect(cfBuys.payRate).toBe(cloudSells.billRate)
  })

  it('employs the person on W2 below and subcontracts corp-to-corp above', async () => {
    const below = await prisma.buyContract.findUniqueOrThrow({ where: { id: ids.buy2 } })
    const above = await prisma.buyContract.findUniqueOrThrow({ where: { id: ids.buy1 } })
    expect(below.contractType).toBe('W2')
    expect(below.vendorCompanyId).toBeNull() // you do not raise a PO to your own employee
    expect(above.contractType).toBe('C2C')
    expect(above.vendorCompanyId).toBe(ids.cloudepa)
  })
})

describe('Step 6 — the person files one week, once', () => {
  it('files it against the contract they actually work under', async () => {
    // Contract 2's sell side: CloudEPA is who employs them, and the
    // diagram is explicit that on Contract 1 the person exists only to
    // submit hours — the counterparty there is CloudEPA, not them.
    const ts = await prisma.timesheet.create({
      data: {
        sellContractId: ids.sell2,
        personId: ids.person,
        periodStart: new Date('2026-09-07'),
        periodEnd: new Date('2026-09-11'),
        days: {
          '2026-09-07': 8, '2026-09-08': 8, '2026-09-09': 8,
          '2026-09-10': 8, '2026-09-11': 8,
        },
        totalHours: 40,
        status: 'APPROVED',
        approvedAt: new Date('2026-09-12'),
      },
    })
    ids.timesheet = ts.id
    expect(Number(ts.totalHours)).toBe(40)
  })

  it('is one row, not one per hop', async () => {
    // Hours are a fact. A fact recorded twice eventually disagrees with
    // itself, and the disagreement surfaces weeks later at
    // invoice-versus-bill.
    const n = await prisma.timesheet.count({ where: { personId: ids.person } })
    expect(n).toBe(1)
  })

  it('carries the employer’s acceptance, which is what payroll follows', async () => {
    await prisma.workAssertion.create({
      data: {
        timesheetId: ids.timesheet, companyId: ids.cloudepa,
        role: 'EMPLOYER_ACCEPTANCE', hours: 40, rateCents: 8500, state: 'LIVE',
      },
    })
    const a = await prisma.workAssertion.findFirstOrThrow({ where: { timesheetId: ids.timesheet } })
    expect(a.companyId).toBe(ids.cloudepa)
  })
})

describe('Step 7 — CloudEPA is paid and pays', () => {
  it('owes the person 40 hours at $85 — $3,400', async () => {
    as(CLOUDEPA)
    const r = await json(await payroll(req('GET', '/api/payroll')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const row = (r.body.data.payItems ?? []).find((x: any) => x.buyContractId === ids.buy2)
    expect(row, 'CloudEPA has no pay item for this person').toBeTruthy()
    expect(Number(row.totalApprovedHours)).toBe(40)
    expect(Number(row.grossPay)).toBe(40 * 8500)
  }, 60_000)

  it('bills Computer Futures 40 hours at $110 — $4,400, a $1,000 margin', async () => {
    const sell = await prisma.sellContract.findUniqueOrThrow({ where: { id: ids.sell2 } })
    const ts = await prisma.timesheet.findUniqueOrThrow({ where: { id: ids.timesheet } })
    const revenue = Number(ts.totalHours) * sell.billRate
    const cost = Number(ts.totalHours) * 8500
    expect(revenue).toBe(440_000)
    expect(revenue - cost).toBe(100_000)
  })
})

describe('Step 8 — one week of hours, billed once at each hop', () => {
  it('leaves the hours where they were filed, on the employer’s contract', async () => {
    // Nothing is copied. Contract 1's sell side — the one that bills
    // Adobe $135 — has no timesheet on it and never will.
    const onCF = await prisma.timesheet.count({ where: { sellContractId: ids.sell1 } })
    expect(onCF).toBe(0)
    const anywhere = await prisma.timesheet.count({ where: { personId: ids.person } })
    expect(anywhere).toBe(1)
  })

  it('lets Computer Futures reach them anyway, one rung down', async () => {
    const rungs = await ladderFor([ids.sell1])
    expect(descend(ids.sell1, rungs)).toEqual([ids.sell1, ids.sell2])
    expect(whereHoursLive(ids.sell1, rungs)).toBe(ids.sell2)
  })

  it('ends the ladder at the firm that employs the person, rather than going on forever', async () => {
    const bottom = await prisma.buyContract.findUniqueOrThrow({ where: { id: ids.buy2 } })
    expect(bottom.supplierSellContractId).toBeNull()

    const rungs = await ladderFor([ids.sell2])
    expect(descend(ids.sell2, rungs)).toEqual([ids.sell2])
  })

  it('still pays CloudEPA from its own link window', async () => {
    const links = await prisma.contractLink.findMany({ where: { buyContractId: ids.buy1 } })
    expect(links).toHaveLength(1)
    expect(links[0].sellContractId).toBe(ids.sell1)

    const ts = await prisma.timesheet.findUniqueOrThrow({ where: { id: ids.timesheet } })
    const owed = hoursFor(
      ids.buy1,
      links.map((l) => ({
        buyContractId: l.buyContractId, sellContractId: l.sellContractId,
        effectiveFrom: l.effectiveFrom, effectiveTo: l.effectiveTo,
      })),
      ts.days as Record<string, number>
    )
    expect(owed).toBe(40)
    expect(Number(ts.totalHours)).toBe(40)
  })

  it('never needs a second timesheet, which is the thing that must not happen', async () => {
    // A second row for the same week was how a chain used to be made
    // billable at both hops, and it creates two records of one fact.
    // They agree today and will not after the first correction —
    // somebody amends one, the other keeps the old number, and the gap
    // surfaces at invoice-versus-bill with nobody able to say which is
    // right.
    //
    // The billing, not the hours, is what repeats per hop now: one
    // InvoiceLine per timesheet per contract.
    const forOneWeek = await prisma.timesheet.count({
      where: { personId: ids.person, periodStart: new Date('2026-09-07') },
    })
    expect(forOneWeek).toBe(1)
  })
})
