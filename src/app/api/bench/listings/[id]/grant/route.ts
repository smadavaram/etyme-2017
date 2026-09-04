import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext } from '@/lib/api-context'

/**
 * PATCH /api/bench/listings/:id/grant
 *
 * Consultant grants a bench listing. BUILD.md §3 — Supply.
 *
 * Only the consultant themselves (the person on the ConsultantProfile)
 * can grant a listing. This is what makes the listing "live" and
 * enables submissions against it.
 *
 * CLAUDE.md invariant: "A Submission requires a live BenchListing
 * granted by the consultant."
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

  // Only the consultant themselves can grant
  if (listing.consultant.personId !== caller.person.id) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the consultant can grant a bench listing' } },
      { status: 403 }
    )
  }

  // Cannot grant a revoked listing — must create a new one
  if (listing.revokedAt) {
    return NextResponse.json(
      { error: { code: 'REVOKED', message: 'This listing has been revoked. Request a new listing.' } },
      { status: 409 }
    )
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Set grantedAt to now — this is the moment the listing becomes live
      const result = await tx.benchListing.update({
        where: { id },
        data: { grantedAt: new Date() },
      })

      // AutomationLog on the company that owns the listing
      await tx.automationLog.create({
        data: {
          companyId: listing.companyId,
          action: 'BENCH_LISTING_GRANTED',
          summary: `"${listing.consultant.person.name}" granted ${listing.tier} bench listing at "${listing.company.name}"`,
          reason: 'Consultant granted bench listing via API',
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
          rateMin: updated.rateMin,
          rateMax: updated.rateMax,
          grantedAt: updated.grantedAt.toISOString(),
          status: 'GRANTED',
        },
        message: `Bench listing granted. "${listing.consultant.person.name}" is now live on "${listing.company.name}" bench.`,
      },
    })
  } catch (err: any) {
    console.error('Bench listing grant failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Grant failed. Please try again.' } },
      { status: 500 }
    )
  }
}
