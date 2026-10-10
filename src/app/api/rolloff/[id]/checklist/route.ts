import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasAnyPermission } from '@/lib/permissions'
import { ENDING_SOON_READERS, notYoursToRead } from '@/lib/releasing-soon'
import { prisma } from '@/lib/db'

/**
 * PATCH /api/rolloff/:id/checklist
 *
 * Toggles a single checklist item on a rolloff event.
 * Body: { item: "knowledgeTransfer" | "finalTimesheet" | "accessRevocation" | "assets" }
 *
 * CLAUDE.md: "Anything the system does unprompted writes an AutomationLog row"
 * This is user-initiated, so no AutomationLog needed — just the update.
 *
 * The rolloff belongs to the firm holding the contract, and only it may
 * tick these off. The route checked that somebody was signed in and not
 * who they were, so any account could mark another firm's access revoked
 * or its final timesheet in.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // The desks that read the board work it. A worker's seat holding only
  // the reads of his own work does not claim, tick off or resolve a
  // colleague's offboarding (sign-up walk round five, the own-work seat).
  if (!hasAnyPermission(caller.permissions, ENDING_SOON_READERS)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: notYoursToRead('Who is rolling off', caller.company?.name) } },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json()
  const { item } = body

  const validItems = ['knowledgeTransfer', 'finalTimesheet', 'accessRevocation', 'assets']
  if (!item || !validItems.includes(item)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `item must be one of: ${validItems.join(', ')}`, field: 'item' } },
      { status: 422 }
    )
  }

  const rolloff = await prisma.rolloffEvent.findUnique({
    where: { id },
    select: { id: true, checklist: true, sellContract: { select: { companyId: true } } },
  })

  if (!rolloff) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Rolloff event not found' } },
      { status: 404 }
    )
  }

  if (caller.company?.id !== rolloff.sellContract.companyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the firm holding this contract can work its rolloff checklist' } },
      { status: 403 }
    )
  }

  // Toggle the item
  const checklist = (rolloff.checklist as Record<string, boolean>) ?? {}
  checklist[item] = !checklist[item]

  await prisma.rolloffEvent.update({
    where: { id },
    data: { checklist },
  })

  return NextResponse.json({
    data: {
      id,
      checklist,
      message: `${item} ${checklist[item] ? 'completed' : 'unchecked'}`,
    },
  })
}
