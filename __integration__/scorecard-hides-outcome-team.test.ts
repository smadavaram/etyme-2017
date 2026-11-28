import { describe, it, expect, beforeAll } from 'vitest'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma, resetDatabase, as, req, json } from './harness'
import { sellPod, type SellPodInput } from '@/lib/money/pod-sale'
import { GET as scorecards } from '@/app/api/vendors/scorecards/route'

/**
 * The client's supplier scorecard and a sold team (record 120). A member of a
 * team sold as outcome work is not the client's contractor, so she is never
 * counted as somebody who started from the supplier. A member marked on site is.
 */
const D = 86_400_000
const NOW = new Date()
const DAY0 = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate())
const CLIENT_EMAIL = 'hester.scard@client.example'
const s: Record<string, any> = {}

async function member(companyId: string, name: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: `${name.split(' ')[0].toLowerCase()}.scard@seed.etyme.invalid` } })
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

describe('the client’s supplier scorecard and a sold team', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Fernhollow Dairy', slug: 'scard-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Marlowe Staffing', slug: 'scard-seller', kind: 'VENDOR', currency: 'USD' } })
    const person = await prisma.person.create({ data: { name: 'Hester Pellam', primaryEmail: CLIENT_EMAIL } })
    const role = await prisma.role.create({ data: { companyId: client.id, name: 'Program Manager', permissions: ['*'], isDefault: true } })
    await prisma.context.create({ data: { personId: person.id, type: 'CLIENT_CONTACT', companyId: client.id, roleId: role.id } })
    const sale = (tx: Prisma.TransactionClient, t: { podId: string }, o: Partial<SellPodInput>) => sellPod(tx, {
      podId: t.podId, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: person.id, decidedBy: person.id,
      projectName: 'Platform build', kind: 'MILESTONE', priceCents: 1_000_000, currency: 'USD',
      deliverables: [{ name: 'Stage 1', amountCents: 1_000_000, dueOn: new Date(DAY0 + 30 * D) }],
      ...o,
    })
    const a = await member(seller.id, 'Ottoline Brackenridge')
    const b = await member(seller.id, 'Osric Thistlewood')
    const one = await prisma.$transaction((tx) => sale(tx, a, {}))
    const two = await prisma.$transaction((tx) => sale(tx, b, { projectName: 'Platform on site', onSite: true }))
    if (!one.ok || !two.ok) throw new Error(JSON.stringify([one, two]))
    const start = new Date(DAY0 - 10 * D)
    await prisma.sellContract.updateMany({
      where: { projectOrderId: { in: [one.projectOrderId, two.projectOrderId] } },
      data: { state: 'IN_PROGRESS', startDate: start, startConfirmedAt: start, endDate: null },
    })
    // Both were put forward to the client for one job each.
    for (const [who, title] of [[a.personId, 'Outcome job'], [b.personId, 'On-site job']] as const) {
      const r = await prisma.requirement.create({ data: { companyId: client.id, title, skills: ['SQL'] } })
      await prisma.submission.create({
        data: { requirementId: r.id, personId: who, fromCompanyId: seller.id, toCompanyId: client.id, kind: 'INTERNAL', rate: 9_000, submittedAt: new Date(DAY0 - 20 * D) },
      })
    }
    Object.assign(s, { seller: seller.id })
  }, 240_000)

  it('a client’s supplier scorecard never counts a member of outcome work', async () => {
    as(CLIENT_EMAIL)
    const r = await json(await scorecards(req('GET', '/api/vendors/scorecards') as NextRequest))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const card = r.body.data.suppliers.find((c: { vendorName: string }) => c.vendorName === 'Marlowe Staffing')
    expect(card.received).toBe(2)
    // Only the member on site started from this supplier for the client.
    expect(card.hired.says).toBe('1 of 2 hired.')
    expect(JSON.stringify(r.body)).not.toContain('Ottoline')
  })
})
