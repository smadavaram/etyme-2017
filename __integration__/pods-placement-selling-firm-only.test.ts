import { describe, it, expect, beforeAll } from 'vitest'
import type { Prisma } from '@prisma/client'
import { as, req, json, prisma, resetDatabase } from './harness'
import { sellPod } from '@/lib/money/pod-sale'
import { GET as placementGet } from '@/app/api/placements/[id]/route'

/**
 * Pax's ruling, batch B: only the selling firm opens a member's placement
 * of outcome work. Every other firm (the client, a program seat, a firm above
 * the seller) is refused as not found, and the refusal is in the access log.
 */
const CLIENT = 'ppf-client@client.example'
const SELLER = 'ppf-owner@seller.example'
const MSP = 'ppf-msp@msp.example'
const s: Record<string, any> = {}
const MEMBER = 'Ysolde Pennywhistle'
const open = async (email: string, id: string) => { as(email); return json(await placementGet(req('GET', `/api/placements/${id}`), { params: Promise.resolve({ id }) } as any)) }

describe('only the selling firm opens a member’s placement of outcome work', () => {
  beforeAll(async () => {
    await resetDatabase()
    const mk = (name: string, slug: string, kind: 'CLIENT' | 'VENDOR') => prisma.company.create({ data: { name, slug, kind, currency: 'USD' } })
    const [client, seller, msp] = [await mk('Harrowgate Foods', 'ppf-client', 'CLIENT'), await mk('Quillbrook Staffing', 'ppf-seller', 'VENDOR'), await mk('Brindlemoor Programs', 'ppf-msp', 'VENDOR')]
    for (const [email, name, c, type] of [[CLIENT, 'Imogen Daleford', client, 'CLIENT_CONTACT'], [SELLER, 'Mira Osei', seller, 'EMPLOYEE'], [MSP, 'Tobias Rennick', msp, 'EMPLOYEE']] as const) {
      const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type, companyId: c.id, roleId: role.id } })
    }
    const m = await prisma.person.create({ data: { name: MEMBER, primaryEmail: 'ysolde.ppf@seed.etyme.invalid' } })
    s.member = m.id
    await prisma.context.create({ data: { personId: m.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
    const pod = await prisma.pod.create({ data: { companyId: seller.id, name: 'Team', pricing: 'RATE_CARD', currency: 'USD', roles: { create: [{ title: 'Data engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: m.id } } }] } }, select: { id: true } })
    const sale = await prisma.$transaction((tx: Prisma.TransactionClient) => sellPod(tx, {
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: s[CLIENT], decidedBy: s[CLIENT],
      projectName: 'Outcome build', kind: 'MILESTONE', priceCents: 1_000_000, currency: 'USD',
      deliverables: [{ name: 'Stage 1', amountCents: 1_000_000, dueOn: new Date(Date.now() + 14 * 86_400_000) }],
    }))
    if (!sale.ok) throw new Error(JSON.stringify(sale))
    s.line = (await prisma.sellContract.findFirstOrThrow({ where: { projectOrderId: sale.projectOrderId }, select: { id: true } })).id
    s.client = client.id; s.msp = msp.id
  }, 240_000)

  it('the selling firm opens its own member of outcome work', async () => {
    expect((await open(SELLER, s.line)).status).toBe(200)
  })

  it('a firm that is not on the line is refused as not found, with no hint of the member or a team, and the refusal is logged', async () => {
    const r = await open(MSP, s.line)
    expect(r.status).toBe(404)
    expect(JSON.stringify(r.body)).not.toMatch(new RegExp(`${MEMBER}|${s.member}|pod|team|training`, 'i'))
    expect(await prisma.accessLog.count({ where: { subjectId: s.member, actorCompanyId: s.msp, action: 'CONTRACT_VIEW', allowed: false } })).toBe(1)
  })

  it('the client is refused the same way and its refusal is logged', async () => {
    const r = await open(CLIENT, s.line)
    expect(r.status).toBe(404)
    expect(await prisma.accessLog.count({ where: { subjectId: s.member, actorCompanyId: s.client, action: 'CONTRACT_VIEW', allowed: false } })).toBe(1)
  })
})
