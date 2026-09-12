import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { checkReview } from '@/lib/review'

/**
 * POST /api/checks/:id/review
 *
 * A person agreeing or disagreeing with what the machine decided.
 *
 * The disagreement is the valuable half — it is the only input that
 * improves the agent — so the note is required there and not on an
 * agreement.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The check queue')
  if (notStaff) return notStaff

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const agreed = body.agreed === true
  const note: string | null = typeof body.note === 'string' ? body.note.trim() : null

  const verdict = checkReview({ agreed, note })
  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: 'NEEDS_REASON', message: verdict.reason, field: 'note' } },
      { status: 422 }
    )
  }

  const check = await prisma.check.findFirst({
    where: { id, companyId: caller.company!.id },
    select: { id: true, agreed: true },
  })

  if (!check) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No check by that id.' } },
      { status: 404 }
    )
  }

  // Reviewed once. A second opinion overwriting the first would quietly
  // change the agreement rate that the whole surface is here to report.
  if (check.agreed !== null) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_REVIEWED',
          message: 'Somebody has already looked at this one.',
        },
      },
      { status: 409 }
    )
  }

  await prisma.check.update({
    where: { id },
    data: {
      agreed,
      disagreedNote: agreed ? null : note,
      checkedById: realPersonId(caller),
    },
  })

  return NextResponse.json({ data: { id, agreed, said: verdict.reason } })
}
