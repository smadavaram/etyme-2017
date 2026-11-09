import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { planCyclesFor } from '@/lib/contract-cycles'
import { localKey } from '@/lib/cycle-generator'

/**
 * The founder, 2026-11-09, on the seeded world: a pay date on a day off
 * moves to the working day before, so the worker is never paid late; a bill
 * date moves to the working day after; and the day a supplier's invoice is
 * received is a bill date, never dated back into the month before the work
 * ends. Read through the one planner every award, extension and seed uses
 * (`planCyclesFor`), with the paying company's own days off read from the
 * record, over January 2026, whose last day is a Saturday.
 */

const s: Record<string, any> = {}
const JAN = { startDate: new Date(Date.UTC(2026, 0, 1)), endDate: new Date(Date.UTC(2026, 0, 31)) }
const MONTHLY = { payPeriod: 'MONTHLY' as const, payCalcOffsetDays: 4, payDayOffsetDays: 6, payDaysOfMonth: [28], payCalcDaysBefore: 3 }

describe('pay before, bills after, around January 2026’s last weekend, on the seeded world', () => {
  beforeAll(async () => {
    await freshWorld()
    // A seeded sell line with a buy line that pays a supplier below it, and
    // one whose buy line is the firm's own employee on payroll.
    const vendorLine = await prisma.buyContract.findFirstOrThrow({
      where: { vendorCompanyId: { not: null }, sellLinks: { some: {} } },
      select: { id: true, contractType: true, vendorCompanyId: true, sellLinks: { select: { sellContractId: true }, take: 1 } },
    })
    const payrollLine = await prisma.buyContract.findFirstOrThrow({
      where: { vendorCompanyId: null, supplierSellContractId: null, contractType: 'W2', sellLinks: { some: {} } },
      select: { id: true, contractType: true, vendorCompanyId: true, sellLinks: { select: { sellContractId: true }, take: 1 } },
    })
    s.vendor = vendorLine
    s.payroll = payrollLine
  }, 600_000)

  const plan = (buy: any, payroll: any) =>
    planCyclesFor(prisma, {
      sell: { id: buy.sellLinks[0].sellContractId, ...JAN },
      buy: { id: buy.id, contractType: buy.contractType, vendorCompanyId: buy.vendorCompanyId },
      packId: 'US_IT',
      payroll,
    })
  const on = (rows: { kind: string; dueOn: Date }[], kind: string) => rows.filter((r) => r.kind === kind).map((r) => localKey(r.dueOn))

  it('the bill for January’s second half is dated the Monday after January 31, a Saturday', async () => {
    const { rows } = await plan(s.vendor, null)
    expect(on(rows, 'INVOICE_GENERATE')).toContain('2026-02-02')
    expect(on(rows, 'INVOICE_GENERATE')).not.toContain('2026-01-30')
  })

  it('a supplier’s invoice for January is received on the Monday after, never dated before January ends', async () => {
    const { rows } = await plan(s.vendor, null)
    expect(on(rows, 'VENDOR_BILL_GENERATE')).toEqual(['2026-01-15', '2026-02-02'])
  })

  it('January’s month-end pay, due on a Saturday, is paid on the Friday before', async () => {
    const { rows } = await plan(s.payroll, MONTHLY)
    expect(on(rows, 'SALARY_PAY')).toEqual(['2026-01-30'])
  })
})
