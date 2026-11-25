import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { notify } from '@/lib/notify'
import { cohortFull, cohortOpen, mayNameTrainer, sameCourse } from '@/lib/training'

/**
 * POST /api/training/enrollments   { courseId, personId, cohortId? }
 *
 * Put somebody on a course. Only a person on our books, only on our
 * course, and only once — a second enrollment is the first one handed
 * back. The person is told, by email if they are a candidate.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Enrolling somebody is for whoever develops the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const courseId = typeof body.courseId === 'string' ? body.courseId : ''
  const personId = typeof body.personId === 'string' ? body.personId : ''
  if (!courseId || !personId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say who, and on which course.' } }, { status: 422 })
  }

  const cohortId = typeof body.cohortId === 'string' && body.cohortId ? body.cohortId : null

  const [course, seat, listing, person] = await Promise.all([
    prisma.course.findFirst({ where: { id: courseId, companyId }, select: { id: true, title: true } }),
    prisma.context.findFirst({ where: { personId, companyId, revokedAt: null }, select: { id: true, type: true } }),
    // Any listing she holds here counts as on our books: granted, or asked and not answered yet.
    prisma.benchListing.findFirst({ where: { companyId, revokedAt: null, state: { in: ['GRANTED', 'INVITED'] }, consultant: { personId } }, select: { id: true } }),
    prisma.person.findUnique({ where: { id: personId }, select: { name: true } }),
  ])
  if (!course) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That course is not in your library.' } }, { status: 404 })
  if (!person || (!seat && !listing)) {
    return NextResponse.json({ error: { code: 'NOT_YOURS', message: 'That person is not on your books.' } }, { status: 403 })
  }

  // The de-duplication read, the seat count and the write are one
  // transaction under a lock per (course, person) and one per cohort, so
  // two enrollments at the same moment can neither both create the row nor
  // both take the last seat (the pattern of `pg_advisory_xact_lock` used
  // for access invites).
  let done
  try {
    done = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'enrollment:' + courseId + ':' + personId}))`
      const existing = await tx.enrollment.findUnique({ where: { courseId_personId: { courseId, personId } }, select: { id: true, status: true, cohortId: true } })
      const already = existing && existing.status !== 'DROPPED'
      // Already on the course and already in a cohort (or none asked): handed back.
      if (already && (!cohortId || existing.cohortId === cohortId)) {
        return { kind: 'handed' as const, id: existing.id, status: existing.status }
      }

      // A cohort takes people for its own course only, while it is open and
      // has a seat. The seats are counted on the people who have not dropped.
      if (cohortId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cohort-seats:' + cohortId}))`
        const cohort = await tx.cohort.findFirst({
          where: { id: cohortId, companyId },
          select: { id: true, name: true, courseId: true, capacity: true, state: true, trainerPersonId: true, _count: { select: { enrollments: { where: { status: { not: 'DROPPED' } } } } } },
        })
        if (!cohort) return { kind: 'refused' as const, res: NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That cohort is not on your books.' } }, { status: 404 }) }
        const same = sameCourse({ enrollmentCourseId: courseId, cohortCourseId: cohort.courseId, courseTitle: course.title, cohortName: cohort.name })
        if (!same.ok) return { kind: 'refused' as const, res: NextResponse.json({ error: { code: 'WRONG_COURSE', message: same.message } }, { status: 409 }) }
        const open = cohortOpen(cohort.state, cohort.name)
        if (!open.ok) return { kind: 'refused' as const, res: NextResponse.json({ error: { code: 'COHORT_CLOSED', message: open.message } }, { status: 409 }) }
        if (cohort.trainerPersonId) {
          const trainee = mayNameTrainer({ trainerPersonId: cohort.trainerPersonId, traineePersonIds: [personId], cohortName: cohort.name })
          if (!trainee.ok) return { kind: 'refused' as const, res: NextResponse.json({ error: { code: 'IS_TRAINER', message: `${person.name} is the trainer of ${cohort.name}. A trainer cannot be a trainee on it.` } }, { status: 409 }) }
        }
        const full = cohortFull({ capacity: cohort.capacity, enrolled: cohort._count.enrollments, name: cohort.name })
        if (!full.ok) return { kind: 'refused' as const, res: NextResponse.json({ error: { code: 'COHORT_FULL', message: full.message } }, { status: 409 }) }
      }

      // Put into a cohort after the fact: the enrollment she holds, moved in.
      if (already) {
        await tx.enrollment.update({ where: { id: existing.id }, data: { cohortId } })
        return { kind: 'moved' as const, id: existing.id, status: existing.status }
      }

      const row = existing
        ? await tx.enrollment.update({ where: { id: existing.id }, data: { status: 'ENROLLED', enrolledAt: new Date(), completedAt: null, score: null, certificateUrl: null, cohortId }, select: { id: true } })
        : await tx.enrollment.create({ data: { courseId, personId, status: 'ENROLLED', cohortId }, select: { id: true } })
      return { kind: 'row' as const, row }
    })
  } catch (err: any) {
    // The unique key is the last word: a clash is the first enrollment handed back, never a 500.
    if (err?.code !== 'P2002') throw err
    const first = await prisma.enrollment.findUnique({ where: { courseId_personId: { courseId, personId } }, select: { id: true, status: true } })
    if (!first) throw err
    return NextResponse.json({ data: { id: first.id, status: first.status, existing: true, says: `${person.name} is already on ${course.title}.` } })
  }
  if (done.kind === 'refused') return done.res
  if (done.kind === 'handed') {
    return NextResponse.json({ data: { id: done.id, status: done.status, existing: true, says: `${person.name} is already on ${course.title}.` } })
  }
  if (done.kind === 'moved') {
    return NextResponse.json({ data: { id: done.id, status: done.status, existing: true, says: `${person.name} is in the cohort.` } })
  }
  const row = done.row

  const staffSeat = seat && seat.type !== 'CONSULTANT'
  void notify({
    personId,
    companyId,
    type: 'SYSTEM',
    title: `${caller.company!.name} enrolled you on ${course.title}`,
    body: 'It shows on your page once you finish.',
    entityId: row.id,
    channel: staffSeat ? 'IN_APP' : 'EMAIL',
  })

  return NextResponse.json(
    { data: { id: row.id, status: 'ENROLLED', existing: false, says: `${person.name} is on ${course.title}. They have been told.` } },
    { status: 201 }
  )
}
