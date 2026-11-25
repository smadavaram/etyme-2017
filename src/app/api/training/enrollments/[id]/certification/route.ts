import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { mayCertify } from '@/lib/training'
import { callerRoleName } from '@/lib/training/caller'

/**
 * POST /api/training/enrollments/:id/certification   { title, expiresAt?, evidenceUrl? }
 *
 * Issued by the person who assessed her or by the cohort's trainer, once
 * her own course is finished. Never a recruiter.
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
      { error: { code: 'FORBIDDEN', message: `Certifying somebody is for whoever develops the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const row = await prisma.enrollment.findFirst({
    where: { id, course: { companyId: caller.company!.id } },
    select: {
      id: true, status: true, person: { select: { name: true } },
      course: { select: { title: true } },
      cohort: { select: { trainerPersonId: true } },
      assessments: { select: { assessorPersonId: true } },
    },
  })
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That enrollment is not on your books.' } }, { status: 404 })

  const verdict = mayCertify({
    enrollmentStatus: row.status,
    personName: row.person.name,
    callerPersonId: caller.person.id,
    callerRole: await callerRoleName(caller),
    trainerPersonId: row.cohort?.trainerPersonId ?? null,
    assessorPersonIds: row.assessments.map((a) => a.assessorPersonId),
  })
  if (!verdict.ok) return NextResponse.json({ error: { code: 'FORBIDDEN', message: verdict.message } }, { status: 403 })

  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : row.course.title
  const now = new Date()
  const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= now)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'A certification must expire after today, or not at all.', field: 'expiresAt' } }, { status: 422 })
  }
  const held = await prisma.certification.findUnique({ where: { enrollmentId_title: { enrollmentId: id, title } }, select: { id: true } })
  if (held) {
    return NextResponse.json({ error: { code: 'ALREADY_EXISTS', message: `${row.person.name} already holds ${title}.` } }, { status: 409 })
  }
  const made = await prisma.certification.create({
    data: {
      enrollmentId: id, title, issuedAt: now, expiresAt, issuedByPersonId: caller.person.id,
      evidenceUrl: typeof body.evidenceUrl === 'string' && body.evidenceUrl.trim() ? body.evidenceUrl.trim().slice(0, 2000) : null,
    },
    select: { id: true },
  })
  return NextResponse.json({ data: { id: made.id, title, says: `${row.person.name} is certified: ${title}.` } }, { status: 201 })
}
