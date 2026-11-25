import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { cohortNext, mayCompleteCohort, type CohortMove } from '@/lib/training'

/**
 * PATCH /api/training/cohorts/:id   { move: 'start' | 'complete' | 'cancel' }  or  { trainerPersonId }
 *
 * Starting a cohort starts the people still only enrolled on it.
 * Finishing one is refused while a trainee has no result, and the
 * sentence names them.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Running a cohort is for whoever develops the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const companyId = caller.company!.id
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const cohort = await prisma.cohort.findFirst({
    where: { id, companyId },
    include: { enrollments: { select: { status: true, person: { select: { name: true } }, _count: { select: { assessments: true } } } } },
  })
  if (!cohort) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That cohort is not on your books.' } }, { status: 404 })

  if (body.trainerPersonId !== undefined) {
    if (cohort.state === 'COMPLETE' || cohort.state === 'CANCELLED') {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: `${cohort.name} is closed. Its trainer stays as it was.` } }, { status: 409 })
    }
    const trainerPersonId = typeof body.trainerPersonId === 'string' && body.trainerPersonId ? body.trainerPersonId : null
    if (trainerPersonId) {
      const seat = await prisma.context.findFirst({ where: { personId: trainerPersonId, companyId, revokedAt: null }, select: { id: true } })
      if (!seat) return NextResponse.json({ error: { code: 'NOT_YOURS', message: 'The trainer must hold a seat at your firm.', field: 'trainerPersonId' } }, { status: 422 })
    }
    await prisma.cohort.update({ where: { id }, data: { trainerPersonId } })
    return NextResponse.json({ data: { id, trainerPersonId, says: trainerPersonId ? `The trainer for ${cohort.name} is set.` : `${cohort.name} has no trainer now.` } })
  }

  const move = String(body.move ?? '').toLowerCase() as CohortMove
  if (!['start', 'complete', 'cancel'].includes(move)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say start, complete or cancel.', field: 'move' } }, { status: 422 })
  }
  const next = cohortNext(cohort.state, move, cohort.name)
  if (!next.ok) return NextResponse.json({ error: { code: 'INVALID_STATE', message: next.message } }, { status: 409 })

  if (move === 'complete') {
    const verdict = mayCompleteCohort({
      name: cohort.name,
      trainees: cohort.enrollments.map((e) => ({ name: e.person.name, status: e.status, assessments: e._count.assessments })),
    })
    if (!verdict.ok) return NextResponse.json({ error: { code: 'NO_RESULT', message: verdict.message } }, { status: 409 })
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.cohort.update({
      where: { id },
      data: { state: next.state, ...(move === 'complete' && !cohort.endsOn ? { endsOn: now } : {}) },
    }),
    ...(move === 'start'
      ? [prisma.enrollment.updateMany({ where: { cohortId: id, status: 'ENROLLED' }, data: { status: 'IN_PROGRESS' } })]
      : []),
  ])
  return NextResponse.json({
    data: {
      id, state: next.state,
      says: move === 'start' ? `${cohort.name} has started.` : move === 'complete' ? `${cohort.name} is finished.` : `${cohort.name} is cancelled.`,
    },
  })
}
