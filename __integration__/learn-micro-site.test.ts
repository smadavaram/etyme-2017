import { describe, it, expect, beforeAll, vi } from 'vitest'

// A visitor has no session: the lookup answers nobody, as it does for a person who never signed in.
vi.mock('next-auth/next', () => ({ getServerSession: async () => null }))
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as progressPost, GET as progressGet } from '@/app/api/learn/[tenant]/progress/route'
import { POST as joinPost } from '@/app/api/learn/[tenant]/join/route'
import { POST as pathPost } from '@/app/api/learn/paths/route'
import { PATCH as pathPatch } from '@/app/api/learn/paths/[id]/route'
import { POST as adopt } from '@/app/api/learn/adopt/route'
import { GET as adoptions } from '@/app/api/learn/adoptions/route'
import { POST as fromSource } from '@/app/api/learn/courses/from-source/route'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { GET as trainingGet } from '@/app/api/training/route'
import { trackOf, lessonsOf } from '@/lib/training/courses/index'

const D = '@demo.etyme.local'
const MAKER = `world-brightmoor${D}`
const ADOPTER = `world-halcyon${D}`
const CLIENT = `world-harlow-health${D}`
const MENTOR = 'mara.mentor@seed.etyme.invalid'
const WORKER = 'wren.worker@seed.etyme.invalid'
const ADOPTED = 'ines.adopted@seed.etyme.invalid'
const KEYS = lessonsOf(trackOf('it-upgrade')!).map((l) => l.lesson.key)
const LESSON = KEYS[0]
const s: Record<string, any> = {}
const route = async (fn: any, method: string, url: string, params: Record<string, string>, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve(params) }))
const ledger = (companyId: string, action: string) => prisma.automationLog.count({ where: { companyId, action } })

describe('the learning micro-site on the one record', () => {
  beforeAll(async () => {
    await freshWorld()
    s.maker = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, slug: true } }))
    s.adopter = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-halcyon' }, select: { id: true } })).id
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: s.maker.id, name: 'Recruiter' }, select: { id: true } })
    const mentor = await prisma.person.create({ data: { name: 'Mara Mentor', primaryEmail: MENTOR } })
    await prisma.context.create({ data: { personId: mentor.id, companyId: s.maker.id, type: 'EMPLOYEE', side: 'SELL', roleId: role.id, grantReason: 'Recruiter' } })
    s.mentor = mentor.id
    as(MAKER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Wren Worker', email: WORKER, skills: ['Python'], location: 'Boise, ID', workAuth: 'US_CITIZEN' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.worker = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: WORKER }, select: { id: true } })).id
    const adopted = await prisma.person.create({ data: { name: 'Ines Adopted', primaryEmail: ADOPTED } })
    await prisma.context.create({ data: { personId: adopted.id, companyId: s.adopter, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
    s.adoptedPerson = adopted.id
  }, 240_000)

  it('the learning routes refuse a firm whose plugin is off, and the site reads as no firm at all', async () => {
    as(MAKER)
    const r = await json(await pathPost(req('POST', '/api/learn/paths', { personId: s.worker, mode: 'SYSTEM' })))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('PLUGIN_OFF')
    as(WORKER)
    const p = await route(progressPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', lessonKey: LESSON })
    expect(p.status).toBe(404)
    expect(await prisma.enrollment.count({ where: { personId: s.worker } })).toBe(0)
  })

  it('a client company is not offered the learning routes', async () => {
    as(CLIENT)
    const r = await json(await adoptions(req('GET', '/api/learn/adoptions')))
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_OFFERED')
  })

  it('a visitor who is not signed in writes nothing to the record', async () => {
    await prisma.company.update({ where: { id: s.maker.id }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    await prisma.company.update({ where: { id: s.adopter }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    const before = { c: await prisma.course.count(), e: await prisma.enrollment.count(), l: await prisma.automationLog.count() }
    delete process.env.DEV_BYPASS_AUTH
    const r = await route(progressPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', lessonKey: LESSON })
    expect(r.status).toBe(401)
    expect({ c: await prisma.course.count(), e: await prisma.enrollment.count(), l: await prisma.automationLog.count() }).toEqual(before)
  })

  it('a path made from her record is proposed, and is not hers to follow until the mentor says yes', async () => {
    as(MAKER)
    const r = await json(await pathPost(req('POST', '/api/learn/paths', { personId: s.worker, mode: 'SYSTEM', mentorPersonId: s.mentor })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.path = r.body.data.id
    const row = await prisma.learningPath.findUniqueOrThrow({ where: { id: s.path } })
    expect(row).toMatchObject({ generationType: 'SYSTEM', state: 'PROPOSED', mentorPersonId: s.mentor, sourcePrompt: null })
    expect(row.sourceSignals).toMatchObject({ skills: ['Python'] })
    as(WORKER)
    const mine = await route(progressGet, 'GET', `/x?track=it-upgrade`, { tenant: s.maker.slug })
    expect(mine.status).toBe(200)
    expect(mine.body.data.path).toMatchObject({ state: 'PROPOSED', live: false, steps: null, mentorName: 'Mara Mentor' })
  })

  it('a path drafted from a goal falls back to the rules path when no model is on, and says so', async () => {
    as(MAKER)
    const r = await json(await pathPost(req('POST', '/api/learn/paths', { personId: s.worker, mode: 'PROMPT', prompt: 'Move me toward data work', mentorPersonId: s.mentor })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.madeBy).toBe('RULES')
    expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: r.body.data.id } })).sourcePrompt).toBe('Move me toward data work')
  })

  it('the learner cannot approve her own path, and a seat that is not the mentor cannot either', async () => {
    as(WORKER)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'approve' })).status).toBe(403)
    as(MAKER)
    const owner = await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'approve' })
    expect(owner.status).toBe(403)
    expect(owner.body.error.message).toBe('Only the path’s mentor says yes to it.')
    expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: s.path } })).state).toBe('PROPOSED')
  })

  it('the mentor adjusts and approves, and the path becomes hers with its steps', async () => {
    as(MENTOR)
    const a = await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'adjust', steps: [LESSON] })
    expect(a.status, JSON.stringify(a.body)).toBe(200)
    const ok = await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'approve' })
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    const row = await prisma.learningPath.findUniqueOrThrow({ where: { id: s.path } })
    expect(row).toMatchObject({ state: 'APPROVED', approvedByPersonId: s.mentor })
    as(WORKER)
    const mine = await route(progressGet, 'GET', '/x?track=it-upgrade', { tenant: s.maker.slug })
    expect(mine.body.data.path).toMatchObject({ live: true, steps: [LESSON] })
  })

  it('a signed-in worker finishing the track writes her enrollment, completes her path and the ledger', async () => {
    as(WORKER)
    const before = await ledger(s.maker.id, 'LEARNING_COMPLETED')
    // Every lesson of the track as it is written today; only the last one completes it.
    let r: any
    for (const lessonKey of KEYS) {
      r = await route(progressPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', lessonKey })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body.data.complete, lessonKey).toBe(lessonKey === KEYS[KEYS.length - 1])
    }
    const e = await prisma.enrollment.findFirstOrThrow({ where: { personId: s.worker, companyId: s.maker.id } })
    expect(e).toMatchObject({ status: 'COMPLETED', trackKey: 'it-upgrade' })
    expect(e.completedAt).not.toBeNull()
    expect((e.progress as any).done).toEqual(KEYS)
    expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: s.path } })).state).toBe('COMPLETE')
    expect(await ledger(s.maker.id, 'LEARNING_COMPLETED')).toBe(before + 1)
    // Saying it twice writes it once.
    await route(progressPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', lessonKey: LESSON })
    expect(await ledger(s.maker.id, 'LEARNING_COMPLETED')).toBe(before + 1)
  })

  it('her yes to being asked writes a line and never a bench listing or a seat', async () => {
    as(WORKER)
    const listings = await prisma.benchListing.count({ where: { companyId: s.maker.id, consultant: { personId: s.worker } } })
    const seats = await prisma.context.count({ where: { personId: s.worker, companyId: s.maker.id } })
    const r = await route(joinPost, 'POST', '/x', { tenant: s.maker.slug })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(await ledger(s.maker.id, 'LEARNER_ASKED_TO_JOIN')).toBe(1)
    expect(await prisma.benchListing.count({ where: { companyId: s.maker.id, consultant: { personId: s.worker } } })).toBe(listings)
    expect(await prisma.context.count({ where: { personId: s.worker, companyId: s.maker.id } })).toBe(seats)
  })

  it('asking to join before finishing a track is refused in a sentence', async () => {
    await prisma.enrollment.updateMany({ where: { personId: s.worker }, data: { status: 'IN_PROGRESS' } })
    await prisma.automationLog.deleteMany({ where: { action: 'LEARNER_ASKED_TO_JOIN' } })
    as(WORKER)
    const r = await route(joinPost, 'POST', '/x', { tenant: s.maker.slug })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Finish a track first, then you can ask to join.')
  })

  it('another firm adopts a course, its learners live on its own record, and the creator reads counts only', async () => {
    const course = await prisma.course.findFirstOrThrow({ where: { companyId: s.maker.id, slug: 'working-in-the-ai-era:it-upgrade' }, select: { id: true } })
    await prisma.course.update({ where: { id: course.id }, data: { isPublic: true } })
    s.course = course.id
    as(ADOPTER)
    const a = await json(await adopt(req('POST', '/api/learn/adopt', { courseId: course.id, teamRef: 'Delivery', personIds: [s.adoptedPerson] })))
    expect(a.status, JSON.stringify(a.body)).toBe(201)
    expect(a.body.data.assigned).toBe(1)
    const e = await prisma.enrollment.findFirstOrThrow({ where: { courseId: course.id, personId: s.adoptedPerson } })
    expect(e.companyId).toBe(s.adopter)
    expect(e.adoptionId).toBe(a.body.data.id)
    await prisma.enrollment.update({ where: { id: e.id }, data: { status: 'COMPLETED' } })

    as(MAKER)
    const mine = await json(await adoptions(req('GET', '/api/learn/adoptions')))
    const row = mine.body.data.asCreator.find((x: any) => x.adopter)
    expect(row).toMatchObject({ named: false, started: 1, completed: 1 })
    expect(JSON.stringify(mine.body)).not.toContain('Ines Adopted')
    expect(JSON.stringify(mine.body)).not.toContain(s.adoptedPerson)

    as(ADOPTER)
    const theirs = await json(await adoptions(req('GET', '/api/learn/adoptions')))
    expect(theirs.body.data.asAdopter[0].learners).toEqual([{ name: 'Ines Adopted', status: 'COMPLETED' }])
    expect(theirs.body.data.asCreator).toEqual([])
  })

  it('the creator reads names only where the adoption grants named evidence', async () => {
    await prisma.courseAdoption.updateMany({ where: { courseId: s.course }, data: { grantsNamedEvidence: true } })
    as(MAKER)
    const r = await json(await adoptions(req('GET', '/api/learn/adoptions')))
    const row = r.body.data.asCreator[0]
    expect(row.named).toBe(true)
    expect(row.learners[0].name).toBe('Ines Adopted')
  })

  it('a firm cannot adopt its own course or the same course twice', async () => {
    as(MAKER)
    const own = await json(await adopt(req('POST', '/api/learn/adopt', { courseId: s.course })))
    expect(own.status).toBe(409)
    as(ADOPTER)
    const twice = await json(await adopt(req('POST', '/api/learn/adopt', { courseId: s.course })))
    expect(twice.status).toBe(409)
    expect(twice.body.error.message).toBe('Your firm has already adopted this course.')
  })

  it('a firm makes its own course from another supplier’s, keeping the source and its supplier, with no price', async () => {
    as(ADOPTER)
    const r = await json(await fromSource(req('POST', '/api/learn/courses/from-source', { sourceCourseId: s.course, title: 'Our own AI onboarding' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const c = await prisma.course.findUniqueOrThrow({ where: { id: r.body.data.id } })
    expect(c).toMatchObject({ companyId: s.adopter, sourceCourseId: s.course, sourceCompanyId: s.maker.id, price: null, isPublic: false })
  })

  it('the Training page’s door names the firm’s own learning address', async () => {
    as(MAKER)
    const r = await json(await trainingGet(req('GET', '/api/training')))
    expect(r.body.data.learnPath).toBe('/learn/world-brightmoor')
  })
})
