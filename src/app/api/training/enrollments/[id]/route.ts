import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { applyMove, type EnrollmentMove } from '@/lib/training'

/**
 * POST /api/training/enrollments/:id   { move: 'start' | 'complete' | 'drop', score?, certificateUrl?, reason? }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Recording training is for whoever develops the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const move = String(body.move ?? '').toLowerCase() as EnrollmentMove
  const score = Number.isFinite(Number(body.score)) && body.score !== '' && body.score != null ? Math.round(Number(body.score)) : null
  const certificateUrl = typeof body.certificateUrl === 'string' && body.certificateUrl.trim() ? body.certificateUrl.trim().slice(0, 2000) : null
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null

  const row = await prisma.enrollment.findFirst({
    where: { id, course: { companyId: caller.company!.id } },
    select: { id: true, status: true, person: { select: { name: true } }, course: { select: { title: true } } },
  })
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That enrollment is not on your books.' } }, { status: 404 })

  const verdict = applyMove(row.status, move, { personName: row.person.name, courseTitle: row.course.title, score, reason })
  if (!verdict.ok) return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 409 })

  await prisma.enrollment.update({
    where: { id },
    data: {
      status: verdict.status,
      ...(verdict.status === 'COMPLETED' ? { completedAt: new Date(), score, certificateUrl } : {}),
    },
  })
  return NextResponse.json({ data: { id, status: verdict.status, says: verdict.says } })
}
