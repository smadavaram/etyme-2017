import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * PATCH /api/rolloff/:id/checklist
 *
 * Toggles a single checklist item on a rolloff event.
 * Body: { item: "knowledgeTransfer" | "finalTimesheet" | "accessRevocation" | "assets" }
 *
 * CLAUDE.md: "Anything the system does unprompted writes an AutomationLog row"
 * This is user-initiated, so no AutomationLog needed — just the update.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
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
