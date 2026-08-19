import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import {
  PACKETS,
  packetByKey,
  resolveItems,
  itemsToAsk,
  progressOf,
  type HeldDocument,
  type PacketSpec,
} from '@/lib/packets'
import {
  deriveSupplierPacket,
  deriveStartPacket,
  explainDerivation,
  differenceFromStatic,
  type Circumstances,
} from '@/lib/packet-derivation'

/**
 * GET  /api/packets — what has been asked for, and how far along
 * POST /api/packets — ask somebody for a set of documents
 *
 * The thing a real programme does every week and had no home for. Four
 * models covered pieces of documents and none of them was a list, so
 * nobody could say "send me these six" and watch five arrive.
 *
 * Two properties make it worth using rather than emailing. It never asks
 * for what is already held and unexpired — the fastest way to be ignored
 * is to ask a supplier for the certificate they sent in March. And the
 * counterparty needs no account, because a supplier's office manager will
 * not create a login to upload a W-9.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Packets belong to a company' } },
      { status: 403 }
    )
  }

  const packets = await prisma.documentPacket.findMany({
    where: { companyId: caller.company.id, cancelledAt: null },
    orderBy: [{ completedAt: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true, packetKey: true, label: true, purpose: true, direction: true,
      recipientEmail: true, recipientName: true,
      expiresAt: true, completedAt: true, reopenedReason: true, createdAt: true,
      subjectCompany: { select: { id: true, name: true } },
      subjectPerson: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      items: {
        orderBy: { position: 'asc' },
        select: { id: true, label: true, required: true, state: true, receivedAt: true },
      },
    },
  })

  const rows = packets.map((p) => {
    const progress = progressOf(
      p.items.map((i) => ({
        label: i.label,
        required: i.required,
        // Received is enough for progress. Whether somebody has reviewed it
        // is a separate question, answered on the packet itself.
        received: i.state === 'RECEIVED' || i.state === 'ACCEPTED',
      }))
    )
    const daysLeft = Math.ceil((p.expiresAt.getTime() - Date.now()) / 86_400_000)
    return {
      id: p.id,
      label: p.label,
      purpose: p.purpose,
      direction: p.direction,
      subject: p.subjectCompany?.name ?? p.subjectPerson?.name ?? p.recipientName ?? p.recipientEmail,
      recipientEmail: p.recipientEmail,
      askedBy: p.createdBy.name,
      askedAt: p.createdAt.toISOString().slice(0, 10),
      progress,
      completedAt: p.completedAt?.toISOString().slice(0, 10) ?? null,
      reopenedReason: p.reopenedReason,
      expiresInDays: daysLeft,
      // A request whose link has expired is one the recipient can no longer
      // act on, which looks identical to them ignoring it.
      linkExpired: daysLeft < 0,
      awaitingReview: p.items.filter((i) => i.state === 'RECEIVED').length,
    }
  })

  return NextResponse.json({
    data: {
      packets: rows,
      // The three things somebody would actually act on.
      open: rows.filter((r) => !r.completedAt && !r.linkExpired).length,
      awaitingReview: rows.reduce((n, r) => n + r.awaitingReview, 0),
      stale: rows.filter((r) => !r.completedAt && r.linkExpired).length,
      available: PACKETS.map((p) => ({
        key: p.key,
        label: p.label,
        purpose: p.purpose,
        subject: p.subject,
        itemCount: p.items.length,
      })),
      canAsk: hasPermission(caller.permissions, 'vendors.manage') ||
        hasPermission(caller.permissions, 'consultants.write'),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Packets belong to a company' } },
      { status: 403 }
    )
  }

  const mayAsk =
    hasPermission(caller.permissions, 'vendors.manage') ||
    hasPermission(caller.permissions, 'consultants.write')
  if (!mayAsk) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Asking a partner for documents needs vendors.manage or consultants.write' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  // ── Derived, where the circumstances are known ──────────────────────
  //
  // A static list is right for the case somebody typed it for and quietly
  // wrong for every other: a UK supplier asked for a W-9, an H-1B holder
  // not asked for their approval notice, a corp-to-corp contractor asked
  // for an I-9 that does not apply to them.
  //
  // Given circumstances, the list is worked out instead. The static packs
  // remain for the case where nothing is known, which is honest rather
  // than lazy — a guess presented as a derivation is worse than a list.
  let spec: PacketSpec | null = null
  let derivedFrom: Circumstances | null = null
  let explanation: string | null = null
  let versusStatic: ReturnType<typeof differenceFromStatic> | null = null

  if (body.circumstances) {
    const c = body.circumstances as Circumstances
    if (!c.country) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Deriving a list needs to know where the work happens — it decides the whole legal frame.',
            field: 'circumstances.country',
          },
        },
        { status: 422 }
      )
    }
    const derived = String(body.for ?? 'SUPPLIER').toUpperCase() === 'START'
      ? deriveStartPacket(c)
      : deriveSupplierPacket(c)

    spec = {
      key: `DERIVED_${derived.purpose}`,
      label: derived.label,
      purpose: derived.purpose,
      subject: derived.subject,
      preamble: derived.preamble,
      items: derived.items,
    }
    derivedFrom = c
    explanation = explainDerivation(derived, c)

    // Shown so somebody can check the derivation rather than trust it.
    const comparable = packetByKey(
      derived.purpose === 'CONTRACT_START' ? 'CONTRACT_START_W2' : 'VENDOR_ONBOARDING_US'
    )
    if (comparable) versusStatic = differenceFromStatic(derived.items, comparable.items)
  } else {
    spec = packetByKey(String(body.packetKey ?? ''))
  }

  if (!spec) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say which set of documents to ask for',
          field: 'packetKey',
          options: PACKETS.map((p) => ({ key: p.key, label: p.label })),
        },
      },
      { status: 422 }
    )
  }

  const recipientEmail = String(body.recipientEmail ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'An email address to send this to', field: 'recipientEmail' } },
      { status: 422 }
    )
  }

  const subjectCompanyId = body.subjectCompanyId ? String(body.subjectCompanyId) : null
  const subjectPersonId = body.subjectPersonId ? String(body.subjectPersonId) : null

  if (spec.subject === 'COMPANY' && !subjectCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `${spec.label} is about a company — say which one`, field: 'subjectCompanyId' } },
      { status: 422 }
    )
  }
  if (spec.subject === 'PERSON' && !subjectPersonId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `${spec.label} is about a person — say who`, field: 'subjectPersonId' } },
      { status: 422 }
    )
  }

  // ── What is already on file ─────────────────────────────────────────
  // The fastest way to be ignored is to ask a supplier for the certificate
  // they sent in March.
  const verifications = await prisma.verification.findMany({
    where: {
      ...(subjectCompanyId ? { companyId: subjectCompanyId } : {}),
      ...(subjectPersonId ? { personId: subjectPersonId } : {}),
    },
    select: { type: true, status: true, expiresAt: true },
  })

  const heldFromVerifications: HeldDocument[] = verifications.map((v) => ({
    key: v.type,
    expiresAt: v.expiresAt,
    // Conditional counts as held — the client decided to accept it, and
    // asking again would relitigate a decision already taken.
    accepted: v.status === 'CLEAR' || v.status === 'CONDITIONAL',
  }))

  // Anything a previous packet already collected and somebody accepted.
  const priorItems = await prisma.packetItem.findMany({
    where: {
      state: 'ACCEPTED',
      packet: {
        companyId: caller.company.id,
        ...(subjectCompanyId ? { subjectCompanyId } : {}),
        ...(subjectPersonId ? { subjectPersonId } : {}),
      },
    },
    select: { key: true, validUntil: true },
  })

  const held: HeldDocument[] = [
    ...heldFromVerifications,
    ...priorItems.map((i) => ({ key: i.key, expiresAt: i.validUntil, accepted: true })),
  ]

  const now = new Date()
  const resolved = resolveItems(spec, held, now)
  const asking = itemsToAsk(resolved)

  if (asking.length === 0) {
    return NextResponse.json({
      data: {
        created: false,
        alreadyHeld: resolved.map((r) => ({ label: r.label, note: r.note })),
        explanation,
        message: `Nothing to ask for — everything in "${spec.label}" is already on file and current.`,
      },
    })
  }

  // ── The request ─────────────────────────────────────────────────────
  const days = Math.min(120, Math.max(7, Number(body.expiresInDays ?? 30)))
  const expiresAt = new Date(now.getTime() + days * 86_400_000)
  const token = randomBytes(32).toString('base64url')

  const packet = await prisma.documentPacket.create({
    data: {
      companyId: caller.company.id,
      packetKey: spec.key,
      label: spec.label,
      purpose: spec.purpose,
      direction: String(body.direction ?? 'COLLECT').toUpperCase() === 'SEND' ? 'SEND' : 'COLLECT',
      subjectCompanyId,
      subjectPersonId,
      recipientEmail,
      recipientName: body.recipientName ? String(body.recipientName).trim() : null,
      token,
      expiresAt,
      createdById: caller.person.id,
      reopenedReason: body.reopenedReason ? String(body.reopenedReason).trim() : null,
      items: {
        create: asking.map((item, position) => ({
          key: item.key,
          label: item.label,
          hint: item.hint,
          required: item.required,
          position,
          state: 'PENDING',
        })),
      },
    },
    select: { id: true, token: true, expiresAt: true, items: { select: { id: true, label: true } } },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'PACKET_REQUESTED',
      summary: `${caller.person.name} asked ${recipientEmail} for ${asking.length} document(s) — ${spec.label}`,
      reason: resolved.length > asking.length
        ? `${resolved.length - asking.length} item(s) skipped because they are already on file and current`
        : 'Nothing was already on file',
      payload: {
        packetId: packet.id,
        packetKey: spec.key,
        asked: asking.map((a) => a.key),
        skipped: resolved.filter((r) => r.state === 'ALREADY_HELD').map((r) => r.key),
      },
      reversible: true,
    },
  })

  void emit({
    type: 'packet.requested',
    companyId: caller.company.id,
    subjectType: 'DocumentPacket',
    subjectId: packet.id,
    actorPersonId: caller.person.id,
    payload: {
      packetKey: spec.key,
      recipientEmail,
      itemCount: asking.length,
      skippedCount: resolved.length - asking.length,
      subjectCompanyId,
      subjectPersonId,
    },
  })

  // If the recipient happens to be somebody here, they get told in-app too.
  const insider = await prisma.person.findUnique({
    where: { primaryEmail: recipientEmail },
    select: { id: true },
  })
  if (insider) {
    void notify({
      personId: insider.id,
      companyId: caller.company.id,
      type: 'SYSTEM',
      title: `${caller.company.name} needs ${asking.length} document(s) from you`,
      body: `${spec.label}: ${asking.map((a) => a.label).join(', ')}`,
      entityId: packet.id,
      channel: 'EMAIL',
    })
  }

  return NextResponse.json(
    {
      data: {
        created: true,
        packetId: packet.id,
        // The link is the credential. Returned once, here, for whoever is
        // sending it on.
        link: `/packet/${packet.token}`,
        expiresAt: packet.expiresAt.toISOString().slice(0, 10),
        asking: asking.map((a) => ({
          label: a.label,
          required: a.required,
          why: a.note,
          // Which rule wanted it. "The system requires it" is the answer
          // that makes somebody phone you.
          becauseOf: (a as any).becauseOf ?? null,
        })),
        derivedFrom,
        explanation,
        versusStatic,
        skipped: resolved
          .filter((r) => r.state === 'ALREADY_HELD')
          .map((r) => ({ label: r.label, note: r.note })),
        message:
          resolved.length > asking.length
            ? `Asking for ${asking.length} of ${resolved.length}. The rest is already on file and current, so we are not asking again.`
            : `Asking for ${asking.length} document(s).`,
      },
    },
    { status: 201 }
  )
}
