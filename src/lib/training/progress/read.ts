import { prisma } from '@/lib/db'
import { trackOf } from '../courses/index'
import { readProgress } from '../learn-progress'
import { pointsOf } from './points'
import { streakOf, streakSays } from './streak'
import { badgeWords } from './badges'
import { cohortBoard, myPlace, mayReadRanking, type BoardRow } from './board'

/**
 * What the micro dashboard shows one learner, and what a mentor's board
 * shows a cohort. Every figure is computed from the enrollment rows each
 * time; nothing is stored as a balance.
 */
const rowOf = (e: { person: { id: string; name: string }; trackKey: string | null; progress: unknown; activityWeeks: string[]; _count?: { badges: number } }, badges: number, now: Date): BoardRow => {
  const track = e.trackKey ? trackOf(e.trackKey) : null
  const p = readProgress(e.progress)
  const total = track ? track.levels.reduce((n, lv) => n + lv.chapters.reduce((m, c) => m + c.lessons.length, 0), 0) : 0
  return {
    personId: e.person.id, name: e.person.name,
    points: track ? pointsOf(track, p).total : 0,
    weeks: streakOf(e.activityWeeks, now).current, badges,
    percent: total ? Math.round((p.done.length / total) * 100) : 0,
  }
}

export async function readMine(tenantId: string, personId: string, now: Date) {
  const [enrolls, company] = await Promise.all([
    prisma.enrollment.findMany({
      where: { personId, companyId: tenantId },
      select: { id: true, trackKey: true, progress: true, activityWeeks: true, cohortId: true, person: { select: { id: true, name: true } }, badges: { where: { revokedAt: null }, select: { id: true, kind: true, levelKey: true, earnedAt: true, shownAt: true } } },
    }),
    prisma.company.findUnique({ where: { id: tenantId }, select: { learnRankingOn: true } }),
  ])
  let total = 0
  const weeks = new Set<string>()
  const badges: { id: string; track: string; kind: string; levelKey: string; words: string; earnedOn: string; shown: boolean }[] = []
  for (const e of enrolls) {
    const track = e.trackKey ? trackOf(e.trackKey) : null
    if (!track) continue
    total += pointsOf(track, readProgress(e.progress)).total
    e.activityWeeks.forEach((w) => weeks.add(w))
    for (const b of e.badges) badges.push({ id: b.id, track: track.key, kind: b.kind, levelKey: b.levelKey, words: badgeWords({ kind: b.kind as 'LEVEL' | 'COURSE', levelKey: b.levelKey }, track.title), earnedOn: b.earnedAt.toISOString().slice(0, 10), shown: !!b.shownAt })
  }
  const streak = streakOf([...weeks], now)
  // Her place: only where the Owner turned it on, and only within the cohort she is in.
  const cohortId = enrolls.find((e) => e.cohortId)?.cohortId ?? null
  const may = mayReadRanking({ rankingOn: !!company?.learnRankingOn, cohortId })
  let place: { place: number; of: number } | null = null
  if (may.ok && cohortId) {
    const mates = await prisma.enrollment.findMany({ where: { cohortId, status: { not: 'DROPPED' } }, select: { trackKey: true, progress: true, activityWeeks: true, person: { select: { id: true, name: true } } } })
    place = myPlace(mates.map((m) => rowOf(m, 0, now)), personId)
  }
  return { points: total, streak: { current: streak.current, longest: streak.longest, says: streakSays(streak) }, badges, ranking: { on: may.ok, place } }
}

/** The boards of the firm's cohorts a seat may read. Names are the mentor's to read. */
export async function readBoards(companyId: string, only: { trainerPersonId?: string }, now: Date) {
  const cohorts = await prisma.cohort.findMany({
    where: { companyId, ...(only.trainerPersonId ? { trainerPersonId: only.trainerPersonId } : {}) },
    orderBy: [{ startsOn: 'desc' }, { name: 'asc' }], take: 50,
    select: { id: true, name: true, enrollments: { where: { status: { not: 'DROPPED' } }, select: { trackKey: true, progress: true, activityWeeks: true, person: { select: { id: true, name: true } }, _count: { select: { badges: true } } } } },
  })
  return cohorts.map((c) => ({ cohortId: c.id, name: c.name, rows: cohortBoard(c.enrollments.map((e) => rowOf(e, e._count.badges, now))) }))
}
