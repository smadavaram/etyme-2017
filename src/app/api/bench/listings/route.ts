import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { invitation } from '@/lib/bench-consent'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { send } from '@/lib/messages'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'

/**
 * POST /api/bench/listings
 *
 * Vendor requests a bench listing for a consultant. BUILD.md §3 — Supply.
 *
 * The listing is created in a pending state. The consultant must grant it
 * via PATCH /api/bench/listings/:id/grant before it becomes active.
 *
 * CLAUDE.md invariant: "A Submission requires a live BenchListing granted
 * by the consultant." — the grant step is what makes it "live".
 *
 * Requires consultants.write permission.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'You need consultants.write permission' } },
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
  const { consultantId, tier = 'MARKETING', rateMin, rateMax } = body

  // Validation
  if (!consultantId || typeof consultantId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'consultantId is required', field: 'consultantId' } },
      { status: 422 }
    )
  }

  const validTiers = ['RETAINED', 'MARKETING']
  if (!validTiers.includes(tier)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `tier must be one of: ${validTiers.join(', ')}`, field: 'tier' } },
      { status: 422 }
    )
  }

  if (rateMin != null && rateMax != null) {
    const min = parseInt(String(rateMin), 10)
    const max = parseInt(String(rateMax), 10)
    if (min > max) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'rateMin cannot exceed rateMax', field: 'rateMin' } },
        { status: 422 }
      )
    }
  }

  // Verify consultant exists
  const consultant = await prisma.consultantProfile.findUnique({
    where: { id: consultantId },
    select: {
      id: true,
      personId: true,
      rateFloor: true,
      person: { select: { name: true, primaryEmail: true } },
    },
  })

  if (!consultant) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Consultant not found' } },
      { status: 404 }
    )
  }

  // Check rate floor — the consultant sets this; no listing may go below it
  if (consultant.rateFloor != null && rateMax != null) {
    const max = parseInt(String(rateMax), 10)
    if (max < consultant.rateFloor) {
      return NextResponse.json(
        {
          error: {
            code: 'BELOW_RATE_FLOOR',
            message: `rateMax (${max}) is below the consultant's rate floor (${consultant.rateFloor})`,
            field: 'rateMax',
          },
        },
        { status: 422 }
      )
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Check for existing active or pending listing
      const existing = await tx.benchListing.findUnique({
        where: {
          consultantId_companyId: {
            consultantId,
            companyId,
          },
        },
      })

      if (existing && !existing.revokedAt) {
        throw new Error('LISTING_EXISTS')
      }

      // If a revoked listing exists, we can create a new one by updating it
      // (the unique constraint is on consultantId+companyId)
      let listing
      if (existing && existing.revokedAt) {
        listing = await tx.benchListing.update({
          where: { id: existing.id },
          data: {
            tier: tier as 'RETAINED' | 'MARKETING',
            rateMin: rateMin != null ? parseInt(String(rateMin), 10) : null,
            rateMax: rateMax != null ? parseInt(String(rateMax), 10) : null,
            // Asked again, not re-granted. Somebody who revoked a
            // listing has to be asked afresh; silently restoring it
            // would make revoking a suggestion.
            ...invitation(new Date()),
            revokedAt: null,
            declinedNote: null,
          },
        })
      } else {
        listing = await tx.benchListing.create({
          data: {
            consultantId,
            companyId,
            tier: tier as 'RETAINED' | 'MARKETING',
            rateMin: rateMin != null ? parseInt(String(rateMin), 10) : null,
            rateMax: rateMax != null ? parseInt(String(rateMax), 10) : null,
            // INVITED, not granted.
            //
            // The log line below has said "Pending consultant grant"
            // since this route was written — the intent was always
            // right and there was no mechanism behind it. grantedAt
            // defaulted to now() and nobody was ever asked.
            ...invitation(new Date()),
          },
        })
      }

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'BENCH_LISTING_REQUESTED',
          summary: `${tier} bench listing requested for "${consultant.person.name}". Pending consultant grant.`,
          reason: 'Vendor requested bench listing via API',
          payload: {
            listingId: listing.id,
            consultantId,
            personId: consultant.personId,
            requestedBy: caller.person.id,
            tier,
          },
          reversible: true,
        },
      })

      return listing
    })

    // And actually ask them.
    //
    // Outside the transaction on purpose: a mail provider being slow or
    // down must not roll back a listing that was correctly created. The
    // invitation is recorded either way and can be resent; a lost
    // listing cannot be recovered from an email that never sent.
    //
    // Sent in the vendor's name. A consultant on two benches never
    // learns that from us.
    const url = inviteUrl(result.id)
    if (url && consultant.person.primaryEmail) {
      const msg = inviteText({
        personName: consultant.person.name,
        vendorName: caller.company!.name,
        url,
      })
      void send({
        companyId,
        personId: consultant.personId,
        kind: 'LINK',
        to: consultant.person.primaryEmail,
        subject: msg.subject,
        body: msg.body,
        aboutType: 'LISTING',
        aboutId: result.id,
      })
    }

    return NextResponse.json(
      {
        data: {
          listing: {
            id: result.id,
            consultantId: result.consultantId,
            companyId: result.companyId,
            tier: result.tier,
            rateMin: result.rateMin,
            rateMax: result.rateMax,
            status: 'PENDING_GRANT',
            grantedAt: result.grantedAt.toISOString(),
          },
          message: `Bench listing created for "${consultant.person.name}". Consultant must grant it before submissions can be made.`,
        },
      },
      { status: 201 }
    )
  } catch (err: any) {
    if (err?.message === 'LISTING_EXISTS') {
      return NextResponse.json(
        { error: { code: 'ALREADY_EXISTS', message: 'An active bench listing already exists for this consultant at your company' } },
        { status: 409 }
      )
    }
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: { code: 'ALREADY_EXISTS', message: 'A bench listing already exists for this consultant at your company' } },
        { status: 409 }
      )
    }
    console.error('Bench listing creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Bench listing creation failed. Please try again.' } },
      { status: 500 }
    )
  }
}
