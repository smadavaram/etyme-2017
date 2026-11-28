import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readPayroll, PATCH as changePayroll } from '@/app/api/settings/payroll/route'
import { GET as readActivity } from '@/app/api/automation/route'
import { paySettingsFor } from '@/lib/payroll-settings'

/**
 * The first pay period's first day leaves a history on the activity log,
 * a change and a refused change alike, and the payroll answer says whether
 * the company has run payroll so the screen asks before moving the day
 * (the skeptic's walk of the pay periods, 2026-11-14). The founder has not
 * said which Sunday; the walk moves through all three he may choose.
 */

type Seat = { id: string; personId: string; email: string; name: string }
let owner: Seat
let plain: Seat
let companyId = ''

async function call(fn: any, method: string, path: string, body?: unknown, seat: Seat = owner) {
  as(seat.email)
  return json(await fn(req(method, path, body, { 'x-context-id': seat.id })))
}

const rows = (action: string) =>
  prisma.automationLog.findMany({ where: { companyId, action }, orderBy: { at: 'asc' } })

describe('moving the first pay day is on the activity log', () => {
  beforeAll(async () => {
    await freshWorld()
    const ctx = await prisma.context.findFirstOrThrow({ orderBy: { id: 'asc' },
      where: { type: 'EMPLOYEE', company: { kind: 'VENDOR' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    owner = { id: ctx.id, personId: ctx.personId, email: ctx.person.primaryEmail, name: ctx.person.name }
    companyId = ctx.companyId!
    const other = await prisma.context.findFirstOrThrow({ orderBy: { id: 'asc' },
      where: {
        companyId, revokedAt: null,
        NOT: [{ role: { permissions: { has: '*' } } }, { role: { permissions: { has: 'settings.manage' } } }],
      },
      include: { person: true },
    })
    plain = { id: other.id, personId: other.personId, email: other.person.primaryEmail, name: other.person.name }
    await prisma.company.update({ where: { id: companyId }, data: { payPeriod: 'BIWEEKLY', payFirstPeriodStart: null } })
    await prisma.automationLog.deleteMany({ where: { companyId, action: { in: ['PAY_FIRST_DAY_CHANGED', 'PAY_FIRST_DAY_CHANGE_REFUSED'] } } })
  })

  it('setting and then moving the first day each write one row with the old day, the new day and who moved it', async () => {
    for (const [from, to] of [[null, '2026-12-06'], ['2026-12-06', '2026-12-13'], ['2026-12-13', '2026-12-27']] as const) {
      const r = await call(changePayroll, 'PATCH', '/api/settings/payroll', { payFirstPeriodStart: to })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      const last = (await rows('PAY_FIRST_DAY_CHANGED')).at(-1)!
      expect(last.payload).toEqual({ from, to, by: owner.personId })
      expect(last.summary).toContain(owner.name)
      expect(last.reversible).toBe(true)
    }
    const all = await rows('PAY_FIRST_DAY_CHANGED')
    expect(all).toHaveLength(3)
    expect(all[2].summary).toBe(`${owner.name} changed the first pay period’s first day from Dec 13, 2026 to Dec 27, 2026.`)
  })

  it('saving the payroll answers with the first day unchanged writes no row about the first day', async () => {
    const before = (await rows('PAY_FIRST_DAY_CHANGED')).length
    const r = await call(changePayroll, 'PATCH', '/api/settings/payroll', { payFirstPeriodStart: '2026-12-27', payDayOffsetDays: 6 })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await rows('PAY_FIRST_DAY_CHANGED')).toHaveLength(before)
  })

  it('a seat that may not change payroll is refused, and the refusal is on the activity log with the day as it stands and the day asked for', async () => {
    const r = await call(changePayroll, 'PATCH', '/api/settings/payroll', { payFirstPeriodStart: '2026-12-06' }, plain)
    expect(r.status).toBe(403)
    expect((await paySettingsFor(companyId)).payFirstPeriodStart).toBe('2026-12-27')
    const refused = await rows('PAY_FIRST_DAY_CHANGE_REFUSED')
    expect(refused).toHaveLength(1)
    expect(refused[0].payload).toEqual({ from: '2026-12-27', asked: '2026-12-06', by: plain.personId })
    expect(refused[0].summary).toBe(`${plain.name} was refused changing the first pay period’s first day from Dec 27, 2026 to Dec 6, 2026.`)
    expect(refused[0].reason).toBe(r.body.error.message)
    expect(refused[0].reversible).toBe(false)
  })

  it('the company’s activity log in Settings shows the change and the refusal', async () => {
    const r = await call(readActivity, 'GET', '/api/automation?limit=200')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const said = r.body.data.entries.map((e: any) => e.summary)
    expect(said).toContain(`${owner.name} changed the first pay period’s first day from Dec 13, 2026 to Dec 27, 2026.`)
    expect(said).toContain(`${plain.name} was refused changing the first pay period’s first day from Dec 27, 2026 to Dec 6, 2026.`)
  })

  it('the payroll answer says whether the company has run payroll, so the screen asks before moving the first day', async () => {
    const ran = (await prisma.automationLog.count({ where: { companyId, action: 'PAYROLL_RUN' } })) > 0
    const first = await call(readPayroll, 'GET', '/api/settings/payroll')
    expect(first.body.data.payrollRun).toBe(ran)
    if (!ran) {
      await prisma.automationLog.create({
        data: { companyId, action: 'PAYROLL_RUN', summary: 'Payroll calculate: 0 contracts', reason: 'Test run', payload: { action: 'calculate', contracts: [] }, reversible: false },
      })
    }
    const after = await call(readPayroll, 'GET', '/api/settings/payroll')
    expect(after.body.data.payrollRun).toBe(true)
  })
})
