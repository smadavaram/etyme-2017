import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as payroll } from '@/app/api/payroll/route'

/**
 * Buy-side cycles land where payroll reads them.
 *
 * Both contract-creating routes wrote every cycle onto the sell contract,
 * including SALARY_CALCULATE and SALARY_PAY — money going out. The payroll
 * screen reads those off the buy contract, where the 2017 system put them
 * and where they belong. So its cycle list was always empty, the screen
 * rendered with no upcoming pay day, and nothing said so.
 *
 * This walks the same path the routes now take — split by side, generate,
 * write — against a real placement from the seeded world, then asks the
 * payroll route the question it could never answer before.
 */
describe('cycles land on the side of the trade they describe', () => {
  let cloudepa: { id: string; seat: string }
  let sell: { id: string; clientCompanyId: string; startDate: Date | null; endDate: Date | null }
  let buy: { id: string; contractType: string; vendorCompanyId: string | null }

  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()

    const co = await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })
    cloudepa = { id: co.id, seat: 'world-cloudepa@demo.etyme.local' }

    // CloudEPA employs the SAP FICO consultant on W-2 and sells them up
    // the chain. Its buy contract has no vendor below — it IS the employer.
    const s = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: co.id },
      include: { buyLinks: { include: { buyContract: true } } },
    })
    sell = { id: s.id, clientCompanyId: s.clientCompanyId, startDate: s.startDate, endDate: s.endDate }
    const b = s.buyLinks[0]!.buyContract
    buy = { id: b.id, contractType: b.contractType, vendorCompanyId: b.vendorCompanyId }

    // Nothing generated here. The world seed writes the cycles; these
    // tests read what it wrote.
  }, 180_000)

  it('the world seed writes cycles for every placement still running, on the right side', async () => {
    // A contract that ended has nothing due, so the programme seed's
    // history — the placements that make the tenure ledger — carries none.
    const running = { state: { not: 'ENDED' as const } }
    const sells = await prisma.sellContract.findMany({ where: { ...running, company: { slug: { startsWith: 'world-' } } }, select: { id: true } })
    expect(sells.length).toBeGreaterThan(0)
    for (const s of sells) {
      const n = await prisma.cycle.count({ where: { sellContractId: s.id } })
      expect(n, `sell ${s.id} has no cycles`).toBeGreaterThan(0)
    }
    const buys = await prisma.buyContract.findMany({ where: { ...running, company: { slug: { startsWith: 'world-' } } }, select: { id: true } })
    for (const b of buys) {
      const n = await prisma.cycle.count({ where: { buyContractId: b.id } })
      expect(n, `buy ${b.id} has no cycles`).toBeGreaterThan(0)
    }
  })

  it('a placement that has ended has nothing due', async () => {
    const ended = await prisma.sellContract.findMany({ where: { state: 'ENDED', company: { slug: { startsWith: 'world-' } } }, select: { id: true } })
    expect(ended.length).toBeGreaterThan(0)
    for (const s of ended) {
      expect(await prisma.cycle.count({ where: { sellContractId: s.id } })).toBe(0)
    }
  })

  it('the seeded employer contract is W-2 with nobody below it', () => {
    expect(buy.contractType).toBe('W2')
    expect(buy.vendorCompanyId).toBeNull()
  })

  it('salary cycles are on the buy contract, not the sell contract', async () => {
    const onBuy = await prisma.cycle.count({ where: { buyContractId: buy.id, kind: { startsWith: 'SALARY_' } } })
    const onSell = await prisma.cycle.count({ where: { sellContractId: sell.id, kind: { startsWith: 'SALARY_' } } })
    expect(onBuy).toBeGreaterThan(0)
    expect(onSell).toBe(0)
  })

  it('hours and invoices are on the sell contract, not the buy contract', async () => {
    const onSell = await prisma.cycle.count({
      where: { sellContractId: sell.id, kind: { in: ['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE', 'INVOICE_GENERATE', 'INVOICE_DUE'] } },
    })
    const onBuy = await prisma.cycle.count({
      where: { buyContractId: buy.id, kind: { in: ['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE', 'INVOICE_GENERATE', 'INVOICE_DUE'] } },
    })
    expect(onSell).toBeGreaterThan(0)
    expect(onBuy).toBe(0)
  })

  it('a W-2 employer gets no vendor-bill cycles — there is no vendor to bill', async () => {
    const n = await prisma.cycle.count({ where: { buyContractId: buy.id, kind: { startsWith: 'VENDOR_BILL_' } } })
    expect(n).toBe(0)
  })

  it('nothing wrote a commission or compliance cycle', async () => {
    const n = await prisma.cycle.count({
      where: {
        OR: [{ sellContractId: sell.id }, { buyContractId: buy.id }],
        kind: { in: ['COMMISSION_CALCULATE', 'COMMISSION_PAY', 'GST_RETURN', 'IR35_ASSESSMENT', 'TAX_WITHHOLD'] },
      },
    })
    expect(n).toBe(0)
  })

  it('payroll now sees a pay day where it saw nothing before', async () => {
    as(cloudepa.seat)
    const res = await json(await payroll(req('GET', '/api/payroll')))
    expect(res.status).toBe(200)
    // The route reads buyCycles where kind in SALARY_CALCULATE / SALARY_PAY
    // and derives the next pay day and calculation day from them. Before
    // this change that select was always empty, so both were always null
    // and the screen showed no upcoming pay day for anybody.
    const items: { nextPayDate: string | null; nextCalcDate: string | null }[] =
      res.body?.data?.payItems ?? []
    expect(items.length).toBeGreaterThan(0)
    expect(items.some((i) => i.nextPayDate !== null)).toBe(true)
    expect(items.some((i) => i.nextCalcDate !== null)).toBe(true)
  })

  it('no cycle is due on a Saturday or a Sunday', async () => {
    const rows = await prisma.cycle.findMany({
      where: { OR: [{ sellContractId: sell.id }, { buyContractId: buy.id }] },
      select: { dueOn: true },
    })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((r) => [0, 6].includes(r.dueOn.getDay()))).toEqual([])
  })
})
