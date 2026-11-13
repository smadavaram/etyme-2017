import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Asking a firm already on Etyme to link, from one place, and what its
 * yes writes. Walked through the routes on the seeded world: Northbend
 * Athletic's own supplier walk approved a firm that is on Etyme and did
 * not work with it, so the approval asked the firm to link and wrote
 * nothing on it; the firm's yes now lands it at the standing Northbend's
 * people gave it, with the agreement between the two. A firm that says
 * yes with no approval behind the ask arrives exactly as before. Every
 * seeded firm has somebody who may answer an ask. Nothing here sends an
 * email: the one sender is faked and counted.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return { ...real, emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }) }
})

const answer = await import('@/app/api/trade-links/[id]/route')
const { answerersAt } = await import('@/app/api/trade-links/ask')
const { approvedSuppliersOf } = await import('@/lib/sites')

const D = '@demo.etyme.local'
let northbend = ''
let isDemo = false
let camille = ''

beforeAll(async () => {
  await freshWorld()
  const n = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true, isDemo: true } })
  northbend = n.id
  isDemo = n.isDemo
  camille = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: `world-nike${D}` }, select: { id: true } })).id
}, 600_000)

/** A firm on Etyme with an Owner who may answer, working with nobody. */
async function firmOnEtyme(name: string, slug: string): Promise<{ id: string; owner: string }> {
  const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', currency: 'USD', claimedAt: new Date(), isDemo }, select: { id: true } })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const email = `${slug}-owner@one-ask.test`
  const p = await prisma.person.create({ data: { name: `${name} owner`, primaryEmail: email } })
  await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Owner' } })
  return { id: c.id, owner: email }
}

/** The approval route's own record of a firm it asked to link: approved, the firm named, nothing written on it. */
async function approvedRequest(firmId: string, name: string, agreement: { state: string; fileUrl: string | null }) {
  await prisma.supplierRequest.create({
    data: {
      companyId: northbend, name, reason: 'Needed for the Tualatin build', recommendedById: camille,
      state: 'APPROVED', stage: 'DONE', decidedAt: new Date(), supplierCompanyId: firmId,
      token: `one-ask-${firmId}`,
      checklist: [{ key: 'AGREEMENT', label: 'Signed agreement', required: true, by: 'VENDOR', ...agreement, note: null, at: null }],
    },
  })
}

async function askOf(firmId: string): Promise<string> {
  return (await prisma.tradeLinkRequest.create({
    data: { fromCompanyId: northbend, toCompanyId: firmId, relationship: 'SUPPLIER', askedById: camille },
    select: { id: true },
  })).id
}

const yes = async (id: string) => json(await answer.POST(req('POST', `/api/trade-links/${id}`, { action: 'accept' }) as any, { params: Promise.resolve({ id }) }))

describe('a firm says yes to an ask that came from the client’s own supplier approval', () => {
  it('a firm that says yes to a client whose four steps already approved it arrives at approved standing, with the signed agreement between them', async () => {
    const firm = await firmOnEtyme('Quillon Staffing', 'quillon-one-ask')
    await approvedRequest(firm.id, 'Quillon Staffing', { state: 'HELD', fileUrl: 'agreements/quillon.pdf' })
    const id = await askOf(firm.id)
    expect((await approvedSuppliersOf(northbend)).map((f) => f.id)).not.toContain(firm.id)

    as(firm.owner)
    const r = await yes(id)
    expect(r.status).toBe(200)
    expect(r.body.data.linked).toBe(true)
    const row = await prisma.counterparty.findUniqueOrThrow({
      where: { companyId_otherCompanyId_relationship: { companyId: northbend, otherCompanyId: firm.id, relationship: 'SUPPLIER' } },
      select: { tier: true },
    })
    expect(row.tier).toBe('APPROVED')
    const msa = await prisma.masterAgreement.findMany({ where: { vendorId: firm.id, clientId: northbend }, select: { signedAt: true } })
    expect(msa).toHaveLength(1)
    expect(msa[0].signedAt).not.toBeNull()
    expect((await approvedSuppliersOf(northbend)).map((f) => f.id)).toContain(firm.id)
  })

  it('where the agreement was not signed on file when the firm was approved, the agreement between them is recorded unsigned', async () => {
    const firm = await firmOnEtyme('Ravelin Talent', 'ravelin-one-ask')
    await approvedRequest(firm.id, 'Ravelin Talent', { state: 'HELD', fileUrl: null })
    const id = await askOf(firm.id)
    as(firm.owner)
    expect((await yes(id)).status).toBe(200)
    const msa = await prisma.masterAgreement.findMany({ where: { vendorId: firm.id, clientId: northbend }, select: { signedAt: true } })
    expect(msa).toHaveLength(1)
    expect(msa[0].signedAt).toBeNull()
  })

  it('a firm that says yes to an ask with no approval behind it is linked exactly as before: no standing given and no agreement written', async () => {
    const firm = await firmOnEtyme('Sorrel Systems', 'sorrel-one-ask')
    const id = await askOf(firm.id)
    as(firm.owner)
    expect((await yes(id)).status).toBe(200)
    const row = await prisma.counterparty.findUniqueOrThrow({
      where: { companyId_otherCompanyId_relationship: { companyId: northbend, otherCompanyId: firm.id, relationship: 'SUPPLIER' } },
      select: { tier: true },
    })
    expect(row.tier).toBeNull()
    expect(await prisma.masterAgreement.count({ where: { vendorId: firm.id, clientId: northbend } })).toBe(0)
  })

  it('answering an ask sends no email to anybody', () => {
    expect(sent).toEqual([])
  })
})

describe('somebody can always answer', () => {
  it('every seeded firm somebody has taken possession of has a person who may answer an ask to link', async () => {
    const firms = await prisma.company.findMany({
      where: { claimedAt: { not: null }, slug: { startsWith: 'world-' } },
      select: { id: true, slug: true },
    })
    expect(firms.length).toBeGreaterThan(10)
    const nobody: string[] = []
    for (const f of firms) if ((await answerersAt(f.id)).length === 0) nobody.push(f.slug)
    expect(nobody).toEqual([])
  })
})
