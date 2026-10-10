import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readWeek, PATCH as changeWeek } from '@/app/api/settings/week/route'
import { GET as readSettings } from '@/app/api/settings/route'
import { TOO_MANY_EXTRA_WEEKS, daysOffFor, weekDueFor } from '@/lib/days-off'

/**
 * The company's week, set through its one door: days off, when hours are
 * due, when they are approved, and who said so.
 */

type Seat = { id: string; personId: string; email: string }
let owner: Seat
let companyId = ''

async function call(fn: any, method: string, body?: unknown, seat: Seat = owner) {
  as(seat.email)
  return json(await fn(req(method, '/api/settings/week', body, { 'x-context-id': seat.id })))
}

describe('a company sets its own week', () => {
  beforeAll(async () => {
    await freshWorld()
    const ctx = await prisma.context.findFirstOrThrow({
      where: { type: 'EMPLOYEE', company: { kind: 'VENDOR' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    owner = { id: ctx.id, personId: ctx.personId, email: ctx.person.primaryEmail }
    companyId = ctx.companyId!
  })

  it('a company with nothing set reads Saturday and Sunday off, hours due Monday and approved Wednesday, and nobody named as having set it', async () => {
    const r = await call(readWeek, 'GET')
    expect(r.status).toBe(200)
    expect(r.body.data).toMatchObject({
      daysOff: [0, 6], hoursDueWeekday: 1, approveByWeekday: 3, approvalExtraWeeks: 0, setAt: null, setById: null,
    })
  })

  it('who changed the week settings and when is recorded', async () => {
    const before = Date.now()
    const r = await call(changeWeek, 'PATCH', { daysOff: [5], approvalExtraWeeks: 1 })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.changed).toEqual(['daysOff', 'approvalExtraWeeks'])
    const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    expect(row.weekSettingsSetById).toBe(owner.personId)
    expect(row.weekSettingsSetAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(await daysOffFor(companyId)).toEqual([5])
    expect(await weekDueFor(companyId)).toEqual({ hoursDueWeekday: 1, approveByWeekday: 3, approvalExtraWeeks: 1 })
  })

  it('a second extra week is refused in the founder’s sentence and nothing is written', async () => {
    const r = await call(changeWeek, 'PATCH', { approvalExtraWeeks: 2 })
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ field: 'approvalExtraWeeks', message: TOO_MANY_EXTRA_WEEKS })
    expect((await weekDueFor(companyId)).approvalExtraWeeks).toBe(1)
  })

  it('a company may go back to no days off at all', async () => {
    const r = await call(changeWeek, 'PATCH', { daysOff: [] })
    expect(r.status).toBe(200)
    expect(await daysOffFor(companyId)).toEqual([])
  })

  it('a seat without the settings desk cannot change the week, and is told which desk can', async () => {
    // Any firm's recruiter-like seat: one whose role holds neither every
    // permission nor the settings desk.
    const seats = await prisma.context.findMany({
      where: { type: 'EMPLOYEE', companyId: { not: null }, roleId: { not: null } },
      include: { person: true, role: true },
    })
    const other = seats.find((c) => !c.role!.permissions.includes('*') && !c.role!.permissions.includes('settings.manage'))
    expect(other, 'the seeded world has a seat without the settings desk').toBeTruthy()
    const theirs = other!.companyId!
    const r = await call(changeWeek, 'PATCH', { daysOff: [5] }, {
      id: other!.id, personId: other!.personId, email: other!.person.primaryEmail,
    })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('working week')
    expect(await daysOffFor(theirs)).toEqual([0, 6])
  })
  it('any seat of a company may read its days off; only the settings desk may change them', async () => {
    await call(changeWeek, 'PATCH', { daysOff: [5] })
    const seat = await prisma.context.findFirst({
      where: {
        companyId, revokedAt: null, roleId: { not: null },
        NOT: [{ role: { permissions: { has: '*' } } }, { role: { permissions: { has: 'settings.manage' } } }],
      },
      include: { person: true },
    }) ?? await prisma.context.findFirstOrThrow({
      // A worker at the company with no role at all reads it too.
      where: { companyId, revokedAt: null, NOT: { role: { permissions: { has: '*' } } } },
      include: { person: true },
    })
    const plain = { id: seat.id, personId: seat.personId, email: seat.person.primaryEmail }
    const read = await call(readWeek, 'GET', undefined, plain)
    expect(read.status).toBe(200)
    expect(read.body.data.daysOff).toEqual([5])
    const change = await call(changeWeek, 'PATCH', { daysOff: [0, 6] }, plain)
    expect(change.status).toBe(403)
    expect(await daysOffFor(companyId)).toEqual([5])
  })
  it('the settings page shows the company’s own days off beside the weekend direction', async () => {
    await call(changeWeek, 'PATCH', { daysOff: [5] })
    as(owner.email)
    const r = await json(await readSettings(req('GET', '/api/settings', undefined, { 'x-context-id': owner.id })))
    expect(r.status).toBe(200)
    expect(r.body.data.cycleShift.policy.daysOff).toEqual([5])
  })
})
