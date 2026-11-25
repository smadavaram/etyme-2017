import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as addCourse } from '@/app/api/training/route'
import { POST as cohortsPost } from '@/app/api/training/cohorts/route'
import { POST as enroll } from '@/app/api/training/enrollments/route'
import { POST as move } from '@/app/api/training/enrollments/[id]/route'
import { POST as benchAsk } from '@/app/api/training/enrollments/[id]/bench-ask/route'
import { POST as answerByLink } from '@/app/api/bench-invite/[token]/route'
import { signInvite } from '@/lib/bench-invite'

/**
 * Two things the happy path does not cover: her answer by the email link
 * is written once on the ask, and two enrollments at the same moment
 * cannot overfill the last seat of a cohort.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const idRoute = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const linkRoute = async (token: string, body: unknown) =>
  json(await answerByLink(req('POST', `/api/bench-invite/${token}`, body), { params: Promise.resolve({ token }) }))
const s: Record<string, any> = {}

async function person(name: string, email: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.consultantProfile.create({ data: { personId: p.id, skills: ['Python'], location: 'Boise, ID', visibility: 'VERIFIED', workAuth: 'USC' } })
  await prisma.context.create({ data: { personId: p.id, companyId: s.firm, type: 'CONSULTANT', side: 'SELL', grantReason: 'Joined a course' } })
  return p.id
}

describe('train to bench: the email link, and the last seat', () => {
  beforeAll(async () => {
    await freshWorld()
    s.firm = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    as(OWNER)
    const c = await json(await addCourse(req('POST', '/api/training', { title: 'SQL for analysts', category: 'TECH', duration: 20 })))
    expect(c.status, JSON.stringify(c.body)).toBe(201)
    s.course = c.body.data.id
  }, 240_000)

  it('her yes by the email link is written once on the ask, with the door it came through', async () => {
    s.ida = await person('Ida Thornwick', 'ida.thornwick@seed.etyme.invalid')
    as(OWNER)
    const en = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: s.ida })))
    expect(en.status, JSON.stringify(en.body)).toBe(201)
    expect((await idRoute(move, 'POST', '/x', en.body.data.id, { move: 'complete' })).status).toBe(200)
    const asked = await idRoute(benchAsk, 'POST', '/x', en.body.data.id, {})
    expect(asked.status, JSON.stringify(asked.body)).toBe(201)
    expect(asked.body.data.method).toBe('EMAIL_LINK')
    const listingId = asked.body.data.listingId
    const before = await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: en.body.data.id } })
    expect(before).toMatchObject({ answer: null, answeredAt: null, answeredVia: null })

    const yes = await linkRoute(signInvite(listingId), { said: 'ACCEPT' })
    expect(yes.status, JSON.stringify(yes.body)).toBe(200)
    const after = await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: en.body.data.id } })
    expect(after).toMatchObject({ answer: 'YES', answeredVia: 'EMAIL_LINK' })
    expect(after.answeredAt).not.toBeNull()

    // A second answer by the same link is refused and never rewrites the first.
    const again = await linkRoute(signInvite(listingId), { said: 'DECLINE' })
    expect(again.status).toBe(409)
    const still = await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: en.body.data.id } })
    expect(still.answer).toBe('YES')
    expect(still.answeredAt!.getTime()).toBe(after.answeredAt!.getTime())
  })

  it('a no by the email link is written on the ask as NO', async () => {
    const jo = await person('Jory Ashdown', 'jory.ashdown@seed.etyme.invalid')
    as(OWNER)
    const en = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: jo })))
    await idRoute(move, 'POST', '/x', en.body.data.id, { move: 'complete' })
    const asked = await idRoute(benchAsk, 'POST', '/x', en.body.data.id, {})
    const no = await linkRoute(signInvite(asked.body.data.listingId), { said: 'DECLINE' })
    expect(no.status, JSON.stringify(no.body)).toBe(200)
    expect(await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: en.body.data.id } })).toMatchObject({ answer: 'NO', answeredVia: 'EMAIL_LINK' })
  })

  it('two enrollments at the same moment cannot overfill the last seat of a cohort', async () => {
    const people = [await person('Kit Larchmont', 'kit.larchmont@seed.etyme.invalid'), await person('Lou Penhallow', 'lou.penhallow@seed.etyme.invalid'), await person('Mae Strand', 'mae.strand@seed.etyme.invalid')]
    as(OWNER)
    const k = await json(await cohortsPost(req('POST', '/api/training/cohorts', { courseId: s.course, name: 'Last seat cohort', startsOn: '2027-02-01', capacity: 1 })))
    expect(k.status, JSON.stringify(k.body)).toBe(201)
    const results = await Promise.all(
      people.map((personId) => enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId, cohortId: k.body.data.id })).then(json))
    )
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409])
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'COHORT_FULL')).toBe(true)
    expect(await prisma.enrollment.count({ where: { cohortId: k.body.data.id, status: { not: 'DROPPED' } } })).toBe(1)
  })

  it('an enrollment that arrives while another is taking the last seat waits, then finds the cohort full', async () => {
    const taker = await person('Nan Oldacre', 'nan.oldacre@seed.etyme.invalid')
    const waiter = await person('Orrin Vesk', 'orrin.vesk@seed.etyme.invalid')
    as(OWNER)
    const k = await json(await cohortsPost(req('POST', '/api/training/cohorts', { courseId: s.course, name: 'Held seat cohort', startsOn: '2027-03-01', capacity: 1 })))
    const cohortId = k.body.data.id
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let holding!: () => void
    const held = new Promise<void>((r) => { holding = r })
    // Somebody else's enrollment has taken the seat under the cohort's lock and has not committed yet.
    const other = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cohort-seats:' + cohortId}))`
      await tx.enrollment.create({ data: { courseId: s.course, personId: taker, status: 'ENROLLED', cohortId } })
      holding()
      await gate
    })
    await held
    let settled = false
    const pending = enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: waiter, cohortId })).then(json).then((r) => { settled = true; return r })
    await new Promise((r) => setTimeout(r, 600))
    expect(settled, 'the second enrollment must wait for the first to finish').toBe(false)
    release()
    await other
    const r = await pending
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('COHORT_FULL')
    expect(await prisma.enrollment.count({ where: { cohortId, status: { not: 'DROPPED' } } })).toBe(1)
  })
})
