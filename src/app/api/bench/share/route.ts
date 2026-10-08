import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { askTheDesk, hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { invitation } from '@/lib/bench-consent'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { termsShown } from '@/lib/bench-filter'
import { send } from '@/lib/messages'

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
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Sharing your bench with another firm',
            needs: 'consultants.write',
            kind: caller.company?.kind ?? null,
            companyName: caller.company?.name ?? null,
          }),
        },
      },
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
          person: { select: { id: true, name: true, primaryEmail: true } },
        },
      },
    },
  })

  const sourceMap = new Map(sourceListings.map((l) => [l.id, l]))

  const now = new Date()
  const toAsk: { listingId: string; personId: string; name: string; email: string | null; terms: ReturnType<typeof termsShown> }[] = []
  let shared = 0
  let errors = 0
  const results: Array<{
    listingId: string
    consultantId: string | null
    status: 'shared' | 'not_found' | 'already_exists' | 'not_consented' | 'error'
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

        // Only somebody who agreed to be marketed by the sharing firm may
        // be offered on. Passing an unanswered or declined person to a
        // second firm is exactly the use of their record they never
        // allowed.
        if (source.state !== 'GRANTED') {
          errors++
          results.push({
            listingId,
            consultantId: source.consultantId,
            status: 'not_consented',
            reason: `${source.consultant.person.name} has not agreed to be marketed by you, so you cannot offer them on.`,
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
              // Asked again, never re-granted. This used to stamp a
              // grant nobody gave and leave the old state standing.
              ...invitation(now),
              declinedNote: null,
              revokedAt: null,
              // A share states no pay terms: what this firm would pay is its
              // own to state, never the sharing firm's. Terms stated or
              // agreed on the listing they took back went with it.
              termsEngagementType: null, termsPayRateCents: null, termsStatedAt: null,
              termsStatedById: null, termsAgreedAt: null,
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
              // An invitation the person answers. This was born GRANTED
              // by the column default, so a firm the consultant had never
              // heard of could submit them the moment it was shared.
              ...invitation(now),
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

        toAsk.push({
          listingId: newListing.id,
          personId: source.consultant.personId,
          name: source.consultant.person.name,
          email: source.consultant.person.primaryEmail,
          terms: termsShown(newListing, targetCompany.name),
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
    reportError('Bench share failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Bench share failed' } },
      { status: 500 }
    )
  }

  // And ask each of them, in the name of the firm that now holds the
  // invitation — outside the transaction, so a slow mail provider cannot
  // roll back a listing that was correctly written.
  for (const a of toAsk) {
    const url = inviteUrl(a.listingId)
    if (!url || !a.email) continue
    const msg = inviteText({ personName: a.name, vendorName: targetCompany.name, url, terms: a.terms })
    void send({
      companyId: toCompanyId,
      personId: a.personId,
      kind: 'LINK',
      to: a.email,
      subject: msg.subject,
      body: msg.body,
      aboutType: 'LISTING',
      aboutId: a.listingId,
    })
  }

  return NextResponse.json({
    data: {
      shared,
      errors,
      results,
    },
  }, { status: shared > 0 ? 201 : 200 })
}
