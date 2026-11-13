import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Asking a firm already on Etyme to link, from one place, and what its
 * yes writes. Walked through the routes on the seeded world: Northbend
 * Athletic's own supplier walk approved a firm that is on Etyme and did
 * not work with it, so the approval asked the firm to link and wrote
 * nothing on it; the firm's yes now lands it at the standing Northbend's
 * people gave it, on Northbend's own list, and writes no agreement: a yes
 * to link is not a signature (review, 2026-11-13). A firm that says
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
async function approvedRequest(firmId: string, name: string, agreement: { state: string; fileUrl: string | null }, decidedAt = new Date()) {
  await prisma.supplierRequest.create({
    data: {
      companyId: northbend, name, reason: 'Needed for the Tualatin build', recommendedById: camille,
      state: 'APPROVED', stage: 'DONE', decidedAt, supplierCompanyId: firmId,
      token: `one-ask-${firmId}`,
      checklist: [{ key: 'AGREEMENT', label: 'Signed agreement', required: true, by: 'VENDOR', ...agreement, note: null, at: null }],
    },
  })
}

async function askOf(firmId: string, createdAt = new Date()): Promise<string> {
  return (await prisma.tradeLinkRequest.create({
    data: { fromCompanyId: northbend, toCompanyId: firmId, relationship: 'SUPPLIER', askedById: camille, createdAt },
    select: { id: true },
  })).id
}

const tierOf = async (firmId: string) => (await prisma.counterparty.findUniqueOrThrow({
  where: { companyId_otherCompanyId_relationship: { companyId: northbend, otherCompanyId: firmId, relationship: 'SUPPLIER' } },
  select: { tier: true },
})).tier

const yes = async (id: string) => json(await answer.POST(req('POST', `/api/trade-links/${id}`, { action: 'accept' }) as any, { params: Promise.resolve({ id }) }))

describe('a firm says yes to an ask that came from the client’s own supplier approval', () => {
  it('a firm that says yes after the client’s own four steps approved it is on the client’s list at approved standing, and no agreement is written for it', async () => {
    const firm = await firmOnEtyme('Quillon Staffing', 'quillon-one-ask')
    await approvedRequest(firm.id, 'Quillon Staffing', { state: 'HELD', fileUrl: null })
    const id = await askOf(firm.id)
    expect((await approvedSuppliersOf(northbend)).map((f) => f.id)).not.toContain(firm.id)

    as(firm.owner)
    const r = await yes(id)
    expect(r.status).toBe(200)
    expect(r.body.data.linked).toBe(true)
    expect(await tierOf(firm.id)).toBe('APPROVED')
    expect(await prisma.masterAgreement.count({ where: { vendorId: firm.id, clientId: northbend } })).toBe(0)
    expect((await approvedSuppliersOf(northbend)).map((f) => f.id)).toContain(firm.id)
  })

  it('a yes to link never records a signed agreement, even where the client’s own file holds a signed copy the firm did not send', async () => {
    const firm = await firmOnEtyme('Ravelin Talent', 'ravelin-one-ask')
    await approvedRequest(firm.id, 'Ravelin Talent', { state: 'HELD', fileUrl: 'agreements/ravelin.pdf' })
    const id = await askOf(firm.id)
    as(firm.owner)
    expect((await yes(id)).status).toBe(200)
    expect(await prisma.masterAgreement.count({ where: { vendorId: firm.id, clientId: northbend } })).toBe(0)
  })

  it('an approval made after the ask was sent gives the yes no standing, because the ask was not the one the approval raised', async () => {
    const firm = await firmOnEtyme('Tamsin Labor', 'tamsin-one-ask')
    const id = await askOf(firm.id, new Date(Date.now() - 86_400_000))
    await approvedRequest(firm.id, 'Tamsin Labor', { state: 'HELD', fileUrl: null })
    as(firm.owner)
    expect((await yes(id)).status).toBe(200)
    expect(await tierOf(firm.id)).toBeNull()
  })

  it('an old approval gives no standing to a later ask once an earlier ask after it was already answered', async () => {
    const firm = await firmOnEtyme('Umbra Staffing', 'umbra-one-ask')
    await approvedRequest(firm.id, 'Umbra Staffing', { state: 'HELD', fileUrl: null }, new Date(Date.now() - 3 * 86_400_000))
    await prisma.tradeLinkRequest.create({
      data: {
        fromCompanyId: northbend, toCompanyId: firm.id, relationship: 'SUPPLIER', askedById: camille,
        createdAt: new Date(Date.now() - 2 * 86_400_000), answer: 'NOT_NOW', answeredAt: new Date(Date.now() - 2 * 86_400_000),
      },
    })
    const id = await askOf(firm.id)
    as(firm.owner)
    expect((await yes(id)).status).toBe(200)
    expect(await tierOf(firm.id)).toBeNull()
  })

  it('a firm that says yes to an ask with no approval behind it is linked exactly as before: no standing given and no agreement written', async () => {
    const firm = await firmOnEtyme('Sorrel Systems', 'sorrel-one-ask')
    const id = await askOf(firm.id)
    as(firm.owner)
    expect((await yes(id)).status).toBe(200)
    expect(await tierOf(firm.id)).toBeNull()
    expect(await prisma.masterAgreement.count({ where: { vendorId: firm.id, clientId: northbend } })).toBe(0)
  })

  it('a person at the firm who does not keep its list of companies cannot answer, and the refusal is on the access log', async () => {
    const firm = await firmOnEtyme('Vellum Partners', 'vellum-one-ask')
    const role = await prisma.role.create({ data: { companyId: firm.id, name: 'Recruiter', permissions: ['submissions.create'], isDefault: false } })
    const p = await prisma.person.create({ data: { name: 'Vellum recruiter', primaryEmail: 'vellum-recruiter@one-ask.test' } })
    await prisma.context.create({ data: { personId: p.id, companyId: firm.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'Recruiter' } })
    const id = await askOf(firm.id)
    as('vellum-recruiter@one-ask.test')
    const r = await yes(id)
    expect(r.status).toBe(403)
    expect(await prisma.accessLog.count({ where: { actorPersonId: p.id, allowed: false } })).toBeGreaterThan(0)
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
