import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as decisions } from '@/app/api/decisions/route'

/**
 * Record 130: one person, one job, one card. A client's job request sent to
 * a supplier is the Account Manager's to answer, not the Recruiter's queue.
 */
const D = '@demo.etyme.local'

async function seatOf(role: string) {
  const c = await prisma.context.findFirstOrThrow({
    where: { company: { slug: { startsWith: 'world-brightmoor' } }, revokedAt: null, person: { primaryEmail: { endsWith: D } }, role: { name: role } },
    select: { companyId: true, person: { select: { primaryEmail: true } } },
  })
  if (!c.companyId) throw new Error(`the seeded ${role} holds no company seat`)
  return { email: c.person.primaryEmail, companyId: c.companyId }
}
const cardsOf = async (email: string) => {
  as(email)
  const res = await json(await decisions(req('GET', '/api/decisions')))
  return (res.body?.data?.decisions ?? []) as any[]
}

describe('A job request a client sent a supplier is a card', () => {
  let invitationId = ''
  let requirementId = ''
  beforeAll(async () => {
    await freshWorld()
    const am = await seatOf('Account Manager')
    const r = await prisma.requirement.findFirstOrThrow({ where: { companyId: { not: am.companyId } }, select: { id: true, companyId: true } })
    requirementId = r.id
    await prisma.requirementInvitation.deleteMany({ where: { requirementId: r.id, toCompanyId: am.companyId } })
    const inv = await prisma.requirementInvitation.create({
      data: { requirementId: r.id, fromCompanyId: r.companyId, toCompanyId: am.companyId, payMin: 5000, payMax: 9000, status: 'SENT', expiresAt: new Date(Date.now() + 5 * 864e5) },
    })
    invitationId = inv.id
  }, 600_000)

  it('a client’s job request sent to a supplier is the Account Manager’s card', async () => {
    const am = await seatOf('Account Manager')
    const card = (await cardsOf(am.email)).find((d) => d.entityId === invitationId)
    expect(card?.type).toBe('JOB_REQUEST_ANSWER')
    expect(card.actionUrl).toBe(`/dashboard/requirements/${requirementId}`)
  })

  it('the Recruiter, who cannot look outside the firm, is not shown the job request', async () => {
    const rec = await seatOf('Recruiter')
    expect((await cardsOf(rec.email)).some((d) => d.entityId === invitationId)).toBe(false)
  })

  it('a job request already answered or past its date is no card', async () => {
    const am = await seatOf('Account Manager')
    await prisma.requirementInvitation.update({ where: { id: invitationId }, data: { status: 'DECLINED' } })
    expect((await cardsOf(am.email)).some((d) => d.entityId === invitationId)).toBe(false)
  })

  it('the card carries no pay band', async () => {
    const am = await seatOf('Account Manager')
    await prisma.requirementInvitation.update({ where: { id: invitationId }, data: { status: 'SENT' } })
    const card = (await cardsOf(am.email)).find((d) => d.entityId === invitationId)
    expect(JSON.stringify(card)).not.toMatch(/5000|9000|\$50|\$90/)
  })
})
