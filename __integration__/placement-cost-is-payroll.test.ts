import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { RATE_CHANGE_PERSON } from '@/lib/seed-rate-change'
import { ratePeriods } from '@/lib/contract-rate'
import { placementEarned, hoursSigned } from '@/lib/money/placement-earned'
import { placementPayTerms, placementMoneySheets } from '@/lib/money/placement-pay-terms'

import { POST as runPayroll } from '@/app/api/payroll/run/route'

/**
 * Rosa Delgado's placement at Brightmoor, on the seeded world, as the
 * browser walk found it: a header reading the hours on the card's dozen
 * weeks, and a cost that left out the premium payroll pays on her
 * forty-five-hour week. This walks the money door the placement page
 * reads and holds it to the payroll run.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const ISO = /\b\d{4}-\d{2}-\d{2}\b/

let sellId = ''
let buyId = ''
let personId = ''
let earned: ReturnType<typeof placementEarned>
let longWeekMonth = ''
let sheetCount = 0

beforeAll(async () => {
  await freshWorld()
  const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: RATE_CHANGE_PERSON.email } })
  personId = person.id
  const sell = await prisma.sellContract.findFirstOrThrow({ where: { personId }, include: { buyLinks: true } })
  sellId = sell.id
  buyId = sell.buyLinks[0].buyContractId
  const seat = await prisma.buyContractCandidate.findFirstOrThrow({ where: { buyContractId: buyId, personId } })
  const rows = await prisma.rateHistory.findMany({
    where: { OR: [{ contractType: 'SELL', contractId: sellId }, { contractType: 'BUY', contractId: buyId }] },
    select: { id: true, contractType: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  const sheets = await placementMoneySheets(sellId)
  sheetCount = sheets.length
  earned = placementEarned({
    sheets,
    bill: { openingRateCents: sell.billRate, periods: ratePeriods(rows.filter((r) => r.contractType === 'SELL')), currency: sell.billCurrency },
    pay: {
      openingRateCents: seat.payRate,
      periods: ratePeriods(rows.filter((r) => r.contractType === 'BUY')),
      currency: seat.payCurrency ?? 'USD',
      overtime: await placementPayTerms({ buyContractId: buyId, sellContractId: sellId, personId }),
    },
  })
  const long = await prisma.timesheet.findFirstOrThrow({ where: { sellContractId: sellId, totalHours: { gt: 40 } } })
  longWeekMonth = long.periodStart.toISOString().slice(0, 7)
}, 900_000)

describe("Rosa Delgado's placement, costed the way payroll pays her", () => {
  it('the seeded placement has more weeks than the dozen on its card, and its hours are summed over all of them', async () => {
    expect(sheetCount).toBeGreaterThan(12)
    const signed = hoursSigned(await placementMoneySheets(sellId))
    expect(signed.accepted).toBe(earned.hoursPaid)
    expect(signed.approved).toBe(earned.hoursBilled)
  })

  it("a placement's cost is what payroll pays, overtime premium included, and the premium is the run's own figure for her long week", async () => {
    const owner = await prisma.context.findFirstOrThrow({
      where: { person: { primaryEmail: OWNER }, company: { slug: 'world-brightmoor' } },
    })
    // Since 2026-09-30 the seed pays every month before this one, her
    // long week's included, so the run's figure is the processed run's
    // own premium. Where that week is in this month, no run has reached
    // it, and a calculate run says what it would pay.
    const seeded = (await prisma.automationLog.findMany({ where: { action: 'PAYROLL_RUN' }, select: { payload: true } }))
      .flatMap((l) => ((l.payload as any)?.action === 'process' ? (l.payload as any).contracts ?? [] : []))
      .filter((c: any) => c.buyContractId === buyId && c.payPeriod?.start?.slice(0, 7) === longWeekMonth)
      .flatMap((c: any) => c.paid ?? [])
      .reduce((n: number, l: any) => n + (l.premiumCents ?? 0), 0)
    let premiumCents = Math.round(seeded)
    if (premiumCents === 0) {
      as(OWNER)
      const r = await json(await runPayroll(req('POST', '/api/payroll/run', {
        buyContractIds: [buyId], action: 'calculate', period: longWeekMonth,
      }, { 'x-context-id': owner.id })))
      expect(r.status).toBe(200)
      premiumCents = r.body.data.details.find((x: any) => x.buyContractId === buyId).premiumCents
    }
    expect(premiumCents).toBeGreaterThan(0)
    expect(earned.overtimePremiumCents).toBe(premiumCents)
    expect(earned.costCents).not.toBeNull()
    expect(earned.overtimeSays).toContain('of overtime premium')
  })

  it('no sentence on the payroll or placement money screens carries an ISO date: Rosa’s rate change and her overtime', () => {
    expect(earned.payRateChangeSays).toBeTruthy()
    expect(earned.payRateChangeSays).not.toMatch(ISO)
    expect(earned.overtimeSays).not.toMatch(ISO)
  })
})
