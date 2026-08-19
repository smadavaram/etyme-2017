import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import {
  newToken, clampExpiry, summarise, isShareableKind,
} from '@/lib/document-share'

/**
 * GET  /api/document-shares  — what this company has sent out
 * POST /api/document-shares  — send a package to somebody outside
 *
 * The case this exists for: an immigration lawyer preparing an H1B needs
 * six specific documents, once. Today that is an email with attachments,
 * which lives in an inbox forever and nobody can tell who opened it.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Shares belong to a company' } },
      { status: 403 }
    )
  }

  const shares = await prisma.documentShare.findMany({
    where: { companyId: caller.company.id },
    include: {
      items: { select: { id: true, kind: true, label: true } },
      accesses: { select: { at: true } },
      subjectPerson: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const now = new Date()
  const rows = shares.map(s => {
    const summary = summarise(
      { expiresAt: s.expiresAt, revokedAt: s.revokedAt },
      s.accesses, now
    )
    return {
      id: s.id,
      purpose: s.purpose,
      recipient: { email: s.recipientEmail, name: s.recipientName, role: s.recipientRole },
      subject: s.subjectPerson,
      createdBy: s.createdBy,
      documentCount: s.items.length,
      documents: s.items.map(i => i.label),
      expiresAt: s.expiresAt.toISOString().slice(0, 10),
      createdAt: s.createdAt.toISOString(),
      ...summary,
      lastOpenedAt: summary.lastOpenedAt?.toISOString() ?? null,
    }
  })

  return NextResponse.json({
    data: {
      shares: rows,
      summary: {
        active: rows.filter(r => r.state === 'ACTIVE').length,
        // The useful number: sent, never opened, running out.
        needChasing: rows.filter(r => r.needsChasing).length,
        expired: rows.filter(r => r.state === 'EXPIRED').length,
        revoked: rows.filter(r => r.state === 'REVOKED').length,
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Shares belong to a company' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { recipientEmail, recipientName, recipientRole, purpose, subjectPersonId, days } = body
  const items: { kind: string; refId: string; label: string }[] = Array.isArray(body.items) ? body.items : []

  if (!recipientEmail || !/.+@.+\..+/.test(String(recipientEmail))) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A recipient email address is required', field: 'recipientEmail' } },
      { status: 422 }
    )
  }

  // The purpose is not paperwork. It is what the subject is told when they
  // ask why their passport went to a stranger.
  if (!purpose || String(purpose).trim().length < 5) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say what this is for. The person whose documents these are can see it.',
          field: 'purpose',
        },
      },
      { status: 422 }
    )
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Pick at least one document to share', field: 'items' } },
      { status: 422 }
    )
  }

  const bad = items.find(i => !isShareableKind(i.kind) || !i.refId || !i.label)
  if (bad) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `Cannot share "${bad.kind}"`, field: 'items' } },
      { status: 422 }
    )
  }

  const now = new Date()
  const share = await prisma.documentShare.create({
    data: {
      companyId: caller.company.id,
      recipientEmail: String(recipientEmail).trim().toLowerCase(),
      recipientName: recipientName ?? null,
      recipientRole: recipientRole ?? null,
      purpose: String(purpose).trim(),
      subjectPersonId: subjectPersonId ?? null,
      token: newToken(),
      expiresAt: clampExpiry(days, now),
      createdById: caller.person.id,
      items: {
        create: items.map(i => ({ kind: i.kind, refId: i.refId, label: i.label })),
      },
    },
    include: { items: true },
  })

  // The subject's own record. Sending somebody's documents outside the
  // company is a read of their data by definition, so it is logged where
  // they can see it — not only where the company can.
  if (share.subjectPersonId) {
    await prisma.accessLog.create({
      data: {
        subjectId: share.subjectPersonId,
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company.id,
        action: 'DOCUMENTS_SHARED_EXTERNALLY',
        allowed: true,
        reason: `${share.items.length} document(s) sent to ${share.recipientEmail} — ${share.purpose}`,
      },
    })
  }

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'DOCUMENTS_SHARED',
      summary: `${share.items.length} document(s) shared with ${share.recipientEmail}`,
      reason: share.purpose,
      payload: {
        shareId: share.id,
        recipient: share.recipientEmail,
        documents: share.items.map(i => i.label),
        expiresAt: share.expiresAt.toISOString(),
      },
      reversible: true,
    },
  })

  return NextResponse.json(
    {
      data: {
        id: share.id,
        // The whole point. Send this; the recipient needs nothing else.
        link: `/shared/${share.token}`,
        recipient: share.recipientEmail,
        documentCount: share.items.length,
        expiresAt: share.expiresAt.toISOString().slice(0, 10),
        message: `${share.items.length} document(s) ready to send. The link works until ${share.expiresAt.toISOString().slice(0, 10)} and can be withdrawn at any time.`,
      },
    },
    { status: 201 }
  )
}
