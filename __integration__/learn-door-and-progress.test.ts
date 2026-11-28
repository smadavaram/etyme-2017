import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('next-auth/next', () => ({ getServerSession: async () => null }))
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as progressPost } from '@/app/api/learn/[tenant]/progress/route'
import { GET as mineGet } from '@/app/api/learn/[tenant]/mine/route'
import { POST as badgesPost } from '@/app/api/learn/[tenant]/badges/route'
import { POST as readyPost } from '@/app/api/learn/[tenant]/ready/route'
import { POST as pathPost, GET as queueGet } from '@/app/api/learn/paths/route'
import { PATCH as pathPatch } from '@/app/api/learn/paths/[id]/route'
import { POST as teamPost } from '@/app/api/learn/paths/team/route'
import { GET as boardGet } from '@/app/api/learn/cohort-board/route'
import { GET as rankingGet, PATCH as rankingPatch } from '@/app/api/learn/ranking/route'
import { POST as addConsultant } from '@/app/api/consultants/route'
import { proposeTeamPaths } from '@/lib/training/paths/team-db'
import { trackOf, lessonsOf } from '@/lib/training/courses/index'

const D = '@demo.etyme.local'
const MAKER = `world-brightmoor${D}`
const CLIENT = `world-harlow-health${D}`
const MENTOR = 'mara.mentor@door.etyme.invalid'
const WREN = 'wren.worker@door.etyme.invalid'
const CY = 'cy.worker@door.etyme.invalid'
const track = trackOf('it-upgrade')!
const flat = lessonsOf(track)
const KEYS = flat.map((l) => l.lesson.key)
const SKILL = flat[0].lesson.introduces[0]
const LEVEL0 = track.levels[0].chapters.flatMap((c) => c.lessons.map((l) => l.key))
const s: Record<string, any> = {}
const route = async (fn: any, method: string, url: string, params: Record<string, string>, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve(params) }))
const learn = (who: string, keys: string[]) => keys.reduce(async (p, k) => { await p; as(who); await route(progressPost, 'POST', '/x', { tenant: s.slug }, { track: 'it-upgrade', lessonKey: k }) }, Promise.resolve())
const mine = async (who: string, q = '') => { as(who); return route(mineGet, 'GET', `/x${q}`, { tenant: s.slug }) }

describe('the door and the progress mechanics, on the one record', () => {
  beforeAll(async () => {
    await freshWorld()
    const maker = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, slug: true } })
    s.id = maker.id; s.slug = maker.slug
    await prisma.company.update({ where: { id: maker.id }, data: { pluginsOn: ['TRAIN_TO_BENCH'] } })
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: maker.id, name: 'Recruiter' }, select: { id: true } })
    const mentor = await prisma.person.create({ data: { name: 'Mara Mentor', primaryEmail: MENTOR } })
    await prisma.context.create({ data: { personId: mentor.id, companyId: maker.id, type: 'EMPLOYEE', side: 'SELL', roleId: role.id, grantReason: 'Recruiter' } })
    s.mentor = mentor.id
    as(MAKER)
    for (const [name, email] of [['Wren Worker', WREN], ['Cy Worker', CY]]) {
      const r = await json(await addConsultant(req('POST', '/api/consultants', { name, email, skills: ['Python'], location: 'Boise, ID', workAuth: 'US_CITIZEN' })))
      expect(r.status, JSON.stringify(r.body)).toBe(201)
    }
    s.wren = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: WREN }, select: { id: true } })).id
    s.cy = (await prisma.person.findFirstOrThrow({ where: { primaryEmail: CY }, select: { id: true } })).id
    s.owner = (await prisma.context.findFirstOrThrow({ where: { companyId: maker.id, role: { name: 'Owner' }, revokedAt: null }, select: { personId: true } })).personId
    const job = (title: string, skills: string[], companyId = maker.id) => prisma.requirement.create({ data: { companyId, title, skills, status: 'OPEN', approvalState: 'APPROVED', headcount: 1, raisedById: s.owner, ownerId: s.owner } })
    s.job = await job('Data engineer', [SKILL])
    s.welder = await job('Pipe welder', ['welding'])
    const harlow = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-harlow-health' }, select: { id: true } })
    s.otherJob = await job('Nurse', [SKILL], harlow.id)
  }, 240_000)

  // ── The door: a job's skills make a path ────────────────────────────
  it('a job-ready path names its job and waits for the mentor before it is hers', async () => {
    as(MAKER)
    const r = await json(await pathPost(req('POST', '/api/learn/paths', { personId: s.wren, mode: 'SYSTEM', requirementId: s.job.id, mentorPersonId: s.mentor })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const row = await prisma.learningPath.findUniqueOrThrow({ where: { id: r.body.data.id } })
    expect(row).toMatchObject({ state: 'PROPOSED', generationType: 'SYSTEM', sourceKind: 'JOB', sourceRefId: s.job.id, sourceLabel: 'Made from the job: Data engineer', mentorPersonId: s.mentor })
    expect((row.steps as string[])).toContain(flat[0].lesson.key)
    as(WREN)
    const hers = await route((await import('@/app/api/learn/[tenant]/progress/route')).GET, 'GET', '/x?track=it-upgrade', { tenant: s.slug })
    expect(hers.body.data.path).toMatchObject({ state: 'PROPOSED', live: false, steps: null })
    s.jobPath = row.id
  })

  it('the mentor sees the job on the proposal and her yes makes it live', async () => {
    as(MENTOR)
    const q = await json(await queueGet(req('GET', '/api/learn/paths')))
    expect(q.body.data.find((x: any) => x.id === s.jobPath).source).toBe('Made from the job: Data engineer')
    const y = await route(pathPatch, 'PATCH', '/x', { id: s.jobPath }, { move: 'approve' })
    expect(y.status).toBe(200)
  })

  it('a job whose skills nothing in the course teaches makes no path and says so', async () => {
    as(MAKER)
    const before = await prisma.learningPath.count()
    const r = await json(await pathPost(req('POST', '/api/learn/paths', { personId: s.wren, mode: 'SYSTEM', requirementId: s.welder.id, mentorPersonId: s.mentor })))
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('NO_PATH')
    expect(await prisma.learningPath.count()).toBe(before)
  })

  it('a job another firm owns cannot be turned into a path', async () => {
    as(MAKER)
    const r = await json(await pathPost(req('POST', '/api/learn/paths', { personId: s.wren, mode: 'SYSTEM', requirementId: s.otherJob.id, mentorPersonId: s.mentor })))
    expect(r.status).toBe(404)
  })

  // ── The door: an applicant's own yes ────────────────────────────────
  it('routing an applicant into a path writes nothing without her yes', async () => {
    const before = await prisma.learningPath.count()
    as(CY)
    for (const body of [{}, { yes: false }, { yes: 'true' }]) {
      const r = await route(readyPost, 'POST', '/x', { tenant: s.slug }, body)
      expect(r.status).toBe(422)
    }
    expect(await prisma.learningPath.count()).toBe(before)
  })

  it('with her yes a path is proposed, carries her consent, and her application is never touched', async () => {
    const counts = async () => ({ sub: await prisma.submission.count(), lead: await prisma.lead.count(), req: await prisma.requirement.count() })
    const before = await counts()
    as(CY)
    const r = await route(readyPost, 'POST', '/x', { tenant: s.slug }, { yes: true, jobId: s.job.id })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const row = await prisma.learningPath.findUniqueOrThrow({ where: { id: r.body.data.id } })
    expect(row).toMatchObject({ personId: s.cy, sourceKind: 'DOOR', state: 'PROPOSED', mentorPersonId: null })
    expect(row.consentedAt).not.toBeNull()
    expect(await counts()).toEqual(before)
    s.doorPath = row.id
  })

  it('asking twice does not make a second path', async () => {
    as(CY)
    const before = await prisma.learningPath.count()
    const r = await route(readyPost, 'POST', '/x', { tenant: s.slug }, { yes: true })
    expect(r.status).toBe(200)
    expect(await prisma.learningPath.count()).toBe(before)
  })

  it('a path from the door waits for a mentor, and nobody can say yes to it before one is named', async () => {
    as(MAKER)
    const q = await json(await queueGet(req('GET', '/api/learn/paths')))
    expect(q.body.data.find((x: any) => x.id === s.doorPath)).toMatchObject({ needsMentor: true })
    const no = await route(pathPatch, 'PATCH', '/x', { id: s.doorPath }, { move: 'approve' })
    expect(no.status).toBe(403)
    expect((await prisma.learningPath.findUniqueOrThrow({ where: { id: s.doorPath } })).state).toBe('PROPOSED')
    const take = await route(pathPatch, 'PATCH', '/x', { id: s.doorPath }, { move: 'reassign', mentorPersonId: 'me' })
    expect(take.status, JSON.stringify(take.body)).toBe(200)
  })

  it('the client company never reads a learning path, because the learning routes are not offered to it', async () => {
    as(CLIENT)
    const q = await json(await queueGet(req('GET', '/api/learn/paths')))
    expect(q.status).toBe(403)
  })

  // ── Pods ────────────────────────────────────────────────────────────
  it('team paths are refused while Project teams is off, and the plugin stays off', async () => {
    as(MAKER)
    const r = await json(await teamPost(req('POST', '/api/learn/paths/team', { podId: 'any' })))
    expect(r.status).toBe(403)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.id } })).pluginsOn).toEqual(['TRAIN_TO_BENCH'])
  })

  it('a team’s skill gaps become one proposed path per member, each naming the team, and a role with no skills makes none', async () => {
    const pod = await prisma.pod.create({ data: { companyId: s.id, name: 'Data team', pricing: 'RATE_CARD' } })
    const withSkills = await prisma.podRole.create({ data: { podId: pod.id, title: 'Engineer', skills: [SKILL] } })
    const bare = await prisma.podRole.create({ data: { podId: pod.id, title: 'Lead' } })
    await prisma.podMember.create({ data: { podRoleId: withSkills.id, personId: s.wren } })
    await prisma.podMember.create({ data: { podRoleId: bare.id, personId: s.cy } })
    const r = await proposeTeamPaths({ companyId: s.id, podId: pod.id, mentorPersonId: s.mentor, trackKey: 'it-upgrade' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.made).toHaveLength(1)
    expect(r.skipped.find((x) => x.personId === s.cy)!.why).toBe('Her role lists no skills.')
    const row = await prisma.learningPath.findUniqueOrThrow({ where: { id: r.made[0].pathId } })
    expect(row).toMatchObject({ personId: s.wren, state: 'PROPOSED', sourceKind: 'POD', sourceRefId: pod.id, sourceLabel: 'Made from the team: Data team', mentorPersonId: s.mentor })
    const again = await proposeTeamPaths({ companyId: s.id, podId: pod.id, mentorPersonId: s.mentor, trackKey: 'it-upgrade' })
    expect(again.ok && again.made).toHaveLength(0)
  })

  // ── Points, streak, badges ──────────────────────────────────────────
  it('points and the weekly streak are read from the record after a lesson', async () => {
    await learn(WREN, [KEYS[0]])
    const m = await mine(WREN)
    expect(m.status).toBe(200)
    expect(m.body.data.points).toBe(15)
    expect(m.body.data.streak.current).toBe(1)
    expect((await prisma.enrollment.findFirstOrThrow({ where: { personId: s.wren, trackKey: 'it-upgrade' } })).activityWeeks).toHaveLength(1)
  })

  it('a person reads only her own points, whoever she asks about', async () => {
    const m = await mine(CY, `?personId=${s.wren}`)
    expect(m.body.data.points).toBe(0)
  })

  it('finishing a level earns its badge once, and finishing the course earns the course badge', async () => {
    await learn(WREN, LEVEL0)
    let b = await prisma.learnBadge.findMany({ where: { personId: s.wren }, orderBy: { kind: 'asc' } })
    expect(b.map((x) => `${x.kind}:${x.levelKey}`)).toEqual(['LEVEL:simple'])
    await learn(WREN, KEYS)
    await learn(WREN, [KEYS[0]])
    b = await prisma.learnBadge.findMany({ where: { personId: s.wren } })
    expect(b.filter((x) => x.kind === 'LEVEL')).toHaveLength(track.levels.length)
    expect(b.filter((x) => x.kind === 'COURSE')).toHaveLength(1)
  })

  it('a badge is hers, not shown until she says so, and cannot be shared before', async () => {
    const m = await mine(WREN)
    const badge = m.body.data.badges.find((x: any) => x.words.startsWith('Finished'))
    expect(badge.shown).toBe(false)
    s.badge = badge.id
    as(WREN)
    const early = await route(badgesPost, 'POST', '/x', { tenant: s.slug }, { badgeId: s.badge, action: 'share' })
    expect(early.status).toBe(409)
  })

  it('sharing a badge is her own press: it returns a LinkedIn address, posts nothing, and is ledgered', async () => {
    as(WREN)
    expect((await route(badgesPost, 'POST', '/x', { tenant: s.slug }, { badgeId: s.badge, action: 'show' })).status).toBe(200)
    const before = await prisma.automationLog.count({ where: { companyId: s.id, action: 'BADGE_SHARED' } })
    const r = await route(badgesPost, 'POST', '/x', { tenant: s.slug }, { badgeId: s.badge, action: 'share' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.url).toMatch(/^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/)
    expect(await prisma.automationLog.count({ where: { companyId: s.id, action: 'BADGE_SHARED' } })).toBe(before + 1)
  })

  it('nobody else can show, hide or share her badge, and the refusal is on the access log', async () => {
    as(CY)
    const before = await prisma.accessLog.count()
    const r = await route(badgesPost, 'POST', '/x', { tenant: s.slug }, { badgeId: s.badge, action: 'hide' })
    expect(r.status).toBe(404)
    expect(await prisma.accessLog.count()).toBe(before + 1)
    expect((await prisma.learnBadge.findUniqueOrThrow({ where: { id: s.badge } })).shownAt).not.toBeNull()
  })

  it('a week with no learning resets the streak quietly and takes nothing from her points or badges', async () => {
    const before = (await mine(WREN)).body.data
    await prisma.enrollment.updateMany({ where: { personId: s.wren }, data: { activityWeeks: ['2025-W01', '2025-W02', '2025-W03'] } })
    const after = (await mine(WREN)).body.data
    expect(after.streak.current).toBe(0)
    expect(after.streak.longest).toBe(3)
    expect(after.streak.says).not.toMatch(/lost|lose|broke|miss|warn|penalt/i)
    expect(after.points).toBe(before.points)
    expect(after.badges).toHaveLength(before.badges.length)
  })

  // ── Cohort board and the ranking ────────────────────────────────────
  it('ranking is off by default, so a learner in a cohort reads no place', async () => {
    const course = await prisma.course.findFirstOrThrow({ where: { companyId: s.id, trackKey: 'it-upgrade' }, select: { id: true } })
    const cohort = await prisma.cohort.create({ data: { companyId: s.id, courseId: course.id, name: 'Winter cohort', startsOn: new Date('2026-12-01T00:00:00Z'), trainerPersonId: s.mentor } })
    s.cohort = cohort.id
    await learn(CY, [KEYS[0], KEYS[1]])
    await prisma.enrollment.updateMany({ where: { personId: { in: [s.wren, s.cy] }, trackKey: 'it-upgrade' }, data: { cohortId: cohort.id } })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.id } })).learnRankingOn).toBe(false)
    const m = await mine(CY)
    expect(m.body.data.ranking).toEqual({ on: false, place: null })
  })

  it('the mentor reads the cohort board with names, points, weeks and badges', async () => {
    as(MENTOR)
    const r = await json(await boardGet(req('GET', '/api/learn/cohort-board')))
    expect(r.status).toBe(200)
    const board = r.body.data.find((c: any) => c.cohortId === s.cohort)
    expect(board.rows.map((x: any) => x.name)).toEqual(['Wren Worker', 'Cy Worker'])
    expect(board.rows[1]).toMatchObject({ points: 30, badges: 0 })
  })

  it('a learner is refused the cohort board', async () => {
    as(CY)
    const r = await json(await boardGet(req('GET', '/api/learn/cohort-board')))
    expect(r.status).toBe(403)
  })

  it('only the Owner turns the ranking on', async () => {
    as(MENTOR)
    const no = await json(await rankingPatch(req('PATCH', '/api/learn/ranking', { on: true })))
    expect(no.status).toBe(403)
    as(WREN)
    expect((await json(await rankingPatch(req('PATCH', '/api/learn/ranking', { on: true })))).status).toBe(403)
    expect((await prisma.company.findUniqueOrThrow({ where: { id: s.id } })).learnRankingOn).toBe(false)
    as(MAKER)
    const ok = await json(await rankingPatch(req('PATCH', '/api/learn/ranking', { on: true })))
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(await prisma.automationLog.count({ where: { companyId: s.id, action: 'LEARN_RANKING_SWITCHED' } })).toBe(1)
    expect((await json(await rankingGet(req('GET', '/api/learn/ranking')))).body.data.on).toBe(true)
  })

  it('with the ranking on a learner reads her own place and the size of her cohort and no other name', async () => {
    const m = await mine(CY)
    expect(m.body.data.ranking).toEqual({ on: true, place: { place: 2, of: 2 } })
    expect(JSON.stringify(m.body.data)).not.toMatch(/Wren/)
  })

  it('a learner in no cohort reads no place even with the ranking on', async () => {
    await prisma.enrollment.updateMany({ where: { personId: s.cy }, data: { cohortId: null } })
    const m = await mine(CY)
    expect(m.body.data.ranking.place).toBeNull()
  })
})
