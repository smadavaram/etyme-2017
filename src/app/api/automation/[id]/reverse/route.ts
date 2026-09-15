import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * POST /api/automation/:id/reverse
 *
 * BUILD.md §3 — The machine: "only where reversible is true"
 *
 * Marks an automation log entry as reversed. The actual reversal logic
 * depends on the action type — this endpoint records the reversal and
 * returns the entry. Domain-specific undo logic (e.g. unclaiming a
 * rolloff, revoking a bench listing) lives in the respective endpoints;
 * this serves as the audit trail.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const entry = await prisma.automationLog.findFirst({
    where: {
      id,
      companyId: caller.company?.id,
    },
  })

  if (!entry) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Automation log entry not found' } },
      { status: 404 }
    )
  }

  if (!entry.reversible) {
    return NextResponse.json(
      { error: { code: 'NOT_REVERSIBLE', message: 'This action cannot be reversed' } },
      { status: 422 }
    )
  }

  if (entry.reversedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY_REVERSED', message: 'This action was already reversed' } },
      { status: 409 }
    )
  }

  const now = new Date()

  const [updated] = await prisma.$transaction([
    prisma.automationLog.update({
      where: { id },
      data: { reversedAt: now },
    }),
    // Log the reversal itself
    prisma.automationLog.create({
      data: {
        companyId: entry.companyId,
        action: 'REVERSAL',
        summary: `Reversed: ${entry.summary}`,
        reason: `${caller.person.name} reversed automation action ${entry.action}`,
        payload: { reversedEntryId: entry.id, originalAction: entry.action },
        reversible: false,
      },
    }),
  ])

  return NextResponse.json({
    data: {
      id: updated.id,
      action: updated.action,
      summary: updated.summary,
      reversedAt: updated.reversedAt?.toISOString(),
    },
  })
}
