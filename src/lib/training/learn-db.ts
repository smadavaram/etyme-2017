import { prisma } from '@/lib/db'
import { trackOf, lessonsOf, course, COURSE_SLUG } from './courses/index'
import { readProgress, markDone, setTick, isComplete, type LearnProgress } from './learn-progress'
import { pathNext } from './paths/state'

export const courseSlugFor = (track: string): string => `${COURSE_SLUG}:${track}`

/** The tenant's own course row for a track, made on first use. Free; no price is ever written. */
export async function ensureCourse(tenantId: string, trackKey: string) {
  const track = trackOf(trackKey)
  if (!track) return null
  const slug = courseSlugFor(trackKey)
  const found = await prisma.course.findFirst({ where: { companyId: tenantId, slug }, select: { id: true, title: true } })
  if (found) return found
  return prisma.course.create({
    data: { companyId: tenantId, slug, trackKey, title: `${course().title} — ${track.title}`, category: 'AI_UPSKILLING', isPublic: false },
    select: { id: true, title: true },
  })
}

export type ProgressMove = { lessonKey?: string; tick?: { project: string; item: string; on: boolean } }

/**
 * A signed-in worker's progress, written to her own enrollment at the firm
 * and, on the last lesson, her completion and the ledger. Her path (if the
 * mentor said yes) starts with her first lesson and completes with the track.
 */
export async function saveProgress(o: { tenantId: string; tenantName: string; trackKey: string; personId: string; personName: string; move: ProgressMove }) {
  const track = trackOf(o.trackKey)
  if (!track) return { ok: false as const, message: 'That track is not written yet.' }
  const c = await ensureCourse(o.tenantId, o.trackKey)
  if (!c) return { ok: false as const, message: 'That track is not written yet.' }
  const keys = lessonsOf(track).map((l) => l.lesson.key)
  const existing = await prisma.enrollment.findUnique({ where: { courseId_personId: { courseId: c.id, personId: o.personId } } })
  let progress: LearnProgress = readProgress(existing?.progress)
  if (o.move.lessonKey) progress = markDone(progress, o.move.lessonKey, keys)
  if (o.move.tick) progress = setTick(progress, o.move.tick.project, o.move.tick.item, o.move.tick.on)
  const complete = isComplete(progress, keys)
  const wasComplete = existing?.status === 'COMPLETED'
  const status = wasComplete || complete ? 'COMPLETED' : 'IN_PROGRESS'
  const now = new Date()
  const row = await prisma.enrollment.upsert({
    where: { courseId_personId: { courseId: c.id, personId: o.personId } },
    create: { courseId: c.id, personId: o.personId, companyId: o.tenantId, trackKey: o.trackKey, status, progress: progress as object, completedAt: complete ? now : null },
    update: { status, progress: progress as object, ...(complete && !wasComplete ? { completedAt: now } : {}), companyId: existing?.companyId ?? o.tenantId, trackKey: o.trackKey },
    select: { id: true, status: true },
  })
  // Her path: the mentor's yes already made it hers. Starting and finishing follow the lessons.
  const path = await prisma.learningPath.findFirst({ where: { personId: o.personId, companyId: o.tenantId, OR: [{ courseId: c.id }, { course: { trackKey: o.trackKey } }], state: { in: ['APPROVED', 'ACTIVE'] } }, orderBy: { createdAt: 'desc' } })
  if (path) {
    const move = complete ? (path.state === 'APPROVED' ? 'start' : 'complete') : 'start'
    const n = pathNext(path.state, move)
    if (n.ok) await prisma.learningPath.update({ where: { id: path.id }, data: { state: n.state } })
    if (complete) {
      const cur = await prisma.learningPath.findUniqueOrThrow({ where: { id: path.id }, select: { state: true } })
      const fin = pathNext(cur.state, 'complete')
      if (fin.ok) await prisma.learningPath.update({ where: { id: path.id }, data: { state: fin.state, completedAt: now } })
    }
  }
  if (complete && !wasComplete) {
    await prisma.automationLog.create({
      data: {
        companyId: o.tenantId, action: 'LEARNING_COMPLETED',
        summary: `${o.personName} finished ${c.title}. It is on her record at ${o.tenantName}.`,
        reason: 'A signed-in worker finished every lesson of a track, so the completion is written to her own enrollment.',
        payload: { enrollmentId: row.id, personId: o.personId, trackKey: o.trackKey }, reversible: false,
      },
    })
  }
  return { ok: true as const, progress, complete, enrollmentId: row.id, courseId: c.id }
}
