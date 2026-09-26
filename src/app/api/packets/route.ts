import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import {
  PACKETS,
  packetByKey,
  resolveItems,
  itemsToAsk,
  progressOf,
  withRequirements,
  type HeldDocument,
  type PacketSpec,
} from '@/lib/packets'
import {
  requiredOfSupplier,
  requiredOfWorker,
  type RequiredLine,
} from '@/lib/document-request'
import type { EffectiveRequirement } from '@/lib/document-requirements'
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
 * The thing a real program does every week and had no home for. Four
 * models covered pieces of documents and none of them was a list, so
 * nobody could say "send me these six" and watch five arrive.
 *
 * Two properties make it worth using rather than emailing. It never asks
 * for what is already held and unexpired — the fastest way to be ignored
 * is to ask a supplier for the certificate they sent in March. And the
 * counterparty needs no account, because a supplier's office manager will
 * not create a login to upload a W-9.
 */

/**
 * The items the lines between us require of the party this packet is
 * about, ready to merge over the packet.
 *
 * ── Why a submission packet gets none of them ────────────────────────
 *
 * Questions at application, documents at award. A line exists only
 * because somebody was awarded the work, so every requirement read off
 * a line or the order above it is an engagement-stage fact by
 * construction — including one a client invented and `stageFor` has
 * never heard of, which is the case that would otherwise slip through,
 * since an unknown key answers APPLICATION on purpose.
 *
 * So a SUBMISSION packet is left exactly as it ships. Where the subject
 * happens to be somebody already placed, the submission list is still
 * the application list: folding a start's documents into it would ask
 * for a passport before an offer, which is document abuse in the US,
 * discrimination in the UK and excessive collection across the EU.
 *
 * A waived item is not asked for either: this client decided on the
 * record that this line does not need it, and asking again relitigates
 * a decision somebody already took with their name on it. Work
 * authorization cannot be waived at all, and `lib/document-requirements`
 * refuses that waiver before the item ever reaches here.
 */
async function lineRequirements(input: {
  spec: PacketSpec
  companyId: string
  subjectCompanyId: string | null
  subjectPersonId: string | null
}): Promise<{ extras: EffectiveRequirement[]; extraLines: RequiredLine[]; heldBack: string[] }> {
  const nothing = { extras: [], extraLines: [], heldBack: [] }
  if (input.spec.purpose === 'SUBMISSION') return nothing

  const answer = input.subjectCompanyId
    ? await requiredOfSupplier({ companyId: input.companyId, supplierCompanyId: input.subjectCompanyId })
    : input.subjectPersonId
      ? await requiredOfWorker({ companyId: input.companyId, personId: input.subjectPersonId })
      : null
  if (!answer) return nothing

  const onTheFloor = new Set(input.spec.items.map((i) => i.key))
  return {
    extras: answer.items.filter((i) => !i.waived),
    extraLines: answer.lines,
    // Named rather than dropped silently, so the desk that waived
    // something is not left wondering why it vanished off the ask.
    //
    // Only what the waiver actually removed. An item the packet itself
    // ships with is still asked for — a customer waiving its own
    // requirement does not cancel this firm's, and saying it was
    // dropped when it is on the list below would be the log describing
    // a packet nobody sent.
    heldBack: answer.items.filter((i) => i.waived && !onTheFloor.has(i.key)).map((i) => i.label),
  }
}

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
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Asking a supplier or a contractor for their documents',
            needs: ['vendors.manage', 'consultants.write'],
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
        },
      },
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
      {
        error: {
          code: 'VALIDATION',
          message: recipientEmail
            ? `“${body.recipientEmail}” is not an email address. The request needs somewhere to arrive.`
            : 'The request goes to the person who has to answer it. Type their email address first.',
          field: 'recipientEmail',
        },
      },
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
    // `validFrom` as well as `expiresAt`: a packet that treats a policy
    // beginning in October as already held in September asks the supplier
    // for nothing and leaves the gap open.
    select: { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true },
  })

  const heldFromVerifications: HeldDocument[] = verifications.map((v) => ({
    key: v.type,
    // Where the paper does not say when cover begins, the day it was
    // issued is the best floor there is — the same fallback clearance uses.
    validFrom: v.validFrom ?? v.issuedAt,
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
    // A packet item records the life of the document, not its start —
    // there is no floor to read here, and claiming one would be inventing
    // a date nobody typed.
    ...priorItems.map((i) => ({ key: i.key, validFrom: null, expiresAt: i.validUntil, accepted: true })),
  ]

  // ── What the lines actually require, over the packet's own floor ────
  //
  // The packet was a list in this file and nothing behind it. A client
  // whose order asks for a hot floor induction had it refused at the
  // start and chased by the nightly watch, and the one screen whose
  // whole job is asking for documents never mentioned it — because the
  // packet had never heard of the order.
  //
  // So where the subject is somebody we actually trade with, the lines
  // between us are read through `lib/document-requirements` and their
  // items are merged over the packet. The packet stays the floor:
  // nobody orders their way out of a federal form, and a line can make
  // a shipped item required where it was optional but cannot remove it.
  const { extras, extraLines, heldBack } = await lineRequirements({
    spec,
    companyId: caller.company.id,
    subjectCompanyId,
    subjectPersonId,
  })
  const asked = extras.length ? withRequirements(spec, extras) : spec
  const saysFor = new Map(extras.map((e) => [e.key, e.says]))

  const now = new Date()
  const resolved = resolveItems(asked, held, now)
  const asking = itemsToAsk(resolved)

  if (asking.length === 0) {
    return NextResponse.json({
      data: {
        created: false,
        alreadyHeld: resolved.map((r) => ({ label: r.label, note: r.note })),
        explanation,
        message: `Nothing to ask for — everything in "${spec.label}" is already on file and current.`,
        alsoAsked: extras.map((e) => ({ label: e.label, says: e.says })),
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
      reason:
        (resolved.length > asking.length
          ? `${resolved.length - asking.length} item(s) skipped because they are already on file and current`
          : 'Nothing was already on file') +
        (extras.length
          ? `. ${extras.length} of them ${extras.length === 1 ? 'is' : 'are'} asked for by the lines between the two firms rather than by the packet: ` +
            extras.map((e) => `${e.label} (${e.says})`).join('; ')
          : '') +
        (heldBack.length
          ? `. ${heldBack.join(', ')} ${heldBack.length === 1 ? 'was' : 'were'} waived on the line and ${heldBack.length === 1 ? 'is' : 'are'} not asked for again`
          : ''),
      payload: {
        packetId: packet.id,
        packetKey: spec.key,
        fromLines: extraLines.map((l) => `${l.side}:${l.id}`),
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
          // Which rule wanted it, in the order's own words. "The system
          // requires it" is the answer that makes somebody phone you.
          becauseOf: saysFor.get(a.key) ?? null,
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
