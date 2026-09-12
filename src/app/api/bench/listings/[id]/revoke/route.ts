import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext } from '@/lib/api-context'

/**
 * PATCH /api/bench/listings/:id/revoke
 *
 * Consultant revokes a bench listing, effective immediately.
 * BUILD.md §3 — Supply.
 *
 * Only the consultant themselves can revoke. Once revoked, the listing
 * is no longer "live" and no new submissions can reference it.
 *
 * CLAUDE.md invariant: "A Submission requires a live BenchListing
 * granted by the consultant." — revoking the listing makes it no
 * longer live, blocking future submissions.
 *
 * Existing submissions that were made while the listing was live
 * remain valid — the revocation does not retroactively invalidate them.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const listing = await prisma.benchListing.findUnique({
    where: { id },
    include: {
      consultant: {
        select: {
          id: true,
          personId: true,
          person: { select: { name: true } },
        },
      },
      company: {
        select: { id: true, name: true },
      },
    },
  })

  if (!listing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Bench listing not found' } },
      { status: 404 }
    )
  }

  // Only the consultant themselves can revoke
  if (listing.consultant.personId !== caller.person.id) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the consultant can revoke a bench listing' } },
      { status: 403 }
    )
  }

  // Already revoked — idempotent
  if (listing.revokedAt) {
    return NextResponse.json({
      data: {
        listing: {
          id: listing.id,
          consultantId: listing.consultantId,
          companyId: listing.companyId,
          tier: listing.tier,
          revokedAt: listing.revokedAt.toISOString(),
          status: 'REVOKED',
        },
        message: 'Listing was already revoked',
      },
    })
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Set revokedAt to now — effective immediately
      const result = await tx.benchListing.update({
        where: { id },
        data: { revokedAt: new Date() },
      })

      // AutomationLog on the company that owned the listing
      await tx.automationLog.create({
        data: {
          companyId: listing.companyId,
          action: 'BENCH_LISTING_REVOKED',
          summary: `"${listing.consultant.person.name}" revoked ${listing.tier} bench listing at "${listing.company.name}". Effective immediately.`,
          reason: 'Consultant revoked bench listing via API',
          payload: {
            listingId: listing.id,
            consultantId: listing.consultantId,
            personId: listing.consultant.personId,
            tier: listing.tier,
          },
          reversible: false,
        },
      })

      return result
    })

    return NextResponse.json({
      data: {
        listing: {
          id: updated.id,
          consultantId: updated.consultantId,
          companyId: updated.companyId,
          tier: updated.tier,
          revokedAt: updated.revokedAt!.toISOString(),
          status: 'REVOKED',
        },
        message: `Bench listing revoked. "${listing.consultant.person.name}" is no longer on "${listing.company.name}" bench. Existing submissions remain valid.`,
      },
    })
  } catch (err: any) {
    console.error('Bench listing revocation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Revocation failed. Please try again.' } },
      { status: 500 }
    )
  }
}
