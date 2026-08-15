import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

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
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

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
    select: { id: true, companyId: true, title: true, status: true },
  })

  if (!requirement) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requirement not found' } },
      { status: 404 }
    )
  }

  if (requirement.status !== 'OPEN') {
    return NextResponse.json(
      { error: { code: 'NOT_OPEN', message: `Requirement is ${requirement.status}, not OPEN` } },
      { status: 409 }
    )
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
          reason: `Manual distribution by ${email}`,
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
    console.error('Distribution failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Distribution failed. Please try again.' } },
      { status: 500 }
    )
  }
}
