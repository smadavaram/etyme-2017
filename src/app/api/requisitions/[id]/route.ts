import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { assessFit } from '@/lib/candidate-fit'

/**
 * GET /api/requisitions/:id
 *
 * One requisition, with everything needed to work it: where the approval
 * got to, which vendors were asked and what they said, and who has been
 * put forward.
 *
 * This is the client's side of the glass, so the bands ARE shown — the
 * client set them. The invariant that survives is the other direction: a
 * vendor reading its own invitation still sees only its own
 * (src/lib/invitation-visibility.ts).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const req = await prisma.requirement.findUnique({
    where: { id },
    include: {
      raisedBy: { select: { id: true, name: true } },
      orgUnit: { select: { id: true, name: true } },
      costCenter: { select: { id: true, code: true, name: true } },
      company: { select: { id: true, name: true } },
      approvals: {
        include: { approver: { select: { id: true, name: true } } },
        orderBy: { rank: 'asc' },
      },
      invitations: {
        include: { toCompany: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!req) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Requisition not found' } },
      { status: 404 }
    )
  }

  // Only the raising company may open the working view of its own demand.
  if (caller.company?.id !== req.companyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This requisition belongs to another company' } },
      { status: 403 }
    )
  }

  const submissions = await prisma.submission.findMany({
    where: { requirementId: id },
    include: {
      person: {
        select: {
          id: true, name: true,
          consultant: {
            select: {
              headline: true, skills: true, location: true,
              availableFrom: true, workAuth: true,
            },
          },
        },
      },
      fromCompany: { select: { id: true, name: true } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  const now = new Date()

  return NextResponse.json({
    data: {
      requisition: {
        id: req.id,
        title: req.title,
        skills: req.skills,
        location: req.location,
        headcount: req.headcount,
        billMin: req.billMin,
        billMax: req.billMax,
        months: req.months,
        neededBy: req.neededBy?.toISOString() ?? null,
        justification: req.justification,
        status: req.status,
        approvalState: req.approvalState,
        raisedBy: req.raisedBy,
        orgUnit: req.orgUnit,
        costCenter: req.costCenter,
        createdAt: req.createdAt.toISOString(),
      },
      approvals: req.approvals.map(a => ({
        id: a.id,
        approver: a.approver,
        rank: a.rank,
        outcome: a.outcome,
        reason: a.reason,
        decidedAt: a.decidedAt?.toISOString() ?? null,
      })),
      invitations: req.invitations.map(i => ({
        id: i.id,
        vendor: i.toCompany,
        // The client's own numbers, shown back to the client that set them.
        band: { payMin: i.payMin, payMax: i.payMax },
        status: i.expiresAt < now && i.status === 'SENT' ? 'EXPIRED' : i.status,
        expiresAt: i.expiresAt.toISOString(),
        message: i.message,
        // How many this vendor actually put forward — the number that
        // separates a vendor working it from one that merely accepted.
        submittedCount: submissions.filter(s => s.fromCompanyId === i.toCompanyId).length,
      })),
      candidates: submissions.map(s => ({
        id: s.id,
        // Deterministic, instant, and honest about what it cannot judge —
        // the client is choosing between these people today, not deciding
        // whether to go looking (src/lib/candidate-fit.ts).
        fit: assessFit({
          required: {
            skills: req.skills,
            location: req.location,
            ceilingCents: req.billMax,
            neededBy: req.neededBy,
          },
          candidate: {
            skills: s.person.consultant?.skills ?? [],
            headline: s.person.consultant?.headline ?? null,
            location: s.person.consultant?.location ?? null,
            availableFrom: s.person.consultant?.availableFrom ?? null,
          },
          submittedRateCents: s.rate,
        }),
        person: {
          id: s.person.id,
          name: s.person.name,
          headline: s.person.consultant?.headline ?? null,
          skills: s.person.consultant?.skills ?? [],
        },
        vendor: s.fromCompany,
        rate: s.rate,
        kind: s.kind,
        status: s.status,
        submittedAt: s.submittedAt.toISOString(),
      })),
      summary: {
        invited: req.invitations.length,
        accepted: req.invitations.filter(i => i.status === 'ACCEPTED').length,
        declined: req.invitations.filter(i => i.status === 'DECLINED').length,
        // Asked, said nothing, deadline still running. The quiet ones are
        // the reason a requisition dies without anybody noticing.
        silent: req.invitations.filter(i => i.status === 'SENT' && i.expiresAt >= now).length,
        candidates: submissions.length,
        // Positions still to fill after anyone already placed.
        remaining: Math.max(0, req.headcount - submissions.filter(s => s.status === 'PLACED').length),
      },
    },
  })
}
