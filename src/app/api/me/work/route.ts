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

  // When the next one is due.
  //
  // A consultant asking "when do I have to submit by" had nowhere to
  // look, and the answer already existed: cycle dates are generated per
  // contract and already shifted off weekends and the company's own
  // holidays. Not showing them meant the one party with a deadline was
  // the only party who could not see it.
  const cycles = await prisma.cycle.findMany({
    where: {
      sellContractId: { in: contracts.map((c) => c.id) },
      completedAt: null,
      // Both deadlines, because a consultant asked for both: when they
      // must submit, and when it should have been signed off. The second
      // is somebody else's deadline and still theirs to know — an
      // approval that has not happened is money that has not started
      // moving.
      kind: { in: ['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE'] },
    },
    orderBy: { dueOn: 'asc' },
    take: 12,
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

      // Deadlines, soonest first, and only the ones still open.
      due: cycles.map((c) => ({
        contractId: c.sellContractId,
        whose: c.kind === 'TIMESHEET_SUBMIT' ? 'YOU' : 'THEM',
        what:
          c.kind === 'TIMESHEET_SUBMIT'
            ? 'Your hours are due'
            : 'They should have approved it by',
        dueOn: c.dueOn.toISOString().slice(0, 10),
        daysAway: Math.ceil((c.dueOn.getTime() - now.getTime()) / 86_400_000),
        overdue: c.dueOn < now,
      })),

      // What they are owed for work already signed off.
      //
      // Approved hours at their own pay rate, and only approved: a
      // submitted timesheet is a claim, an approved one is a debt, and
      // showing the two as one number would tell somebody they are owed
      // money that nobody has agreed to yet.
      //
      // Silent where the rate is not recorded rather than guessed. A
      // consultant planning around a number this product invented is
      // worse off than one who knows it is not here.
      owed: (() => {
        const byContract = new Map(contracts.map((c) => [c.id, c.companyId]))
        let cents = 0
        let hours = 0
        let unknownRate = 0
        for (const t of timesheets) {
          if (t.status !== 'APPROVED') continue
          const pay = payByCompany.get(byContract.get(t.sellContractId) ?? '')
          if (!pay?.payRate) { unknownRate++; continue }
          hours += Number(t.totalHours)
          cents += Number(t.totalHours) * pay.payRate
        }
        return {
          hours,
          cents,
          currency: contracts[0] ? payByCompany.get(contracts[0].companyId)?.payCurrency ?? null : null,
          // Weeks whose rate is not on Etyme, so the figure is short and
          // says so rather than quietly under-reporting.
          weeksWithNoRate: unknownRate,
          says:
            hours === 0 && unknownRate === 0
              ? 'Nothing approved and unpaid right now.'
              : unknownRate > 0
                ? `${hours} approved hours here. ${unknownRate} more week${unknownRate === 1 ? '' : 's'} ` +
                  `approved with no rate recorded on Etyme — your agency has those.`
                : `${hours} approved hours, not yet paid.`,
        }
      })(),
    },
  })
}
