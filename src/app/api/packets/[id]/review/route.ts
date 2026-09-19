import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { progressOf } from '@/lib/packets'

/**
 * POST /api/packets/:id/review   { itemId, action: 'accept' | 'reject', note?, validUntil? }
 *
 * Somebody looking at what arrived.
 *
 * A file arriving is not the same as a file being right, and collapsing
 * the two is how an expired certificate passes for a current one. So
 * uploads land as RECEIVED and a person moves them to ACCEPTED or
 * REJECTED — and accepting an insurance certificate asks when it expires,
 * because that date is what stops the next placement.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Packets belong to a company' } },
      { status: 403 }
    )
  }

  const mayReview =
    hasPermission(caller.permissions, 'vendors.manage') ||
    hasPermission(caller.permissions, 'consultants.write')
  if (!mayReview) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Reviewing documents needs vendors.manage or consultants.write' } },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const itemId = String(body.itemId ?? '')
  const action = String(body.action ?? '')
  const note = String(body.note ?? '').trim()

  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: "action is 'accept' or 'reject'", field: 'action' } },
      { status: 422 }
    )
  }

  // A rejection with no reason sends the counterparty back to a blank
  // screen to guess what was wrong with it.
  if (action === 'reject' && !note) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say what was wrong with it, so they can send the right thing', field: 'note' } },
      { status: 422 }
    )
  }

  const packet = await prisma.documentPacket.findFirst({
    where: { id, companyId: caller.company.id },
    select: { id: true, label: true, completedAt: true, recipientEmail: true },
  })
  if (!packet) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such packet here' } },
      { status: 404 }
    )
  }

  const item = await prisma.packetItem.findFirst({
    where: { id: itemId, packetId: id },
    select: { id: true, key: true, label: true, state: true },
  })
  if (!item) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such item on this packet' } },
      { status: 404 }
    )
  }
  if (item.state === 'PENDING') {
    return NextResponse.json(
      { error: { code: 'NOTHING_TO_REVIEW', message: `${item.label} has not been sent yet` } },
      { status: 409 }
    )
  }

  // When it stops counting. Without this an insurance certificate accepted
  // today is treated as good forever, which is the failure the whole expiry
  // mechanism exists to prevent.
  const validUntil = body.validUntil ? new Date(String(body.validUntil)) : null
  if (action === 'accept' && validUntil && Number.isNaN(validUntil.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Give the date it expires, like 2027-06-30', field: 'validUntil' } },
      { status: 422 }
    )
  }

  await prisma.packetItem.update({
    where: { id: itemId },
    data: {
      state: action === 'accept' ? 'ACCEPTED' : 'REJECTED',
      reviewedById: caller.person.id,
      reviewedAt: new Date(),
      reviewNote: note || null,
      ...(action === 'accept' ? { validUntil } : {}),
      // A rejected document is not held, so it must be asked for again.
      ...(action === 'reject' ? { fileUrl: null, receivedAt: null } : {}),
    },
  })

  const fresh = await prisma.packetItem.findMany({
    where: { packetId: id },
    orderBy: { position: 'asc' },
    select: { label: true, required: true, state: true },
  })
  const progress = progressOf(
    fresh.map((i) => ({
      label: i.label,
      required: i.required,
      received: i.state === 'RECEIVED' || i.state === 'ACCEPTED',
    }))
  )

  // Rejecting the last outstanding item reopens a packet that had closed.
  await prisma.documentPacket.update({
    where: { id },
    data: { completedAt: progress.complete ? (packet.completedAt ?? new Date()) : null },
  })

  void emit({
    type: 'verification.recorded',
    companyId: caller.company.id,
    subjectType: 'PacketItem',
    subjectId: itemId,
    actorPersonId: caller.person.id,
    payload: {
      packetId: id,
      itemKey: item.key,
      action,
      validUntil: validUntil?.toISOString() ?? null,
      note: note || null,
    },
  })

  return NextResponse.json({
    data: {
      itemId,
      state: action === 'accept' ? 'ACCEPTED' : 'REJECTED',
      progress,
      message:
        action === 'accept'
          ? validUntil
            ? `${item.label} accepted, good until ${validUntil.toISOString().slice(0, 10)}. We will ask again before it lapses.`
            : `${item.label} accepted.`
          : `${item.label} sent back to ${packet.recipientEmail}. They can see why and send another.`,
    },
  })
}
