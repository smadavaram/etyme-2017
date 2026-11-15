import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { invitation } from '@/lib/bench-consent'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { askByEmail } from '@/app/api/consultants/ask-by-email'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { listingTermsFrom, termsShown, notAtACompany, INVITE_LINK_KEPT_SAYS, tierInWords, askedOntoBenchSays } from '@/lib/bench-filter'
import { readAddToBench } from '@/lib/consultant-portfolio/forms'
import { firmKnowsForBench, nameAskedUnder, firmReadsAt, floorRefuses, belowFloorSays } from '@/lib/consultant-portfolio/before-her-yes'
import { recordRefusal, accessActor } from '@/lib/access-log'
import { maySeeOutside } from '@/lib/walls'
import { NETWORK_VISIBLE } from '@/lib/shared-consultant'

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
 * Terms (2026-10-06), optional: `termsEngagementType` (W2 · IND_1099 ·
 * OWN_COMPANY) and `termsPayRateCents`, what the firm would pay the
 * person when it places them. Checked by demand's `checkStatedTerms`;
 * recorded with who stated them and when; agreed only by the person's
 * own yes (`/api/me/benches/:id/respond`).
 *
 * Requires consultants.write permission.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Changing a consultant’s record or putting them on the bench is for the recruiters, the resource manager, HR or the owner. Ask one of them.' } },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: notAtACompany('bench') } },
      { status: 403 }
    )
  }

  const body = await request.json()

  // The fields checked before anybody is looked up, read the way Add to
  // bench builds its body (`readAddToBench`, lib/consultant-portfolio/forms),
  // so a field refused here is always one the form draws.
  const read = readAddToBench(body)
  if (!read.ok) {
    return NextResponse.json(
      { error: { code: read.code, message: read.message, field: read.field } },
      { status: 422 }
    )
  }
  const { consultantId, tier, rateMin, rateMax } = read

  // Verify consultant exists
  const consultant = await prisma.consultantProfile.findUnique({
    where: { id: consultantId },
    select: {
      id: true,
      personId: true,
      rateFloor: true,
      person: { select: { name: true, primaryEmail: true } },
      ownCompany: { select: { id: true, name: true } },
    },
  })

  if (!consultant) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Consultant not found' } },
      { status: 404 }
    )
  }

  // The firm must know them (fix list, layer five, a): a seat here, a
  // listing here ever (one taken back is asked again), or a partner's
  // bench that shows them to this firm, where Ask to represent reads them
  // (`firmKnowsForBench`). Anybody else is answered as an id that does
  // not exist, and the refusal is written before it is sent.
  const [seatHere, existingAny] = await Promise.all([
    prisma.context.findFirst({ where: { personId: consultant.personId, companyId, revokedAt: null }, select: { id: true } }),
    prisma.benchListing.findUnique({
      where: { consultantId_companyId: { consultantId, companyId } },
      select: { id: true, firmName: true },
    }),
  ])
  const onPartnerBench = !seatHere && !existingAny && (await shownOnPartnerBench(caller, companyId, consultantId))
  if (!firmKnowsForBench({ seatHere: seatHere != null, listedHereEver: existingAny != null, onPartnerBench })) {
    await recordRefusal([consultant.personId], {
      ...accessActor(caller),
      action: 'PROFILE_VIEW',
      reason: 'Refused Add to bench: the firm neither employs this person, nor ever listed them, nor sees them on a partner bench.',
    })
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Consultant not found' } },
      { status: 404 }
    )
  }

  // The name the firm asks her under: the one it typed on its listing, or
  // the one it reads where it employs her or a partner shows her
  // (`nameAskedUnder`). Her own record's name is never written or said on
  // a record the firm has only an id for. Her own name stays in the
  // letter, which only she reads.
  const asked = nameAskedUnder({
    existing: existingAny,
    email: consultant.person.primaryEmail,
    shownName: consultant.person.name,
  })

  // Her lowest rate is hers. A range under it is refused only where this
  // firm reads her floor once it has asked (`floorRefuses`): before her
  // yes, on a record whose words are not its own, it reads only what it
  // typed, so the floor refuses nothing and every range is saved alike.
  // A refusal there, figure or no figure, would let a firm read her floor
  // by trying rates (the reader of a626b0b18, item 1).
  if (consultant.rateFloor != null && rateMax != null) {
    const max = parseInt(String(rateMax), 10)
    const readsHerFloor =
      (await firmReadsAt({ companyId, callerPersonId: caller.person.id, consultantIds: [consultantId], asAsked: true })).get(consultantId)?.onlyTyped === false
    if (floorRefuses({ readsHerFloor, floor: consultant.rateFloor, max })) {
      return NextResponse.json(
        { error: { code: 'BELOW_RATE_FLOOR', message: belowFloorSays(asked.says), field: 'rateMax' } },
        { status: 422 }
      )
    }
  }

  // What the firm says it would pay them, where it says anything. The
  // same rule and the same sentences as the terms page.
  // The pay is in the currency the firm chose for this person, its own by
  // default (`termsPayCurrency`; a US firm may pay somebody in India in rupees).
  const firmCurrency =
    (await prisma.company.findUnique({ where: { id: caller.company!.id }, select: { homeCurrency: true } }))?.homeCurrency ?? 'USD'
  const terms = listingTermsFrom(
    { engagementType: body.termsEngagementType, payRateCents: body.termsPayRateCents, payCurrency: body.termsPayCurrency },
    {
      personName: asked.says,
      firmName: caller.company!.name,
      ownCompany: consultant.ownCompany ?? null,
      statedById: caller.person.id,
      now: new Date(),
      firmCurrency,
    }
  )
  if (!terms.ok) {
    return NextResponse.json(
      { error: { code: terms.code, message: terms.says, field: terms.field } },
      { status: 422 }
    )
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
            // The name the firm typed when it first asked, kept: asking
            // again never swaps in her own record's (`nameAskedUnder`).
            firmName: asked.firmName,
            // Stated afresh or not at all. Terms agreed on the listing
            // they took back went with it.
            ...terms.fields,
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
            // The name the firm reads her by when it asks, kept so it reads
            // it until she says yes (lib/consultant-portfolio/before-her-yes).
            firmName: asked.firmName,
            ...terms.fields,
          },
        })
      }

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'BENCH_LISTING_REQUESTED',
          summary: `Bench listing requested for "${asked.says}"${tierInWords(tier, true) ? ` (${tierInWords(tier, true)})` : ''}. Waiting on their yes.`,
          reason: 'Vendor requested bench listing via API',
          payload: {
            listingId: listing.id,
            consultantId,
            personId: consultant.personId,
            requestedBy: caller.person.id,
            tier,
            termsEngagementType: terms.fields.termsEngagementType,
            termsPayRateCents: terms.fields.termsPayRateCents,
            termsPayCurrency: terms.fields.termsPayCurrency,
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
    // What the firm reads her as now that it has asked (`firmReadsAt`):
    // the name it typed where it reads only that, else the name it asked
    // under. The sentence says nothing else of hers.
    const typed = (await firmReadsAt({ companyId, callerPersonId: caller.person.id, consultantIds: [consultantId] })).get(consultantId)?.typed ?? null
    const shown = typed ? typed.name : asked.says

    const url = inviteUrl(result.id)
    const msg = inviteText({
      personName: consultant.person.name,
      vendorName: caller.company!.name,
      url,
      // The terms stated on the listing, so the email names what a yes agrees.
      // In the firm's own currency: a dong rate reads whole dong.
      terms: termsShown(result, {
        name: caller.company!.name,
        homeCurrency: firmCurrency,
      }),
    })
    // The same sender as Add consultant: where no email can leave, nothing
    // is emailed, and the answer says to press Copy link on Bench.
    const mail = await askByEmail({
      companyId, personId: consultant.personId, to: consultant.person.primaryEmail, url,
      subject: msg.subject, body: msg.body, listingId: result.id,
    })

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
            termsEngagementType: result.termsEngagementType,
            termsPayRateCents: result.termsPayRateCents,
            termsStatedAt: result.termsStatedAt?.toISOString() ?? null,
            termsAgreedAt: null,
          },
          message:
            askedOntoBenchSays(shown) +
            (mail === 'KEPT' ? ` ${INVITE_LINK_KEPT_SAYS}` : '') +
            (terms.says ? ` ${terms.says}` : ''),
          mail,
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
    reportError('Bench listing creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Bench listing creation failed. Please try again.' } },
      { status: 500 }
    )
  }
}

/**
 * Whether a firm this one trades with shows her on its partner bench to
 * this seat: a live yes, marketed, at a firm on either side of an active
 * register row, and only where this seat may look outside its own firm.
 * The same reading as `GET /api/bench?scope=network`, asked as a yes or no.
 */
async function shownOnPartnerBench(
  caller: { company: { outsideAccess?: string | null } | null; permissions: readonly string[] },
  companyId: string,
  consultantId: string
): Promise<boolean> {
  const outside = maySeeOutside({ posture: caller.company?.outsideAccess ?? 'NAMED_ONLY', permissions: caller.permissions })
  if (!outside.ok) return false
  const [mine, theirs] = await Promise.all([
    prisma.counterparty.findMany({ where: { companyId, status: 'ACTIVE' }, select: { otherCompanyId: true } }),
    prisma.counterparty.findMany({ where: { otherCompanyId: companyId, status: 'ACTIVE' }, select: { companyId: true } }),
  ])
  const partnerIds = [...new Set([...mine.map((c) => c.otherCompanyId), ...theirs.map((c) => c.companyId)])].filter((id) => id !== companyId)
  if (partnerIds.length === 0) return false
  const shown = await prisma.benchListing.findFirst({
    where: { consultantId, ...NETWORK_VISIBLE, companyId: { in: partnerIds } },
    select: { id: true },
  })
  return shown != null
}
