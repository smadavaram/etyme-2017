import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { invitation } from '@/lib/bench-consent'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { termsShown } from '@/lib/bench-filter'
import { send } from '@/lib/messages'

/**
 * POST /api/rolloff/:id/resolve
 *
 * What actually happened when somebody rolled off — the field that has
 * sat on RolloffEvent since it was built (`outcome: REDEPLOYED · BENCH ·
 * LOST`) with nothing anywhere ever writing to it.
 *
 * "Firing people with a notice from the project which also means
 * bringing them to bench" — a delivery manager's own words for the
 * gap this closes. Choosing BENCH here does the actual work, and what
 * it does depends on who the person is to this firm:
 *
 * - **Somebody the firm employs** (a live EMPLOYEE seat — the
 *   integrator's own W2) goes back on the firm's own roster. No listing
 *   is written: the employment is the consent.
 * - **Anybody else** is asked, through the same invite-then-grant door
 *   /api/bench/listings uses: the listing is born INVITED and the
 *   person gets the signed link. CLAUDE.md: "A Submission requires a
 *   live BenchListing granted by the consultant" — this only asks.
 *   Somebody who already granted one stays granted and is told nothing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const outcome = body?.outcome

  const validOutcomes = ['REDEPLOYED', 'BENCH', 'LOST']
  if (!validOutcomes.includes(outcome)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `outcome must be one of: ${validOutcomes.join(', ')}`, field: 'outcome' } },
      { status: 422 }
    )
  }

  const rolloff = await prisma.rolloffEvent.findUnique({
    where: { id },
    include: {
      sellContract: {
        select: {
          id: true, companyId: true, personId: true,
          person: { select: { name: true, primaryEmail: true } },
        },
      },
    },
  })

  if (!rolloff) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Rolloff event not found' } },
      { status: 404 }
    )
  }

  // The company handling the offboarding, and nobody else's rolloff to
  // resolve. Same wall every other contract-scoped route in this app
  // already checks.
  if (caller.company?.id !== rolloff.sellContract.companyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This rolloff belongs to a different company' } },
      { status: 403 }
    )
  }

  if (rolloff.outcome) {
    return NextResponse.json(
      { error: { code: 'ALREADY_RESOLVED', message: `This rolloff was already resolved as ${rolloff.outcome}` } },
      { status: 409 }
    )
  }

  const personName = rolloff.sellContract.person.name
  const companyId = rolloff.sellContract.companyId
  const personId = rolloff.sellContract.personId

  // Whether this firm employs the person — the same live-seat test the
  // submission door uses, so the two cannot disagree about who works
  // here. Revoked, suspended and expired seats are people it no longer
  // employs.
  const employedByUs =
    outcome === 'BENCH' &&
    (await prisma.context.findFirst({
      where: {
        personId,
        companyId,
        type: 'EMPLOYEE',
        revokedAt: null,
        suspendedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    })) !== null

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.rolloffEvent.update({
        where: { id },
        data: {
          outcome,
          // Resolving is claiming, if nobody has yet — one action instead
          // of a forced two clicks to record the same decision.
          claimedById: rolloff.claimedById ?? caller.person.id,
        },
      })

      let benchNote: string | null = null
      // Set only where a new question was put to the person, and read
      // after the transaction to send it — see below.
      let invite: { listingId: string; terms: ReturnType<typeof termsShown> } | null = null

      if (outcome === 'BENCH' && employedByUs) {
        // The integrator's case. The firm employs this person, so they
        // go back on its own roster — the payroll bench, read off the
        // EMPLOYEE seat and the contracts (`/api/bench?scope=payroll`),
        // not off a listing. CLAUDE.md, "Who sells and who buys": the
        // employment is the consent. Asking an employee to agree to be
        // marketed by the firm that already employs them is the bug
        // that section exists to stop, so no listing is written here.
        benchNote = `${personName} is back on your own roster, between projects. They are your employee, so there is nothing for them to agree to.`
      } else if (outcome === 'BENCH') {
        // A person rolling off may never have had a ConsultantProfile —
        // nothing about being staffed on a project required one. One is
        // made here with the minimum this needs; everything else on it
        // (skills, rate floor) is theirs to fill in same as anybody else's.
        let profile = await tx.consultantProfile.findUnique({
          where: { personId },
          select: { id: true },
        })
        if (!profile) {
          profile = await tx.consultantProfile.create({
            data: { personId },
            select: { id: true },
          })
        }

        const existing = await tx.benchListing.findUnique({
          where: { consultantId_companyId: { consultantId: profile.id, companyId } },
        })

        // The rate range is left empty on purpose. It used to be filled
        // with the sell line's bill rate — the price this firm charged
        // its client — and a bench listing's range is the rate the
        // person is marketed at, which the consultant's own floor
        // (`ConsultantProfile.rateFloor`) bounds. A client's price is
        // neither, and copying it here would carry one rung's price onto
        // the next deal. The desk sets a range on the Bench page if it
        // wants one, the same as for anybody else.
        if (existing && !existing.revokedAt && existing.state === 'GRANTED') {
          benchNote = `${personName} is already on your bench. Nothing new was asked.`
        } else if (existing && !existing.revokedAt && existing.state === 'INVITED') {
          benchNote = `${personName} has already been asked to be on your bench and has not answered yet. Nothing new was sent.`
        } else if (existing) {
          // A revoked or declined listing from before. They are asked
          // afresh, never quietly re-granted: silently restoring it
          // would make revoking or declining a suggestion.
          const again = await tx.benchListing.update({
            where: { id: existing.id },
            data: {
              tier: 'MARKETING',
              rateMin: null,
              rateMax: null,
              ...invitation(new Date()),
              revokedAt: null,
              declinedNote: null,
              // Stated afresh or not at all, as on the Bench page: terms
              // stated or agreed on the listing they took back went with it.
              termsEngagementType: null, termsPayRateCents: null, termsStatedAt: null,
              termsStatedById: null, termsAgreedAt: null,
            },
            select: { termsEngagementType: true, termsPayRateCents: true, termsAgreedAt: true },
          })
          invite = { listingId: existing.id, terms: termsShown(again, caller.company!.name) }
          benchNote = `Asked ${personName} to agree to be on your bench. Nobody can put them forward until they say yes.`
        } else {
          const created = await tx.benchListing.create({
            data: {
              consultantId: profile.id,
              companyId,
              tier: 'MARKETING',
              rateMin: null,
              rateMax: null,
              // INVITED, not granted. The row's default is GRANTED so
              // that listings from before asking kept their meaning; a
              // new one must be born asking.
              ...invitation(new Date()),
            },
            select: { id: true, termsEngagementType: true, termsPayRateCents: true, termsAgreedAt: true },
          })
          invite = { listingId: created.id, terms: termsShown(created, caller.company!.name) }
          benchNote = `Asked ${personName} to agree to be on your bench. Nobody can put them forward until they say yes.`
        }
      }

      await tx.automationLog.create({
        data: {
          companyId,
          action: 'ROLLOFF_RESOLVED',
          summary:
            outcome === 'BENCH'
              ? `${personName}'s rolloff resolved as BENCH — ${benchNote}`
              : `${personName}'s rolloff resolved as ${outcome}`,
          reason: `Resolved via rolloff console by ${caller.person.name}`,
          payload: { rolloffId: id, outcome, sellContractId: rolloff.sellContractId },
          reversible: false,
        },
      })

      return { benchNote, invite }
    })

    // And actually ask them, the same way /api/bench/listings does.
    //
    // Outside the transaction on purpose: a mail provider being slow or
    // down must not roll back a resolved rolloff. The invitation is
    // recorded either way and can be resent from the Bench page.
    // Sent in the firm's name.
    if (result.invite && rolloff.sellContract.person.primaryEmail) {
      const url = inviteUrl(result.invite.listingId)
      if (url) {
        const msg = inviteText({ personName, vendorName: caller.company!.name, url, terms: result.invite.terms })
        void send({
          companyId,
          personId,
          kind: 'LINK',
          to: rolloff.sellContract.person.primaryEmail,
          subject: msg.subject,
          body: msg.body,
          aboutType: 'LISTING',
          aboutId: result.invite.listingId,
        })
      }
    }

    return NextResponse.json({
      data: {
        id,
        outcome,
        message:
          outcome === 'BENCH'
            ? result.benchNote
            : outcome === 'REDEPLOYED'
              ? `${personName} is already on their next assignment — recorded.`
              : `Recorded. ${personName} is not returning to your bench.`,
      },
    })
  } catch (err: any) {
    reportError('Rolloff resolve failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Could not resolve this rolloff. Please try again.' } },
      { status: 500 }
    )
  }
}
