import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Before her yes, a firm reads only what it typed (batch five, 2026-11-16),
 * for an answer she gives from her own page.
 *
 * A no from the invitation link already reached the firm under the name it
 * typed. The same no from her own page (`POST /api/me/benches/:id/respond`)
 * still named her by the name on her own record, in the firm's activity
 * log and in the notice the firm gets. A no is not a yes. This walks it on
 * the seeded world: another firm keeps her record under her own name, then
 * Brightmoor asks her at that address under a name of its own. Made-up
 * people on a reserved domain.
 */

const { POST: addConsultant } = await import('@/app/api/consultants/route')
const { POST: respond } = await import('@/app/api/me/benches/[id]/respond/route')

const BRIGHTMOOR = 'world-brightmoor@demo.etyme.local'
const PINNACLE = 'world-pinnacle@demo.etyme.local'

const OWN_NAME = 'Daniel Osei'
const TYPED = 'Theo Marchetti'
const HER_EMAIL = 'daniel.osei@harborline-tech.example'

let listingId = ''
let firm = { id: '', name: '' }

const answer = async (said: 'ACCEPT' | 'DECLINE') => {
  as(HER_EMAIL)
  return json(await respond(req('POST', `/api/me/benches/${listingId}/respond`, { said }), { params: Promise.resolve({ id: listingId }) }))
}

async function noticesSince(since: Date) {
  let notices: { title: string; body: string | null }[] = []
  for (let i = 0; i < 50 && notices.length === 0; i++) {
    notices = await prisma.notification.findMany({
      where: { companyId: firm.id, type: 'BENCH', entityId: listingId, createdAt: { gte: since } },
      select: { title: true, body: true },
    })
    if (notices.length === 0) await new Promise((res) => setTimeout(res, 50))
  }
  return notices
}

async function logSince(action: string, since: Date) {
  return prisma.automationLog.findFirstOrThrow({
    where: { action, companyId: firm.id, at: { gte: since }, payload: { path: ['listingId'], equals: listingId } },
    select: { summary: true },
  })
}

beforeAll(async () => {
  await freshWorld()

  // Another firm keeps her record, under her own name.
  as(PINNACLE)
  const kept = await json(await addConsultant(req('POST', '/api/consultants', { name: OWN_NAME, email: HER_EMAIL, skills: ['Python'] })))
  expect([200, 201], JSON.stringify(kept.body)).toContain(kept.status)

  // Brightmoor asks her at that address, under a name it typed.
  as(BRIGHTMOOR)
  const asked = await json(await addConsultant(req('POST', '/api/consultants', { name: TYPED, email: HER_EMAIL, skills: ['Java'] })))
  expect([200, 201], JSON.stringify(asked.body)).toContain(asked.status)
  const listing = await prisma.benchListing.findFirstOrThrow({
    where: { consultant: { person: { primaryEmail: HER_EMAIL } }, company: { slug: 'world-brightmoor' }, revokedAt: null },
    select: { id: true, state: true, firmName: true },
  })
  expect(listing.state).toBe('INVITED')
  expect(listing.firmName).toBe(TYPED)
  listingId = listing.id
  firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, name: true } })
}, 300_000)

describe('her answer from her own page, as the firm that asked reads it', () => {
  it('when she says no from her own page, the firm\'s notice and its log name her as the firm typed her, never by the name on her own record', async () => {
    const since = new Date()
    const r = await answer('DECLINE')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.state).toBe('DECLINED')
    try {
      const log = await logSince('BENCH_CONSENT_DECLINED', since)
      expect(log.summary).toBe(`${TYPED} declined being marketed by ${firm.name}`)
      expect(log.summary).not.toMatch(/Daniel|Osei/)

      const notices = await noticesSince(since)
      expect(notices.length).toBeGreaterThan(0)
      for (const n of notices) {
        expect(n.title).toBe(`${TYPED} said no to your bench invitation`)
        expect(`${n.title} ${n.body ?? ''}`).not.toMatch(/Daniel|Osei/)
      }
    } finally {
      await prisma.benchListing.update({ where: { id: listingId }, data: { state: 'INVITED', revokedAt: null } })
    }
  })

  it('a yes from her own page names her own name', async () => {
    const since = new Date()
    const r = await answer('ACCEPT')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.state).toBe('GRANTED')

    const log = await logSince('BENCH_CONSENT_GIVEN', since)
    expect(log.summary.startsWith(`${OWN_NAME} agreed to being marketed by ${firm.name}`)).toBe(true)

    const notices = await noticesSince(since)
    expect(notices.length).toBeGreaterThan(0)
    for (const n of notices) {
      expect(n.title).toContain(OWN_NAME)
      expect(n.title).not.toContain(TYPED)
    }
  })
})
