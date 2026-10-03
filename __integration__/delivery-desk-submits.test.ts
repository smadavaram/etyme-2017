import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as submit } from '@/app/api/submissions/route'

/**
 * A delivery manager puts the firm's own employee forward — decided by
 * the founder 2026-09-30 (CLAUDE.md, the integrator bench).
 *
 * Rahul Deshpande is Teleworld's delivery manager for San Jose. He holds
 * `assignments.write` and not `submissions.create`. Felix Brenner is a
 * Teleworld employee coming off his project. Northbend Athletic's HCM
 * integration lead is sent to Teleworld. Rahul may put Felix forward, as
 * INTERNAL; he may not put forward anybody Teleworld does not employ.
 */

const D = '@demo.etyme.local'
const RAHUL = `world-teleworld-delivery-sanjose${D}`
const s: Record<string, string> = {}

beforeAll(async () => {
  await freshWorld()
  s.teleworld = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-teleworld' } })).id
  const job = await prisma.requirement.findFirstOrThrow({
    where: { title: 'HCM integration lead', company: { slug: 'world-nike' } },
    select: { id: true, companyId: true },
  })
  s.job = job.id
  await prisma.requirementInvitation.upsert({
    where: { requirementId_toCompanyId: { requirementId: job.id, toCompanyId: s.teleworld } },
    create: { requirementId: job.id, fromCompanyId: job.companyId, toCompanyId: s.teleworld, status: 'SENT', expiresAt: new Date(Date.now() + 14 * 86_400_000) },
    update: {},
  })
  s.felix = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'felix.brenner@seed.etyme.invalid' } })).id
  s.tamsin = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'tamsin.okoro@seed.etyme.invalid' } })).id
}, 240_000)

describe('a delivery manager and the firm’s own people', () => {
  it('the premise: Rahul holds the delivery desk and not the recruiting desk', async () => {
    const seat = await prisma.context.findFirstOrThrow({
      where: { person: { primaryEmail: RAHUL }, companyId: s.teleworld, revokedAt: null },
      select: { role: { select: { permissions: true } } },
    })
    expect(seat.role?.permissions).toContain('assignments.write')
    expect(seat.role?.permissions).not.toContain('submissions.create')
  })

  it('a delivery manager puts the firm’s own employee forward on a client’s job request', async () => {
    as(RAHUL)
    const r = await json(await submit(req('POST', '/api/submissions', {
      requirementId: s.job, personIds: [s.felix], rate: 12_500, fromCompanyId: s.teleworld,
    })))
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
    expect(r.body.data.results[0].status, JSON.stringify(r.body)).toBe('created')
    const sub = await prisma.submission.findFirstOrThrow({ where: { requirementId: s.job, personId: s.felix } })
    expect(sub.kind).toBe('INTERNAL')
    expect(sub.fromCompanyId).toBe(s.teleworld)
  })

  it('a delivery manager cannot put forward somebody the firm does not employ, and is told who can', async () => {
    as(RAHUL)
    const r = await json(await submit(req('POST', '/api/submissions', {
      requirementId: s.job, personIds: [s.tamsin], rate: 12_500, fromCompanyId: s.teleworld,
    })))
    const item = r.body.data.results[0]
    expect(item.status).toBe('error')
    expect(item.code).toBe('NOT_YOUR_EMPLOYEE')
    expect(item.error).toBe(
      'Tamsin Okoro is not employed by Teleworld Solutions, so a delivery manager cannot put them forward. ' +
      'Somebody the firm does not employ needs their own consent and a bench listing — ask a recruiter, a resource manager or the account manager to submit them.'
    )
    expect(await prisma.submission.count({ where: { requirementId: s.job, personId: s.tamsin, fromCompanyId: s.teleworld } })).toBe(0)
    const trail = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: s.tamsin, action: 'SUBMIT', allowed: false }, orderBy: { at: 'desc' } })
    expect(trail.reason).toContain('Delivery desk refused')
  })
})
