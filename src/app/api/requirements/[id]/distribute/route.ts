import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { mayDistribute } from '@/lib/requisition-approval'

/**
 * POST /api/requirements/:id/distribute
 *
 * BUILD.md:
 *   { toCompanyIds[], payMin, payMax, expiresAt, message }
 *   → one RequirementInvitation per recipient, each with its own band
 *   → queued, not synchronous: fifty vendors must not block the request
 *   → AutomationLog: which vendors and why
 *
 * Rate bands live on RequirementInvitation, never on Requirement (CLAUDE.md).
 * Every recipient may see a different one.
 *
 * Who may send it out is three questions, not one. Authenticated is not
 * authorised: this route asked only whether somebody was signed in, so
 * any account anywhere could put another company's role in front of
 * vendors of its choosing. The gates are the ones `/api/requisitions/:id/
 * distribute` already holds — the raising company, the desk that owns the
 * supplier panel, and an approved requisition.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id: requirementId } = await params
  const body = await request.json()
  const { toCompanyIds, payMin, payMax, expiresAt, message } = body

  if (!Array.isArray(toCompanyIds) || toCompanyIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'toCompanyIds must be a non-empty array', field: 'toCompanyIds' } },
      { status: 422 }
    )
  }

  if (!expiresAt) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'expiresAt is required', field: 'expiresAt' } },
      { status: 422 }
    )
  }

  const expDate = new Date(expiresAt)
  if (isNaN(expDate.getTime()) || expDate <= new Date()) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'expiresAt must be a future date', field: 'expiresAt' } },
      { status: 422 }
    )
  }

  // Verify requirement exists and is OPEN
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true, companyId: true, title: true, status: true,
      approvalState: true, clearedSupplierIds: true,
    },
  })

  if (!requirement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requirement not found' } },
      { status: 404 }
    )
  }

  // The company that raised it is the only one that may put it to market.
  // Checked before status, so a stranger learns nothing about a role
  // they have no business seeing.
  if (caller.company?.id !== requirement.companyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the raising company may send this requirement to suppliers' } },
      { status: 403 }
    )
  }

  // And within it, only the desk that owns the supplier panel. A hiring
  // manager raises the role and deliberately does not choose who sees it.
  if (!hasPermission(caller.permissions, 'requirements.distribute')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Choosing which suppliers see a requirement is the program office\'s call. Ask them to send it out.',
        },
      },
      { status: 403 }
    )
  }

  // The gate that makes approval mean something.
  if (!mayDistribute(requirement.approvalState)) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_APPROVED',
          message: `This requirement is ${requirement.approvalState} — it must be approved before suppliers see it`,
        },
      },
      { status: 409 }
    )
  }

  if (requirement.status !== 'OPEN') {
    return NextResponse.json(
      { error: { code: 'NOT_OPEN', message: `Requirement is ${requirement.status}, not OPEN` } },
      { status: 409 }
    )
  }

  // Only the suppliers Procurement cleared. An empty list means it
  // cleared by rule; a named list is the go-ahead and the release
  // cannot widen it.
  const cleared = requirement.clearedSupplierIds ?? []
  if (cleared.length > 0) {
    const notCleared = toCompanyIds.filter((c: string) => !cleared.includes(c))
    if (notCleared.length > 0) {
      const named = await prisma.company.findMany({
        where: { id: { in: notCleared } },
        select: { id: true, name: true },
      })
      const names = notCleared.map((c: string) => named.find((n) => n.id === c)?.name ?? c).join(', ')
      return NextResponse.json(
        {
          error: {
            code: 'NOT_CLEARED',
            message:
              `${names} ${notCleared.length === 1 ? 'was' : 'were'} not among the suppliers Procurement cleared for this requirement. ` +
              'Ask Procurement to add them, or leave them out.',
          },
        },
        { status: 403 }
      )
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created: any[] = []
      const skipped: string[] = []

      for (const toCompanyId of toCompanyIds) {
        // Check if company exists
        const toCompany = await tx.company.findUnique({
          where: { id: toCompanyId },
          select: { id: true, name: true },
        })

        if (!toCompany) {
          skipped.push(toCompanyId)
          continue
        }

        // Check for existing invitation to this company
        const existing = await tx.requirementInvitation.findUnique({
          where: {
            requirementId_toCompanyId: {
              requirementId,
              toCompanyId,
            },
          },
        })

        if (existing) {
          skipped.push(toCompanyId)
          continue
        }

        const invitation = await tx.requirementInvitation.create({
          data: {
            requirementId,
            fromCompanyId: requirement.companyId,
            toCompanyId,
            payMin: payMin ?? null,
            payMax: payMax ?? null,
            message: message ?? null,
            expiresAt: expDate,
            status: 'SENT',
          },
        })

        created.push({
          id: invitation.id,
          toCompanyId,
          toCompanyName: toCompany.name,
        })
      }

      // AutomationLog: which vendors and why
      await tx.automationLog.create({
        data: {
          companyId: requirement.companyId,
          action: 'REQUIREMENT_DISTRIBUTED',
          summary: `Distributed "${requirement.title}" to ${created.length} vendor(s)`,
          reason: `Sent to suppliers by ${caller.person.name}`,
          payload: {
            requirementId,
            distributedTo: created.map((c) => c.toCompanyId),
            skipped,
            payMin,
            payMax,
            expiresAt: expDate.toISOString(),
          },
          reversible: true,
        },
      })

      return { created, skipped }
    })

    return NextResponse.json({
      data: {
        requirementId,
        distributed: result.created.length,
        skipped: result.skipped.length,
        invitations: result.created,
        message: `Distributed to ${result.created.length} vendor(s). ${result.skipped.length} skipped (not found or already invited).`,
      },
    })
  } catch (err: any) {
    reportError('Distribution failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Distribution failed. Please try again.' } },
      { status: 500 }
    )
  }
}
