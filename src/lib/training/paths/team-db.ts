import { prisma } from '@/lib/db'
import { trackOf, lessonsOf } from '../courses/index'
import { readProgress } from '../learn-progress'
import { teamPath } from './for-skills'
import { ensureCourse } from '../learn-db'

/**
 * One path per member of a team whose role needs a skill she has not
 * learned here (record 133). Rules only. Each is PROPOSED to the named
 * mentor; nothing is live and nobody is told she is behind. A member with
 * no gap, or in a role with no skills listed, gets none.
 */
export async function proposeTeamPaths(o: { companyId: string; podId: string; mentorPersonId: string; trackKey: string }) {
  const track = trackOf(o.trackKey)
  if (!track) return { ok: false as const, message: 'That track is not written yet.' }
  const pod = await prisma.pod.findFirst({
    where: { id: o.podId, companyId: o.companyId },
    select: { id: true, name: true, roles: { select: { title: true, skills: true, members: { select: { personId: true } } } } },
  })
  if (!pod) return { ok: false as const, message: 'That team is not on your books.' }
  const c = await ensureCourse(o.companyId, o.trackKey)
  const made: { personId: string; pathId: string; lessons: number }[] = []
  const skipped: { personId: string; why: string }[] = []
  const known = new Set(lessonsOf(track).map((l) => l.lesson.key))
  for (const role of pod.roles) for (const m of role.members) {
    if (m.personId === o.mentorPersonId) { skipped.push({ personId: m.personId, why: 'Nobody mentors their own path.' }); continue }
    const open = await prisma.learningPath.findFirst({ where: { companyId: o.companyId, personId: m.personId, sourceKind: 'POD', sourceRefId: pod.id, state: { in: ['PROPOSED', 'APPROVED', 'ACTIVE'] } }, select: { id: true } })
    if (open) { skipped.push({ personId: m.personId, why: 'A path for this team is already open.' }); continue }
    const enrolls = await prisma.enrollment.findMany({ where: { personId: m.personId }, select: { progress: true } })
    const done = [...new Set(enrolls.flatMap((e) => readProgress(e.progress).done))].filter((k) => known.has(k))
    const p = teamPath(track, { podId: pod.id, podName: pod.name, roleSkills: role.skills, done })
    if (!p) { skipped.push({ personId: m.personId, why: role.skills.length === 0 ? 'Her role lists no skills.' : 'Nothing to learn here for her role.' }); continue }
    const row = await prisma.learningPath.create({
      data: {
        companyId: o.companyId, personId: m.personId, courseId: c?.id ?? null, generationType: 'SYSTEM',
        sourceSignals: { priorCompletions: done, roleSkills: role.skills } as object, mentorPersonId: o.mentorPersonId,
        steps: p.steps, state: 'PROPOSED', sourceKind: p.sourceKind, sourceRefId: p.sourceRefId, sourceLabel: p.sourceLabel,
      },
      select: { id: true },
    })
    await prisma.automationLog.create({
      data: { companyId: o.companyId, action: 'LEARNING_PATH_PROPOSED', summary: `A rules-made team path was proposed for one member of ${pod.name}. It waits for its mentor’s yes.`, reason: p.why, payload: { pathId: row.id, personId: m.personId, podId: pod.id }, reversible: false },
    })
    made.push({ personId: m.personId, pathId: row.id, lessons: p.steps.length })
  }
  return { ok: true as const, made, skipped }
}
