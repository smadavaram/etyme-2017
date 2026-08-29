import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { progressOf } from '@/lib/packets'

/**
 * GET  /api/packet/:token — what the recipient is being asked for
 * POST /api/packet/:token — they send something back
 *
 * Singular, and separate from /api/packets, because these are two
 * different surfaces: one is a company's list of requests, the other is a
 * stranger's view of one. Next.js also refuses to have :token and :id at
 * the same level, which is the router agreeing.
 *
 * No authentication. The token is the credential, exactly as it is for
 * sharing files with a lawyer. A supplier's office manager will not create
 * a login to upload a W-9, and a system that requires one does not get the
 * W-9 — it gets an email with an attachment and a person retyping things.
 *
 * Everything about this route assumes the caller is a stranger. It says
 * nothing about the company beyond its name, never lists other packets,
 * and refuses the moment the link is out of date.
 */

async function loadByToken(token: string) {
  return prisma.documentPacket.findUnique({
    where: { token },
    select: {
      id: true, label: true, purpose: true, direction: true,
      expiresAt: true, completedAt: true, cancelledAt: true, reopenedReason: true,
      recipientName: true,
      company: { select: { name: true } },
      subjectCompany: { select: { name: true } },
      subjectPerson: { select: { name: true } },
      items: {
        // Stable order. Without it the list rearranges every time somebody
        // uploads, which reads as the page losing their work.
        orderBy: { position: 'asc' },
        select: {
          id: true, key: true, label: true, hint: true, required: true,
          state: true, fileName: true, fileUrl: true, receivedAt: true, reviewNote: true,
        },
      },
    },
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const packet = await loadByToken(token)

  // The same answer for a wrong token and a revoked one. Telling a stranger
  // which of the two it was is telling them whether to keep guessing.
  if (!packet || packet.cancelledAt) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This link is not valid. Ask whoever sent it for a new one.' } },
      { status: 404 }
    )
  }

  if (packet.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      {
        error: {
          code: 'EXPIRED',
          message: `This link expired on ${packet.expiresAt.toISOString().slice(0, 10)}. Ask ${packet.company.name} for a new one — nothing you sent before is lost.`,
        },
      },
      { status: 410 }
    )
  }

  const progress = progressOf(
    packet.items.map((i) => ({
      label: i.label,
      required: i.required,
      received: i.state === 'RECEIVED' || i.state === 'ACCEPTED',
    }))
  )

  // COLLECT — they send us things. SEND — we are giving them ours, and
  // the page is a list of downloads rather than a list of upload buttons.
  const outbound = packet.direction === 'SEND'

  return NextResponse.json({
    data: {
      direction: packet.direction,
      label: packet.label,
      from: packet.company.name,
      about: packet.subjectCompany?.name ?? packet.subjectPerson?.name ?? null,
      greeting: packet.recipientName ? `Hello ${packet.recipientName}` : null,
      reopenedReason: packet.reopenedReason,
      expiresAt: packet.expiresAt.toISOString().slice(0, 10),
      complete: Boolean(packet.completedAt),
      progress,
      items: packet.items.map((i) => ({
        id: i.id,
        label: i.label,
        hint: i.hint,
        required: i.required,
        state: i.state,
        fileName: i.fileName,
        receivedAt: i.receivedAt?.toISOString().slice(0, 10) ?? null,
        // The file itself is handed back only on a pack we are sending.
        // On a collection, handing an uploader's file back through the
        // link would let anybody holding the token read what somebody
        // else sent.
        fileUrl: outbound ? i.fileUrl : null,
        // Only a rejection reason is shown back. Internal review notes on
        // an accepted document are not the sender's business.
        note: i.state === 'REJECTED' ? i.reviewNote : null,
      })),
    },
  })
}

/**
 * POST — the recipient sends something.
 *
 * Records the file against one item and moves it to RECEIVED, not
 * ACCEPTED. A file arriving is not the same as somebody having looked at
 * it, and collapsing the two is how an expired certificate passes for a
 * current one.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const packet = await loadByToken(token)

  if (!packet || packet.cancelledAt) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This link is not valid. Ask whoever sent it for a new one.' } },
      { status: 404 }
    )
  }
  if (packet.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: { code: 'EXPIRED', message: 'This link has expired. Ask for a new one — nothing you sent before is lost.' } },
      { status: 410 }
    )
  }

  // A pack we are sending is a set of downloads. Letting the recipient
  // write into it would let anybody holding the link overwrite our own
  // certificate of insurance with their own file.
  if (packet.direction === 'SEND') {
    return NextResponse.json(
      {
        error: {
          code: 'READ_ONLY',
          message:
            'These are documents being sent to you, not asked of you. If you need something else from us, reply to whoever sent the link.',
        },
      },
      { status: 405 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const itemId = String(body.itemId ?? '')
  const fileUrl = String(body.fileUrl ?? '').trim()
  const fileName = String(body.fileName ?? '').trim()

  const item = packet.items.find((i) => i.id === itemId)
  if (!item) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That is not one of the things being asked for here.' } },
      { status: 404 }
    )
  }
  if (!fileUrl || !fileName) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Attach a file', field: 'fileUrl' } },
      { status: 422 }
    )
  }

  await prisma.packetItem.update({
    where: { id: itemId },
    data: {
      fileUrl,
      fileName,
      state: 'RECEIVED',
      receivedAt: new Date(),
      // A resend clears the previous rejection, so the note does not sit
      // over a document that has since been replaced.
      reviewNote: null,
      reviewedById: null,
      reviewedAt: null,
    },
  })

  // Recount from the database rather than from what was loaded, since two
  // people may be uploading at once.
  const fresh = await prisma.packetItem.findMany({
    where: { packetId: packet.id },
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

  if (progress.complete && !packet.completedAt) {
    await prisma.documentPacket.update({
      where: { id: packet.id },
      data: { completedAt: new Date() },
    })
  }

  const full = await prisma.documentPacket.findUnique({
    where: { id: packet.id },
    select: { companyId: true, createdById: true, label: true, recipientEmail: true },
  })

  void emit({
    type: progress.complete ? 'packet.completed' : 'packet.item_received',
    companyId: full?.companyId ?? null,
    subjectType: 'DocumentPacket',
    subjectId: packet.id,
    // Nobody signed in. An outside upload is not a person in this system.
    actorKind: 'SERVICE',
    payload: {
      itemKey: item.key,
      itemLabel: item.label,
      fileName,
      received: progress.received,
      total: progress.total,
      complete: progress.complete,
    },
  })

  // Whoever asked gets told, because the whole point is not having to chase.
  if (full?.createdById) {
    void notify({
      personId: full.createdById,
      companyId: full.companyId,
      type: 'SYSTEM',
      title: progress.complete
        ? `${full.recipientEmail} finished "${full.label}"`
        : `${item.label} arrived from ${full.recipientEmail}`,
      body: progress.summary,
      entityId: packet.id,
    })
  }

  return NextResponse.json({
    data: {
      itemId,
      state: 'RECEIVED',
      progress,
      message: progress.complete
        ? 'That is everything. Thank you — nothing more is needed from you.'
        : `Got it. ${progress.summary}`,
    },
  })
}
