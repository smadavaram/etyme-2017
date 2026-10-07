import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { PATCH as changePayroll } from '@/app/api/settings/payroll/route'
import { POST as extend } from '@/app/api/contracts/[id]/extend/route'

/**
 * The company's payroll choice reaches the pay dates a line is written
 * with. Founder, 2026-10-07: payroll is the company's choice, and the
 * recommendation is the default. The setting and its door are
 * `lib/payroll-settings`; the dates are `generatePayCycles` in
 * `lib/cycle-generator`, read by `writeCyclesFor` in `lib/contract-cycles`.
 *
 * Walked on the seeded world: a firm paying one of its own W-2s changes
 * its payroll to every week on its settings page, then extends the line.
 * The added months get a pay day every week; the months already written
 * keep the dates they had.
 */

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('a company’s payroll choice reaches the dates', () => {
  beforeAll(async () => {
    await freshWorld()
  })

  it('changing a company’s payroll to weekly and regenerating a W2 line’s cycles writes a pay date every week', async () => {
    // Every seeded line in progress that the firm pays itself, with a
    // seat at that firm that may both change settings and extend.
    const lines = await prisma.sellContract.findMany({
      where: {
        state: 'IN_PROGRESS',
        endDate: { not: null },
        buyLinks: { some: { buyContract: { vendorCompanyId: null } } },
      },
      select: {
        id: true,
        companyId: true,
        endDate: true,
        buyLinks: { select: { buyContract: { select: { id: true, vendorCompanyId: true } } } },
      },
      orderBy: { id: 'asc' },
    })
    expect(lines.length, 'the seeded world has payroll lines in progress').toBeGreaterThan(0)

    let done: { buyId: string; oldEnd: Date; before: { id: string; kind: string; dueOn: Date }[] } | null = null
    const refusals: string[] = []
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
      expect(set.status, JSON.stringify(set.body)).toBe(200)

      const before = await prisma.cycle.findMany({
        where: { buyContractId: buyId },
        select: { id: true, kind: true, dueOn: true },
      })
      const r = await json(
        await extend(
          req('POST', `/api/contracts/${line.id}/extend`, { months: 2, limitReason: 'Walking the payroll choice' }, headers),
          { params: Promise.resolve({ id: line.id }) }
        )
      )
      if (r.status !== 200) {
        refusals.push(`${line.id}: ${r.status} ${JSON.stringify(r.body?.error?.message ?? r.body)}`)
        continue
      }
      done = { buyId, oldEnd: line.endDate!, before }
      break
    }
    expect(done, `no seeded payroll line could be extended:\n${refusals.join('\n')}`).not.toBeNull()
    const { buyId, oldEnd, before } = done!

    // Nothing already written moved.
    const after = await prisma.cycle.findMany({ where: { buyContractId: buyId }, select: { id: true, kind: true, dueOn: true } })
    for (const b of before) {
      const same = after.find((a) => a.id === b.id)
      expect(same && iso(same.dueOn)).toBe(iso(b.dueOn))
    }

    // The added months: a calculation and a pay day every week.
    const added = after.filter((a) => !before.some((b) => b.id === a.id))
    const pays = added.filter((a) => a.kind === 'SALARY_PAY').map((a) => a.dueOn.getTime()).sort((x, y) => x - y)
    const calcs = added.filter((a) => a.kind === 'SALARY_CALCULATE')
    expect(pays.length, 'two months added are at least seven weeks of pay').toBeGreaterThanOrEqual(7)
    expect(calcs.length).toBe(pays.length)
    for (let i = 1; i < pays.length; i++) {
      // Seven days apart, or six or eight where a holiday moved one of them back.
      const gap = Math.round((pays[i] - pays[i - 1]) / DAY)
      expect(gap, `pay days ${iso(new Date(pays[i - 1]))} and ${iso(new Date(pays[i]))}`).toBeGreaterThanOrEqual(5)
      expect(gap).toBeLessThanOrEqual(9)
    }
    // And none of them is for a period the line had already been written for.
    expect(pays[0]).toBeGreaterThan(oldEnd.getTime())
  })
})
