import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('next-auth/next', () => ({ getServerSession: async () => null }))
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as progressPost, GET as progressGet } from '@/app/api/learn/[tenant]/progress/route'
import { POST as credentialPost } from '@/app/api/learn/[tenant]/credential/route'
import { POST as pathPost, GET as queueGet } from '@/app/api/learn/paths/route'
import { PATCH as pathPatch } from '@/app/api/learn/paths/[id]/route'
import { PUT as videoPut, DELETE as videoDelete } from '@/app/api/learn/videos/route'
import { POST as adopt } from '@/app/api/learn/adopt/route'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { trackOf, lessonsOf } from '@/lib/training/courses/index'
import { routeFor } from '@/lib/training/courses/opening'
import { learnTenant, videoFor, readCredential } from '@/lib/training/learn-read'

const D = '@demo.etyme.local'
const MAKER = `world-brightmoor${D}`
const ADOPTER = `world-halcyon${D}`
const MENTOR = 'mara.mentor@seed.etyme.invalid'
const SECOND = 'sam.second@seed.etyme.invalid'
const WORKER = 'wren.worker@seed.etyme.invalid'
const ADOPTED = 'ines.adopted@seed.etyme.invalid'
const KEYS = lessonsOf(trackOf('it-upgrade')!).map((l) => l.lesson.key)
const LESSON = KEYS[0]
const s: Record<string, any> = {}
const route = async (fn: any, method: string, url: string, params: Record<string, string>, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve(params) }))
const plain = async (fn: any, method: string, url: string, body?: unknown) => json(await fn(req(method, url, body)))

describe('Phase 1 of the training plugin, door to record', () => {
  beforeAll(async () => {
    await freshWorld()
    s.maker = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, slug: true } })
    s.adopter = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-halcyon' }, select: { id: true, slug: true } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: s.maker.id, name: 'Recruiter' }, select: { id: true } })
    for (const [email, name, key] of [[MENTOR, 'Mara Mentor', 'mentor'], [SECOND, 'Sam Second', 'second']] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      await prisma.context.create({ data: { personId: p.id, companyId: s.maker.id, type: 'EMPLOYEE', side: 'SELL', roleId: role.id, grantReason: 'Recruiter' } })
      s[key] = p.id
    }
    as(MAKER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Wren Worker', email: WORKER, skills: ['Python'], location: 'Boise, ID', workAuth: 'US_CITIZEN' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.worker = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: WORKER }, select: { id: true } })).id
    const adopted = await prisma.person.create({ data: { name: 'Ines Adopted', primaryEmail: ADOPTED } })
    await prisma.context.create({ data: { personId: adopted.id, companyId: s.adopter.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
    s.adoptedPerson = adopted.id
    // The switch is the Owner's; this test database holds it on, as the existing suites do.
    await prisma.company.updateMany({ where: { id: { in: [s.maker.id, s.adopter.id] } }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
  }, 240_000)

  it('the opening answer routes to the firm’s own track and the firm’s learning site opens', async () => {
    expect(routeFor(s.maker.slug, 'it-upgrade')).toBe(`/learn/${s.maker.slug}/it-upgrade`)
    expect(await learnTenant(s.maker.slug)).toMatchObject({ id: s.maker.id })
  })

  it('a path made from her record is proposed under a named mentor and nothing is due or live yet', async () => {
    as(MAKER)
    const r = await plain(pathPost, 'POST', '/api/learn/paths', { personId: s.worker, mode: 'SYSTEM', mentorPersonId: s.mentor })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.path = r.body.data.id
    as(WORKER)
    const mine = await route(progressGet, 'GET', '/x?track=it-upgrade', { tenant: s.maker.slug })
    expect(mine.body.data.path).toMatchObject({ live: false, dueOn: null, stepDues: null })
  })

  it('the mentor sees the path in her queue, and a seat that is not the mentor sees none', async () => {
    as(MENTOR)
    const q = await plain(queueGet, 'GET', '/api/learn/paths')
    expect(q.body.data.map((x: any) => x.id)).toEqual([s.path])
    expect(q.body.data[0].learner).toBe('Wren Worker')
    as(SECOND)
    expect((await plain(queueGet, 'GET', '/api/learn/paths')).body.data).toEqual([])
  })

  it('the mentor sets the day the whole path and a lesson are due, and the path stays proposed', async () => {
    as(MENTOR)
    const r = await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'dates', dueOn: '2099-12-20', stepDues: { [LESSON]: '2099-12-04' } })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await prisma.learningPath.findUniqueOrThrow({ where: { id: s.path } })
    expect(row.state).toBe('PROPOSED')
    expect(row.dueOn?.toISOString().slice(0, 10)).toBe('2099-12-20')
    expect(row.stepDues).toEqual({ [LESSON]: '2099-12-04' })
    expect(await prisma.automationLog.count({ where: { companyId: s.maker.id, action: 'LEARNING_PATH_ADJUSTED' } })).toBeGreaterThan(0)
  })

  it('a date that is not a real day, a lesson not on the path, or a lesson due after the path is refused in a sentence', async () => {
    as(MENTOR)
    const bad = await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'dates', dueOn: '2099-02-30' })
    expect(bad.status).toBe(422)
    expect(bad.body.error.message).toMatch(/real day/)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'dates', stepDues: { 'no-such-lesson': '2099-12-04' } })).status).toBe(422)
    const after = await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'dates', dueOn: '2099-12-01' })
    expect(after.status).toBe(422)
    expect(after.body.error.message).toBe('A lesson cannot be due after the whole path is.')
    expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: s.path } })).dueOn?.toISOString().slice(0, 10)).toBe('2099-12-20')
  })

  it('the learner and a seat that is not the mentor cannot set dates, and the learner cannot pick her own mentor', async () => {
    as(WORKER)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'dates', dueOn: '2099-01-01' })).status).toBe(403)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'reassign', mentorPersonId: s.worker })).status).toBe(403)
    as(SECOND)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'dates', dueOn: '2099-01-01' })).status).toBe(403)
  })

  it('the mentor hands the path to another seat at the firm, never to the learner or to nobody, and back again', async () => {
    as(MENTOR)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'reassign', mentorPersonId: s.worker })).status).toBe(422)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'reassign', mentorPersonId: 'nobody' })).status).toBe(422)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'reassign', mentorPersonId: s.second })).status).toBe(200)
    expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: s.path } })).mentorPersonId).toBe(s.second)
    as(MENTOR)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'approve' })).status).toBe(403)
    as(SECOND)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'reassign', mentorPersonId: s.mentor })).status).toBe(200)
  })

  it('the mentor’s yes makes the path hers, and she reads what is due from it', async () => {
    as(MENTOR)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.path }, { move: 'approve' })).status).toBe(200)
    as(WORKER)
    const mine = await route(progressGet, 'GET', '/x?track=it-upgrade', { tenant: s.maker.slug })
    expect(mine.body.data.path).toMatchObject({ live: true, dueOn: '2099-12-20', stepDues: { [LESSON]: '2099-12-04' } })
  })

  it('a firm anchors a video link to a lesson with step spans and frames, and the lesson page reads it back without the server fetching the link', async () => {
    as(MAKER)
    const body = {
      trackKey: 'it-upgrade', lessonKey: LESSON, sourceUrl: 'https://videos.example/clip.mp4', startSec: 10, endSec: 200,
      steps: [{ step: 'intro', startSec: 10, endSec: 60 }, { step: 'example', startSec: 60, endSec: 120 }],
      frames: [{ step: 'intro', text: 'Say what you want.' }, { step: 'example', text: 'Read the answer.' }],
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await json(await videoPut(req('PUT', '/api/learn/videos', body)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const v = await videoFor(s.maker.id, 'it-upgrade', LESSON)
    expect(v).toMatchObject({ sourceUrl: 'https://videos.example/clip.mp4', startSec: 10, endSec: 200 })
    expect(v!.steps).toHaveLength(2)
    expect(v!.frames).toHaveLength(2)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    // Saying it again replaces it, never doubles it.
    await videoPut(req('PUT', '/api/learn/videos', { ...body, frames: [{ step: 'intro', text: 'Only one.' }] }))
    expect(await prisma.lessonVideo.count({ where: { companyId: s.maker.id, lessonKey: LESSON } })).toBe(1)
    expect((await videoFor(s.maker.id, 'it-upgrade', LESSON))!.frames).toHaveLength(1)
  })

  it('a video that is not an https link, or names a stored file, or a lesson not in the track, is refused in a sentence', async () => {
    as(MAKER)
    const put = (b: object) => plain(videoPut, 'PUT', '/api/learn/videos', { trackKey: 'it-upgrade', lessonKey: LESSON, ...b })
    expect((await put({ sourceUrl: 'http://videos.example/a.mp4' })).status).toBe(422)
    const stored = await put({ storedFileId: 'f1' })
    expect(stored.status).toBe(422)
    expect(stored.body.error.message).toMatch(/not offered yet/)
    expect((await put({ sourceUrl: 'https://videos.example/a.mp4', lessonKey: 'nope' })).status).toBe(404)
    expect((await videoFor(s.maker.id, 'it-upgrade', LESSON))!.sourceUrl).toBe('https://videos.example/clip.mp4')
  })

  it('a worker cannot anchor a video, and a firm reads only its own', async () => {
    as(WORKER)
    expect((await plain(videoPut, 'PUT', '/api/learn/videos', { trackKey: 'it-upgrade', lessonKey: LESSON, sourceUrl: 'https://videos.example/x.mp4' })).status).toBe(403)
    expect(await videoFor(s.adopter.id, 'it-upgrade', LESSON)).toBeNull()
  })

  it('a firm can take a video off a lesson and the lesson reads Video coming again', async () => {
    as(MAKER)
    const r = await plain(videoDelete, 'DELETE', '/api/learn/videos', { trackKey: 'it-upgrade', lessonKey: LESSON })
    expect(r.body.data.removed).toBe(1)
    expect(await videoFor(s.maker.id, 'it-upgrade', LESSON)).toBeNull()
  })

  it('a credential cannot be shown before the track is finished', async () => {
    as(WORKER)
    await route(progressPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', lessonKey: LESSON })
    const r = await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', action: 'show' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOT_COMPLETE')
    expect(await prisma.learnCredential.count()).toBe(0)
  })

  it('finishing the placeholder run lands the completion on her record, her path and the ledger', async () => {
    as(WORKER)
    let r: any
    for (const lessonKey of KEYS) r = await route(progressPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', lessonKey })
    expect(r.body.data.complete).toBe(true)
    const e = await prisma.enrollment.findFirstOrThrow({ where: { personId: s.worker, companyId: s.maker.id } })
    expect(e.status).toBe('COMPLETED')
    expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: s.path } })).state).toBe('COMPLETE')
    expect(await prisma.automationLog.count({ where: { companyId: s.maker.id, action: 'LEARNING_COMPLETED' } })).toBe(1)
    // A finished path owes nothing on her home.
    const mine = await route(progressGet, 'GET', '/x?track=it-upgrade', { tenant: s.maker.slug })
    expect(mine.body.data.path.state).toBe('COMPLETE')
    expect(mine.body.data.credential).toEqual({ shown: false })
  })

  it('a finished course has no public page until she says yes', async () => {
    const e = await prisma.enrollment.findFirstOrThrow({ where: { personId: s.worker, companyId: s.maker.id } })
    expect(await prisma.learnCredential.count({ where: { enrollmentId: e.id } })).toBe(0)
    expect(await readCredential(s.maker.slug, 'anything')).toEqual({ ok: false, reason: 'NO_SUCH_CODE' })
  })

  it('her yes puts the page up, checked against the record, with the course, the firm, the date and her name', async () => {
    as(WORKER)
    const r = await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', action: 'show' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.code = r.body.data.code
    expect(r.body.data.address).toBe(`/learn/${s.maker.slug}/credential/${s.code}`)
    const read = await readCredential(s.maker.slug, s.code)
    expect(read.ok).toBe(true)
    if (read.ok) {
      expect(read.view).toMatchObject({ issuer: expect.any(String), learnerName: 'Wren Worker', code: s.code })
      expect(read.view.courseTitle).toContain('IT')
      expect(read.view.completedAt).toBeInstanceOf(Date)
      expect(read.view.courseTitle).not.toContain('Tapin')
    }
    const home = await route(progressGet, 'GET', '/x?track=it-upgrade', { tenant: s.maker.slug })
    expect(home.body.data.credential).toMatchObject({ shown: true, code: s.code })
  })

  it('the same id read at another firm’s address, or with a wrong id, shows nothing', async () => {
    expect(await readCredential(s.adopter.slug, s.code)).toEqual({ ok: false, reason: 'OTHER_FIRM' })
    expect(await readCredential(s.maker.slug, `${s.code}x`)).toEqual({ ok: false, reason: 'NO_SUCH_CODE' })
  })

  it('a firm whose plugin is off reads as no page, and the page comes back when it is on again', async () => {
    await prisma.company.update({ where: { id: s.maker.id }, data: { pluginsOn: [] } })
    expect(await readCredential(s.maker.slug, s.code)).toEqual({ ok: false, reason: 'PLUGIN_OFF' })
    await prisma.company.update({ where: { id: s.maker.id }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    expect((await readCredential(s.maker.slug, s.code)).ok).toBe(true)
  })

  it('an enrollment that is not complete shows nothing even where a row says it is shown', async () => {
    const e = await prisma.enrollment.findFirstOrThrow({ where: { personId: s.worker, companyId: s.maker.id } })
    await prisma.enrollment.update({ where: { id: e.id }, data: { status: 'IN_PROGRESS' } })
    expect(await readCredential(s.maker.slug, s.code)).toEqual({ ok: false, reason: 'NOT_COMPLETE' })
    await prisma.enrollment.update({ where: { id: e.id }, data: { status: 'COMPLETED' } })
  })

  it('only she can show or take it down: a colleague or a visitor cannot', async () => {
    as(MENTOR)
    const other = await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', action: 'revoke' })
    expect(other.status).toBe(404)
    expect((await readCredential(s.maker.slug, s.code)).ok).toBe(true)
    delete process.env.DEV_BYPASS_AUTH
    expect((await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', action: 'revoke' })).status).toBe(401)
  })

  it('she takes it down and the old address is dead, and showing it again issues a new id', async () => {
    as(WORKER)
    expect((await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', action: 'revoke' })).status).toBe(200)
    expect(await readCredential(s.maker.slug, s.code)).toEqual({ ok: false, reason: 'REVOKED' })
    expect((await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', action: 'revoke' })).status).toBe(409)
    const again = await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: 'it-upgrade', action: 'show' })
    expect(again.status).toBe(201)
    expect(again.body.data.code).not.toBe(s.code)
    expect(await readCredential(s.maker.slug, s.code)).toEqual({ ok: false, reason: 'NO_SUCH_CODE' })
    expect((await readCredential(s.maker.slug, again.body.data.code)).ok).toBe(true)
  })

  it('adopting a course gives each assigned person a proposed path under a named mentor, due on the day given', async () => {
    const course = await prisma.course.findFirstOrThrow({ where: { companyId: s.maker.id, slug: 'working-in-the-ai-era:it-upgrade' }, select: { id: true } })
    await prisma.course.update({ where: { id: course.id }, data: { isPublic: true } })
    as(ADOPTER)
    const bad = await plain(adopt, 'POST', '/api/learn/adopt', { courseId: course.id, personIds: [s.adoptedPerson], dueOn: '2099-13-40' })
    expect(bad.status).toBe(422)
    expect(await prisma.courseAdoption.count({ where: { courseId: course.id } })).toBe(0)
    const a = await plain(adopt, 'POST', '/api/learn/adopt', { courseId: course.id, personIds: [s.adoptedPerson], dueOn: '2099-11-30' })
    expect(a.status, JSON.stringify(a.body)).toBe(201)
    expect(a.body.data).toMatchObject({ assigned: 1, paths: 1 })
    const p = await prisma.learningPath.findFirstOrThrow({ where: { personId: s.adoptedPerson, companyId: s.adopter.id } })
    expect(p).toMatchObject({ state: 'PROPOSED', courseId: course.id })
    expect(p.dueOn?.toISOString().slice(0, 10)).toBe('2099-11-30')
    expect(p.mentorPersonId).not.toBe(s.adoptedPerson)
    expect(p.enrollmentId).not.toBeNull()
    expect(p.steps).toEqual(KEYS)
    s.adoptedPath = p.id
  })

  it('an adopted learner reads what is due from her path once her mentor says yes, and not before', async () => {
    as(ADOPTED)
    const before = await route(progressGet, 'GET', '/x?track=it-upgrade', { tenant: s.adopter.slug })
    expect(before.body.data.path).toMatchObject({ live: false, dueOn: null })
    as(ADOPTER)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.adoptedPath }, { move: 'approve' })).status).toBe(200)
    as(ADOPTED)
    const after = await route(progressGet, 'GET', '/x?track=it-upgrade', { tenant: s.adopter.slug })
    expect(after.body.data.path).toMatchObject({ live: true, dueOn: '2099-11-30' })
  })

  it('a person named as her own mentor on adoption is assigned the course and given no path', async () => {
    const course = await prisma.course.findFirstOrThrow({ where: { companyId: s.maker.id, slug: 'working-in-the-ai-era:it-upgrade' }, select: { id: true } })
    await prisma.courseAdoption.deleteMany({ where: { courseId: course.id } })
    await prisma.learningPath.deleteMany({ where: { companyId: s.adopter.id } })
    as(ADOPTER)
    const a = await plain(adopt, 'POST', '/api/learn/adopt', { courseId: course.id, personIds: [s.adoptedPerson], mentorPersonId: s.adoptedPerson })
    expect(a.status).toBe(201)
    expect(a.body.data).toMatchObject({ assigned: 1, paths: 0 })
  })
})
