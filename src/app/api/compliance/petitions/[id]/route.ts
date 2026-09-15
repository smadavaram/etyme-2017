import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { applyMove, type Move } from '@/lib/visa-petition'

/**
 * POST /api/compliance/petitions/:id   { move, occurredAt?, expiresAt?, notes? }
 *
 * One move on a petition — RFE, evidence sent, approved, denied, stamped,
 * active — with an event written for it. The rule is lib/visa-petition.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Visa petitions')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Recording a petition's progress is for whoever looks after the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const move = String(body.move ?? '').toUpperCase() as Move
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date()
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null

  const petition = await prisma.visaPetition.findUnique({
    where: { id },
    select: {
      id: true, status: true, type: true, expiresAt: true,
      person: {
        select: {
          name: true,
          contexts: { where: { companyId: caller.company!.id, revokedAt: null }, select: { id: true } },
          consultant: { select: { listings: { where: { companyId: caller.company!.id, state: 'GRANTED' }, select: { id: true } } } },
        },
      },
    },
  })
  const ours = petition && (petition.person.contexts.length > 0 || (petition.person.consultant?.listings.length ?? 0) > 0)
  if (!petition || !ours) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That petition is not on your books.' } }, { status: 404 })
  }

  const verdict = applyMove(petition.status, move, { personName: petition.person.name, type: petition.type, expiresAt: expiresAt ?? petition.expiresAt })
  if (!verdict.ok) {
    return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 409 })
  }

  await prisma.visaPetition.update({
    where: { id },
    data: {
      status: verdict.status,
      ...(move === 'APPROVED' ? { approvedAt: occurredAt, expiresAt: expiresAt ?? petition.expiresAt } : {}),
      ...(expiresAt && move !== 'APPROVED' ? { expiresAt } : {}),
      events: { create: { eventType: verdict.event, occurredAt, notes } },
    },
  })

  return NextResponse.json({ data: { id, status: verdict.status, says: verdict.says } })
}
