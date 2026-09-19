import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { standingOf } from '@/lib/document-stages'
import { OWN_DOCUMENT_KINDS, kindByKey, loadOwnDocuments, libraryPacket } from '../own-documents'

/**
 * GET  /api/outbound-pack/documents — our own papers, and where each stands
 * POST /api/outbound-pack/documents — put one on file
 *
 * A readiness screen reading from a store nothing writes to is a screen
 * that always says zero, so this is the write. It records into the
 * company's own document library — a `DocumentPacket` whose subject is
 * the company itself — because that model already holds "a set of
 * documents about a company, each with a validity date".
 *
 * ── The refusal at the point of entry ────────────────────────────────
 *
 * A document of a kind that expires cannot be recorded without a date.
 * That is the fourth state, and it is the one that made the 2017 build
 * wrong for four months: on file, no expiry recorded, on a kind that
 * expires — green on every screen until somebody audited it. It is
 * cheaper to refuse the row than to sweep for it later, and the person
 * typing has the certificate open in front of them.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Documents belong to a company. This account is not in one.' } },
      { status: 403 }
    )
  }

  const now = new Date()
  const held = await loadOwnDocuments(caller.company.id)
  const byKey = new Map(held.map((h) => [h.key, h]))

  const rows = OWN_DOCUMENT_KINDS.map((kind) => {
    const doc = byKey.get(kind.key) ?? null
    const st = standingOf(doc, kind, now)
    return {
      key: kind.key,
      label: kind.label,
      expires: kind.validMonths != null,
      standing: st.standing,
      daysLeft: st.daysLeft,
      unconfirmed: st.unverified,
      says: st.says,
      expiresAt: doc?.expiresAt?.toISOString().slice(0, 10) ?? null,
    }
  })

  return NextResponse.json({
    data: {
      documents: rows,
      onFile: rows.filter((r) => r.standing !== 'MISSING').length,
      kinds: OWN_DOCUMENT_KINDS,
      canRecord: hasPermission(caller.permissions, 'settings.manage'),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Documents belong to a company. This account is not in one.' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: "Recording the company's own compliance documents needs settings.manage" } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const kind = kindByKey(String(body.key ?? ''))
  if (!kind) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say which document this is',
          field: 'key',
          options: OWN_DOCUMENT_KINDS.map((k) => ({ key: k.key, label: k.label })),
        },
      },
      { status: 422 }
    )
  }

  const parseDate = (v: unknown): Date | null => {
    if (!v) return null
    const d = new Date(String(v))
    return Number.isNaN(d.getTime()) ? null : d
  }

  const issuedAt = parseDate(body.issuedAt)
  let expiresAt = parseDate(body.expiresAt)

  // Where the kind expires and only an issue date is given, work it out
  // rather than leaving the column null.
  if (!expiresAt && kind.validMonths != null && issuedAt) {
    expiresAt = new Date(
      Date.UTC(
        issuedAt.getUTCFullYear(),
        issuedAt.getUTCMonth() + kind.validMonths,
        issuedAt.getUTCDate()
      )
    )
  }

  if (kind.validMonths != null && !expiresAt) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message:
            `${kind.label} expires, so it cannot go on file without a date. Give the expiry from the ` +
            `certificate, or the issue date and we will work it out. A document on file with no expiry ` +
            `recorded looks current on every screen until the day somebody audits it — that is the ` +
            `state that made the last system wrong for four months.`,
          field: 'expiresAt',
        },
      },
      { status: 422 }
    )
  }

  const library = await libraryPacket(caller.company.id, caller.person.id)

  const existing = await prisma.packetItem.findFirst({
    where: { packetId: library.id, key: kind.key },
    select: { id: true, position: true },
  })

  // ACCEPTED only where somebody says they have checked it. Otherwise it
  // goes on file as RECEIVED and the readiness view says, out loud, that
  // nobody here has confirmed they looked at it.
  const confirmed = body.confirmed === true
  const data = {
    label: kind.label,
    hint: String(body.note ?? kind.label),
    required: true,
    state: confirmed ? 'ACCEPTED' : 'RECEIVED',
    fileUrl: body.fileUrl ? String(body.fileUrl) : null,
    fileName: body.fileName ? String(body.fileName) : null,
    receivedAt: issuedAt ?? new Date(),
    validUntil: expiresAt,
    reviewedById: confirmed ? caller.person.id : null,
    reviewedAt: confirmed ? new Date() : null,
  }

  const saved = existing
    ? await prisma.packetItem.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.packetItem.create({
        data: { ...data, packetId: library.id, key: kind.key, position: OWN_DOCUMENT_KINDS.findIndex((k) => k.key === kind.key) },
        select: { id: true },
      })

  const now = new Date()
  const st = standingOf(
    { key: kind.key, label: kind.label, issuedAt, expiresAt, verifiedAt: data.reviewedAt },
    kind,
    now
  )

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'OWN_DOCUMENT_RECORDED',
      summary: `${caller.person.name} put ${kind.label} on file${expiresAt ? `, valid until ${expiresAt.toISOString().slice(0, 10)}` : ''}`,
      reason: confirmed
        ? `${caller.person.name} confirmed they had looked at it.`
        : 'On file, but nobody has confirmed they looked at it yet.',
      payload: { key: kind.key, itemId: saved.id, standing: st.standing },
      reversible: true,
    },
  })

  return NextResponse.json(
    {
      data: {
        id: saved.id,
        key: kind.key,
        label: kind.label,
        standing: st.standing,
        daysLeft: st.daysLeft,
        says: st.says,
        confirmed,
      },
    },
    { status: existing ? 200 : 201 }
  )
}
