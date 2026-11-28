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
      id: true, status: true, personId: true, person: { select: { name: true } },
      cohort: { select: { trainerPersonId: true } },
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
    enrolledPersonId: row.personId,
  })
  if (!who.ok) return NextResponse.json({ error: { code: 'FORBIDDEN', message: who.message } }, { status: 403 })

  // The next number and the row are one step under one lock per
  // (enrollment, skill): two attempts at the same moment would otherwise
  // read the same last number and the second would fail on the unique key.
  const skillKey = String(body.skill ?? '').trim().toLowerCase()
  const noteText = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  let done
  try {
    done = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'assessment:' + id + ':' + skillKey}))`
      const existing = await tx.assessment.findMany({ where: { enrollmentId: id }, select: { skill: true, attempt: true } })
      const next = nextAttempt(existing, String(body.skill ?? ''), body.score)
      if (!next.ok) return { refused: next.message }
      const made = await tx.assessment.create({
        data: { enrollmentId: id, skill: next.skill, score: next.score, attempt: next.attempt, assessorPersonId: caller.person.id, note: noteText },
        select: { id: true },
      })
      return { made, next }
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: { code: 'CONFLICT', message: 'Another attempt was recorded at the same moment. Look again and enter yours.' } }, { status: 409 })
    }
    throw err
  }
  if ('refused' in done) return NextResponse.json({ error: { code: 'VALIDATION', message: done.refused } }, { status: 422 })
  const { made, next } = done
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
