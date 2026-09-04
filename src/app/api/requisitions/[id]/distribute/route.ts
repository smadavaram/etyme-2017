import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { mayDistribute } from '@/lib/requisition-approval'

/**
 * POST /api/requisitions/:id/distribute
 *
 * Body: {
 *   vendors: [{ companyId, payMin?, payMax?, message? }],
 *   expiresAt?: ISO date
 * }
 *
 * Puts an approved requisition in front of vendors — the moment demand
 * becomes visible to supply, and the reason a vendor joins at all.
 *
 * CLAUDE.md invariant: "Rate bands live on RequirementInvitation, never on
 * Requirement where a recipient could read another vendor's rate." So the
 * band is given PER VENDOR here, and the response never echoes one
 * vendor's band back to another. A preferred supplier and a one-time
 * supplier are routinely offered different numbers for the same role; a
 * single band applied to everyone throws that away and leaks it besides.
 *
 * Only an approved requisition may be distributed. Without that gate the
 * approval chain decides nothing.
 */

interface VendorBand {
  companyId: string
  payMin?: number | null
  payMax?: number | null
  message?: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const vendors: VendorBand[] = Array.isArray(body.vendors) ? body.vendors : []

  if (vendors.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'vendors must be a non-empty array', field: 'vendors' } },
      { status: 422 }
    )
  }

  const requisition = await prisma.requirement.findUnique({
    where: { id },
    include: { company: { select: { id: true, name: true } } },
  })

  if (!requisition) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requisition not found' } },
      { status: 404 }
    )
  }

  // The company that raised it is the only one that may put it to market.
  if (caller.company?.id !== requisition.companyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the raising company may distribute this requisition' } },
      { status: 403 }
    )
  }

  // The gate that makes approval mean something.
  if (!mayDistribute(requisition.approvalState)) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_APPROVED',
          message: `Requisition is ${requisition.approvalState} — it must be approved before vendors see it`,
        },
      },
      { status: 409 }
    )
  }

  // Each band must be coherent on its own before anything is sent.
  for (const v of vendors) {
    if (!v.companyId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Every vendor entry needs a companyId' } },
        { status: 422 }
      )
    }
    if (v.payMin != null && v.payMax != null && v.payMin > v.payMax) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: `Band for ${v.companyId} has a minimum above its maximum` } },
        { status: 422 }
      )
    }
    // A band above what the client itself will pay is a mistake worth
    // catching before a vendor sources against it.
    if (v.payMax != null && requisition.billMax != null && v.payMax > requisition.billMax) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: `Band for ${v.companyId} exceeds the requisition ceiling of $${Math.round(requisition.billMax / 100)}/hr`,
          },
        },
        { status: 422 }
      )
    }
  }

  const vendorIds = [...new Set(vendors.map(v => v.companyId))]
  const vendorCompanies = await prisma.company.findMany({
    where: { id: { in: vendorIds } },
    select: { id: true, name: true },
  })
  const vendorMap = new Map(vendorCompanies.map(c => [c.id, c]))

  const missing = vendorIds.filter(vid => !vendorMap.has(vid))
  if (missing.length > 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown companies: ${missing.join(', ')}` } },
      { status: 404 }
    )
  }

  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  const results: Array<{ companyId: string; name: string; status: string; reason?: string }> = []

  for (const v of vendors) {
    const company = vendorMap.get(v.companyId)!
    try {
      await prisma.requirementInvitation.create({
        data: {
          requirementId: id,
          fromCompanyId: requisition.companyId,
          toCompanyId: v.companyId,
          payMin: v.payMin ?? null,
          payMax: v.payMax ?? null,
          message: v.message ?? null,
          expiresAt,
          status: 'SENT',
        },
      })
      results.push({ companyId: v.companyId, name: company.name, status: 'sent' })
    } catch (err: any) {
      // Unique on (requirementId, toCompanyId) — re-inviting is a no-op,
      // reported per vendor rather than failing the whole distribution.
      if (err?.code === 'P2002') {
        results.push({ companyId: v.companyId, name: company.name, status: 'already_invited' })
      } else {
        results.push({ companyId: v.companyId, name: company.name, status: 'error', reason: 'Could not send' })
      }
    }
  }

  const sent = results.filter(r => r.status === 'sent')

  await prisma.automationLog.create({
    data: {
      companyId: requisition.companyId,
      action: 'REQUISITION_DISTRIBUTED',
      summary: `${requisition.title} sent to ${sent.length} vendor(s)`,
      reason: `Distributed by ${caller.person.name} to ${sent.map(s => s.name).join(', ') || 'nobody'}`,
      payload: {
        requirementId: id,
        // Bands recorded per vendor for audit. This log is company-scoped,
        // so it is visible to the client only — never to a recipient.
        invitations: vendors.map(v => ({
          companyId: v.companyId,
          payMin: v.payMin ?? null,
          payMax: v.payMax ?? null,
        })),
        expiresAt: expiresAt.toISOString(),
      },
      reversible: true,
    },
  })

  // Vendor list only — never the bands. This event is readable by an
  // integration, and a rate band belongs to one recipient.
  void emit({
    type: 'invitation.sent',
    companyId: requisition.companyId,
    subjectType: 'Requirement',
    subjectId: id,
    actorPersonId: caller.person.id,
    payload: {
      title: requisition.title,
      vendorCompanyIds: vendors.map(v => v.companyId),
      sentCount: sent.length,
      expiresAt: expiresAt.toISOString(),
    },
  })

  // Notify each vendor's people who can act on a requirement.
  if (sent.length > 0) {
    const recipients = await prisma.context.findMany({
      where: {
        companyId: { in: sent.map(s => s.companyId) },
        revokedAt: null,
        role: { permissions: { hasSome: ['requirements.read'] } },
      },
      select: { personId: true, companyId: true },
      take: 40,
    })

    const notifications: NotifyParams[] = recipients.map(r => ({
      personId: r.personId,
      companyId: r.companyId ?? undefined,
      type: 'SYSTEM',
      title: `New requirement from ${requisition.company.name}`,
      body: `${requisition.title} — ${requisition.headcount} position(s)${requisition.location ? ` in ${requisition.location}` : ''}. Responses close ${expiresAt.toISOString().slice(0, 10)}.`,
      entityId: id,
      data: { requirementId: id },
    }))
    if (notifications.length > 0) notifyBulk(notifications)
  }

  return NextResponse.json({
    data: {
      requirementId: id,
      // Deliberately no bands here — the caller supplied them and each
      // vendor learns only its own, when it reads its invitation.
      results,
      summary: {
        sent: sent.length,
        alreadyInvited: results.filter(r => r.status === 'already_invited').length,
        errors: results.filter(r => r.status === 'error').length,
      },
      expiresAt: expiresAt.toISOString(),
      message: `Sent to ${sent.length} vendor(s)`,
    },
  })
}
