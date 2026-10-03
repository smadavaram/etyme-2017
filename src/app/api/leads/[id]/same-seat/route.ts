import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'

/**
 * POST /api/leads/:id/same-seat  { same: true | false }
 *
 * A person settling a collapse the machine would not settle itself.
 *
 * SAME joins a seat on its own. LIKELY never does — nothing merges
 * silently, which is the same rule CLAUDE.md sets for resolving people,
 * for the same reason: a wrongly merged seat loses a live role and nobody
 * notices.
 *
 * Yes moves the advert onto the seat it was matched to and the two stop
 * being two. No leaves it where it is and stops asking.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Leads')
  if (notStaff) return notStaff

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const same = body.same === true

  const lead = await prisma.lead.findFirst({
    where: { id, companyId: caller.company!.id },
    select: {
      id: true, title: true, openingId: true, likeOpeningId: true,
      matchStrength: true, confirmedAt: true,
    },
  })

  if (!lead) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No lead by that id.' } },
      { status: 404 }
    )
  }

  if (lead.confirmedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY_SETTLED', message: 'Somebody has already answered this one.' } },
      { status: 409 }
    )
  }

  const now = new Date()

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      confirmedAt: now,
      confirmedById: realPersonId(caller),
      // Yes moves the advert onto the seat it was suspected of being, and
      // the two stop being two.
      ...(same && lead.likeOpeningId ? { openingId: lead.likeOpeningId } : {}),
      // Answered either way. The strength records what a person decided,
      // not what the machine guessed, so a later look at the matching can
      // tell the two apart.
      matchStrength: same ? 'SAME' : 'UNRELATED',
    },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company!.id,
      action: same ? 'LEAD_MERGED_BY_PERSON' : 'LEAD_KEPT_APART_BY_PERSON',
      summary: same
        ? `"${lead.title}" confirmed as the same seat`
        : `"${lead.title}" confirmed as a different seat`,
      reason: `${caller.person.name} settled a collapse the matching would not settle itself`,
      payload: { leadId: lead.id, wasOn: lead.openingId, movedTo: same ? lead.likeOpeningId : null },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      id: lead.id,
      same,
      said: same
        ? 'Merged. The adverts are one seat from here.'
        : 'Kept apart. It stays its own seat and you will not be asked again.',
    },
  })
}
