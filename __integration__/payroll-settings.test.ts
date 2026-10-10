import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readPayroll, PATCH as changePayroll } from '@/app/api/settings/payroll/route'
import { PAY_BEFORE_WORKED_OUT, paySettingsFor } from '@/lib/payroll-settings'

/**
 * The company's payroll, set through its one door: how often pay is run,
 * when it is worked out and paid, and who said so. Founder, 2026-10-07.
 */

type Seat = { id: string; personId: string; email: string }
let owner: Seat
let companyId = ''

async function call(fn: any, method: string, body?: unknown, seat: Seat = owner) {
  as(seat.email)
  return json(await fn(req(method, '/api/settings/payroll', body, { 'x-context-id': seat.id })))
}

describe('a company sets its own payroll', () => {
  beforeAll(async () => {
    await freshWorld()
    const ctx = await prisma.context.findFirstOrThrow({
      where: { type: 'EMPLOYEE', company: { kind: 'VENDOR' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    owner = { id: ctx.id, personId: ctx.personId, email: ctx.person.primaryEmail }
    companyId = ctx.companyId!
  })

  it('a company with nothing set reads every other week, worked out four days and paid six days after the period ends, and nobody named as having set it', async () => {
    const r = await call(readPayroll, 'GET')
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({
      payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, payDaysOfMonth: [28], payCalcDaysBefore: 3,
      setAt: null, setById: null, setByName: null,
    })
  })

  it('a change to monthly on the 28th, worked out three days before, sticks and records who made it and when', async () => {
    const before = Date.now()
    const r = await call(changePayroll, 'PATCH', { payPeriod: 'MONTHLY', payDaysOfMonth: [28], payCalcDaysBefore: 3 })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.changed).toEqual(['payPeriod', 'payCalcDaysBefore', 'payDaysOfMonth'])
    const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    expect(row.paySettingsSetById).toBe(owner.personId)
    expect(row.paySettingsSetAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(await paySettingsFor(companyId)).toMatchObject({ payPeriod: 'MONTHLY', payDaysOfMonth: [28], payCalcDaysBefore: 3 })
    const read = await call(readPayroll, 'GET')
    expect(read.body.data.payPeriod).toBe('MONTHLY')
    expect(read.body.data.setByName).toBeTruthy()
  })

  it('a refused change writes nothing and says why in a sentence', async () => {
    const stamp = (await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).paySettingsSetAt
    const r = await call(changePayroll, 'PATCH', { payPeriod: 'BIWEEKLY', payCalcOffsetDays: 6, payDayOffsetDays: 4 })
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ field: 'payDayOffsetDays', message: PAY_BEFORE_WORKED_OUT })
    const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    expect(row.payPeriod).toBe('MONTHLY')
    expect(row.paySettingsSetAt).toEqual(stamp)
  })

  it('a seat without the settings desk may read payroll but cannot change it, and is told which desk can', async () => {
    const seat = await prisma.context.findFirst({
      where: {
        companyId, revokedAt: null, roleId: { not: null },
        NOT: [{ role: { permissions: { has: '*' } } }, { role: { permissions: { has: 'settings.manage' } } }],
      },
      include: { person: true },
    }) ?? await prisma.context.findFirstOrThrow({
      where: { companyId, revokedAt: null, NOT: { role: { permissions: { has: '*' } } } },
      include: { person: true },
    })
    const plain = { id: seat.id, personId: seat.personId, email: seat.person.primaryEmail }
    const read = await call(readPayroll, 'GET', undefined, plain)
    expect(read.status).toBe(200)
    expect(read.body.data.payPeriod).toBe('MONTHLY')
    const change = await call(changePayroll, 'PATCH', { payPeriod: 'WEEKLY' }, plain)
    expect(change.status).toBe(403)
    expect(change.body.error.message).toContain('payroll')
    expect(change.body.error.message).toMatch(/is done by .+ Ask/)
    expect((await paySettingsFor(companyId)).payPeriod).toBe('MONTHLY')
  })
})
