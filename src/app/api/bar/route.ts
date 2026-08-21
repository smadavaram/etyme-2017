import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { bar, whatIsStopping, TARGET_PER_DAY, type Sub } from '@/lib/outcomes'
import { costPerSubmission, trend, filterRate, worstOffender, showMicros } from '@/lib/agent-run'

/**
 * GET /api/bar?days=14
 *
 * The number, and what it costs.
 *
 * Good submissions per day, per requirement — the one measure that says
 * whether any of this works. Not users, not logins, not model accuracy,
 * not requirements processed. Five and there is a business; two and
 * something is wrong that no further feature will fix.
 *
 * Alongside it, what a submission costs and whether that is falling,
 * because a number that goes up while the cost goes up faster is not
 * progress either.
 *
 * Meant to be looked at with the customer in the room. Both sides read
 * the same screen, which turns pricing day into arithmetic instead of an
 * argument.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The bar')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const days = Math.min(90, Math.max(1, parseInt(request.nextUrl.searchParams.get('days') ?? '14', 10)))

  const now = new Date()
  const since = new Date(now.getTime() - days * 86400000)
  const lastWeekStart = new Date(now.getTime() - 14 * 86400000)
  const thisWeekStart = new Date(now.getTime() - 7 * 86400000)

  const [submissions, runs, lastWeekSubs, thisWeekSubs] = await Promise.all([
    prisma.submission.findMany({
      where: { fromCompanyId: companyId, submittedAt: { gte: since } },
      select: {
        requirementId: true, submittedAt: true, checkState: true,
        overriddenAt: true, rejectReason: true,
      },
    }),
    prisma.agentRun.findMany({
      where: { companyId, at: { gte: lastWeekStart } },
      select: {
        agent: true, verdict: true, attempt: true, costMicros: true, ms: true,
        consideredCount: true, scoredCount: true, at: true,
      },
    }),
    prisma.submission.count({
      where: { fromCompanyId: companyId, submittedAt: { gte: lastWeekStart, lt: thisWeekStart } },
    }),
    prisma.submission.count({
      where: { fromCompanyId: companyId, submittedAt: { gte: thisWeekStart } },
    }),
  ])

  const subs: Sub[] = submissions.map((s) => ({
    requirementId: s.requirementId,
    submittedAt: s.submittedAt,
    checkState: s.checkState,
    overriddenAt: s.overriddenAt,
    rejectReason: s.rejectReason,
  }))

  const theBar = bar(subs, days)

  const thisWeekRuns = runs.filter((r) => r.at >= thisWeekStart)
  const lastWeekRuns = runs.filter((r) => r.at < thisWeekStart)

  const costNow = costPerSubmission(thisWeekRuns, thisWeekSubs)
  const costBefore = costPerSubmission(lastWeekRuns, lastWeekSubs)

  return NextResponse.json({
    data: {
      target: TARGET_PER_DAY,
      window: days,
      bar: theBar,
      stopping: whatIsStopping(subs),
      cost: {
        perSubmission: costNow,
        shown: showMicros(costNow),
        trend: trend(costNow, costBefore),
        // How much of the bench the rules threw away before anything was
        // paid for. A filter that has quietly stopped filtering shows up
        // here long before it shows up on the invoice.
        filtered: filterRate(runs),
        worst: worstOffender(runs),
      },
    },
  })
}
