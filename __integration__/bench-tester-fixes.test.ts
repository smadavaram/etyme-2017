import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { GET as bench } from '@/app/api/bench/route'
import { POST as nudge } from '@/app/api/bench/listings/[id]/nudge/route'
import { poolFor } from '@/lib/match-pool'

/**
 * The bench tester's findings of 2026-09-30, walked on the seeded world.
 */

const TECHPEPLE = 'world-techpeple@demo.etyme.local'
const params = (id: string) => ({ params: Promise.resolve({ id }) })
let cloud: { id: string }

async function listFor(name: string, state: 'INVITED' | 'GRANTED', lapsed: boolean) {
  const person = await prisma.person.create({ data: { name, primaryEmail: `${name.toLowerCase().replace(/\s+/g, '.')}@tester.invalid` } })
  const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: ['ERP finance'] } })
  return prisma.benchListing.create({
    data: {
      consultantId: profile.id, companyId: cloud.id, tier: 'MARKETING', state, invitedAt: new Date(),
      ...(state === 'GRANTED' ? { grantedAt: new Date(Date.now() - 20 * 86_400_000) } : {}),
      ...(lapsed ? { stayDays: 15, staysUntil: new Date(Date.now() - 2 * 86_400_000), lapsedAt: new Date(Date.now() - 86_400_000), revokedAt: new Date(Date.now() - 86_400_000) } : {}),
    },
  })
}

beforeAll(async () => {
  await freshWorld()
  cloud = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' }, select: { id: true } })
}, 600_000)

describe('a bench invitation nobody has answered', () => {
  it('is counted apart from the people the firm markets, as waiting', async () => {
    await listFor('Lucia Ferreira', 'INVITED', false)
    as(TECHPEPLE)
    const r = await json(await bench(req('GET', '/api/bench?scope=company')))
    expect(r.body.data.totals.waiting).toBeGreaterThanOrEqual(1)
  })

  it('can be sent again, or its link copied, and somebody who said yes is sent nothing', async () => {
    const asked = await prisma.benchListing.findFirstOrThrow({ where: { companyId: cloud.id, state: 'INVITED', consultant: { person: { name: 'Lucia Ferreira' } } } })
    as(TECHPEPLE)
    const again = await json(await nudge(req('POST', `/api/bench/listings/${asked.id}/nudge`, {}), params(asked.id)))
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(await prisma.automationLog.count({ where: { action: 'BENCH_INVITATION_RESENT', companyId: cloud.id } })).toBe(1)
    const copy = await json(await nudge(req('POST', `/api/bench/listings/${asked.id}/nudge`, { copyOnly: true }), params(asked.id)))
    expect(copy.body.data.url).toContain('/bench-invite/')
    expect(copy.body.data.sent).toBe(false)

    const agreed = await prisma.benchListing.findFirstOrThrow({ where: { companyId: cloud.id, state: 'GRANTED', revokedAt: null } })
    const no = await json(await nudge(req('POST', `/api/bench/listings/${agreed.id}/nudge`, {}), params(agreed.id)))
    expect(no.status).toBe(409)
    expect(no.body.error.message).toContain('There is nothing to send.')
  })
})

describe('somebody whose chosen stay ended', () => {
  it('is on the firm’s bench with the day it ended, and the firm may ask them to renew', async () => {
    const ended = await listFor('Jonas Ended', 'GRANTED', true)
    as(TECHPEPLE)
    const r = await json(await bench(req('GET', '/api/bench?scope=company')))
    const row = r.body.data.ended.find((e: any) => e.name === 'Jonas Ended')
    expect(row.says).toMatch(/^Stay ended on .+ · ask to renew$/)
    const asked = await json(await nudge(req('POST', `/api/bench/listings/${ended.id}/nudge`, {}), params(ended.id)))
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    expect(await prisma.automationLog.count({ where: { action: 'BENCH_STAY_RENEW_ASKED', companyId: cloud.id } })).toBe(1)
  })
})

describe('matching', () => {
  it('never offers somebody placed and billing past the day the job starts', async () => {
    const helena = await prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' } })
    const live = await prisma.sellContract.findFirst({ where: { personId: helena.id, state: 'IN_PROGRESS' } })
    expect(live).not.toBeNull()
    const job = await prisma.requirement.create({
      data: {
        companyId: cloud.id, title: 'ERP finance lead — test', skills: ['ERP finance'], status: 'OPEN',
        approvalState: 'AUTO_APPROVED', source: 'MANUAL', months: 6, headcount: 1, startDate: new Date(Date.now() + 7 * 86_400_000),
      },
    })
    const pool = await poolFor({ id: job.id, companyId: cloud.id, payerCompanyId: null, endClientCompanyId: null, startDate: job.startDate }, cloud.id, { suggest: false })
    expect(pool.entries.map((e) => e.personId)).not.toContain(helena.id)
    expect(pool.says).toMatch(/placed past the day this job starts/)
  })
})
