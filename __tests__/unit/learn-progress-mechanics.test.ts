import { describe, it, expect } from 'vitest'
import { trackOf, lessonsOf } from '@/lib/training/courses/index'
import { EMPTY_PROGRESS } from '@/lib/training/learn-progress'
import { LESSON_POINTS, EXERCISE_POINTS, PROJECT_POINTS, pointsOf } from '@/lib/training/progress/points'
import { weekKey, recordWeek, streakOf, streakSays } from '@/lib/training/progress/streak'
import { badgesEarned, badgeWords } from '@/lib/training/progress/badges'
import { cohortBoard, myPlace, mayReadRanking } from '@/lib/training/progress/board'
import { skillsMatching, jobReadyPath, gapsAgainst, teamPath } from '@/lib/training/paths/for-skills'
import { mayOfferToApplicant } from '@/lib/training/paths/door'

const track = trackOf('it-upgrade')!
const flat = lessonsOf(track)
const keys = flat.map((l) => l.lesson.key)
const levelKeys = (i: number) => track.levels[i].chapters.flatMap((c) => c.lessons.map((l) => l.key))

describe('points are read from the record and cannot be spent', () => {
  it('a lesson is worth less than an exercise and an exercise is worth less than a project', () => {
    expect(LESSON_POINTS).toBeLessThan(EXERCISE_POINTS)
    expect(EXERCISE_POINTS).toBeLessThan(PROJECT_POINTS)
  })
  it('a person with nothing done has no points', () => {
    expect(pointsOf(track, EMPTY_PROGRESS).total).toBe(0)
  })
  it('one finished lesson counts its lesson and its exercise', () => {
    const p = pointsOf(track, { done: [keys[0]], ticks: {} })
    expect(p.lessons).toBe(LESSON_POINTS)
    expect(p.exercises).toBe(EXERCISE_POINTS)
    expect(p.total).toBe(LESSON_POINTS + EXERCISE_POINTS)
  })
  it('a project counts only once every item of its checklist is ticked', () => {
    const pr = track.levels[0].project
    expect(pointsOf(track, { done: [], ticks: { [pr.key]: pr.checklist.slice(1) } }).projects).toBe(0)
    expect(pointsOf(track, { done: [], ticks: { [pr.key]: pr.checklist } }).projects).toBe(PROJECT_POINTS)
  })
  it('a lesson key that is not in the course adds no points', () => {
    expect(pointsOf(track, { done: ['not-a-lesson'], ticks: {} }).total).toBe(0)
  })
  it('points are a function of the record alone, so the same record reads the same twice', () => {
    const rec = { done: keys.slice(0, 3), ticks: {} }
    expect(pointsOf(track, rec)).toEqual(pointsOf(track, rec))
  })
  it('the points reader offers nothing to spend, move or give away', async () => {
    const mod = await import('@/lib/training/progress/points')
    expect(Object.keys(mod).filter((k) => /spend|transfer|give|send|redeem|balance|wallet/i.test(k))).toEqual([])
  })
})

describe('the weekly streak never punishes', () => {
  it('a week is named by its ISO year and week number', () => {
    expect(weekKey(new Date('2026-11-28T10:00:00Z'))).toBe('2026-W48')
    expect(weekKey(new Date('2026-12-28T10:00:00Z'))).toBe('2026-W53')
    expect(weekKey(new Date('2027-01-03T10:00:00Z'))).toBe('2026-W53')
  })
  it('activity twice in one week is written once', () => {
    const now = new Date('2026-11-25T10:00:00Z')
    expect(recordWeek(recordWeek([], now), now)).toEqual(['2026-W48'])
  })
  it('three weeks in a row read as a streak of three', () => {
    const now = new Date('2026-11-28T10:00:00Z')
    expect(streakOf(['2026-W46', '2026-W47', '2026-W48'], now).current).toBe(3)
  })
  it('this week not started yet does not break the streak she built up to last week', () => {
    const now = new Date('2026-11-23T08:00:00Z')
    expect(streakOf(['2026-W46', '2026-W47'], now).current).toBe(2)
  })
  it('a missed week resets the streak to zero and the longest run stays on her record', () => {
    const now = new Date('2026-12-14T10:00:00Z')
    const s = streakOf(['2026-W44', '2026-W45', '2026-W46', '2026-W47'], now)
    expect(s.current).toBe(0)
    expect(s.longest).toBe(4)
  })
  it('a missed week is told with no loss, warning or penalty words', () => {
    const now = new Date('2026-12-14T10:00:00Z')
    const says = streakSays(streakOf(['2026-W44'], now))
    expect(says).not.toMatch(/lost|lose|broke|broken|miss|warning|penalt|streak is gone|careful|don.t/i)
    expect(says.length).toBeGreaterThan(0)
  })
  it('an old week that is not a week key is ignored', () => {
    expect(streakOf(['nonsense'], new Date('2026-11-28T10:00:00Z')).current).toBe(0)
  })
})

describe('badges are earned per level and per finished course', () => {
  it('no badge is earned for a part of a level', () => {
    expect(badgesEarned(track, { done: levelKeys(0).slice(1), ticks: {} })).toEqual([])
  })
  it('a level badge is earned when every lesson of that level is done', () => {
    const b = badgesEarned(track, { done: levelKeys(0), ticks: {} })
    expect(b).toEqual([{ kind: 'LEVEL', levelKey: track.levels[0].key }])
  })
  it('the course badge is earned with the last lesson, beside every level badge', () => {
    const b = badgesEarned(track, { done: keys, ticks: {} })
    expect(b.filter((x) => x.kind === 'LEVEL')).toHaveLength(track.levels.length)
    expect(b.filter((x) => x.kind === 'COURSE')).toEqual([{ kind: 'COURSE', levelKey: '' }])
  })
  it('a badge reads in plain words naming the level or the course', () => {
    expect(badgeWords({ kind: 'LEVEL', levelKey: 'simple' }, 'IT')).toMatch(/Simple/)
    expect(badgeWords({ kind: 'COURSE', levelKey: '' }, 'IT')).toMatch(/IT/)
  })
})

describe('a job-ready path is made from the job’s skills by rules', () => {
  const skill = track.levels[0].chapters[0].lessons[0].introduces[0]
  it('a skill matches the lessons that introduce it or carry it in their title', () => {
    expect(skillsMatching(track, [skill]).matched).toContain(track.levels[0].chapters[0].lessons[0].key)
  })
  it('a skill no lesson teaches is said to be uncovered and is never guessed at', () => {
    const r = skillsMatching(track, ['underwater welding'])
    expect(r.matched).toEqual([])
    expect(r.uncovered).toEqual(['underwater welding'])
  })
  it('the path names the job it was made from', () => {
    const p = jobReadyPath(track, { jobId: 'job-1', jobTitle: 'Data engineer', skills: [skill], priorCompletions: [] })!
    expect(p.sourceKind).toBe('JOB')
    expect(p.sourceRefId).toBe('job-1')
    expect(p.sourceLabel).toBe('Made from the job: Data engineer')
  })
  it('lessons she already finished are left off the path', () => {
    const first = track.levels[0].chapters[0].lessons[0].key
    const p = jobReadyPath(track, { jobId: 'j', jobTitle: 'T', skills: [skill], priorCompletions: [first] })
    expect(p === null || !p.steps.includes(first)).toBe(true)
  })
  it('a lesson that builds on an earlier term brings its earlier lesson with it, in reading order', () => {
    const later = flat.find((l) => l.lesson.uses.length > 0)!
    const p = jobReadyPath(track, { jobId: 'j', jobTitle: 'T', skills: [later.lesson.introduces[0] ?? later.lesson.title], priorCompletions: [] })!
    expect(p.steps).toContain(later.lesson.key)
    const order = p.steps.map((k) => keys.indexOf(k))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    for (const u of later.lesson.uses) {
      const builder = flat.find((l) => l.lesson.introduces.includes(u))!
      expect(p.steps.indexOf(builder.lesson.key)).toBeGreaterThanOrEqual(0)
    }
  })
  it('a job whose skills nothing teaches makes no path and says why, never an empty one', () => {
    expect(jobReadyPath(track, { jobId: 'j', jobTitle: 'Welder', skills: ['welding'], priorCompletions: [] })).toBeNull()
  })
  it('a job with no skills listed makes no path', () => {
    expect(jobReadyPath(track, { jobId: 'j', jobTitle: 'T', skills: [], priorCompletions: [] })).toBeNull()
  })
})

describe('a team path is made from what each member lacks against the role', () => {
  const skill = track.levels[0].chapters[0].lessons[0].introduces[0]
  const first = track.levels[0].chapters[0].lessons[0].key
  it('a skill she has finished a lesson on is not a gap', () => {
    expect(gapsAgainst(track, [skill], [first])).toEqual([])
  })
  it('a skill she has not learned here is a gap', () => {
    expect(gapsAgainst(track, [skill], [])).toEqual([skill])
  })
  it('a role with no skills listed makes no team path', () => {
    expect(teamPath(track, { podId: 'p', podName: 'Data team', roleSkills: [], done: [] })).toBeNull()
  })
  it('a member with no gaps gets no path', () => {
    expect(teamPath(track, { podId: 'p', podName: 'Data team', roleSkills: [skill], done: [first] })).toBeNull()
  })
  it('a member with a gap gets a path that names the team', () => {
    const p = teamPath(track, { podId: 'p', podName: 'Data team', roleSkills: [skill], done: [] })!
    expect(p.sourceKind).toBe('POD')
    expect(p.sourceRefId).toBe('p')
    expect(p.sourceLabel).toBe('Made from the team: Data team')
    expect(p.steps.length).toBeGreaterThan(0)
  })
})

describe('an applicant is routed into a path only with her own yes', () => {
  it('without her yes nothing is offered', () => {
    expect(mayOfferToApplicant({ yes: false, signedIn: true }).ok).toBe(false)
  })
  it('a yes from nobody signed in is not hers', () => {
    expect(mayOfferToApplicant({ yes: true, signedIn: false }).ok).toBe(false)
  })
  it('her yes, signed in as herself, lets the path be proposed', () => {
    expect(mayOfferToApplicant({ yes: true, signedIn: true }).ok).toBe(true)
  })
})

describe('the cohort board and the ranking', () => {
  const rows = [
    { personId: 'a', name: 'Ann', points: 40, weeks: 2, badges: 1, percent: 40 },
    { personId: 'b', name: 'Bo', points: 90, weeks: 3, badges: 2, percent: 70 },
    { personId: 'c', name: 'Cy', points: 40, weeks: 1, badges: 0, percent: 40 },
  ]
  it('the mentor reads the cohort ordered by points, then by name', () => {
    expect(cohortBoard(rows).map((r) => r.name)).toEqual(['Bo', 'Ann', 'Cy'])
  })
  it('the ranking is off unless the Owner turned it on', () => {
    expect(mayReadRanking({ rankingOn: false, cohortId: 'c1' }).ok).toBe(false)
    expect(mayReadRanking({ rankingOn: true, cohortId: 'c1' }).ok).toBe(true)
  })
  it('the ranking is never read by a person who is in no cohort, even where it is on', () => {
    expect(mayReadRanking({ rankingOn: true, cohortId: null }).ok).toBe(false)
  })
  it('a learner reads only her own place and how many are in her cohort, never another’s name', () => {
    const p = myPlace(rows, 'a')!
    expect(p).toEqual({ place: 2, of: 3 })
    expect(JSON.stringify(p)).not.toMatch(/Bo|Cy/)
  })
  it('people on equal points share the place', () => {
    expect(myPlace(rows, 'c')!.place).toBe(2)
  })
  it('a person not on the board has no place', () => {
    expect(myPlace(rows, 'zz')).toBeNull()
  })
})
