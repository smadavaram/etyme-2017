import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { GET as courses, POST as addCourse } from '@/app/api/training/route'
import { POST as enroll } from '@/app/api/training/enrollments/route'
import { POST as move } from '@/app/api/training/enrollments/[id]/route'

/**
 * Pinnacle adds a course for a skill it is short of, puts Tariq on it,
 * he starts, finishes with a score, and the course is on his record.
 */

const D = '@demo.etyme.local'
const PINNACLE = `world-pinnacle${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const WORKER = 'tariq.al.amin@seed.etyme.invalid'
const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const it_: Record<string, any> = {}

describe('training on the bench, enrolled to finished', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    const pinnacle = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true } })
    const tariq = await prisma.person.create({ data: { name: 'Tariq Al-Amin', primaryEmail: WORKER } })
    it_.worker = tariq.id
    const profile = await prisma.consultantProfile.create({ data: { personId: tariq.id, skills: ['Power BI'], location: 'Portland, OR', visibility: 'VERIFIED', workAuth: 'USC' } })
    await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: pinnacle.id, tier: 'RETAINED', state: 'GRANTED', invitedAt: day(-30), respondedAt: day(-29), grantedAt: day(-29) } })
    await prisma.context.create({ data: { personId: tariq.id, companyId: pinnacle.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the bench' } })
  }, 240_000)

  it('Pinnacle adds a course', async () => {
    as(PINNACLE)
    const r = await json(await addCourse(req('POST', '/api/training', { title: 'Kinaxis RapidResponse fundamentals', category: 'TECH', duration: 16 })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.course = r.body.data.id
  })

  it('puts Tariq on it — ENROLLED, and he is told by email', async () => {
    as(PINNACLE)
    const r = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: it_.course, personId: it_.worker })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    it_.enrollment = r.body.data.id
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: it_.enrollment } })).status).toBe('ENROLLED')
    for (let i = 0; i < 20; i++) {
      if (await prisma.notification.count({ where: { personId: it_.worker, entityId: it_.enrollment } })) break
      await new Promise((r) => setTimeout(r, 50))
    }
    const told = await prisma.notification.findFirst({ where: { personId: it_.worker, entityId: it_.enrollment } })
    expect(told?.channel).toBe('EMAIL')
    expect(told?.title).toBe('Pinnacle Resourcing enrolled you on Kinaxis RapidResponse fundamentals')
  })

  it('enrolling him again hands back the same enrollment', async () => {
    as(PINNACLE)
    const r = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: it_.course, personId: it_.worker })))
    expect(r.body.data).toMatchObject({ id: it_.enrollment, existing: true })
  })

  it('he starts, then finishes with a score — IN_PROGRESS, then COMPLETED with the date', async () => {
    as(PINNACLE)
    const s = await call(move, 'POST', `/api/training/enrollments/${it_.enrollment}`, it_.enrollment, { move: 'start' })
    expect(s.body?.error, JSON.stringify(s.body)).toBeUndefined()
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: it_.enrollment } })).status).toBe('IN_PROGRESS')
    const c = await call(move, 'POST', `/api/training/enrollments/${it_.enrollment}`, it_.enrollment, { move: 'complete', score: 88 })
    expect(c.body.data.says).toBe('Tariq Al-Amin finished Kinaxis RapidResponse fundamentals with 88. It is on their page now.')
    const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: it_.enrollment } })
    expect([row.status, row.score]).toEqual(['COMPLETED', 88])
    expect(row.completedAt).not.toBeNull()
  })

  it('a finished course cannot be dropped', async () => {
    as(PINNACLE)
    const r = await call(move, 'POST', `/api/training/enrollments/${it_.enrollment}`, it_.enrollment, { move: 'drop', reason: 'x' })
    expect(r.status).toBe(409)
  })

  it('the list shows the course with one finished; Brightmoor sees no course of Pinnacle’s', async () => {
    as(PINNACLE)
    const mine = await json(await courses(req('GET', '/api/training')))
    expect(mine.body.data.courses.find((c: any) => c.id === it_.course).counts.completed).toBe(1)
    as(BRIGHTMOOR)
    const theirs = await json(await courses(req('GET', '/api/training')))
    expect(theirs.body.data.courses.some((c: any) => c.id === it_.course)).toBe(false)
  })
})
