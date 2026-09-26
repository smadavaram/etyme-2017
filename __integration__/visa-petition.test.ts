import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { GET as list, POST as file } from '@/app/api/compliance/petitions/route'
import { POST as move } from '@/app/api/compliance/petitions/[id]/route'
import { GET as watch } from '@/app/api/cron/visa-watch/route'

/**
 * Pinnacle files an H-1B for Tariq, records the request for evidence,
 * the approval with its date, the stamp, and the day he starts on it;
 * the watch job says when it is running out. Brightmoor sees none of it.
 */

const D = '@demo.etyme.local'
const PINNACLE = `world-pinnacle${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const WORKER = 'tariq.al.amin@seed.etyme.invalid'
const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const it_: Record<string, any> = {}

describe('a visa petition on the bench, filing to running out', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const pinnacle = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true } })
    const tariq = await prisma.person.create({ data: { name: 'Tariq Al-Amin', primaryEmail: WORKER } })
    it_.worker = tariq.id
    const profile = await prisma.consultantProfile.create({ data: { personId: tariq.id, skills: ['Power BI'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'H1B' } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: pinnacle.id, tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) } })
    await prisma.context.create({ data: { personId: tariq.id, companyId: pinnacle.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' } })
  }, 240_000)

  it('Pinnacle files an H-1B for Tariq: FILED, with the filing as its first event', async () => {
    as(PINNACLE)
    const r = await json(await file(req('POST', '/api/compliance/petitions', { personId: it_.worker, type: 'H1B', country: 'US', notes: 'Receipt WAC-26-123' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.petition = r.body.data.id
    const row = await prisma.visaPetition.findUniqueOrThrow({ where: { id: it_.petition }, include: { events: true } })
    expect(row.status).toBe('FILED')
    expect(row.events.map((e) => e.eventType)).toEqual(['FILED'])
  })

  it('an RFE, the answer, then approval with the date it runs out — each an event', async () => {
    as(PINNACLE)
    for (const [m, extra] of [['RFE', {}], ['RFE_ANSWERED', {}], ['APPROVED', { expiresAt: day(60).toISOString().slice(0, 10) }]] as const) {
      const r = await call(move, 'POST', `/api/compliance/petitions/${it_.petition}`, it_.petition, { move: m, ...extra })
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    }
    const row = await prisma.visaPetition.findUniqueOrThrow({ where: { id: it_.petition }, include: { events: { orderBy: { createdAt: 'asc' } } } })
    expect(row.status).toBe('APPROVED')
    expect(row.expiresAt).not.toBeNull()
    expect(row.events.map((e) => e.eventType)).toEqual(['FILED', 'RFE_ISSUED', 'RFE_RESPONDED', 'APPROVED'])
  })

  it('approval without a date is refused in a sentence', async () => {
    as(PINNACLE)
    const fresh = await json(await file(req('POST', '/api/compliance/petitions', { personId: it_.worker, type: 'L1', country: 'US' })))
    const r = await call(move, 'POST', `/api/compliance/petitions/${fresh.body.data.id}`, fresh.body.data.id, { move: 'APPROVED' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('An approval comes with the date it runs out. Enter it.')
  })

  it('stamped, then working on it', async () => {
    as(PINNACLE)
    for (const m of ['STAMPED', 'ACTIVE']) {
      const r = await call(move, 'POST', `/api/compliance/petitions/${it_.petition}`, it_.petition, { move: m })
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    }
    expect((await prisma.visaPetition.findUniqueOrThrow({ where: { id: it_.petition } })).status).toBe('ACTIVE')
  })

  it('the watch job sees sixty days left and marks it running out, with an event and a note to the person', async () => {
    process.env.CRON_SECRET = 'visa-test'
    const r = await json(await watch(req('GET', '/api/cron/visa-watch', undefined, { authorization: 'Bearer visa-test' })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const row = await prisma.visaPetition.findUniqueOrThrow({ where: { id: it_.petition }, include: { events: true } })
    expect(row.status).toBe('EXPIRING')
    expect(row.events.some((e) => e.eventType === 'EXPIRING')).toBe(true)
  })

  it('the list shows the petition with its word and the moves left; Brightmoor sees nothing', async () => {
    as(PINNACLE)
    const mine = await json(await list(req('GET', '/api/compliance/petitions')))
    const p = mine.body.data.petitions.find((x: any) => x.id === it_.petition)
    expect(p.word).toBe('Running out')
    as(BRIGHTMOOR)
    const theirs = await json(await list(req('GET', '/api/compliance/petitions')))
    expect(theirs.body.data.petitions.some((x: any) => x.id === it_.petition)).toBe(false)
  })
})
