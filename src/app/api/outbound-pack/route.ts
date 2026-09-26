import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { emit } from '@/lib/events'
import {
  OUTBOUND_PACKS,
  outboundPackByKey,
  assemble,
  linkLife,
  packForLine,
  readinessAcross,
  DEFAULT_HORIZON_DAYS,
  type OutboundPackSpec,
} from '@/lib/outbound-pack'
import { requiredOfUsBy } from '@/lib/document-request'
import { loadOwnDocuments } from './own-documents'

/**
 * GET  /api/outbound-pack — can we answer a client's screening today
 * POST /api/outbound-pack — send our own documents to a named recipient
 *
 * The direction nobody built. Everything under /api/packets asks somebody
 * else for documents; this answers the same question pointed at us, which
 * a staffing vendor is asked several times a month and answers by
 * searching a shared drive at nine at night.
 *
 * The one rule the POST enforces without an override: **an expired
 * document is never sent**, and neither is one whose expiry nobody
 * recorded. A lapsed certificate of insurance in a client's procurement
 * inbox is a written claim that we are covered when we are not. There is
 * no force flag here and there should never be one — the way to send a
 * lapsed certificate is to renew it.
 */


/**
 * The customers this firm bills, for the "who asked for it" picker.
 *
 * A pack is answered to somebody, and which somebody decides what is in
 * it: a client whose own order requires a certificate of good standing
 * is answered with one. Read off the lines rather than typed, because a
 * list somebody maintains by hand is a list that is wrong by the second
 * week.
 */
async function customersOf(companyId: string): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.sellContract.findMany({
    where: { companyId, state: { notIn: ['ENDED', 'CANCELLED'] } },
    select: { clientCompany: { select: { id: true, name: true } } },
    take: 200,
  })
  const byId = new Map<string, { id: string; name: string }>()
  for (const r of rows) if (r.clientCompany) byId.set(r.clientCompany.id, r.clientCompany)
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The packs as this customer's own orders ask for them.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * `packForLine` has been able to do this since the day the table
 * landed and nothing in production called it, so a client that asked
 * for a document on its order was screened against a list in a file
 * that had never heard of the order. The lines this firm bills that
 * customer on are read through `lib/document-requirements`, and only
 * what this firm itself owes comes across: an item the set says the
 * worker owes is her file, and sending it to a procurement team in a
 * qualification pack is the document abuse the two-stage split exists
 * to stop.
 */
async function packsFor(
  companyId: string,
  clientCompanyId: string | null
): Promise<{ packs: OutboundPackSpec[]; added: { key: string; label: string; says: string }[] }> {
  if (!clientCompanyId) return { packs: OUTBOUND_PACKS, added: [] }
  const answer = await requiredOfUsBy({ companyId, clientCompanyId })
  if (answer.items.length === 0) return { packs: OUTBOUND_PACKS, added: [] }

  const packs = OUTBOUND_PACKS.map((p) => packForLine(p, answer.items))
  const shipped = new Set(OUTBOUND_PACKS.flatMap((p) => p.items.map((i) => i.key)))
  const added = answer.items
    .filter((i) => !shipped.has(i.key) && (i.owedBy === 'SUPPLIER' || i.owedBy === 'US') && !i.waived)
    .map((i) => ({ key: i.key, label: i.label, says: i.says }))
  return { packs, added }
}

/** Sending our own legal and financial papers out of the building. */
function maySend(permissions: readonly string[]) {
  return (
    hasPermission(permissions, 'settings.manage') ||
    hasPermission(permissions, 'vendors.manage')
  )
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_COMPANY',
          message: 'An outbound pack is a company answering for itself. This account is not in one.',
        },
      },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const horizonParam = url.searchParams.get('horizonDays')
  const horizonDays = horizonParam ? Math.max(1, Math.min(730, Number(horizonParam))) : DEFAULT_HORIZON_DAYS

  // Who is doing the screening. A pack answered to nobody in particular
  // is the shipped list; a pack answered to a customer is that
  // customer's own order as well.
  const askedById = url.searchParams.get('clientCompanyId')
  const customers = await customersOf(caller.company.id)
  const askedBy = askedById ? customers.find((c) => c.id === askedById) ?? null : null

  const held = await loadOwnDocuments(caller.company.id)
  const now = new Date()
  const { packs: specs, added } = await packsFor(caller.company.id, askedBy?.id ?? null)
  const packs = readinessAcross(held, now, {
    horizonDays: Number.isFinite(horizonDays) ? horizonDays : DEFAULT_HORIZON_DAYS,
    packs: specs,
  })

  const sent = await prisma.documentPacket.findMany({
    where: { companyId: caller.company.id, direction: 'SEND', cancelledAt: null },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, packetKey: true, label: true, purpose: true,
      recipientEmail: true, recipientName: true,
      expiresAt: true, createdAt: true,
      createdBy: { select: { name: true } },
      items: { select: { label: true, validUntil: true } },
    },
  })

  const sentRows = sent.map((p) => {
    const daysLeft = Math.ceil((p.expiresAt.getTime() - now.getTime()) / 86_400_000)
    // The earliest document inside it. A recipient opening the link after
    // this date reads a lapsed certificate as current, which is the exact
    // failure this whole file exists to prevent.
    const earliest = p.items
      .filter((i) => i.validUntil)
      .sort((a, b) => (a.validUntil as Date).getTime() - (b.validUntil as Date).getTime())[0]
    return {
      id: p.id,
      label: p.label,
      packetKey: p.packetKey,
      purpose: p.purpose,
      to: p.recipientName ?? p.recipientEmail,
      recipientEmail: p.recipientEmail,
      sentBy: p.createdBy.name,
      sentAt: p.createdAt.toISOString().slice(0, 10),
      itemCount: p.items.length,
      expiresAt: p.expiresAt.toISOString().slice(0, 10),
      expiresInDays: daysLeft,
      linkExpired: daysLeft < 0,
      earliestDocument: earliest
        ? {
            label: earliest.label,
            expiresAt: (earliest.validUntil as Date).toISOString().slice(0, 10),
          }
        : null,
    }
  })

  const notReady = packs.filter((p) => !p.ready)

  return NextResponse.json({
    data: {
      horizonDays,
      // The firms this pack could be answered to, and the one it is
      // being answered to now.
      customers,
      askedBy,
      // What this customer's own order adds to every pack, said out
      // loud — a document appearing in a list with no explanation is a
      // document somebody deletes.
      addedByCustomer: added,
      addedSays:
        added.length === 0
          ? null
          : `${askedBy?.name ?? 'This customer'} asks for ` +
            `${added.map((a) => a.label).join(', ')} on its own order, so ${added.length === 1 ? 'it is' : 'they are'} ` +
            `in every pack answered to ${askedBy?.name ?? 'it'}.`,
      // The number worth putting on a screen. A vendor losing a bid on a
      // certificate that lapsed three weeks ago never finds out why.
      standing: {
        packs: packs.length,
        ready: packs.filter((p) => p.ready).length,
        lapsed: new Set(packs.flatMap((p) => p.lapsed.map((l) => l.key))).size,
        neverCollected: new Set(packs.flatMap((p) => p.neverCollected.map((l) => l.key))).size,
        noExpiryRecorded: new Set(packs.flatMap((p) => p.noExpiryRecorded.map((l) => l.key))).size,
        expiringInsideHorizon: new Set(packs.flatMap((p) => p.expiresInsideHorizon.map((l) => l.key))).size,
        unconfirmed: new Set(packs.flatMap((p) => p.unconfirmed.map((l) => l.key))).size,
        says:
          packs.length === 0
            ? 'No screening packs are defined.'
            : notReady.length === 0
              ? `Every one of the ${packs.length} screening packs could go out today.`
              : `${notReady.length} of ${packs.length} screening packs could not go out today. ${notReady[0].says}`,
      },
      packs: packs.map((p) => ({
        key: p.packKey,
        label: p.packLabel,
        ready: p.ready,
        asked: p.asked,
        answerable: p.answerable,
        percent: p.percent,
        says: p.says,
        askedBy: outboundPackByKey(p.packKey)?.askedBy ?? null,
        lapsed: p.lapsed.map((i) => ({ key: i.key, label: i.label, says: i.says })),
        neverCollected: p.neverCollected.map((i) => ({ key: i.key, label: i.label, required: i.required })),
        noExpiryRecorded: p.noExpiryRecorded.map((i) => ({ key: i.key, label: i.label, says: i.says })),
        expiresInsideHorizon: p.expiresInsideHorizon.map((i) => ({
          key: i.key, label: i.label, daysLeft: i.daysLeft,
        })),
        unconfirmed: p.unconfirmed.map((i) => ({ key: i.key, label: i.label })),
      })),
      sent: sentRows,
      available: specs.map((p) => ({
        key: p.key,
        label: p.label,
        purpose: p.purpose,
        askedBy: p.askedBy,
        itemCount: p.items.length,
      })),
      canSend: maySend(caller.permissions),
      // The same sentence the POST would answer with, said before the
      // click rather than after it, so the screen and the route cannot
      // disagree about who this desk is.
      cannotSend: maySend(caller.permissions)
        ? null
        : askTheDesk({
            doing: 'Sending this firm’s own tax, insurance and registration documents out',
            needs: ['settings.manage', 'vendors.manage'],
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An outbound pack is a company answering for itself. This account is not in one.' } },
      { status: 403 }
    )
  }
  if (!maySend(caller.permissions)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Sending this firm’s own tax, insurance and registration documents out',
            needs: ['settings.manage', 'vendors.manage'],
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const shipped = outboundPackByKey(String(body.packKey ?? ''))
  if (!shipped) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say which pack to send. A pack is a named subset with a stated purpose, never everything we hold.',
          field: 'packKey',
          options: OUTBOUND_PACKS.map((p) => ({ key: p.key, label: p.label })),
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
            ? `“${body.recipientEmail}” is not an email address. This pack goes to a person at the ` +
              'firm that asked for it, so it needs somewhere to arrive.'
            : 'This pack goes to whoever asked for it. Type their email address first.',
          field: 'recipientEmail',
        },
      },
      { status: 422 }
    )
  }

  // The pack as the customer who asked for it asks for it. Where the
  // sender does not say who asked, it is the shipped list — which is
  // honest rather than lazy: a set merged from a customer nobody named
  // would be this route guessing at whose rules it is applying.
  const clientCompanyId = body.clientCompanyId ? String(body.clientCompanyId) : null
  const { packs } = await packsFor(caller.company.id, clientCompanyId)
  const spec = packs.find((p) => p.key === shipped.key) ?? shipped

  const now = new Date()
  const held = await loadOwnDocuments(caller.company.id)
  const pack = assemble(spec, held, now)

  // ── The refusal ─────────────────────────────────────────────────────
  //
  // Loud, itemized, and with no way past it. Somebody who has been told
  // the bid closes at five will look for the override; there is not one.
  if (!pack.sendable) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_SENDABLE',
          message: pack.says,
          refusals: pack.refusals.map((r) => ({
            key: r.key, label: r.label, required: r.required, because: r.refusedBecause,
          })),
          missing: pack.absent.map((a) => ({ key: a.key, label: a.label, required: a.required })),
          fix:
            'Renew or record the documents named above, then send. Nothing here can be overridden — ' +
            'a lapsed certificate in a procurement inbox is a written claim that we are covered when we are not.',
        },
      },
      { status: 422 }
    )
  }

  const life = linkLife(now, body.expiresInDays == null ? undefined : Number(body.expiresInDays), pack.sending)
  const token = randomBytes(32).toString('base64url')

  const created = await prisma.documentPacket.create({
    data: {
      companyId: caller.company.id,
      packetKey: spec.key,
      label: spec.label,
      purpose: spec.purpose,
      // The whole point of this file.
      direction: 'SEND',
      // The subject is us. We are the company being screened.
      subjectCompanyId: caller.company.id,
      recipientEmail,
      recipientName: body.recipientName ? String(body.recipientName).trim() : null,
      token,
      expiresAt: life.expiresAt,
      // Complete the moment it is sent. Nothing is awaited from the
      // recipient, so it must not join the queue of packets somebody is
      // chasing — that queue is for documents that have not arrived.
      completedAt: now,
      createdById: caller.person.id,
      items: {
        create: pack.sending.map((item, position) => ({
          key: item.key,
          label: item.label,
          hint: item.says,
          required: item.required,
          position,
          // Ours, already on file, already checked where anybody checked
          // it. Nothing is awaited from the recipient.
          state: 'ACCEPTED',
          receivedAt: now,
          validUntil: item.expiresAt,
        })),
      },
    },
    select: { id: true, token: true, expiresAt: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'OUTBOUND_PACK_SENT',
      summary: `${caller.person.name} sent ${pack.sending.length} of our own document(s) to ${recipientEmail} — ${spec.label}`,
      reason:
        (clientCompanyId ? 'Assembled against that customer\u2019s own order set. ' : '') +
        (pack.refusals.length > 0
          ? `${pack.refusals.length} held back because they are out of date or their expiry was never recorded: ` +
            pack.refusals.map((r) => r.label).join(', ')
          : 'Everything the pack asks for was current and went out.'),
      payload: {
        packetId: created.id,
        packKey: spec.key,
        purpose: spec.purpose,
        // Whose rules this pack was assembled under. Without it the row
        // says what went out and not which customer's order decided the
        // list, which is the half an auditor asks for.
        assembledFor: clientCompanyId,
        sent: pack.sending.map((s) => s.key),
        refused: pack.refusals.map((r) => r.key),
        withheldOutOfScope: pack.withheld.map((w) => w.key),
        linkDays: life.days,
        linkClampedBecause: life.clampedBecause,
      },
      reversible: true,
    },
  })

  // There is no packet.sent event type and events belong to another
  // domain, so this records as a request with the direction stated.
  void emit({
    type: 'packet.requested',
    companyId: caller.company.id,
    subjectType: 'DocumentPacket',
    subjectId: created.id,
    actorPersonId: caller.person.id,
    payload: {
      direction: 'SEND',
      packKey: spec.key,
      recipientEmail,
      itemCount: pack.sending.length,
      refusedCount: pack.refusals.length,
    },
  })

  return NextResponse.json(
    {
      data: {
        created: true,
        packetId: created.id,
        link: `/packet/${created.token}`,
        expiresAt: created.expiresAt.toISOString().slice(0, 10),
        linkDays: life.days,
        // Said out loud, because a link quietly shorter than the one
        // somebody asked for looks like a bug when they notice.
        linkClampedBecause: life.clampedBecause,
        sending: pack.sending.map((s) => ({
          label: s.label,
          standing: s.standing,
          daysLeft: s.daysLeft,
          says: s.says,
        })),
        refused: pack.refusals.map((r) => ({ label: r.label, because: r.refusedBecause })),
        notOnFile: pack.absent.map((a) => ({ label: a.label, required: a.required })),
        withheld: pack.withheld,
        message: pack.says,
      },
    },
    { status: 201 }
  )
}
