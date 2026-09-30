import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as suppliers } from '@/app/api/suppliers/route'
import { GET as queue } from '@/app/api/checks/queue/route'
import { POST as review } from '@/app/api/checks/[id]/review/route'

/**
 * Suppliers and the Check queue, on the seeded world, as the desks that
 * use them and as one that does not.
 *
 * Karthik Menon is a Teleworld delivery engineer: he reads the work he is
 * on and files his own week, and nothing else. Both pages were open to
 * him because both routes asked for nothing past being staff.
 */

const D = '@demo.etyme.local'
const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const PROCUREMENT = `world-nike-procurement${D}`
const HIRING = `world-nike-hiring${D}`
const AP = `world-nike-ap${D}`

const it_: Record<string, any> = {}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()

  // A machine's judgment of one submitted person, waiting for a person —
  // written here rather than hoped for from the seed, so the sentence
  // below does not depend on which day the world was born.
  const sub = await prisma.submission.findFirstOrThrow({ select: { id: true, personId: true, toCompanyId: true } })
  it_.check = await prisma.check.create({
    data: {
      companyId: sub.toCompanyId, recordType: 'SUBMISSION', recordId: sub.id,
      checker: 'MODEL', code: 'SKILLS_EVIDENCED', verdict: 'FAIL',
      reason: 'The CV does not evidence the skills the job asks for.', evidence: 'test',
    },
    select: { id: true },
  })
  it_.subject = sub.personId
  const owner = await prisma.context.findFirstOrThrow({
    where: { companyId: sub.toCompanyId, revokedAt: null, role: { permissions: { has: '*' } } },
    select: { person: { select: { primaryEmail: true } } },
  })
  it_.reader = owner.person.primaryEmail
}, 300_000)

describe('who opens the supplier list', () => {
  it('a delivery engineer is refused the supplier list in a sentence that says who to ask', async () => {
    as(KARTHIK)
    const { status, body } = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(status).toBe(403)
    expect(body.data).toBeUndefined()
    expect(body.error.message).toContain('Ask whoever manages roles at your company')
    expect(body.error.message).not.toMatch(/vendors\.read|requirements\.read|payments\.record/)
  })

  it('the procurement desk still opens its suppliers', async () => {
    as(PROCUREMENT)
    const { status, body } = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.suppliers.length).toBeGreaterThan(0)
  })

  it('a hiring manager still opens the supplier list to recommend a new supplier', async () => {
    as(HIRING)
    const { status } = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(status).toBe(200)
  })

  it('the AP clerk, who checks a new supplier’s bank details, still opens the supplier list', async () => {
    as(AP)
    const { status } = await json(await suppliers(req('GET', '/api/suppliers')))
    expect(status).toBe(200)
  })
})

describe('who opens the check queue', () => {
  it('a delivery engineer is refused the check queue in a sentence that says who to ask', async () => {
    as(KARTHIK)
    const { status, body } = await json(await queue(req('GET', '/api/checks/queue')))
    expect(status).toBe(403)
    expect(body.data).toBeUndefined()
    expect(body.error.message).toContain('Ask whoever manages roles at your company')
  })

  it('a delivery engineer cannot review a machine check either', async () => {
    as(KARTHIK)
    const res = await review(
      req('POST', `/api/checks/${it_.check.id}/review`, { agreed: true }),
      { params: Promise.resolve({ id: it_.check.id }) }
    )
    expect(res.status).toBe(403)
  })

  it('a desk that reads submissions opens the check queue, and the read of each person behind the sample leaves a trail', async () => {
    as(it_.reader)
    const before = await prisma.accessLog.count({ where: { subjectId: it_.subject, action: 'MATCH_VIEW', allowed: true } })
    const { status, body } = await json(await queue(req('GET', '/api/checks/queue')))
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data.sample.map((c: any) => c.id)).toContain(it_.check.id)

    // The trail is written without holding the response; give it a beat.
    let after = before
    for (let i = 0; i < 20 && after === before; i++) {
      await new Promise((r) => setTimeout(r, 50))
      after = await prisma.accessLog.count({ where: { subjectId: it_.subject, action: 'MATCH_VIEW', allowed: true } })
    }
    expect(after).toBeGreaterThan(before)
  })
})
