import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as payroll } from '@/app/api/payroll/route'
import { PATCH as changePayroll } from '@/app/api/settings/payroll/route'

/**
 * Reported from Tapin production (docs/decisions/104, Start here 2): the
 * first pay-period Sunday is set ahead of today, every other week, and
 * the Payroll page still read the old cycle. The first Sunday here is the
 * Sunday five to six weeks after today, so the test holds on every day of
 * the year; the Dec 27, 2026 period is asked for by its own day.
 */

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const DAY = 86_400_000
const key = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
// The Sunday on or after today + 35 days.
const AHEAD = key(today + (35 + ((7 - new Date(today + 35 * DAY).getUTCDay()) % 7)) * DAY)
const TODAY = key(today)

let firmId = ''
let ownerCtx = ''

async function setFirst(sunday: string) {
  as(BRIGHTMOOR)
  const r = await json(await changePayroll(req('PATCH', '/api/settings/payroll', { payFirstPeriodStart: sunday }, { 'x-context-id': ownerCtx })))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}
async function view(period?: string) {
  as(BRIGHTMOOR)
  const r = await json(await payroll(req('GET', `/api/payroll${period ? `?period=${period}` : ''}`)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}

describe('a firm that set its first pay-period Sunday ahead of today', () => {
  beforeAll(async () => {
    await freshWorld()
    firmId = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
    ownerCtx = (await prisma.context.findFirstOrThrow({
      where: { companyId: firmId, person: { primaryEmail: BRIGHTMOOR }, revokedAt: null }, orderBy: { id: 'asc' },
    })).id
    await prisma.company.update({
      where: { id: firmId },
      data: { payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, payFirstPeriodStart: null },
    })
  }, 600_000)

  it('a pay day already written keeps its date and its paid mark when the first Sunday is set', async () => {
    const before = await prisma.cycle.findMany({
      where: { OR: [{ buyContract: { companyId: firmId } }, { sellContract: { companyId: firmId } }] },
      select: { id: true, dueOn: true, completedAt: true }, orderBy: { id: 'asc' },
    })
    expect(before.length, 'the seeded firm has pay days written').toBeGreaterThan(0)
    await setFirst(AHEAD)
    const after = await prisma.cycle.findMany({ where: { id: { in: before.map((c) => c.id) } }, select: { id: true, dueOn: true, completedAt: true }, orderBy: { id: 'asc' } })
    expect(after.map((c) => [c.id, c.dueOn.toISOString(), c.completedAt?.toISOString() ?? null]))
      .toEqual(before.map((c) => [c.id, c.dueOn.toISOString(), c.completedAt?.toISOString() ?? null]))
  })

  it('a firm that set its first Sunday five weeks ahead sees today\'s work in the period that holds it, and the page opens there', async () => {
    const data = await view()
    expect(data.payPeriods, 'pay is listed by the firm\'s own periods').not.toBeNull()
    const current = data.payPeriods.periods.find((p: any) => p.start === data.payPeriods.current)
    expect(current.start <= TODAY && TODAY <= current.end).toBe(true)
    // Counted back from the first Sunday in whole two-week steps.
    expect((Date.parse(`${AHEAD}T00:00:00Z`) - Date.parse(`${current.start}T00:00:00Z`)) % (14 * DAY)).toBe(0)
  })

  it('the first period is on the picker, however many periods ahead it is', async () => {
    const data = await view()
    expect(data.payPeriods.periods.map((p: any) => p.start)).toContain(AHEAD)
    expect(data.firstPeriod?.start).toBe(AHEAD)
  })

  it('the page says which cycle it shows and from which date the new one starts', async () => {
    const data = await view()
    expect(data.firstPeriodSays).toMatch(/^Brightmoor Staffing counts its pay periods from the first period, /)
    expect(data.firstPeriodSays).toContain('before it are counted back from that Sunday')
    // Once the first period has begun, nothing more is said.
    await setFirst(key(Date.parse(`${AHEAD}T00:00:00Z`) - 70 * DAY))
    expect((await view()).firstPeriodSays).toBeNull()
    await setFirst(AHEAD)
  })

  it('the first period reads Dec 27 to Jan 9, worked out Jan 13, paid Jan 15', async () => {
    await setFirst('2026-12-27')
    const data = await view('2026-12-27')
    expect(data.payPeriods.shown).toMatchObject({ start: '2026-12-27', end: '2027-01-09', calcOn: '2027-01-13', payOn: '2027-01-15' })
    expect(data.periodSays).toContain('Dec 27, 2026 – Jan 9, 2027')
    expect(data.periodSays).toContain('Jan 13, 2027')
    expect(data.periodSays).toContain('Jan 15, 2027')
    await setFirst(AHEAD)
  })
})
