import { describe, it, expect } from 'vitest'
import { readSegmentDefinition, segmentMatches, describeSegment, type SegmentDefinition } from '@/lib/outreach/segment-rules'
import {
  podCapacity, engagementEnded, cohortCompleted, jobUnfilled, benchMatchesDemand, repeatVisits, completionShared, contractEnding, quietSince,
  OUTCOME_PROOF_FLOOR, TRIPWIRE_KINDS,
} from '@/lib/outreach/tripwire-rules'
import { AIMS, aimsFor, matchSegment, pickContent, draftByRules, draftRefusal, modelDraftOk, pageOf } from '@/lib/outreach/match-rules'
import { packFits, packPlan, readPackAsk, PACK_LETTER_CAP } from '@/lib/outreach/pack-rules'
import { sendRefusal } from '@/lib/agents/tasks'

const today = new Date('2026-12-01T12:00:00Z')
const ago = (n: number) => new Date(today.getTime() - n * 86_400_000)
const seg = (o: Record<string, unknown> = {}): SegmentDefinition => {
  const r = readSegmentDefinition({ role: 'CANDIDATE', ...o })
  if (!r.ok) throw new Error(r.says)
  return r.def
}

describe('the audience builder reads a definition and nothing else', () => {
  it('a segment names who it is for: candidates, clients or partners', () => {
    expect(readSegmentDefinition({})).toMatchObject({ ok: false, field: 'role' })
    expect(readSegmentDefinition({ role: 'STRANGERS' })).toMatchObject({ ok: false, field: 'role' })
    expect(readSegmentDefinition({ role: 'PARTNER' })).toMatchObject({ ok: true })
  })
  it('a segment cut by industry is refused in a sentence, because nothing on the record holds an industry', () => {
    const r = readSegmentDefinition({ role: 'CLIENT', industry: 'Packaging' })
    expect(r).toMatchObject({ ok: false, field: 'industry' })
    expect((r as any).says).toMatch(/No industry is recorded/)
  })
  it('a segment cannot ask for people who have not agreed to hear from the firm', () => {
    expect(readSegmentDefinition({ role: 'CANDIDATE', consent: 'ANYONE' })).toMatchObject({ ok: false, field: 'consent' })
    expect(seg().consent).toBe('CONSENTED')
  })
  it('skills belong to candidates, so a client segment that names skills is refused', () => {
    expect(readSegmentDefinition({ role: 'CLIENT', skills: ['sql'] })).toMatchObject({ ok: false, field: 'skills' })
  })
  it('a stage is read against the kind of person: a candidate has finished a course, a company has gone quiet', () => {
    expect(readSegmentDefinition({ role: 'CANDIDATE', stage: 'DORMANT' })).toMatchObject({ ok: false, field: 'stage' })
    expect(readSegmentDefinition({ role: 'CLIENT', stage: 'FINISHED' })).toMatchObject({ ok: false, field: 'stage' })
    expect(readSegmentDefinition({ role: 'CLIENT', stage: 'dormant' })).toMatchObject({ ok: true })
  })
  it('a segment cannot be both active within some days and quiet for some days', () => {
    expect(readSegmentDefinition({ role: 'CLIENT', activeWithinDays: 30, quietForDays: 90 })).toMatchObject({ ok: false })
  })
  it('a candidate matches on any one skill, a place, a stage and how lately something happened', () => {
    const d = seg({ skills: ['SQL', 'dbt'], location: 'leeds', stage: 'FINISHED', activeWithinDays: 60 })
    const f = { skills: ['DBT', 'Python'], location: 'Leeds, GB', stage: 'FINISHED', lastActivityAt: ago(10) }
    expect(segmentMatches(d, f, today)).toBe(true)
    expect(segmentMatches(d, { ...f, skills: ['Java'] }, today)).toBe(false)
    expect(segmentMatches(d, { ...f, location: 'Austin' }, today)).toBe(false)
    expect(segmentMatches(d, { ...f, stage: 'KEPT' }, today)).toBe(false)
    expect(segmentMatches(d, { ...f, lastActivityAt: ago(200) }, today)).toBe(false)
    expect(segmentMatches(d, { ...f, lastActivityAt: null }, today)).toBe(false)
  })
  it('quiet for N days matches a company with no activity at all and one whose last activity is old enough', () => {
    const d = seg({ role: 'CLIENT', quietForDays: 90 })
    expect(segmentMatches(d, { skills: [], location: null, stage: null, lastActivityAt: null }, today)).toBe(true)
    expect(segmentMatches(d, { skills: [], location: null, stage: null, lastActivityAt: ago(100) }, today)).toBe(true)
    expect(segmentMatches(d, { skills: [], location: null, stage: null, lastActivityAt: ago(10) }, today)).toBe(false)
  })
  it('a segment is described in words that end by saying only people who agreed to hear are in it', () => {
    expect(describeSegment(seg({ skills: ['sql'], location: 'Leeds' }))).toBe('Candidates, with sql, in Leeds. Only people who agreed to hear from you.')
  })
})

describe('the tripwires say why they fired, and fire once for a thing', () => {
  it('a team with a free seat fires with the seats and the roles named, and a full or archived team does not', () => {
    const roles = [{ title: 'Data engineer', headcount: 3, members: 1, skills: ['SQL'] }, { title: 'Analyst', headcount: 1, members: 1, skills: [] }]
    const d = podCapacity({ id: 'p1', name: 'Data team', archivedAt: null, roles })!
    expect(d.reason).toBe('Data team has room for 2 more people: Data engineer.')
    expect(d.skills).toEqual(['sql'])
    expect(podCapacity({ id: 'p1', name: 'Data team', archivedAt: null, roles: [roles[1]] })).toBeNull()
    expect(podCapacity({ id: 'p1', name: 'Data team', archivedAt: today, roles })).toBeNull()
  })
  it('more room in the same team is new news, so the source changes with the seat count', () => {
    const mk = (members: number) => podCapacity({ id: 'p1', name: 'T', archivedAt: null, roles: [{ title: 'R', headcount: 4, members, skills: [] }] })!.sourceId
    expect(mk(3)).not.toBe(mk(2))
  })
  it('an engagement fires only for two weeks after it was fulfilled', () => {
    expect(engagementEnded({ id: 'e', podName: 'Data team', fulfilledAt: ago(3), skills: [] }, today)).not.toBeNull()
    expect(engagementEnded({ id: 'e', podName: 'Data team', fulfilledAt: ago(30), skills: [] }, today)).toBeNull()
    expect(engagementEnded({ id: 'e', podName: 'Data team', fulfilledAt: null, skills: [] }, today)).toBeNull()
  })
  it('a cohort fires when everyone who has not dropped has finished, and not while one is still working', () => {
    const done = { status: 'COMPLETED', completedAt: ago(2) }
    expect(cohortCompleted({ id: 'c', name: 'Autumn', courseTitle: 'Data basics', enrollments: [done, done, { status: 'DROPPED', completedAt: null }] }, today)!.reason).toBe('Autumn finished Data basics: 2 people, the last on 2026-11-29.')
    expect(cohortCompleted({ id: 'c', name: 'Autumn', courseTitle: 'Data basics', enrollments: [done, { status: 'IN_PROGRESS', completedAt: null }] }, today)).toBeNull()
    expect(cohortCompleted({ id: 'c', name: 'Autumn', courseTitle: 'Data basics', enrollments: [] }, today)).toBeNull()
  })
  it('an open job fires only once it has been open longer than the firm’s own line', () => {
    const j = { id: 'j', title: 'Data engineer', status: 'OPEN', archivedAt: null, createdAt: ago(20), skills: ['SQL'] }
    expect(jobUnfilled(j, today, 14)!.reason).toBe('Data engineer has been open 20 days, past your 14-day line.')
    expect(jobUnfilled(j, today, 30)).toBeNull()
    expect(jobUnfilled({ ...j, status: 'FILLED' }, today, 14)).toBeNull()
  })
  it('a new bench listing fires when its skill is on an open job, and the reason names no person', () => {
    const d = benchMatchesDemand({ id: 'b', grantedAt: ago(2), skills: ['SQL', 'Airflow'] }, [{ title: 'Data engineer', skills: ['sql'] }], today)!
    expect(d.reason).toBe('A person newly on the bench has sql, which Data engineer asks for.')
    expect(d.sourceId).toBe('sql') // the skill, not the person: three people with one skill are one piece of news
    expect(benchMatchesDemand({ id: 'b', grantedAt: ago(2), skills: ['Java'] }, [{ title: 'Data engineer', skills: ['sql'] }], today)).toBeNull()
    expect(benchMatchesDemand({ id: 'b', grantedAt: ago(60), skills: ['SQL'] }, [{ title: 'Data engineer', skills: ['sql'] }], today)).toBeNull()
  })
  it('repeat visits count only a known person on two different days, never two clicks on one day', () => {
    const v = { pageKind: 'COURSE' as const, pageRef: 'c1', pageName: 'Data basics', personId: 'p1', contactId: null }
    expect(repeatVisits({ ...v, at: [ago(5), ago(1)] }, today)).not.toBeNull()
    expect(repeatVisits({ ...v, at: [ago(1), ago(1)] }, today)).toBeNull()
    expect(repeatVisits({ ...v, at: [ago(1)] }, today)).toBeNull()
  })
  it('a visit with no person and no contact behind it never fires', () => {
    expect(repeatVisits({ pageKind: 'COURSE', pageRef: 'c1', pageName: 'Data basics', personId: null, contactId: null, at: [ago(5), ago(1)] }, today)).toBeNull()
  })
  it('a shared completion fires for two weeks, and a contract fires inside its last 45 days only while it is running', () => {
    expect(completionShared({ enrollmentId: 'e', courseTitle: 'Data basics', at: ago(1) }, today)).not.toBeNull()
    expect(completionShared({ enrollmentId: 'e', courseTitle: 'Data basics', at: ago(40) }, today)).toBeNull()
    const c = { id: 's', clientCompanyId: 'k', clientName: 'Corvane', endDate: new Date(today.getTime() + 20 * 86_400_000), state: 'IN_PROGRESS', skills: [] }
    expect(contractEnding(c, today)!.reason).toBe('A contract at Corvane ends on 2026-12-21, in 20 days.')
    expect(contractEnding({ ...c, state: 'ENDED' }, today)).toBeNull()
    expect(contractEnding({ ...c, endDate: new Date(today.getTime() + 90 * 86_400_000) }, today)).toBeNull()
    expect(contractEnding({ ...c, endDate: ago(1) }, today)).toBeNull()
  })
  it('a thing that fired lately stays quiet for thirty days and may fire again after', () => {
    expect(quietSince(ago(5), today)).toBe(true)
    expect(quietSince(ago(31), today)).toBe(false)
    expect(quietSince(null, today)).toBe(false)
  })
  it('every tripwire the record names has somebody it is for', () => {
    for (const k of TRIPWIRE_KINDS) if (k !== 'REPEAT_VISITS') expect(AIMS[k].length, k).toBeGreaterThan(0)
    expect(TRIPWIRE_KINDS).toHaveLength(8)
  })
})

describe('content is matched to a firing and its segment', () => {
  const pool = {
    courses: [
      { id: 'c1', title: 'Data engineering basics', description: 'SQL and dbt', trackKey: 'it-upgrade', completions: 7 },
      { id: 'c2', title: 'Cooking for crowds', description: null, trackKey: null, completions: 2 },
    ],
    pods: [{ id: 'p1', name: 'Data team', description: null, skills: ['sql'], openSeats: 2 }],
  }
  it('a firing is pushed to the saved segment of the right role, and to none where the firm saved none', () => {
    const a = { id: 'a', name: 'Clients', def: seg({ role: 'CLIENT' }) }
    const b = { id: 'b', name: 'Learners', def: seg({ skills: ['sql'] }) }
    expect(matchSegment('CLIENT', [], [b, a])!.id).toBe('a')
    expect(matchSegment('CANDIDATE', ['sql'], [a, b])!.id).toBe('b')
    expect(matchSegment('CANDIDATE', ['java'], [a, b])).toBeNull()
    expect(matchSegment('PARTNER', [], [a, b])).toBeNull()
  })
  it('a course is picked by the skills the firing carries, and none is offered where no course covers them', () => {
    expect(pickContent('COURSE', ['sql'], pool)).toMatchObject({ ok: true, content: { ref: 'c1' } })
    expect(pickContent('COURSE', ['welding'], pool)).toMatchObject({ ok: false })
  })
  it('a team offer is picked by the team’s own skills', () => {
    expect(pickContent('POD_OFFER', ['sql'], pool)).toMatchObject({ ok: true, content: { ref: 'p1' } })
    expect(pickContent('POD_OFFER', ['welding'], pool)).toMatchObject({ ok: false })
  })
  it('outcome proof is shown only where at least five people finished the course, and says how many fell short', () => {
    expect(OUTCOME_PROOF_FLOOR).toBe(5)
    expect(pickContent('OUTCOME_PROOF', [], pool)).toMatchObject({ ok: true, content: { ref: 'c1', facts: ['Data engineering basics', '7'] } })
    const few = pickContent('OUTCOME_PROOF', [], { ...pool, courses: [{ ...pool.courses[0], completions: 4 }, pool.courses[1]] })
    expect(few).toMatchObject({ ok: false })
    expect((few as any).says).toMatch(/at least 5 people.*The most so far is 4/)
  })
  it('a repeat visit is for the kind of person who came back and about the page she came back to', () => {
    const d = { kind: 'REPEAT_VISITS', page: { pageKind: 'POD', pageRef: 'p1' }, visitor: { personId: null, contactId: 'k' } } as any
    expect(aimsFor(d)).toEqual([{ role: 'CLIENT', kinds: ['POD_OFFER'] }])
    expect(aimsFor({ ...d, page: { pageKind: 'COURSE', pageRef: 'c1' }, visitor: { personId: 'p', contactId: null } })).toEqual([{ role: 'CANDIDATE', kinds: ['COURSE'] }])
  })
  it('the push the rules draft is fit to send: no web address, no rate, a subject that says what it is', () => {
    const c = pickContent('OUTCOME_PROOF', [], pool)
    const dr = draftByRules('Win Firm', { kind: 'COHORT_COMPLETED', skills: [] } as any, (c as any).content, 7)
    expect(dr.subject).toBe('7 people finished Data engineering basics with Win Firm')
    expect(draftRefusal(dr)).toBeNull()
    expect(draftRefusal({ subject: 'Fwd: hi', body: 'x' })).toMatch(/Re: or Fwd:/)
    expect(draftRefusal({ subject: 'Hi', body: 'see https://x.example' })).toMatch(/web address/)
  })
  it('a model’s draft is used only if it passes the same rules and invents no number the facts do not hold', () => {
    const facts = ['Data engineering basics', '7']
    expect(modelDraftOk({ subject: '7 people finished Data engineering basics', body: 'Seven of them did it.' }, facts)).toBe(true)
    expect(modelDraftOk({ subject: '12 people finished', body: 'Come and see.' }, facts)).toBe(false)
    expect(modelDraftOk({ subject: 'Fine', body: 'Visit https://x.example' }, facts)).toBe(false)
  })
  it('the tracked link of a team offer leads to the firm’s page and of a course to its learning page', () => {
    expect(pageOf({ kind: 'POD_OFFER', ref: 'p1' }, 'win', null).path).toBe('/site/win')
    expect(pageOf({ kind: 'COURSE', ref: 'c1' }, 'win', 'it-upgrade')).toMatchObject({ pageKind: 'COURSE', path: '/learn/win/it-upgrade' })
  })
})

describe('a pack is the only place a push may leave from', () => {
  const approved = { state: 'APPROVED', segmentId: 's1', contentKinds: ['COURSE', 'OUTCOME_PROOF'] }
  it('a push joins a pack only when its segment and its kind both match what the pack declared', () => {
    expect(packFits(approved, { segmentId: 's1', contentKind: 'COURSE' })).toBeNull()
    expect(packFits(approved, { segmentId: 's2', contentKind: 'COURSE' })).toMatch(/different segment/)
    expect(packFits(approved, { segmentId: 's1', contentKind: 'POD_OFFER' })).toMatch(/does not carry a team offer/)
  })
  it('a pack that is not approved takes nothing, whatever it declared', () => {
    for (const state of ['DRAFT', 'PROPOSED', 'CLOSED']) expect(packFits({ ...approved, state }, { segmentId: 's1', contentKind: 'COURSE' }), state).toMatch(/not been approved/)
  })
  it('a pack is asked for with a name, a segment and at least one kind it may carry', () => {
    expect(readPackAsk({})).toMatchObject({ ok: false, field: 'name' })
    expect(readPackAsk({ name: 'A' })).toMatchObject({ ok: false, field: 'segmentId' })
    expect(readPackAsk({ name: 'A', segmentId: 's' })).toMatchObject({ ok: false, field: 'contentKinds' })
    expect(readPackAsk({ name: 'A', segmentId: 's', contentKinds: ['EMAIL_BLAST'] })).toMatchObject({ ok: false, field: 'contentKinds' })
    expect(readPackAsk({ name: 'A', segmentId: 's', contentKinds: ['COURSE'] })).toMatchObject({ ok: true })
  })
  it('a pack of letters to companies is sent again twice at most, and to candidates never', () => {
    expect(packPlan('CLIENT')).toMatchObject({ retries: 2, daysApart: 5, recipients: PACK_LETTER_CAP })
    expect(packPlan('CANDIDATE')).toMatchObject({ retries: 0, recipients: PACK_LETTER_CAP })
    expect(packPlan('CANDIDATE').messages[0].template).toBe('candidate-update')
  })
  it('the task that carries a pack refuses a letter before the yes and a letter past the most it was approved for', () => {
    const plan = packPlan('CLIENT', 2)
    const task = { companyId: 'f', agentKey: 'outreach-batch', recordType: 'Company', recordId: 'f', plan, sentCount: 0 }
    const step = { companyId: 'f', agentKey: 'outreach-batch', recordType: 'OutreachLetter', recordId: 'l', template: 'outreach-batch', attempt: 1 }
    expect(sendRefusal({ task: { ...task, state: 'PROPOSED' }, switchState: 'ON', step })).toMatch(/waiting for a yes/)
    expect(sendRefusal({ task: { ...task, state: 'APPROVED' }, switchState: 'ON', step })).toBeNull()
    expect(sendRefusal({ task: { ...task, state: 'RUNNING', sentCount: 6 }, switchState: 'ON', step })).toMatch(/sent everything it was approved for/)
    expect(sendRefusal({ task: { ...task, state: 'APPROVED' }, switchState: 'ON', step: { ...step, attempt: 4 } })).toMatch(/beyond the retries/)
  })
})

describe('nothing in detection sends mail on its own', () => {
  const { readFileSync, readdirSync, statSync } = require('fs') as typeof import('fs')
  const { join } = require('path') as typeof import('path')
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(e)) out.push(p) }
    return out
  }
  const detectionFiles = [...walk('src/lib/outreach'), ...walk('src/app/api/outreach'), ...walk('src/app/dashboard/companies/outreach')]
  it('no file under the outreach library, its routes or its screen calls the mail door to send: the only sender is the agent that reads the task’s yes first', () => {
    const senders = detectionFiles.filter((f) => /\bsendMail\s*\(/.test(readFileSync(f, 'utf8')))
    expect(senders).toEqual([])
  })
  it('the agent that sends a pack’s letter asks the task’s own yes before every send, and holds a pack while Outreach is off', () => {
    const src = readFileSync('src/lib/agents/outreach-batch.ts', 'utf8')
    expect(src.indexOf('mayAgentSend(')).toBeGreaterThan(-1)
    expect(src.indexOf('mayAgentSend(')).toBeLessThan(src.indexOf('send({'))
    expect(src).toMatch(/payload\.pack && !isOn\(firm\.pluginsOn, 'OUTREACH'\)/)
  })
  it('a push is placed into a pack only after the pack’s yes is read fresh from its task', () => {
    const src = readFileSync('src/lib/outreach/pack.ts', 'utf8')
    expect(src).toMatch(/await syncPack\(c\.id\)[\s\S]*packFits\(fresh, push\)/)
  })
  it('no detection file reads a mailbox or analytics, and the visit counts only a person signed in', () => {
    const src = readFileSync('src/lib/outreach/visit.ts', 'utf8')
    expect(src).toMatch(/if \(!sessionEmail\) return \{ redirect: path, recorded: false/)
    for (const f of detectionFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bimap\b|pop3|gtag/i)
  })
})
