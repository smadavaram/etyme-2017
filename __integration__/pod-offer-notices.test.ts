import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, resetDatabase } from './harness'
import { raisePodSaleCard, tellCardAcceptor, type PodSaleCardInput } from '@/lib/twin/pod-sale-card'
import { POST as decideRoute } from '@/app/api/twin/approvals/[id]/route'

/**
 * The notices around a project offer (record 120, pods): the named acceptor
 * is told a card waits, the proposer is told her answer, and a notice that
 * cannot be written never undoes a decision. Own world.
 */

const flags = vi.hoisted(() => ({ failProposerNotice: false }))
vi.mock('@/lib/notify/pod-sale-notices', async (orig) => {
  const real = await orig<typeof import('@/lib/notify/pod-sale-notices')>()
  return {
    ...real,
    tellProposer: (...a: Parameters<typeof real.tellProposer>) =>
      flags.failProposerNotice ? Promise.reject(new Error('the mail service is down')) : real.tellProposer(...a),
  }
})

const ACCEPTOR = 'pon-acceptor@client.example'
const COLLEAGUE = 'pon-colleague@client.example'
const SELLER = 'pon-owner@seller.example'
const s: Record<string, any> = {}
const answer = (email: string, id: string, body: unknown) => {
  as(email)
  return decideRoute(req('POST', `/api/twin/approvals/${id}`, body), { params: Promise.resolve({ id }) } as any).then(json)
}
const input = (podId: string, projectName: string): PodSaleCardInput => ({
  podId, sellerCompanyId: s.seller, clientCompanyId: s.client, acceptorPersonId: s[ACCEPTOR], proposedByPersonId: s[SELLER],
  projectName, sellerName: 'Quillbrook Staffing', kind: 'FIXED_PRICE', priceCents: 3_000_000, currency: 'USD',
  deliverables: [{ name: 'The work', amountCents: 3_000_000, dueOn: new Date(Date.now() + 14 * 86_400_000) }],
})
const offer = async (podId: string, projectName: string) => {
  const r = await prisma.$transaction((tx) => raisePodSaleCard(tx, input(podId, projectName)))
  if (!r.ok) throw new Error(r.says)
  await tellCardAcceptor(r)
  return r
}
const told = (personId: string, entityId: string) => prisma.notification.findMany({ where: { personId, entityId } })

describe('the people on a project offer are told, and a notice never undoes an answer', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Harrowgate Foods', slug: 'pon-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'pon-seller', kind: 'VENDOR', currency: 'USD' } })
    Object.assign(s, { client: client.id, seller: seller.id })
    const cRole = await prisma.role.create({ data: { companyId: client.id, name: 'Program Manager', permissions: ['*'], isDefault: true } })
    const sRole = await prisma.role.create({ data: { companyId: seller.id, name: 'Owner', permissions: ['*'], isDefault: true } })
    for (const [email, name, companyId, roleId, type] of [
      [ACCEPTOR, 'Imogen Daleford', client.id, cRole.id, 'CLIENT_CONTACT'],
      [COLLEAGUE, 'Tobias Wrenfield', client.id, cRole.id, 'CLIENT_CONTACT'],
      [SELLER, 'Mira Osei', seller.id, sRole.id, 'EMPLOYEE'],
    ] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      s[email] = p.id
      await prisma.context.create({ data: { personId: p.id, type, companyId, roleId } })
    }
    s.pods = []
    for (const [i, name] of ['Ada Quillfeather', 'Bram Oakhollow', 'Cora Elmstead'].entries()) {
      const p = await prisma.person.create({ data: { name, primaryEmail: `m${i}.pon@seed.etyme.invalid` } })
      await prisma.context.create({ data: { personId: p.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
      const pod = await prisma.pod.create({
        data: { companyId: seller.id, name: `Team ${i}`, pricing: 'RATE_CARD', currency: 'USD', roles: { create: [{ title: 'Engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: p.id } } }] } },
        select: { id: true },
      })
      s.pods.push(pod.id)
    }
  }, 240_000)

  it('an offer writes one notice for the named acceptor and none for her colleagues', async () => {
    const card = await offer(s.pods[0], 'Data platform build')
    s.yes = card.approvalId
    const mine = await told(s[ACCEPTOR], card.approvalId)
    expect(mine).toHaveLength(1)
    expect(mine[0].title).toBe('Quillbrook Staffing offers you the project Data platform build')
    expect(await told(s[COLLEAGUE], card.approvalId)).toHaveLength(0)
    expect(await told(s[SELLER], card.approvalId)).toHaveLength(0)
  })

  it('a yes from the acceptor tells the proposer the project is set up', async () => {
    const r = await answer(ACCEPTOR, s.yes, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const note = await told(s[SELLER], s.yes)
    expect(note).toHaveLength(1)
    expect(note[0].title).toBe('Harrowgate Foods said yes to Data platform build')
    expect(await prisma.podProject.count({ where: { podId: s.pods[0] } })).toBe(1)
  })

  it('a not now from the acceptor tells the proposer, with her reason', async () => {
    const card = await offer(s.pods[1], 'Reporting build')
    const r = await answer(ACCEPTOR, card.approvalId, { decision: 'REJECTED', reason: 'Not this quarter', surface: 'WEB' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const note = await told(s[SELLER], card.approvalId)
    expect(note).toHaveLength(1)
    expect(note[0].title).toBe('Harrowgate Foods said not now to Reporting build')
    expect(note[0].body).toContain('Not this quarter')
  })

  it('a colleague who is refused an answer causes no notice to the proposer', async () => {
    const card = await offer(s.pods[2], 'Support build')
    s.fail = card.approvalId
    const r = await answer(COLLEAGUE, card.approvalId, { decision: 'APPROVED', surface: 'WEB' })
    expect(r.status).toBe(403)
    expect(await told(s[SELLER], card.approvalId)).toHaveLength(0)
  })

  it('a notice that fails leaves the project written and the answer recorded', async () => {
    flags.failProposerNotice = true
    try {
      const r = await answer(ACCEPTOR, s.fail, { decision: 'APPROVED', surface: 'WEB' })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    } finally { flags.failProposerNotice = false }
    expect(await prisma.podProject.count({ where: { podId: s.pods[2] } })).toBe(1)
    expect((await prisma.twinApproval.findUniqueOrThrow({ where: { id: s.fail } })).decision).toBe('APPROVED')
    expect(await told(s[SELLER], s.fail)).toHaveLength(0)
  })
})
