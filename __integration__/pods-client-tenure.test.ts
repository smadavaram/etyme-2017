import { describe, it, expect, beforeAll } from 'vitest'
import type { Prisma } from '@prisma/client'
import { prisma, resetDatabase } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { tenureWarnings } from '@/lib/twin/rules/tenure'
import { daysFor } from '@/lib/tenure-days'

/**
 * The client's time limit and a sold team (record 120, ruling on tenure).
 * A member of a team sold as outcome work accrues no tenure at the client:
 * she is not the client's contractor. A member of a team marked on site is
 * read as any contractor on the site and counts from her start day.
 * Both members here are the same few days from an 18-month limit.
 */
const D = 86_400_000
const NOW = new Date()
const DAY0 = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate())
const s: Record<string, any> = {}
const OUTCOME = 'Ottoline Brackenridge'
const ONSITE = 'Osric Thistlewood'

async function team(companyId: string, name: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.pct@seed.etyme.invalid` } })
  await prisma.context.create({ data: { personId: p.id, companyId, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
  const pod = await prisma.pod.create({
    data: {
      companyId, name: `${name} team`, pricing: 'RATE_CARD', currency: 'USD',
      roles: { create: [{ title: 'Data engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: p.id } } }] },
    },
    select: { id: true },
  })
  return { personId: p.id, podId: pod.id }
}

describe('a sold team and the client’s time limit', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Fernhollow Dairy', slug: 'pct-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Marlowe Staffing', slug: 'pct-seller', kind: 'VENDOR', currency: 'USD' } })
    const person = await prisma.person.create({ data: { name: 'Hester Pellam', primaryEmail: 'hester.pct@client.example' } })
    const role = await prisma.role.create({ data: { companyId: client.id, name: 'Program Manager', permissions: ['*'], isDefault: true } })
    await prisma.context.create({ data: { personId: person.id, type: 'CLIENT_CONTACT', companyId: client.id, roleId: role.id } })
    Object.assign(s, { client: client.id, seller: seller.id })
    const sale = (tx: Prisma.TransactionClient, t: { podId: string }, o: Partial<SellPodInput>) => sellPod(tx, {
      podId: t.podId, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: person.id, decidedBy: person.id,
      projectName: 'Platform build', kind: 'MILESTONE', priceCents: 1_000_000, currency: 'USD',
      deliverables: [{ name: 'Stage 1', amountCents: 1_000_000, dueOn: new Date(DAY0 + 30 * D) }],
      ...o,
    })
    const a = await team(seller.id, OUTCOME)
    const b = await team(seller.id, ONSITE)
    s.outcome = a.personId
    s.onSite = b.personId
    const one = await prisma.$transaction((tx) => sale(tx, a, {}))
    const two = await prisma.$transaction((tx) => sale(tx, b, { projectName: 'Platform on site', onSite: true }))
    if (!one.ok || !two.ok) throw new Error(JSON.stringify([one, two]))
    // Both started so that today is 25 days before the 18-month limit.
    s.start = new Date(DAY0 - (daysFor(18) - 1 - 25) * D)
    await prisma.sellContract.updateMany({
      where: { projectOrderId: { in: [one.projectOrderId, two.projectOrderId] } },
      data: { state: 'IN_PROGRESS', startDate: s.start, startConfirmedAt: s.start, endDate: null },
    })
  }, 240_000)

  const rules = { capMonths: 18, breakDays: 90, warnAtDays: [90, 60, 30] }

  it('a member of a team sold as outcome work accrues no tenure at the client, however near the limit her days would be', async () => {
    const w = await tenureWarnings(s.client, rules, { now: new Date(DAY0) })
    expect(w.map((x) => x.personId)).not.toContain(s.outcome)
    expect(JSON.stringify(w)).not.toContain(OUTCOME)
  })

  it('a member of a team marked on the client’s site counts from her start day and is warned like any contractor', async () => {
    const w = await tenureWarnings(s.client, rules, { now: new Date(DAY0) })
    const mine = w.find((x) => x.personId === s.onSite)
    expect(mine?.tier).toBe('WARN_30')
    expect(mine?.daysToLimit).toBe(25)
    expect(mine?.daysOnSite).toBe(daysFor(18) - 26)
  })

  it('reading the client’s tenure writes an access row for the member on site and none for the member of outcome work', async () => {
    const rows = await prisma.accessLog.findMany({ where: { action: 'TENURE_VIEW' } })
    const touched = JSON.stringify(rows)
    expect(touched).toContain(s.onSite)
    expect(touched).not.toContain(s.outcome)
  })
})
