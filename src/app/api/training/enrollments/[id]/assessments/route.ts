import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { mayAssess, nextAttempt } from '@/lib/training'
import { callerRoleName } from '@/lib/training/caller'

/**
 * POST /api/training/enrollments/:id/assessments   { skill, score, note? }
 *
 * One scored attempt at one skill. Never overwrites: a retake is the
 * next attempt, and every earlier one stays on the record.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Recording an assessment is for whoever develops the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const row = await prisma.enrollment.findFirst({
    where: { id, course: { companyId: caller.company!.id } },
    select: {
      id: true, status: true, person: { select: { name: true } },
      cohort: { select: { trainerPersonId: true } },
      assessments: { select: { skill: true, attempt: true } },
    },
  })
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That enrollment is not on your books.' } }, { status: 404 })
  if (row.status === 'DROPPED') {
    return NextResponse.json({ error: { code: 'INVALID_STATE', message: `${row.person.name} dropped the course. There is nothing to assess.` } }, { status: 409 })
  }

  const who = mayAssess({
    callerPersonId: caller.person.id,
    callerRole: await callerRoleName(caller),
    trainerPersonId: row.cohort?.trainerPersonId ?? null,
  })
  if (!who.ok) return NextResponse.json({ error: { code: 'FORBIDDEN', message: who.message } }, { status: 403 })

  const next = nextAttempt(row.assessments, String(body.skill ?? ''), body.score)
  if (!next.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: next.message } }, { status: 422 })

  const made = await prisma.assessment.create({
    data: {
      enrollmentId: id, skill: next.skill, score: next.score, attempt: next.attempt,
      assessorPersonId: caller.person.id,
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null,
    },
    select: { id: true },
  })
  return NextResponse.json(
    {
      data: {
        id: made.id, skill: next.skill, score: next.score, attempt: next.attempt,
        says: `${row.person.name}: ${next.skill} ${next.score}${next.attempt > 1 ? `, attempt ${next.attempt}. The earlier ${next.attempt - 1 === 1 ? 'attempt stays' : 'attempts stay'} on the record` : ''}.`,
      },
    },
    { status: 201 }
  )
}
