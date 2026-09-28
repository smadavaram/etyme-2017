import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { mayChangeTier, whoSees } from '@/lib/shared-consultant'

/**
 * PATCH /api/bench/listings/:id
 *
 * The firm that holds a listing moves it between retained and marketing.
 *
 * Body: { tier: 'RETAINED' | 'MARKETING' }
 *
 * ── Why this door exists ─────────────────────────────────────────────
 *
 * Found on the founder's lifecycle walk, 2026-09-28. A listing's tier was
 * written once, when the row was created, and nothing in the product ever
 * wrote it again. A consultant added as Retained stayed Retained, and the
 * network bench shows partners marketing listings only — so a bench
 * vendor could not put somebody in front of the prime it sells through,
 * however clearly the person had agreed to be marketed.
 *
 * The rule is `mayChangeTier` in `lib/shared-consultant`: the tier is the
 * firm's choice and needs no fresh consent, it cannot outrun the consent
 * the person gave or took back, and a person has one retained bench.
 *
 * ── What it never does ───────────────────────────────────────────────
 *
 * It never touches `state`. Consent is the consultant's alone and moves
 * only through their own answer; a firm that could flip it here would be
 * consenting on their behalf.
 *
 * A listing that is not the caller's firm's answers 404, not 403. Saying
 * "that exists but is not yours" to a rival tells them the person is on
 * another bench, which is the one thing a shared consultant is owed
 * silence about.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Changing how a person is marketed is the recruiting desk’s call. Ask whoever runs your bench.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A bench belongs to a firm. Sign in at the firm that holds this listing.' } },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const to = typeof body.tier === 'string' ? body.tier.toUpperCase() : ''

  const listing = await prisma.benchListing.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, consultantId: true, tier: true, state: true, revokedAt: true,
      consultant: { select: { personId: true, person: { select: { name: true } } } },
    },
  })

  if (!listing || listing.companyId !== companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'There is no listing by that id on your bench.' } },
      { status: 404 }
    )
  }

  // Asked of the database, answered as a yes or no. Which firm it is
  // never leaves this line.
  const retainedElsewhere =
    to === 'RETAINED'
      ? (await prisma.benchListing.count({
          where: {
            consultantId: listing.consultantId,
            companyId: { not: companyId },
            tier: 'RETAINED',
            state: 'GRANTED',
            revokedAt: null,
          },
        })) > 0
      : false

  const verdict = mayChangeTier({
    listing: { tier: listing.tier, state: listing.state, revokedAt: listing.revokedAt },
    to,
    retainedElsewhere,
  })

  if (!verdict.ok) {
    const status = verdict.code === 'VALIDATION' ? 422 : 409
    return NextResponse.json({ error: { code: verdict.code, message: verdict.says, field: 'tier' } }, { status })
  }

  const name = listing.consultant.person.name
  if (verdict.unchanged) {
    return NextResponse.json({
      data: { listing: { id, tier: listing.tier, reach: whoSees(listing).reach }, message: verdict.says },
    })
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.benchListing.update({
        where: { id },
        data: { tier: to as 'RETAINED' | 'MARKETING' },
        select: { id: true, tier: true, state: true, revokedAt: true },
      })
      // No automation log row: this is a person's own choice, not
      // something the system did unprompted, and lib/autonomy has no
      // rung for it yet (asked of the architect). The trail it leaves is
      // on the subject, below.
      // Showing somebody to other firms is a use of their data, so it is
      // on their trail beside every read.
      await tx.accessLog.create({
        data: {
          subjectId: listing.consultant.personId,
          actorPersonId: caller.person.id,
          actorCompanyId: companyId,
          action: 'MARKETING_REQUEST',
          allowed: true,
          reason: `${caller.person.name} at ${caller.company!.name} moved ${name}'s listing from ${listing.tier.toLowerCase()} to ${to.toLowerCase()}. ${verdict.says}`,
        },
      })
      return row
    })

    return NextResponse.json({
      data: {
        listing: { id: updated.id, tier: updated.tier, reach: whoSees(updated).reach },
        message: `${name}: ${verdict.says}`,
      },
    })
  } catch (err) {
    reportError('Bench listing tier change failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The listing could not be changed. Nothing was saved; try again.' } },
      { status: 500 }
    )
  }
}
