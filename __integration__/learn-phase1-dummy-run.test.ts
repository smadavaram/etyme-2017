import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('next-auth/next', () => ({ getServerSession: async () => null }))
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as progressPost, GET as progressGet } from '@/app/api/learn/[tenant]/progress/route'
import { POST as credentialPost } from '@/app/api/learn/[tenant]/credential/route'
import { POST as pathPost } from '@/app/api/learn/paths/route'
import { PATCH as pathPatch } from '@/app/api/learn/paths/[id]/route'
import { PUT as videoPut } from '@/app/api/learn/videos/route'
import { POST as adopt } from '@/app/api/learn/adopt/route'
import { GET as adoptions } from '@/app/api/learn/adoptions/route'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { COURSES } from '@/lib/training/courses/index'
import type { Track } from '@/lib/training/courses/types'
import { routeFor } from '@/lib/training/courses/opening'
import { publicSite } from '@/lib/public-site'
import { learnTenant, videoFor, readCredential } from '@/lib/training/learn-read'

/**
 * Phase 1 of the training plugin, proved with a placeholder course that lives
 * in this file only. It is added to the course list for the length of the run
 * and taken out again; nothing shipped is changed and no content is written.
 */
const PLACEHOLDER: Track = {
  key: 'non-it', title: 'Placeholder track', goodAt: ['Check the plumbing'], placeholder: true,
  levels: [{
    key: 'simple', title: 'Placeholder level',
    project: { key: 'p', title: 'Placeholder project', checklist: ['One item'] },
    chapters: [{
      key: 'c1', title: 'Placeholder chapter',
      lessons: [{
        key: 'placeholder-lesson', title: 'Placeholder lesson', intro: 'This lesson only proves the plumbing.', introduces: [], uses: [],
        example: { text: 'An example.' },
        tryIt: { prompt: 'Type a word.', starter: '', rules: [{ kind: 'minWords', value: 1, says: 'Type one word.' }], expected: 'word' },
        exercise: { question: 'Is this a placeholder?', choices: ['Yes', 'No'], correctIndex: 0, reason: 'It is.' },
      }],
    }],
  }],
}
const TRACK = 'non-it'
const LESSON = 'placeholder-lesson'
const D = '@demo.etyme.local'
const MAKER = `world-brightmoor${D}`
const ADOPTER = `world-halcyon${D}`
const MENTOR = 'dummy.mentor@seed.etyme.invalid'
const WORKER = 'dummy.worker@seed.etyme.invalid'
const ADOPTED = 'dummy.adopted@seed.etyme.invalid'
const s: Record<string, any> = {}
const route = async (fn: any, method: string, url: string, params: Record<string, string>, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve(params) }))
const plain = async (fn: any, method: string, url: string, body?: unknown) => json(await fn(req(method, url, body)))

describe('Phase 1 dummy run: door, routing, generated path, placeholder lesson, record', () => {
  beforeAll(async () => {
    COURSES[0].tracks.push(PLACEHOLDER)
    await freshWorld()
    s.maker = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, slug: true } })
    s.adopter = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-halcyon' }, select: { id: true, slug: true } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: s.maker.id, name: 'Recruiter' }, select: { id: true } })
    const mentor = await prisma.person.create({ data: { name: 'Dina Mentor', primaryEmail: MENTOR } })
    await prisma.context.create({ data: { personId: mentor.id, companyId: s.maker.id, type: 'EMPLOYEE', side: 'SELL', roleId: role.id, grantReason: 'Recruiter' } })
    s.mentor = mentor.id
    as(MAKER)
    const r = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Dara Worker', email: WORKER, skills: ['Python'], location: 'Boise, ID', workAuth: 'US_CITIZEN' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    s.worker = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: WORKER }, select: { id: true } })).id
    const adopted = await prisma.person.create({ data: { name: 'Ivo Adopted', primaryEmail: ADOPTED } })
    await prisma.context.create({ data: { personId: adopted.id, companyId: s.adopter.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
    s.adoptedPerson = adopted.id
  }, 240_000)

  afterAll(() => {
    const i = COURSES[0].tracks.indexOf(PLACEHOLDER)
    if (i >= 0) COURSES[0].tracks.splice(i, 1)
  })

  it('a visitor goes through the door, picks a track, gets a generated path, finishes the placeholder lesson and the completion lands on her record', async () => {
    // Door: absent with the plugin off, present with it on. The firm's page is made to render first
    // (the Owner's switches; this test database sets them directly).
    await prisma.company.update({ where: { id: s.maker.id }, data: { pluginsOn: ['WEBSITE'], siteLiveAt: new Date(), claimedAt: new Date() } })
    expect((await publicSite(s.maker.slug))!.learnOpen).toBe(false)
    expect(await learnTenant(s.maker.slug)).toBeNull()
    await prisma.company.updateMany({ where: { id: { in: [s.maker.id, s.adopter.id] } }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    await prisma.company.update({ where: { id: s.maker.id }, data: { pluginsOn: ['WEBSITE', 'TRAIN_TO_BENCH'] } })
    expect((await publicSite(s.maker.slug))!.learnOpen).toBe(true)
    expect(await learnTenant(s.maker.slug)).toMatchObject({ id: s.maker.id })

    // Opening question routes the answer; an unknown answer goes nowhere.
    expect(routeFor(s.maker.slug, TRACK)).toBe(`/learn/${s.maker.slug}/${TRACK}`)
    expect(routeFor(s.maker.slug, 'catalog')).toBeNull()

    // A visitor with no session writes nothing.
    delete process.env.DEV_BYPASS_AUTH
    const before = await prisma.enrollment.count()
    expect((await route(progressPost, 'POST', '/x', { tenant: s.maker.slug }, { track: TRACK, lessonKey: LESSON })).status).toBe(401)
    expect(await prisma.enrollment.count()).toBe(before)

    // System-generated path, with its provenance.
    as(MAKER)
    const sys = await plain(pathPost, 'POST', '/api/learn/paths', { personId: s.worker, mode: 'SYSTEM', trackKey: TRACK, mentorPersonId: s.mentor })
    expect(sys.status, JSON.stringify(sys.body)).toBe(201)
    expect(sys.body.data).toMatchObject({ state: 'PROPOSED', madeBy: 'RULES', steps: [LESSON] })
    const sysRow = await prisma.learningPath.findUniqueOrThrow({ where: { id: sys.body.data.id } })
    expect(sysRow).toMatchObject({ generationType: 'SYSTEM', sourcePrompt: null, mentorPersonId: s.mentor, state: 'PROPOSED' })
    expect(sysRow.sourceSignals).not.toBeNull()

    // Prompt-generated path: the gateway is not configured, so the rules answer, and the row says so.
    const pr = await plain(pathPost, 'POST', '/api/learn/paths', { personId: s.worker, mode: 'PROMPT', prompt: 'Get her ready for the plumbing work', trackKey: TRACK, mentorPersonId: s.mentor })
    expect(pr.status, JSON.stringify(pr.body)).toBe(201)
    expect(pr.body.data.madeBy).toBe('RULES')
    const prRow = await prisma.learningPath.findUniqueOrThrow({ where: { id: pr.body.data.id } })
    expect(prRow).toMatchObject({ generationType: 'PROMPT', sourcePrompt: 'Get her ready for the plumbing work' })
    expect(prRow.steps).toEqual([LESSON])
    const proposed = await prisma.automationLog.findMany({ where: { companyId: s.maker.id, action: 'LEARNING_PATH_PROPOSED' }, select: { payload: true } })
    expect(proposed.map((p: any) => p.payload.by)).toEqual(['RULES', 'RULES'])
    s.sysPath = sys.body.data.id

    // Mentor assigned and approving; until then nothing is live for her.
    as(WORKER)
    expect((await route(progressGet, 'GET', `/x?track=${TRACK}`, { tenant: s.maker.slug })).body.data.path).toMatchObject({ live: false, steps: null })
    as(MENTOR)
    expect((await route(pathPatch, 'PATCH', '/x', { id: s.sysPath }, { move: 'approve' })).status).toBe(200)
    as(WORKER)
    const live = await route(progressGet, 'GET', `/x?track=${TRACK}`, { tenant: s.maker.slug })
    expect(live.body.data.path).toMatchObject({ live: true, steps: [LESSON], mentorName: 'Dina Mentor', generationType: 'SYSTEM' })

    // Video anchor on the placeholder lesson, never fetched by the server.
    as(MAKER)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const v = await plain(videoPut, 'PUT', '/api/learn/videos', {
      trackKey: TRACK, lessonKey: LESSON, sourceUrl: 'https://videos.example/placeholder.mp4', startSec: 0, endSec: 30,
      steps: [{ step: 'intro', startSec: 0, endSec: 10 }], frames: [{ step: 'intro', text: 'Plumbing frame.' }],
    })
    expect(v.status, JSON.stringify(v.body)).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    expect(await videoFor(s.maker.id, TRACK, LESSON)).toMatchObject({ sourceUrl: 'https://videos.example/placeholder.mp4' })

    // Completion as a signed-in worker writes the record, her path and the ledger.
    as(WORKER)
    const done = await route(progressPost, 'POST', '/x', { tenant: s.maker.slug }, { track: TRACK, lessonKey: LESSON })
    expect(done.body.data.complete).toBe(true)
    const e = await prisma.enrollment.findFirstOrThrow({ where: { personId: s.worker, companyId: s.maker.id } })
    expect(e).toMatchObject({ status: 'COMPLETED', trackKey: TRACK })
    expect(e.completedAt).not.toBeNull()
    expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: s.sysPath } })).state).toBe('COMPLETE')
    expect(await prisma.automationLog.count({ where: { companyId: s.maker.id, action: 'LEARNING_COMPLETED' } })).toBe(1)

    // No public page until her yes; then it is public and its id checks against the record.
    expect(await prisma.learnCredential.count({ where: { enrollmentId: e.id } })).toBe(0)
    const shown = await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: TRACK, action: 'show' })
    expect(shown.status, JSON.stringify(shown.body)).toBe(201)
    s.code = shown.body.data.code
    const read = await readCredential(s.maker.slug, s.code)
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.view).toMatchObject({ learnerName: 'Dara Worker', code: s.code })
    expect(await readCredential(s.adopter.slug, s.code)).toEqual({ ok: false, reason: 'OTHER_FIRM' })

    // Revocation hides it.
    expect((await route(credentialPost, 'POST', '/x', { tenant: s.maker.slug }, { track: TRACK, action: 'revoke' })).status).toBe(200)
    expect(await readCredential(s.maker.slug, s.code)).toEqual({ ok: false, reason: 'REVOKED' })

    // Adoption by a second tenant: the maker sees counts only, no name and no person id.
    const course = await prisma.course.findFirstOrThrow({ where: { companyId: s.maker.id, trackKey: TRACK }, select: { id: true } })
    await prisma.course.update({ where: { id: course.id }, data: { isPublic: true } })
    as(ADOPTER)
    const a = await plain(adopt, 'POST', '/api/learn/adopt', { courseId: course.id, personIds: [s.adoptedPerson] })
    expect(a.status, JSON.stringify(a.body)).toBe(201)
    expect(a.body.data).toMatchObject({ assigned: 1, paths: 1 })
    as(MAKER)
    const seen = await plain(adoptions, 'GET', '/api/learn/adoptions')
    expect(seen.body.data.asCreator).toHaveLength(1)
    expect(seen.body.data.asCreator[0]).toMatchObject({ named: false, started: 1, completed: 0 })
    const text = JSON.stringify(seen.body.data.asCreator)
    expect(text).not.toContain('Ivo Adopted')
    expect(text).not.toContain(s.adoptedPerson)
  }, 120_000)
})
