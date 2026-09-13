import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'

/**
 * POST /api/training/enrollments   { courseId, personId }
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

  const [course, seat, listing, person] = await Promise.all([
    prisma.course.findFirst({ where: { id: courseId, companyId }, select: { id: true, title: true } }),
    prisma.context.findFirst({ where: { personId, companyId, revokedAt: null }, select: { id: true, type: true } }),
    prisma.benchListing.findFirst({ where: { companyId, state: 'GRANTED', consultant: { personId } }, select: { id: true } }),
    prisma.person.findUnique({ where: { id: personId }, select: { name: true } }),
  ])
  if (!course) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That course is not in your library.' } }, { status: 404 })
  if (!person || (!seat && !listing)) {
    return NextResponse.json({ error: { code: 'NOT_YOURS', message: 'That person is not on your books.' } }, { status: 403 })
  }

  const existing = await prisma.enrollment.findUnique({ where: { courseId_personId: { courseId, personId } }, select: { id: true, status: true } })
  if (existing && existing.status !== 'DROPPED') {
    return NextResponse.json({ data: { id: existing.id, status: existing.status, existing: true, says: `${person.name} is already on ${course.title}.` } })
  }

  const row = existing
    ? await prisma.enrollment.update({ where: { id: existing.id }, data: { status: 'ENROLLED', enrolledAt: new Date(), completedAt: null, score: null, certificateUrl: null }, select: { id: true } })
    : await prisma.enrollment.create({ data: { courseId, personId, status: 'ENROLLED' }, select: { id: true } })

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
