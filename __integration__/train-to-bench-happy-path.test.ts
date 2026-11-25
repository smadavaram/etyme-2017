import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as cohortsGet, POST as cohortsPost } from '@/app/api/training/cohorts/route'
import { PATCH as cohortPatch } from '@/app/api/training/cohorts/[id]/route'
import { POST as addCourse } from '@/app/api/training/route'
import { POST as enroll } from '@/app/api/training/enrollments/route'
import { POST as move } from '@/app/api/training/enrollments/[id]/route'
import { POST as assess } from '@/app/api/training/enrollments/[id]/assessments/route'
import { POST as certify } from '@/app/api/training/enrollments/[id]/certification/route'
import { POST as benchAsk } from '@/app/api/training/enrollments/[id]/bench-ask/route'
import { POST as respond } from '@/app/api/me/benches/[id]/respond/route'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { GET as benchGet } from '@/app/api/bench/route'
import { GET as profitGet } from '@/app/api/bench/profit/route'

/**
 * Train to bench, end to end, at one firm: the plugin on, a program, a
 * cohort of two seats, two people in and a third refused, scores with a
 * retake kept, a certification each, the cohort finished, each asked onto
 * the bench, each says yes at her own door, one bench row each with proof,
 * then the plugin off (refused, nothing deleted) and on again (restored).
 */

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const RECRUITER = 'quentin.recruiter@seed.etyme.invalid'
const trainees = [
  { key: 'ada', name: 'Ada Quillfeather', email: 'ada.quillfeather@seed.etyme.invalid' },
  { key: 'bram', name: 'Bram Oakhollow', email: 'bram.oakhollow@seed.etyme.invalid' },
  { key: 'cleo', name: 'Cleo Marshwick', email: 'cleo.marshwick@seed.etyme.invalid' },
]
const idRoute = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const s: Record<string, any> = { enrollment: {}, person: {}, listing: {} }
const listingOf = (key: string) => prisma.benchListing.findUniqueOrThrow({ where: { id: s.listing[key] } })

async function counts(companyId: string) {
  return {
    cohorts: await prisma.cohort.count({ where: { companyId } }),
    enrollments: await prisma.enrollment.count({ where: { course: { companyId } } }),
    assessments: await prisma.assessment.count({ where: { enrollment: { course: { companyId } } } }),
    certifications: await prisma.certification.count({ where: { enrollment: { course: { companyId } } } }),
    asks: await prisma.benchAsk.count({ where: { companyId } }),
    listings: await prisma.benchListing.count({ where: { companyId, sourceCohortId: { not: null } } }),
  }
}
async function benchRows(): Promise<any[]> {
  as(OWNER)
  const r = await json(await benchGet(req('GET', '/api/bench?scope=company')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return [...Object.values(r.body.data.tiers as Record<string, any[]>).flat(), ...(r.body.data.asked ?? [])]
}

describe('train to bench, from a plugin switched on to a trainee on the bench with proof', () => {
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    s.firm = firm.id
    s.owner = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: OWNER }, select: { id: true } })).id
    // A recruiter at the firm: holds the training permission and still never grades.
    const recruiterRole = await prisma.role.findFirstOrThrow({ where: { companyId: firm.id, name: 'Recruiter' }, select: { id: true } })
    const rec = await prisma.person.create({ data: { name: 'Quentin Reedmarsh', primaryEmail: RECRUITER } })
    await prisma.context.create({ data: { personId: rec.id, companyId: firm.id, type: 'EMPLOYEE', side: 'SELL', roleId: recruiterRole.id, grantReason: 'Recruiter' } })
    // The usual way: Add consultant. Each is a person and a profile and a
    // listing that is asked (INVITED) and not answered. No seat is written.
    as(OWNER)
    for (const t of trainees) {
      const r = await json(await addConsultant(req('POST', '/api/consultants', { name: t.name, email: t.email, skills: ['Python'], location: 'Boise, ID', workAuth: 'US_CITIZEN' })))
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      s.person[t.key] = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: t.email }, select: { id: true } })).id
      s.listing[t.key] = (await prisma.benchListing.findFirstOrThrow({ where: { companyId: firm.id, consultant: { personId: s.person[t.key] } }, select: { id: true } })).id
    }
  }, 240_000)

  it('the plugin is off by default, so the cohort routes refuse in one sentence and nothing is read', async () => {
    as(OWNER)
    const r = await json(await cohortsGet(req('GET', '/api/training/cohorts')))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('PLUGIN_OFF')
    expect(r.body.error.message).toMatch(/^Train to bench is off for /)
  })

  it('the Owner turns the plugin on and plans a cohort of two seats with a trainer', async () => {
    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    as(OWNER)
    const c = await json(await addCourse(req('POST', '/api/training', { title: 'Python for data engineering', category: 'TECH', duration: 40, price: 900 })))
    expect(c.status, JSON.stringify(c.body)).toBe(201)
    s.course = c.body.data.id
    const k = await json(await cohortsPost(req('POST', '/api/training/cohorts', { courseId: s.course, name: 'Spring data cohort', startsOn: '2026-12-01', endsOn: '2027-01-30', trainerPersonId: s.owner, capacity: 2 })))
    expect(k.status, JSON.stringify(k.body)).toBe(201)
    s.cohort = k.body.data.id
    const row = await prisma.cohort.findUniqueOrThrow({ where: { id: s.cohort } })
    expect(row).toMatchObject({ capacity: 2, state: 'PLANNED', trainerPersonId: s.owner, companyId: s.firm })
  })

  it('two trainees are enrolled and the third is refused with the capacity named', async () => {
    as(OWNER)
    for (const t of trainees.slice(0, 2)) {
      const r = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: s.person[t.key], cohortId: s.cohort })))
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      s.enrollment[t.key] = r.body.data.id
    }
    const third = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: s.person.cleo, cohortId: s.cohort })))
    expect(third.status).toBe(409)
    expect(third.body.error.code).toBe('COHORT_FULL')
    expect(third.body.error.message).toContain('holds 2 people and is full')
    expect(await prisma.enrollment.count({ where: { cohortId: s.cohort } })).toBe(2)
  })

  it('a course cannot be finished while its cohort is only planned, and the screen offers no Finish then', async () => {
    as(OWNER)
    const r = await idRoute(move, 'POST', '/x', s.enrollment.ada, { move: 'complete' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Start the cohort first.')
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: s.enrollment.ada } })).status).toBe('ENROLLED')
    const read = await json(await cohortsGet(req('GET', '/api/training/cohorts')))
    const c = read.body.data.cohorts.find((x: any) => x.id === s.cohort)
    expect(c.fullSays).toBe('Spring data cohort is full (2 of 2).')
    expect(c.trainees.every((t: any) => t.can.finish === false)).toBe(true)
  })

  it('a cohort is started, and its trainees are in progress', async () => {
    as(OWNER)
    const r = await idRoute(cohortPatch, 'PATCH', '/x', s.cohort, { move: 'start' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await prisma.cohort.findUniqueOrThrow({ where: { id: s.cohort } })).state).toBe('RUNNING')
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: s.enrollment.ada } })).status).toBe('IN_PROGRESS')
  })

  it('the cohort cannot be finished while a trainee has no result, and the sentence names them', async () => {
    as(OWNER)
    const r = await idRoute(cohortPatch, 'PATCH', '/x', s.cohort, { move: 'complete' })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('Ada Quillfeather')
    expect(r.body.error.message).toContain('Bram Oakhollow')
    expect((await prisma.cohort.findUniqueOrThrow({ where: { id: s.cohort } })).state).toBe('RUNNING')
  })

  it('a recruiter cannot enter an assessment, and a score over 100 is refused', async () => {
    as(RECRUITER)
    const no = await idRoute(assess, 'POST', '/x', s.enrollment.ada, { skill: 'Python', score: 70 })
    expect(no.status, JSON.stringify(no.body)).toBe(403)
    as(OWNER)
    const over = await idRoute(assess, 'POST', '/x', s.enrollment.ada, { skill: 'Python', score: 101 })
    expect(over.status).toBe(422)
    expect(await prisma.assessment.count({ where: { enrollmentId: s.enrollment.ada } })).toBe(0)
  })

  it('each trainee is assessed and a second attempt is kept beside the first', async () => {
    as(OWNER)
    const a1 = await idRoute(assess, 'POST', '/x', s.enrollment.ada, { skill: 'Python', score: 60 })
    const a2 = await idRoute(assess, 'POST', '/x', s.enrollment.ada, { skill: 'python', score: 82 })
    const b1 = await idRoute(assess, 'POST', '/x', s.enrollment.bram, { skill: 'Python', score: 74 })
    expect([a1.status, a2.status, b1.status]).toEqual([201, 201, 201])
    const rows = await prisma.assessment.findMany({ where: { enrollmentId: s.enrollment.ada }, orderBy: { attempt: 'asc' } })
    expect(rows.map((r) => [r.skill, r.attempt, r.score])).toEqual([['Python', 1, 60], ['Python', 2, 82]])
    expect(await prisma.assessment.count({ where: { enrollmentId: s.enrollment.bram } })).toBe(1)
  })

  it('she cannot be asked onto the bench before her own course is finished', async () => {
    as(OWNER)
    const r = await idRoute(benchAsk, 'POST', '/x', s.enrollment.ada, {})
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOT_FINISHED')
    expect(await prisma.benchAsk.count({ where: { enrollmentId: s.enrollment.ada } })).toBe(0)
    expect(await listingOf('ada')).toMatchObject({ state: 'INVITED', sourceCohortId: null })
  })

  it('a certification needs a finished course, and a recruiter never issues one', async () => {
    as(OWNER)
    const early = await idRoute(certify, 'POST', '/x', s.enrollment.ada, { title: 'Python data engineer' })
    expect(early.status).toBe(403)
    expect(early.body.error.message).toContain('has not finished the course')
    for (const k of ['ada', 'bram']) {
      const m = await idRoute(move, 'POST', '/x', s.enrollment[k], { move: 'complete' })
      expect(m.status, JSON.stringify(m.body)).toBe(200)
    }
    as(RECRUITER)
    const rec = await idRoute(certify, 'POST', '/x', s.enrollment.ada, { title: 'Python data engineer' })
    expect(rec.status).toBe(403)
    expect(rec.body.error.message).toContain('recruiter')
    expect(await prisma.certification.count({ where: { enrollment: { course: { companyId: s.firm } } } })).toBe(0)
  })

  it('the trainer certifies each trainee, once', async () => {
    as(OWNER)
    for (const k of ['ada', 'bram']) {
      const r = await idRoute(certify, 'POST', '/x', s.enrollment[k], { title: 'Python data engineer', expiresAt: '2030-01-01' })
      expect(r.status, JSON.stringify(r.body)).toBe(201)
    }
    const again = await idRoute(certify, 'POST', '/x', s.enrollment.ada, { title: 'Python data engineer' })
    expect(again.status).toBe(409)
    const held = await prisma.certification.findMany({ where: { enrollment: { cohortId: s.cohort } } })
    expect(held).toHaveLength(2)
    expect(held.every((h) => h.issuedByPersonId === s.owner)).toBe(true)
  })

  it('the cohort is finished once every trainee has a result', async () => {
    as(OWNER)
    const r = await idRoute(cohortPatch, 'PATCH', '/x', s.cohort, { move: 'complete' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await prisma.cohort.findUniqueOrThrow({ where: { id: s.cohort } })).state).toBe('COMPLETE')
    const read = await json(await cohortsGet(req('GET', '/api/training/cohorts')))
    const c = read.body.data.cohorts.find((x: any) => x.id === s.cohort)
    expect(c.seatsSays).toBe('2 of 2 seats taken')
    expect(c.trainees.find((t: any) => t.person.name === 'Ada Quillfeather').assessments.map((a: any) => a.score)).toEqual([60, 82])
  })

  it('each is asked onto the bench through the listing she was already given when added: the same one, the cohort kept, no yes written', async () => {
    as(OWNER)
    for (const k of ['ada', 'bram']) {
      expect((await listingOf(k)).state).toBe('INVITED')
      const r = await idRoute(benchAsk, 'POST', '/x', s.enrollment[k], {})
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.method).toBe('EMAIL_LINK')
      expect(r.body.data.listingId).toBe(s.listing[k])
      expect(await listingOf(k)).toMatchObject({ state: 'INVITED', sourceCohortId: s.cohort, companyId: s.firm })
      const ask = await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: s.enrollment[k] } })
      expect(ask).toMatchObject({ method: 'EMAIL_LINK', answer: null, answeredAt: null, answeredVia: null, benchListingId: s.listing[k], askedByPersonId: s.owner })
    }
    const twice = await idRoute(benchAsk, 'POST', '/x', s.enrollment.ada, {})
    expect(twice.status).toBe(409)
    expect(twice.body.error.code).toBe('ALREADY_ASKED')
    expect(await prisma.benchAsk.count({ where: { companyId: s.firm } })).toBe(2)
  })

  it('before her yes the bench shows the cohort and scores but no consent date or method', async () => {
    const row = (await benchRows()).find((r) => r.id === s.listing.ada)
    expect(row.proof.cohort).toEqual({ name: 'Spring data cohort', courseTitle: 'Python for data engineering' })
    expect(row.proof.consent).toBeNull()
  })

  it('each says yes at her own door and it is written once on the ask', async () => {
    for (const t of trainees.slice(0, 2)) {
      as(t.email)
      const r = await idRoute(respond, 'POST', '/x', s.listing[t.key], { said: 'ACCEPT' })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body.data.state).toBe('GRANTED')
      const ask = await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: s.enrollment[t.key] } })
      expect(ask.answer).toBe('YES')
      expect(ask.answeredVia).toBe('OWN_PAGE')
      expect(ask.answeredAt).not.toBeNull()
      s[`yesAt_${t.key}`] = ask.answeredAt!.getTime()
      const second = await idRoute(respond, 'POST', '/x', s.listing[t.key], { said: 'DECLINE' })
      expect(second.status).toBe(409)
      expect((await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: s.enrollment[t.key] } })).answeredAt!.getTime()).toBe(s[`yesAt_${t.key}`])
    }
  })

  it('each has exactly one bench listing, with proof: source cohort, both attempts, certification, her yes date and method', async () => {
    for (const t of trainees.slice(0, 2)) {
      expect(await prisma.benchListing.count({ where: { companyId: s.firm, consultant: { personId: s.person[t.key] } } })).toBe(1)
    }
    const rows = await benchRows()
    const ada = rows.find((r) => r.id === s.listing.ada)
    expect(ada.consent).toBe('GRANTED')
    expect(ada.proof.cohort.name).toBe('Spring data cohort')
    expect(ada.proof.scores).toEqual([{ skill: 'Python', latest: 82, attempts: [expect.objectContaining({ attempt: 2, score: 82 }), expect.objectContaining({ attempt: 1, score: 60 })] }])
    expect(ada.proof.certifications).toEqual([expect.objectContaining({ title: 'Python data engineer', expires: '2030-01-01', standing: 'CURRENT' })])
    expect(ada.proof.consent).toEqual({ yesOn: new Date(s.yesAt_ada).toISOString().slice(0, 10), method: 'OWN_PAGE' })
    expect(rows.find((r) => r.id === s.listing.bram).proof.scores[0].latest).toBe(74)
  })

  it('a firm’s own employee is told, not asked, and gets no bench listing', async () => {
    const e = await prisma.person.create({ data: { name: 'Dara Fenwick', primaryEmail: 'dara.fenwick@seed.etyme.invalid' } })
    await prisma.consultantProfile.create({ data: { personId: e.id, skills: ['SQL'], visibility: 'VERIFIED', workAuth: 'USC' } })
    await prisma.context.create({ data: { personId: e.id, companyId: s.firm, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Hired' } })
    as(OWNER)
    const en = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: e.id })))
    expect(en.status, JSON.stringify(en.body)).toBe(201)
    expect((await idRoute(move, 'POST', '/x', en.body.data.id, { move: 'complete' })).status).toBe(200)
    const r = await idRoute(benchAsk, 'POST', '/x', en.body.data.id, {})
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.method).toBe('EMPLOYEE_TOLD')
    expect(await prisma.benchListing.count({ where: { companyId: s.firm, consultant: { personId: e.id } } })).toBe(0)
    const ask = await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: en.body.data.id } })
    expect(ask).toMatchObject({ method: 'EMPLOYEE_TOLD', answer: null })
  })

  it('switched off, every route refuses and nothing is deleted; switched on, it is all back', async () => {
    const before = await counts(s.firm)
    expect(before).toMatchObject({ cohorts: 1, assessments: 3, certifications: 2, listings: 2 })
    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: [] } })
    as(OWNER)
    const refused = [
      await json(await cohortsGet(req('GET', '/api/training/cohorts'))),
      await json(await cohortsPost(req('POST', '/api/training/cohorts', { courseId: s.course, name: 'x', startsOn: '2027-01-01' }))),
      await idRoute(cohortPatch, 'PATCH', '/x', s.cohort, { move: 'cancel' }),
      await idRoute(assess, 'POST', '/x', s.enrollment.ada, { skill: 'Python', score: 90 }),
      await idRoute(certify, 'POST', '/x', s.enrollment.ada, { title: 'Another' }),
      await idRoute(benchAsk, 'POST', '/x', s.enrollment.bram, {}),
    ]
    expect(refused.map((r) => [r.status, r.body.error.code])).toEqual(Array(6).fill([403, 'PLUGIN_OFF']))
    expect(await counts(s.firm)).toEqual(before)
    const off = (await benchRows()).find((r) => r.id === s.listing.ada)
    expect(off.proof).toBeNull()
    expect(off.consent).toBe('GRANTED')
    const profit = await json(await profitGet(req('GET', '/api/bench/profit')))
    expect(profit.body.data.courses ?? []).toEqual([])

    await prisma.company.update({ where: { id: s.firm }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    expect(await counts(s.firm)).toEqual(before)
    const on = (await benchRows()).find((r) => r.id === s.listing.ada)
    expect(on.proof.certifications).toHaveLength(1)
    expect((await json(await cohortsGet(req('GET', '/api/training/cohorts')))).status).toBe(200)
  })

  it('somebody already on the bench when asked keeps her one listing and gets proof, with the door recorded honestly', async () => {
    const p = await prisma.person.create({ data: { name: 'Eli Fernhollow', primaryEmail: 'eli.fernhollow@seed.etyme.invalid' } })
    const profile = await prisma.consultantProfile.create({ data: { personId: p.id, skills: ['SQL'], visibility: 'VERIFIED', workAuth: 'USC' } })
    const granted = await prisma.benchListing.create({ data: { consultantId: profile.id, companyId: s.firm, tier: 'MARKETING', state: 'GRANTED', grantedAt: new Date('2026-10-01T00:00:00Z'), respondedAt: new Date('2026-10-01T00:00:00Z') } })
    as(OWNER)
    const en = await json(await enroll(req('POST', '/api/training/enrollments', { courseId: s.course, personId: p.id })))
    expect(en.status, JSON.stringify(en.body)).toBe(201)
    await prisma.enrollment.update({ where: { id: en.body.data.id }, data: { cohortId: s.cohort } })
    expect((await idRoute(move, 'POST', '/x', en.body.data.id, { move: 'complete' })).status).toBe(200)
    const r = await idRoute(benchAsk, 'POST', '/x', en.body.data.id, {})
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await prisma.benchListing.count({ where: { companyId: s.firm, consultantId: profile.id } })).toBe(1)
    expect(await prisma.benchListing.findUniqueOrThrow({ where: { id: granted.id } })).toMatchObject({ state: 'GRANTED', sourceCohortId: s.cohort })
    expect(await prisma.benchAsk.findFirstOrThrow({ where: { enrollmentId: en.body.data.id } })).toMatchObject({ answer: 'YES', answeredVia: 'ALREADY_ON_BENCH', benchListingId: granted.id })
    const shown = (await benchRows()).find((x) => x.id === granted.id)
    expect(shown.proof.consent).toEqual({ yesOn: '2026-10-01', method: 'ALREADY_ON_BENCH' })
  })
})
