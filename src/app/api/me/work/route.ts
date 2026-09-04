import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/me/work
 *
 * A consultant's own view: where they work, what they are owed, what is
 * ending, and what somebody has shared about them.
 *
 * Every screen before this one belongs to a company. This one belongs to a
 * person, and it is where the money chain actually starts — nobody has been
 * able to enter an hour, and every control downstream rests on an approved
 * timesheet.
 *
 * Scoped to the signed-in person throughout. There is no companyId here to
 * get wrong: a consultant sees their own rows or nothing.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const personId = caller.person.id
  const now = new Date()

  const contracts = await prisma.sellContract.findMany({
    where: { personId },
    include: {
      company: { select: { id: true, name: true } },        // who pays them
      endClientCompany: { select: { id: true, name: true } }, // where they work
      workLocation: { select: { name: true, city: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  const timesheets = await prisma.timesheet.findMany({
    where: { personId },
    include: { invoiceLine: { select: { id: true } } },
    orderBy: { periodStart: 'desc' },
    take: 26,
  })

  // What has been sent about them, and to whom. A consultant should not
  // have to ask whether their passport went to a stranger.
  const sharedAbout = await prisma.documentShare.findMany({
    where: { subjectPersonId: personId },
    include: { company: { select: { name: true } }, _count: { select: { accesses: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const live = contracts.filter(c => c.state === 'IN_PROGRESS' || c.state === 'VERIFIED')

  // What they are actually paid, from the agreement that pays them.
  //
  // This screen showed billRate — what the vendor charges the client. It
  // is not their rate, and showing it hands them the markup regardless of
  // what the vendor decided about disclosure, which Addendum D makes a
  // per-requirement choice for the vendor to make.
  const payLines = await prisma.buyContractCandidate.findMany({
    where: { personId: caller.person.id, state: 'ACTIVE' },
    select: { payRate: true, payCurrency: true, startDate: true, buyContract: { select: { companyId: true } } },
  })
  const payByCompany = new Map(payLines.map(l => [l.buyContract.companyId, l]))

  return NextResponse.json({
    data: {
      person: { id: caller.person.id, name: caller.person.name },
      placements: contracts.map(c => ({
        id: c.id,
        payer: c.company.name,
        // Where they actually go. Often not who pays them, and the
        // difference matters to the person standing in the building.
        site: c.endClientCompany?.name ?? c.company.name,
        location: c.workLocation ? (c.workLocation.city ?? c.workLocation.name) : null,
        // Their pay, or nothing. A blank with a reason beats the wrong
        // number: somebody planning around a rate that is not theirs is
        // worse off than somebody who knows it is not recorded here.
        payRate: payByCompany.get(c.companyId)?.payRate ?? null,
        payCurrency: payByCompany.get(c.companyId)?.payCurrency ?? null,
        rateNote: payByCompany.has(c.companyId)
          ? null
          : 'Your rate is not recorded on Etyme for this placement. Your agency has it.',
        state: c.state,
        startDate: c.startDate.toISOString().slice(0, 10),
        endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
        daysLeft: c.endDate
          ? Math.ceil((c.endDate.getTime() - now.getTime()) / 86_400_000)
          : null,
      })),
      timesheets: timesheets.map(t => ({
        id: t.id,
        period: `${t.periodStart.toISOString().slice(0, 10)} → ${t.periodEnd.toISOString().slice(0, 10)}`,
        periodStart: t.periodStart.toISOString().slice(0, 10),
        hours: Number(t.totalHours),
        status: t.status,
        // Billed means the client has been invoiced for it. That is the
        // question behind "when do I get paid", so it is answered rather
        // than left to be inferred from a status word.
        billed: t.invoiceLine !== null,
      })),
      sharedAboutMe: sharedAbout.map(s => ({
        by: s.company.name,
        to: s.recipientEmail,
        purpose: s.purpose,
        openedCount: s._count.accesses,
        expiresAt: s.expiresAt.toISOString().slice(0, 10),
        withdrawn: s.revokedAt !== null,
      })),
      summary: {
        livePlacements: live.length,
        // Their own hours, not billing. Somebody working two contracts
        // wants one number.
        hoursThisMonth: timesheets
          .filter(t => t.periodStart.getMonth() === now.getMonth() && t.periodStart.getFullYear() === now.getFullYear())
          .reduce((n, t) => n + Number(t.totalHours), 0),
        awaitingApproval: timesheets.filter(t => t.status === 'SUBMITTED').length,
        // The one that matters: approved work nobody has invoiced.
        approvedNotBilled: timesheets.filter(t => t.status === 'APPROVED' && !t.invoiceLine).length,
        endingSoon: live.filter(c => c.endDate && (c.endDate.getTime() - now.getTime()) / 86_400_000 <= 60).length,
      },
    },
  })
}
