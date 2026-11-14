import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readPayroll, PATCH as changePayroll } from '@/app/api/settings/payroll/route'
import { payPeriodAt, paySettingsFor } from '@/lib/payroll-settings'

/**
 * Where a company's first two-week pay period starts, set through the
 * payroll door. The founder, 2026-11-14: "W2 first, outside payroll
 * provider, biweekly". He has not said which Sunday, so all three he may
 * choose are walked: Dec 6, Dec 13 and Dec 27, 2026.
 */

type Seat = { id: string; personId: string; email: string }
let owner: Seat
let companyId = ''

async function call(fn: any, method: string, body?: unknown, seat: Seat = owner) {
  as(seat.email)
  return json(await fn(req(method, '/api/settings/payroll', body, { 'x-context-id': seat.id })))
}

describe('the Owner says which Sunday the first pay period starts on', () => {
  beforeAll(async () => {
    await freshWorld()
    const ctx = await prisma.context.findFirstOrThrow({ orderBy: { id: 'asc' },
      where: { type: 'EMPLOYEE', company: { kind: 'VENDOR' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    owner = { id: ctx.id, personId: ctx.personId, email: ctx.person.primaryEmail }
    companyId = ctx.companyId!
    // Christmas and New Year's Day on the company's own calendar, so the
    // first two Sundays' pay days land on a holiday.
    await prisma.holiday.deleteMany({ where: { companyId, date: { in: [new Date('2026-12-25'), new Date('2027-01-01')] } } })
    await prisma.holiday.createMany({ data: [
      { companyId, date: new Date('2026-12-25T00:00:00Z'), name: 'Christmas Day' },
      { companyId, date: new Date('2027-01-01T00:00:00Z'), name: 'New Year’s Day' },
    ] })
    await prisma.company.update({ where: { id: companyId }, data: { payPeriod: 'BIWEEKLY', cycleShiftPay: 'BEFORE', daysOff: [0, 6] } })
  })

  it('a company that never set it reads no first day and no first period', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { payFirstPeriodStart: null } })
    const r = await call(readPayroll, 'GET')
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({ payPeriod: 'BIWEEKLY', payFirstPeriodStart: null, firstPeriod: null })
    expect(await payPeriodAt(companyId, '2026-12-16')).toBeNull()
  })

  const WANT = {
    '2026-12-06': { start: '2026-12-06', end: '2026-12-19', calcOn: '2026-12-23', payOn: '2026-12-24', payOnUnmoved: '2026-12-25' },
    '2026-12-13': { start: '2026-12-13', end: '2026-12-26', calcOn: '2026-12-30', payOn: '2026-12-31', payOnUnmoved: '2027-01-01' },
    '2026-12-27': { start: '2026-12-27', end: '2027-01-09', calcOn: '2027-01-13', payOn: '2027-01-15', payOnUnmoved: '2027-01-15' },
  } as const

  for (const [sunday, want] of Object.entries(WANT)) {
    it(`setting ${sunday} as the first day is kept as that calendar day, with who set it and when, and the first period and its pay day read back moved off a holiday`, async () => {
      const before = Date.now()
      const r = await call(changePayroll, 'PATCH', { payFirstPeriodStart: sunday })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body.data.changed).toEqual(['payFirstPeriodStart'])
      expect(r.body.data.settings).toMatchObject({ payFirstPeriodStart: sunday, firstPeriod: want })
      const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
      expect(row.payFirstPeriodStart!.toISOString()).toBe(`${sunday}T00:00:00.000Z`)
      expect(row.paySettingsSetById).toBe(owner.personId)
      expect(row.paySettingsSetAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
      const read = await call(readPayroll, 'GET')
      expect(read.body.data).toMatchObject({ payFirstPeriodStart: sunday, firstPeriod: want })
      // A week worked before the first period still falls in a period.
      const earlier = await payPeriodAt(companyId, '2026-11-30')
      expect(earlier && earlier.start <= '2026-11-30' && earlier.end >= '2026-11-30').toBe(true)
    })
  }

  it('a Monday is refused in a sentence offering the Sunday before and after, and nothing is written', async () => {
    const stamp = (await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).paySettingsSetAt
    const r = await call(changePayroll, 'PATCH', { payFirstPeriodStart: '2026-12-07' })
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({
      field: 'payFirstPeriodStart',
      message: 'December 7, 2026 is a Monday. A pay period starts on a Sunday: pick December 6, 2026 or December 13, 2026.',
    })
    const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    expect(row.payFirstPeriodStart!.toISOString().slice(0, 10)).toBe('2026-12-27')
    expect(row.paySettingsSetAt).toEqual(stamp)
  })

  it('a seat that may not change payroll may not set the first day either, and the day stays as it was', async () => {
    const seat = await prisma.context.findFirstOrThrow({
      where: {
        companyId, revokedAt: null,
        NOT: [{ role: { permissions: { has: '*' } } }, { role: { permissions: { has: 'settings.manage' } } }],
      },
      include: { person: true },
    })
    const plain = { id: seat.id, personId: seat.personId, email: seat.person.primaryEmail }
    const r = await call(changePayroll, 'PATCH', { payFirstPeriodStart: '2026-12-06' }, plain)
    expect(r.status).toBe(403)
    expect((await paySettingsFor(companyId)).payFirstPeriodStart).toBe('2026-12-27')
  })

  it('the first day can be cleared, and then no period is worked out from it', async () => {
    const r = await call(changePayroll, 'PATCH', { payFirstPeriodStart: null })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.settings).toMatchObject({ payFirstPeriodStart: null, firstPeriod: null })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).payFirstPeriodStart).toBeNull()
  })
})
