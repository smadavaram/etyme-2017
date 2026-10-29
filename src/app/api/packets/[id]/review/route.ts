import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { progressOf } from '@/lib/packets'
import { accessActor } from '@/lib/access-log'
import { examinationOf, paperFollowsItem } from '@/app/api/packets/examination'

/**
 * POST /api/packets/:id/review   { itemId, action: 'accept' | 'reject', note?, validUntil? }
 *   accepting an examined paper may also carry what was examined, the
 *   same fields a recorded check takes:
 *   { formEdition, evidence: [{ type, expiresAt }] }        an I-9
 *   { issuer, licenseNumber, licenseState, expiresAt }      a license
 *   { expiresAt }  (or validUntil)                          a passport, a visa
 *
 * Somebody looking at what arrived.
 *
 * A file arriving is not the same as a file being right, and collapsing
 * the two is how an expired certificate passes for a current one. So
 * uploads land as RECEIVED and a person moves them to ACCEPTED or
 * REJECTED — and accepting an insurance certificate asks when it expires,
 * because that date is what stops the next placement.
 *
 * ── An accepted paper reaches the start check (2026-10-20) ─────────
 *
 * Found by the simulation: an I-9 or a license accepted here was a
 * packet row and nothing else, and the start check reads recorded checks
 * only, so a placement whose papers had all been accepted still could
 * not start. Now accepting a paper of a kind the start check reads, by
 * the firm that employs or places the person, records the examination
 * through the same rule and the same writer as Record a check
 * (`checkToRecord`, `mayRecordCheck`, `writeCheck`), and the item keeps
 * the row it became. So it is read exactly as a recorded check is,
 * because it is one.
 *
 * What is never true: a file accepted with nothing examined counting as
 * an examination. An I-9 needs its edition and the document behind it;
 * a license its board and number; a passport the day it runs out. Where
 * those are not given the file is still accepted — somebody looked at
 * it — and the answer says, in a sentence, that it does not count toward
 * the start yet and what to give. Where they are given and wrong, nothing
 * changes and the sentence says what to fix. A screening company's
 * verdict never comes from a packet: the report goes to the firm that
 * ordered it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Document requests are reviewed by the company that sent them, and you are not signed in at one. Anything a company asks you for is under Your paperwork.' } },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const itemId = String(body.itemId ?? '')
  const action = String(body.action ?? '')
  const note = String(body.note ?? '').trim()

  // Whose packet first, then whose seat. Until 2026-10-21 the seat was
  // checked first, so a seat at a firm that never sent this packet was told
  // to ask its program manager, who then read "No such packet here" (found
  // by the document-flow walk). A packet that is not this firm's is not
  // here, for every seat; a refusal names a person only where that person
  // can act.
  const packet = await prisma.documentPacket.findFirst({
    where: { id, companyId: caller.company.id },
    select: { id: true, label: true, completedAt: true, recipientEmail: true, subjectPersonId: true, subjectCompanyId: true },
  })
  if (!packet) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That document request was not sent by your company, so there is nothing here to review.' } },
      { status: 404 }
    )
  }

  const mayReview =
    hasPermission(caller.permissions, 'vendors.manage') ||
    hasPermission(caller.permissions, 'consultants.write')
  if (!mayReview) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reviewing the documents somebody sent back',
            needs: ['vendors.manage', 'consultants.write'],
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

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

  // ── Whether accepting this paper records an examination ──
  const now = new Date()
  const examined = action === 'accept' ? await examinationOf({
    packet, item, body, validUntil, now,
    caller: {
      companyId: caller.company.id,
      companyName: caller.company.name,
      personId: caller.person.id,
      personName: caller.person.name,
      holds: (p) => hasPermission(caller.permissions ?? [], p as never),
      actor: accessActor(caller),
    },
  }) : null
  if (examined?.refused) {
    return NextResponse.json(
      { error: { code: examined.refused.code, message: examined.refused.message, ...(examined.refused.field ? { field: examined.refused.field } : {}) } },
      { status: examined.refused.status }
    )
  }

  await prisma.packetItem.update({
    where: { id: itemId },
    data: {
      ...(examined?.verificationId ? { verificationId: examined.verificationId } : {}),
      state: action === 'accept' ? 'ACCEPTED' : 'REJECTED',
      reviewedById: caller.person.id,
      reviewedAt: new Date(),
      reviewNote: note || null,
      ...(action === 'accept' ? { validUntil } : {}),
      // A rejected document is not held, so it must be asked for again.
      ...(action === 'reject' ? { fileUrl: null, receivedAt: null } : {}),
    },
  })

  // The paper kept from this item reads the same verdict on Paperwork.
  await paperFollowsItem({ itemId, accepted: action === 'accept', reviewerId: caller.person.id, validUntil })

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
      // Whether it reaches the start check, said either way: an accepted
      // paper that does not count is never left to look as if it did.
      countsTowardStart: examined ? !!examined.verificationId : null,
      message:
        action === 'accept'
          ? (validUntil
              ? `${item.label} accepted, good until ${validUntil.toISOString().slice(0, 10)}. We will ask again before it lapses.`
              : `${item.label} accepted.`) + (examined?.says ? ` ${examined.says}` : '')
          : `${item.label} sent back to ${packet.recipientEmail}. They can see why and send another.`,
    },
  })
}
