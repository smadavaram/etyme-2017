import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * POST /api/bench/share
 *
 * Vendor-to-vendor bench sharing. Creates MARKETING-tier bench listings
 * at the target company for each shared consultant. The consultant must
 * still grant each new listing before it becomes active.
 *
 * Body: { listingIds: string[], toCompanyId: string }
 *
 * CLAUDE.md invariant: "Every read of another person's data writes an
 * AccessLog row, including refusals." — we log each share as a
 * MARKETING_REQUEST access event.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires consultants.write permission' } },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Active context must be associated with a company' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { listingIds, toCompanyId } = body

  if (!Array.isArray(listingIds) || listingIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'listingIds must be a non-empty array', field: 'listingIds' } },
      { status: 422 }
    )
  }

  if (!toCompanyId || typeof toCompanyId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'toCompanyId is required', field: 'toCompanyId' } },
      { status: 422 }
    )
  }

  if (toCompanyId === companyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Cannot share listings to your own company', field: 'toCompanyId' } },
      { status: 422 }
    )
  }

  // Verify target company exists
  const targetCompany = await prisma.company.findUnique({
    where: { id: toCompanyId },
    select: { id: true, name: true },
  })

  if (!targetCompany) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Target company not found' } },
      { status: 404 }
    )
  }

  // Fetch the source listings — must belong to the caller's company
  const sourceListings = await prisma.benchListing.findMany({
    where: {
      id: { in: listingIds },
      companyId,
      revokedAt: null,
    },
    include: {
      consultant: {
        select: {
          id: true,
          personId: true,
          person: { select: { id: true, name: true } },
        },
      },
    },
  })

  const sourceMap = new Map(sourceListings.map((l) => [l.id, l]))

  let shared = 0
  let errors = 0
  const results: Array<{
    listingId: string
    consultantId: string | null
    status: 'shared' | 'not_found' | 'already_exists' | 'error'
    newListingId?: string
    reason?: string
  }> = []

  try {
    await prisma.$transaction(async (tx) => {
      for (const listingId of listingIds) {
        const source = sourceMap.get(listingId)

        if (!source) {
          errors++
          results.push({
            listingId,
            consultantId: null,
            status: 'not_found',
            reason: 'Listing not found or not owned by your company',
          })
          continue
        }

        // Check if a listing already exists at the target company for this consultant
        const existing = await tx.benchListing.findUnique({
          where: {
            consultantId_companyId: {
              consultantId: source.consultantId,
              companyId: toCompanyId,
            },
          },
        })

        if (existing && !existing.revokedAt) {
          errors++
          results.push({
            listingId,
            consultantId: source.consultantId,
            status: 'already_exists',
            reason: `Consultant "${source.consultant.person.name}" already has an active listing at the target company`,
          })
          continue
        }

        // Create or re-activate the listing at the target company
        let newListing
        if (existing && existing.revokedAt) {
          // Re-activate a previously revoked listing
          newListing = await tx.benchListing.update({
            where: { id: existing.id },
            data: {
              tier: 'MARKETING',
              rateMin: source.rateMin,
              rateMax: source.rateMax,
              grantedAt: new Date(), // will be updated when consultant grants
              revokedAt: null,
            },
          })
        } else {
          newListing = await tx.benchListing.create({
            data: {
              consultantId: source.consultantId,
              companyId: toCompanyId,
              tier: 'MARKETING',
              rateMin: source.rateMin,
              rateMax: source.rateMax,
            },
          })
        }

        // AccessLog — CLAUDE.md invariant: every read of another person's data
        await tx.accessLog.create({
          data: {
            subjectId: source.consultant.personId,
            actorPersonId: caller.person.id,
            actorCompanyId: companyId,
            action: 'MARKETING_REQUEST',
            allowed: true,
            reason: `Bench listing shared to "${targetCompany.name}" by ${caller.person.name}`,
          },
        })

        shared++
        results.push({
          listingId,
          consultantId: source.consultantId,
          status: 'shared',
          newListingId: newListing.id,
        })
      }
    })
  } catch (err: any) {
    console.error('Bench share failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Bench share failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: {
      shared,
      errors,
      results,
    },
  }, { status: shared > 0 ? 201 : 200 })
}
