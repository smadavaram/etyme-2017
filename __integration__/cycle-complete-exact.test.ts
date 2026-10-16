import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { completeCycle, ownSeries } from '@/lib/cycle-complete'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { loadContractHolidays } from '@/lib/holidays'

/**
 * A week closes its own date, read from the line's whole series.
 *
 * A placement awarded for work already under way writes no date before
 * the award. Which date a week's bill then closes used to be estimated
 * from the usual gap between dates, and a first date moved off a weekend
 * broke the estimate: awarded on 22 October 2026, a semimonthly line's
 * first written invoice date is Monday 2 November (the 31st is a
 * Saturday), the week ending 17 October was billed, and nothing closed —
 * so 2 November read overdue after the bill had been raised.
 *
 * Here on a fixed calendar, so it does not depend on the day it runs: a
 * seeded supplier line moved to start Monday 5 October 2026, its dates
 * rewritten as an award on Thursday 22 October writes them, and each
 * week's bill and invoice receipt closed through `completeCycle`, the
 * function the routes call.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)
const AWARD = d('2026-10-22')

const line: { sell: string; buy: string } = { sell: '', buy: '' }

async function open(where: { sellContractId?: string; buyContractId?: string }, kind: string) {
  const rows = await prisma.cycle.findMany({ where: { ...where, kind }, select: { id: true, dueOn: true, completedAt: true } })
  return rows.sort((a, b) => +a.dueOn - +b.dueOn)
}

describe('a placement awarded for work under way closes each week’s own date', () => {
  beforeAll(async () => {
    await freshWorld()
    const sell = await prisma.sellContract.findFirstOrThrow({
      where: {
        endDate: { not: null },
        buyLinks: { some: { buyContract: { vendorCompanyId: { not: null } } } },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true, companyId: true, clientCompanyId: true,
        company: { select: { templatePack: true } },
        buyLinks: { select: { buyContract: { select: { id: true, contractType: true, vendorCompanyId: true } } } },
      },
    })
    const buy = sell.buyLinks.find((l) => l.buyContract.vendorCompanyId !== null)!.buyContract
    line.sell = sell.id
    line.buy = buy.id

    const startDate = d('2026-10-05')
    const endDate = d('2027-03-31')
    await prisma.sellContract.update({ where: { id: sell.id }, data: { startDate, endDate } })
    await prisma.buyContract.update({ where: { id: buy.id }, data: { startDate, endDate } })
    await prisma.cycle.deleteMany({ where: { OR: [{ sellContractId: sell.id }, { buyContractId: buy.id }] } })

    const site = await prisma.companyLocation.findFirst({
      where: { companyId: sell.clientCompanyId }, orderBy: [{ isPrimary: 'desc' }], select: { country: true },
    })
    const holidays = await loadContractHolidays(sell.companyId, sell.clientCompanyId, 2026, 2027, site?.country ?? null)
    // The award's own call: the same door, the floor at the award day.
    await writeCyclesFor(prisma, {
      sell: { id: sell.id, startDate, endDate },
      buy: { id: buy.id, contractType: String(buy.contractType), vendorCompanyId: buy.vendorCompanyId },
      packId: sell.company.templatePack ?? 'US_IT',
      holidays,
      noneDueBefore: AWARD,
    })
  })

  it('the line’s whole series holds the invoice date the award did not write, and the date moved off the weekend', async () => {
    const series = (await ownSeries(prisma, { sellContractId: line.sell, kind: 'INVOICE_GENERATE' }))!.map(iso)
    expect(series.slice(0, 3)).toEqual(['2026-10-15', '2026-11-02', '2026-11-16'])
    const written = (await open({ sellContractId: line.sell }, 'INVOICE_GENERATE')).map((c) => iso(c.dueOn))
    expect(written[0]).toBe('2026-11-02')
    expect(written).toEqual(series.filter((x) => x >= iso(AWARD)))
  })

  it('a bill for a week whose own invoice date fell before the award closes nothing', async () => {
    expect(await completeCycle(prisma, { sellContractId: line.sell, kind: 'INVOICE_GENERATE', periodEnd: d('2026-10-10') })).toBeNull()
    expect((await open({ sellContractId: line.sell }, 'INVOICE_GENERATE')).every((c) => c.completedAt === null)).toBe(true)
  })

  it('a placement awarded after its first invoice date was moved off a weekend closes that date when its first week is billed', async () => {
    const closed = await completeCycle(prisma, { sellContractId: line.sell, kind: 'INVOICE_GENERATE', periodEnd: d('2026-10-17') })
    const rows = await open({ sellContractId: line.sell }, 'INVOICE_GENERATE')
    expect(closed).toBe(rows[0].id)
    expect(rows.filter((c) => c.completedAt).map((c) => iso(c.dueOn))).toEqual(['2026-11-02'])
  })

  it('on the buy line, an invoice receipt for a week whose own date fell before the award closes nothing, and the next week’s closes its own', async () => {
    // A supplier's receipt date is a pay date and moves back off a weekend:
    // the 31st, a Saturday, is Friday 30 October, and Sunday 15 November
    // is Friday the 13th.
    const series = (await ownSeries(prisma, { buyContractId: line.buy, kind: 'VENDOR_BILL_GENERATE' }))!.map(iso)
    expect(series.slice(0, 3)).toEqual(['2026-10-15', '2026-10-30', '2026-11-13'])
    expect(await completeCycle(prisma, { buyContractId: line.buy, kind: 'VENDOR_BILL_GENERATE', periodEnd: d('2026-10-10') })).toBeNull()
    const closed = await completeCycle(prisma, { buyContractId: line.buy, kind: 'VENDOR_BILL_GENERATE', periodEnd: d('2026-10-17') })
    const rows = await open({ buyContractId: line.buy }, 'VENDOR_BILL_GENERATE')
    expect(closed).toBe(rows[0].id)
    expect(rows.filter((c) => c.completedAt).map((c) => iso(c.dueOn))).toEqual(['2026-10-30'])
  })
})
