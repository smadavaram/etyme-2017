import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { bestRoute, type Lead as SeatLead } from '@/lib/openings'

/**
 * POST /api/openings/:id/requirement
 *
 * Write the seat up as a role, so the pipeline that already exists —
 * matching, submission, the hold, the forward chain — picks it up.
 *
 * This is the join the build was missing. Openings collapsed adverts into
 * seats and stopped there; Requirements ran the pipeline and had no way to
 * come into being except by hand. One click here and a pasted advert is a
 * role somebody can be submitted against.
 *
 * Body (all optional — every default comes from the seat itself):
 *   { leadId, billMin, billMax, payerCompanyId }
 *
 * leadId picks which route to answer. Left out, it takes the recommended
 * one, which is not the highest posted rate — a prime who pays in ninety
 * days at $70 is worse than one who pays in thirty at $65.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Openings')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const { id } = await params

  const opening = await prisma.opening.findFirst({
    // Openings are private. Two vendors chasing the same seat each have
    // their own row, and neither can see the other's.
    where: { id, companyId },
    include: {
      leads: { orderBy: { seenAt: 'desc' } },
      requirements: { select: { id: true, title: true } },
    },
  })

  if (!opening) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Opening not found' } },
      { status: 404 }
    )
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    // No body is the ordinary case — one click, everything from the seat.
  }

  const leads: SeatLead[] = opening.leads.map((l) => ({
    id: l.id,
    source: l.source as SeatLead['source'],
    postedBy: l.postedBy,
    title: l.title,
    skills: l.skills,
    location: l.location,
    rateCents: l.rateCents,
    seenAt: l.seenAt,
  }))

  const msas = await prisma.masterAgreement.findMany({
    where: { vendorId: companyId },
    select: { paymentTerms: true, client: { select: { id: true, name: true } } },
  })

  const chosen =
    (body.leadId ? opening.leads.find((l) => l.id === body.leadId) : null) ??
    opening.leads.find(
      (l) =>
        l.id ===
        bestRoute(
          leads,
          msas.map((m) => ({
            postedBy: m.client.name,
            msaOnFile: true,
            paysInDays: m.paymentTerms,
          }))
        )?.lead.id
    ) ??
    opening.leads[0] ??
    null

  if (!chosen) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_ROUTE',
          message: 'This seat has no advert behind it, so there is nobody to answer.',
        },
      },
      { status: 422 }
    )
  }

  // Who to submit to. A prime named in the advert becomes the payer only
  // where a company row already exists for them — inventing a counterparty
  // from a signature line is how a submission ends up addressed to nobody.
  const payerCompanyId: string | null =
    typeof body.payerCompanyId === 'string'
      ? body.payerCompanyId
      : chosen.postedByCompanyId ??
        msas.find(
          (m) => chosen.postedBy && m.client.name.toLowerCase() === chosen.postedBy.toLowerCase()
        )?.client.id ??
        null

  // The advert's rate is a ceiling to bid under, not an offer. So the band
  // opens under it rather than at it, and the gap is deliberate: bidding at
  // the posted number leaves nothing for the margin the placement pays for.
  const ceiling = chosen.rateCents
  const billMax = typeof body.billMax === 'number' ? body.billMax : ceiling
  const billMin =
    typeof body.billMin === 'number'
      ? body.billMin
      : ceiling !== null
        ? Math.round(ceiling * 0.85)
        : null

  const requirement = await prisma.requirement.create({
    data: {
      companyId,
      openingId: opening.id,
      // A vendor answering somebody else's advert is not raising a
      // requisition against their own budget. Left DRAFT, every award
      // against it is blocked forever.
      approvalState: 'AUTO_APPROVED',
      payerCompanyId,
      endClientCompanyId: opening.clientCompanyId,
      title: opening.title,
      skills: opening.skills,
      location: opening.location,
      billMin,
      billMax,
      status: 'OPEN',
      source: chosen.source,
    },
  })

  const note =
    payerCompanyId === null
      ? `Written up. ${chosen.postedBy ?? 'Whoever posted this'} is not a company on here yet, so name who to submit to before sending anybody.`
      : `Written up, to be worked through ${chosen.postedBy}.`

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'OPENING_WRITTEN_UP',
      summary: `"${opening.title}" is now a role`,
      reason: `${caller.person.name} wrote up a seat first seen on ${opening.firstSeen.toISOString().slice(0, 10)}`,
      payload: { openingId: opening.id, requirementId: requirement.id, leadId: chosen.id },
      reversible: true,
    },
  })

  return NextResponse.json(
    {
      data: {
        requirement: {
          id: requirement.id,
          title: requirement.title,
          billMin: requirement.billMin,
          billMax: requirement.billMax,
          payerCompanyId: requirement.payerCompanyId,
        },
        route: {
          leadId: chosen.id,
          postedBy: chosen.postedBy,
          rateCents: chosen.rateCents,
        },
        note,
        // Said out loud rather than left to be discovered on the
        // submission screen, where it stops somebody mid-task.
        needsRecipient: payerCompanyId === null,
      },
    },
    { status: 201 }
  )
}
