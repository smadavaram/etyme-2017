import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { projectInvitationForVendor } from '@/lib/invitation-visibility'

/**
 * GET /api/invitations
 *
 * A vendor's inbox: the requirements a client has put in front of THIS
 * company. Until now distribution wrote RequirementInvitation rows that
 * nothing could read — demand arrived and no supplier could see it.
 *
 * CLAUDE.md invariant: "Rate bands live on RequirementInvitation, never on
 * Requirement where a recipient could read another vendor's rate."
 *
 * Reading is where that invariant is actually kept or broken. Two rules
 * hold it here:
 *
 *   1. The query is scoped by toCompanyId, so a row belonging to another
 *      vendor is never loaded in the first place.
 *   2. The requirement is projected field by field. It is never spread,
 *      so a field added to Requirement later cannot leak into this
 *      response by accident — the commonest way an invariant like this
 *      dies a year after it was written.
 *
 * The count of other invitees is given as a number, because knowing you
 * are one of four is fair information; knowing WHO the other three are,
 * or what they were offered, is not.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Invitations are addressed to a company' } },
      { status: 403 }
    )
  }

  const status = request.nextUrl.searchParams.get('status')
  const now = new Date()

  const invitations = await prisma.requirementInvitation.findMany({
    where: {
      toCompanyId: caller.company.id, // the whole security boundary
      ...(status ? { status } : {}),
    },
    include: {
      fromCompany: { select: { id: true, name: true, slug: true } },
      requirement: {
        include: {
          _count: { select: { invitations: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // What this company has already put forward, so the inbox can show
  // progress rather than making the vendor go and look.
  const requirementIds = invitations.map(i => i.requirementId)
  const mySubmissions = requirementIds.length
    ? await prisma.submission.groupBy({
        by: ['requirementId'],
        where: {
          requirementId: { in: requirementIds },
          fromCompanyId: caller.company.id,
        },
        _count: { _all: true },
      })
    : []
  const submittedBy = new Map(mySubmissions.map(s => [s.requirementId, s._count._all]))

  // The projection is tested separately (src/lib/invitation-visibility.ts)
  // because this is where the band invariant is kept or broken.
  const data = invitations.map(inv =>
    projectInvitationForVendor(
      {
        id: inv.id,
        toCompanyId: inv.toCompanyId,
        payMin: inv.payMin,
        payMax: inv.payMax,
        message: inv.message,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        fromCompany: inv.fromCompany,
        requirement: {
          id: inv.requirement.id,
          title: inv.requirement.title,
          skills: inv.requirement.skills,
          location: inv.requirement.location,
          headcount: inv.requirement.headcount,
          months: inv.requirement.months,
          neededBy: inv.requirement.neededBy,
          status: inv.requirement.status,
          billMin: inv.requirement.billMin,
          billMax: inv.requirement.billMax,
          invitationCount: inv.requirement._count.invitations,
        },
      },
      submittedBy.get(inv.requirementId) ?? 0,
      now
    )
  )

  const live = data.filter(d => d.status === 'SENT' || d.status === 'ACCEPTED')

  return NextResponse.json({
    data: {
      company: { id: caller.company.id, name: caller.company.name },
      invitations: data,
      summary: {
        total: data.length,
        awaitingResponse: data.filter(d => d.status === 'SENT').length,
        accepted: data.filter(d => d.status === 'ACCEPTED').length,
        declined: data.filter(d => d.status === 'DECLINED').length,
        expired: data.filter(d => d.status === 'EXPIRED').length,
        openPositions: live.reduce((sum, d) => sum + d.requirement.headcount, 0),
      },
    },
  })
}
