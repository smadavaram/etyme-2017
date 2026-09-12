import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * POST /api/rolloff/:id/resolve
 *
 * What actually happened when somebody rolled off — the field that has
 * sat on RolloffEvent since it was built (`outcome: REDEPLOYED · BENCH ·
 * LOST`) with nothing anywhere ever writing to it.
 *
 * "Firing people with a notice from the project which also means
 * bringing them to bench" — a delivery manager's own words for the
 * gap this closes. Choosing BENCH here does the actual work: it puts
 * the person up for the company's own bench, through the exact same
 * request-then-grant mechanism /dashboard/bench already uses for
 * anybody else — this does not invent a second, looser way to list
 * somebody. CLAUDE.md: "A Submission requires a live BenchListing
 * granted by the consultant" still holds; this only requests one.
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
          id: true, companyId: true, personId: true, billRate: true,
          person: { select: { name: true } },
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

      if (outcome === 'BENCH') {
        // A W2 employee rolling off may never have had a ConsultantProfile
        // — nothing about being staffed on a project required one. One is
        // made here with the minimum this needs; everything else on it
        // (skills, rate floor) is theirs to fill in same as anybody else's.
        let profile = await tx.consultantProfile.findUnique({
          where: { personId: rolloff.sellContract.personId },
          select: { id: true },
        })
        if (!profile) {
          profile = await tx.consultantProfile.create({
            data: { personId: rolloff.sellContract.personId },
            select: { id: true },
          })
        }

        const existing = await tx.benchListing.findUnique({
          where: { consultantId_companyId: { consultantId: profile.id, companyId } },
        })

        if (existing && !existing.revokedAt) {
          benchNote = `${personName} is already on your bench — nothing new requested.`
        } else if (existing) {
          // A revoked listing from a previous stint. Reopening the same
          // request-then-grant cycle rather than reviving the old grant
          // silently.
          await tx.benchListing.update({
            where: { id: existing.id },
            data: {
              tier: 'MARKETING',
              rateMin: null,
              rateMax: rolloff.sellContract.billRate,
              grantedAt: new Date(),
              revokedAt: null,
            },
          })
          benchNote = `Bench listing requested for ${personName}. They still need to grant it before anybody can submit them.`
        } else {
          await tx.benchListing.create({
            data: {
              consultantId: profile.id,
              companyId,
              tier: 'MARKETING',
              rateMax: rolloff.sellContract.billRate,
            },
          })
          benchNote = `Bench listing requested for ${personName}. They still need to grant it before anybody can submit them.`
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

      return { benchNote }
    })

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
    console.error('Rolloff resolve failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Could not resolve this rolloff. Please try again.' } },
      { status: 500 }
    )
  }
}
