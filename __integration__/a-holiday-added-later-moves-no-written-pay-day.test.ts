import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { PATCH as changePayroll } from '@/app/api/settings/payroll/route'
import { POST as addHoliday } from '@/app/api/settings/holidays/route'
import { POST as extend } from '@/app/api/contracts/[id]/extend/route'

/**
 * The Owner's answer 2 (docs/decisions/92, 2026-11-17): a holiday added
 * later does not move pay days already written; only periods not yet
 * written take it. Through the real holidays and extend routes on the
 * seeded world. No date is pinned: every day is read from the rows.
 */

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('a holiday added after pay days were written', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 600_000)

  it('a holiday added after pay days were written leaves every written pay day on its date, and only periods not yet written take it', async () => {
    const lines = await prisma.sellContract.findMany({
      where: { state: 'IN_PROGRESS', endDate: { not: null }, buyLinks: { some: { buyContract: { vendorCompanyId: null } } } },
      select: { id: true, companyId: true, buyLinks: { select: { buyContract: { select: { id: true, vendorCompanyId: true } } } } },
      orderBy: { id: 'asc' },
    })
    const refusals: string[] = []
    let proved = false
    for (const line of lines) {
      const buyId = line.buyLinks.find((l) => l.buyContract.vendorCompanyId === null)!.buyContract.id
      const owner = await prisma.context.findFirst({
        where: { companyId: line.companyId, type: 'EMPLOYEE', revokedAt: null, role: { permissions: { has: '*' } } },
        include: { person: true },
      })
      if (!owner) continue
      as(owner.person.primaryEmail)
      const headers = { 'x-context-id': owner.id }
      const set = await json(await changePayroll(req('PATCH', '/api/settings/payroll', { payPeriod: 'WEEKLY' }, headers)))
      if (set.status !== 200) { refusals.push(`${line.id}: payroll ${set.status}`); continue }

      const written = await prisma.cycle.findMany({
        where: { buyContractId: buyId, kind: 'SALARY_PAY' },
        select: { id: true, dueOn: true, completedAt: true },
        orderBy: { dueOn: 'asc' },
      })
      const open = written.filter((c) => c.completedAt === null)
      if (open.length === 0) { refusals.push(`${line.id}: no unpaid pay day`); continue }
      const target = open[0].dueOn
      const next = new Date(written[written.length - 1].dueOn.getTime() + 7 * DAY)

      // A holiday on a pay day already written, and one on the next week's pay day, not yet written.
      await prisma.holiday.deleteMany({ where: { companyId: line.companyId, date: { in: [target, next] } } })
      for (const [d, n] of [[target, 'Founders Day'], [next, 'Harbor Day']] as const) {
        const r = await json(await addHoliday(req('POST', '/api/settings/holidays', { date: iso(d), name: n }, headers)))
        expect(r.status, JSON.stringify(r.body)).toBe(201)
      }

      // Every pay day already written is on the date it had.
      const after = await prisma.cycle.findMany({ where: { id: { in: written.map((w) => w.id) } }, select: { id: true, dueOn: true } })
      for (const w of written) expect(iso(after.find((a) => a.id === w.id)!.dueOn)).toBe(iso(w.dueOn))
      expect(after.some((a) => iso(a.dueOn) === iso(target))).toBe(true)

      const r = await json(await extend(
        req('POST', `/api/contracts/${line.id}/extend`, { months: 2, limitReason: 'Walking the holiday rule' }, headers),
        { params: Promise.resolve({ id: line.id }) }
      ))
      if (r.status !== 200) { refusals.push(`${line.id}: extend ${r.status} ${JSON.stringify(r.body?.error?.message ?? r.body)}`); continue }

      const all = await prisma.cycle.findMany({ where: { buyContractId: buyId, kind: 'SALARY_PAY' }, select: { id: true, dueOn: true } })
      const fresh = all.filter((c) => !written.some((w) => w.id === c.id))
      expect(fresh.length, 'the extension wrote new pay days').toBeGreaterThan(0)
      // Still on their dates after the extension.
      for (const w of written) expect(iso(all.find((a) => a.id === w.id)!.dueOn)).toBe(iso(w.dueOn))
      // The new period takes the holiday: no pay day not yet written falls on it.
      expect(fresh.some((c) => iso(c.dueOn) === iso(next))).toBe(false)
      proved = true
      break
    }
    expect(proved, `no seeded payroll line could walk the rule:\n${refusals.join('\n')}`).toBe(true)
  })
})
