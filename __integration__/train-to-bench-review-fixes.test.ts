import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as cohortsGet, POST as cohortsPost } from '@/app/api/training/cohorts/route'
import { PATCH as cohortPatch } from '@/app/api/training/cohorts/[id]/route'
import { GET as coursesGet, POST as addCourse } from '@/app/api/training/route'
import { POST as enroll } from '@/app/api/training/enrollments/route'
import { POST as move } from '@/app/api/training/enrollments/[id]/route'
import { POST as assess } from '@/app/api/training/enrollments/[id]/assessments/route'
import { POST as certify } from '@/app/api/training/enrollments/[id]/certification/route'
import { POST as benchAsk } from '@/app/api/training/enrollments/[id]/bench-ask/route'
import { POST as answerByLink } from '@/app/api/bench-invite/[token]/route'
import { signInvite } from '@/lib/bench-invite'
import { proofsForListings } from '@/lib/training/proof-read'

/**
 * The independent review of train to bench (2026-11-25): seven defects,
 * each pinned on the real routes. Needs the integration database.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const CLERK = 'clara.clerk@seed.etyme.invalid'
const idRoute = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const s: Record<string, any> = {}

async function person(name: string, email: string, seat: 'CONSULTANT' | 'EMPLOYEE' = 'CONSULTANT') {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.consultantProfile.create({ data: { personId: p.id, skills: ['Python'], location: 'Boise, ID', visibility: 'VERIFIED', workAuth: 'USC' } })
  await prisma.context.create({ data: { personId: p.id, companyId: s.firm, type: seat, side: 'SELL', grantReason: 'Joined a course' } })
  return p.id
}
async function cohortWith(name: string, trainerPersonId: string | null, capacity = 5) {
  as(OWNER)
  const k = await json(await cohortsPost(req('POST', '/api/training/cohorts', { courseId: s.course, name, startsOn: '2027-04-01', trainerPersonId, capacity })))
  expect(k.status, JSON.stringify(k.body)).toBe(201)
  return k.body.data.id as string
}
async function enrolled(cohortId: string, personId: string) {
  as(OWNER)
  const r = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId, cohortId })))
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body.data.id as string
}

describe('train to bench: the review’s seven defects, on the real routes', () => {
  beforeAll(async () => {
    await freshWorld()
    s.firm = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
    s.owner = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })).id
    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    as(OWNER)
    const c = await json(await addCourse(req('POST', '/api/training', { title: 'Review course', category: 'TECH', duration: 10 })))
    s.course = c.body.data.id
  }, 240_000)

  it('a person who is a trainee on a cohort cannot be set as its trainer, and a trainer cannot be enrolled on her own cohort', async () => {
    const trainee = await person('Rhea Tindall', 'rhea.tindall@seed.etyme.invalid')
    const cohort = await cohortWith('Self-train cohort', s.owner)
    await enrolled(cohort, trainee)
    as(OWNER)
    const set = await idRoute(cohortPatch, 'PATCH', '/x', cohort, { trainerPersonId: trainee })
    expect(set.status, JSON.stringify(set.body)).toBe(409)
    expect(set.body.error.message).toContain('trainee')
    expect((await prisma.cohort.findUniqueOrThrow({ where: { id: cohort } })).trainerPersonId).toBe(s.owner)
    const trainerAsTrainee = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: s.owner, cohortId: cohort })))
    expect(trainerAsTrainee.status).toBe(409)
  })

  it('a cohort with no trainer refuses every assessment with "Name the cohort’s trainer first."', async () => {
    const trainee = await person('Sol Verrin', 'sol.verrin@seed.etyme.invalid')
    const cohort = await cohortWith('No trainer cohort', null)
    const en = await enrolled(cohort, trainee)
    as(OWNER)
    const r = await idRoute(assess, 'POST', '/x', en, { skill: 'Python', score: 70 })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Name the cohort’s trainer first.')
    expect(await prisma.assessment.count({ where: { enrollmentId: en } })).toBe(0)
  })

  it('four attempts at the same skill at the same moment get four different numbers and none fails', async () => {
    const trainee = await person('Tam Orwell', 'tam.orwell@seed.etyme.invalid')
    const cohort = await cohortWith('Parallel assess cohort', s.owner)
    const en = await enrolled(cohort, trainee)
    as(OWNER)
    const results = await Promise.all([60, 65, 70, 75].map((score) => idRoute(assess, 'POST', '/x', en, { skill: 'SQL', score })))
    expect(results.map((r) => r.status), JSON.stringify(results.map((r) => r.body))).toEqual([201, 201, 201, 201])
    const rows = await prisma.assessment.findMany({ where: { enrollmentId: en }, orderBy: { attempt: 'asc' } })
    expect(rows.map((r) => r.attempt)).toEqual([1, 2, 3, 4])
  })

  it('two certifications of the same title at the same moment give one row and one "already holds" sentence, never a 500', async () => {
    const trainee = await person('Una Fairweather', 'una.fairweather@seed.etyme.invalid')
    const cohort = await cohortWith('Parallel certify cohort', s.owner)
    const en = await enrolled(cohort, trainee)
    as(OWNER)
    await idRoute(move, 'POST', '/x', en, { move: 'complete' })
    const results = await Promise.all([1, 2, 3].map(() => idRoute(certify, 'POST', '/x', en, { title: 'SQL analyst' })))
    expect(results.map((r) => r.status).sort(), JSON.stringify(results.map((r) => r.body))).toEqual([201, 409, 409])
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.message.includes('already holds'))).toBe(true)
    expect(await prisma.certification.count({ where: { enrollmentId: en } })).toBe(1)
  })

  it('two enrollments of the same person at the same moment give one row and never a 500', async () => {
    const trainee = await person('Vic Hallowell', 'vic.hallowell@seed.etyme.invalid')
    as(OWNER)
    const results = await Promise.all([1, 2, 3].map(async () => json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: trainee })))))
    expect(results.every((r) => r.status === 200 || r.status === 201), JSON.stringify(results.map((r) => r.body))).toBe(true)
    expect(await prisma.enrollment.count({ where: { courseId: s.course, personId: trainee } })).toBe(1)
  })

  it('an employee who was told is never stamped as having said yes, by her own page or by the email link', async () => {
    const emp = await person('Wren Ashcombe', 'wren.ashcombe@seed.etyme.invalid', 'EMPLOYEE')
    const profile = await prisma.consultantProfile.findUniqueOrThrow({ where: { personId: emp }, select: { id: true } })
    const listing = await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: s.firm, tier: 'MARKETING', state: 'INVITED', grantedAt: new Date() } })
    const en = await enrolled(await cohortWith('Employee cohort', s.owner), emp)
    as(OWNER)
    await idRoute(move, 'POST', '/x', en, { move: 'complete' })
    const told = await idRoute(benchAsk, 'POST', '/x', en, {})
    expect(told.status, JSON.stringify(told.body)).toBe(201)
    expect(told.body.data.method).toBe('EMPLOYEE_TOLD')
    await json(await answerByLink(req('POST', 'x', { said: 'ACCEPT' }), { params: Promise.resolve({ token: signInvite(listing.id) }) }))
    expect(await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: en } })).toMatchObject({ answer: null, answeredAt: null, answeredVia: null })
  })

  it('the proof shows her yes only while her listing is granted, whatever the ask says', async () => {
    const who = await person('Xan Pellew', 'xan.pellew@seed.etyme.invalid')
    const cohort = await cohortWith('Proof cohort', s.owner)
    const en = await enrolled(cohort, who)
    const profile = await prisma.consultantProfile.findUniqueOrThrow({ where: { personId: who }, select: { id: true } })
    const yes = new Date('2026-11-28T00:00:00Z')
    const listing = await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: s.firm, tier: 'MARKETING', state: 'GRANTED', grantedAt: yes, respondedAt: yes, sourceCohortId: cohort } })
    await prisma.benchAsk.create({ data: { companyId: s.firm, enrollmentId: en, benchListingId: listing.id, askedByPersonId: s.owner, method: 'OWN_PAGE', answer: 'YES', answeredAt: yes, answeredVia: 'OWN_PAGE' } })
    const read = async () => (await proofsForListings(s.firm, [{ listingId: listing.id, personId: who, sourceCohortId: cohort }], new Date('2026-12-01T00:00:00Z'))).get(listing.id)
    expect((await read())!.consent).toEqual({ yesOn: '2026-11-28', method: 'OWN_PAGE' })
    await prisma.benchListing.update({ where: { id: listing.id }, data: { state: 'DECLINED' } })
    expect((await read())!.consent).toBeNull()
  })

  it('a seat that does not read consultants is refused the cohorts and the courses, and each refusal is on the access log', async () => {
    const role = await prisma.role.create({ data: { companyId: s.firm, name: 'Payables clerk (review test)', permissions: ['invoices.read'] } })
    const clerk = await prisma.person.create({ data: { name: 'Clara Clerk', primaryEmail: CLERK } })
    await prisma.context.create({ data: { personId: clerk.id, companyId: s.firm, type: 'EMPLOYEE', side: 'SELL', roleId: role.id, grantReason: 'Clerk' } })
    as(CLERK)
    const a = await json(await cohortsGet(req('GET', '/api/training/cohorts')))
    const b = await json(await coursesGet(req('GET', '/api/training')))
    expect([a.status, b.status]).toEqual([403, 403])
    expect(await prisma.accessLog.count({ where: { actorPersonId: clerk.id, allowed: false } })).toBe(2)
  })

  it('a seat that reads consultants reads the cohorts, and each trainee read is on the access log', async () => {
    const before = await prisma.accessLog.count({ where: { actorPersonId: s.owner, allowed: true } })
    as(OWNER)
    const r = await json(await cohortsGet(req('GET', '/api/training/cohorts')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const trainees = new Set(r.body.data.cohorts.flatMap((c: any) => c.trainees.map((t: any) => t.person.id)))
    expect(trainees.size).toBeGreaterThan(0)
    // Logging is not awaited by the route; give the write a moment.
    await new Promise((res) => setTimeout(res, 500))
    expect(await prisma.accessLog.count({ where: { actorPersonId: s.owner, allowed: true } })).toBeGreaterThanOrEqual(before + trainees.size)
  })

  it('after a drop and a new enrollment, an assessor of the old run cannot certify the new run', async () => {
    const trainee = await person('Yul Brannock', 'yul.brannock@seed.etyme.invalid')
    const cohort = await cohortWith('Rerun cohort', s.owner)
    const en = await enrolled(cohort, trainee)
    as(OWNER)
    expect((await idRoute(assess, 'POST', '/x', en, { skill: 'Python', score: 50 })).status).toBe(201)
    // Another person now trains the cohort; the Owner is only a past assessor.
    const hr = await person('Zed Ingram', 'zed.ingram@seed.etyme.invalid', 'EMPLOYEE')
    expect((await idRoute(cohortPatch, 'PATCH', '/x', cohort, { trainerPersonId: hr })).status).toBe(200)
    expect((await idRoute(move, 'POST', '/x', en, { move: 'drop', reason: 'Moved away' })).status).toBe(200)
    await new Promise((res) => setTimeout(res, 20))
    const again = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: trainee, cohortId: cohort })))
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect((await idRoute(move, 'POST', '/x', en, { move: 'complete' })).status).toBe(200)
    const r = await idRoute(certify, 'POST', '/x', en, { title: 'Python analyst' })
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(await prisma.certification.count({ where: { enrollmentId: en } })).toBe(0)
  })
})
