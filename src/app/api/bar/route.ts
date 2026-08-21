import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { bar, whatIsStopping, TARGET_PER_DAY, type Sub } from '@/lib/outcomes'
import { costPerSubmission, trend, filterRate, worstOffender, showMicros } from '@/lib/agent-run'
import { patterns, headline, type Failure } from '@/lib/recurring'

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

  // The pattern window is its own, and longer.
  //
  // The bar is a daily rate over whatever window somebody is looking at.
  // "Does this keep happening" is the slow loop, and asking it over seven
  // days answers a different question — one where three CV failures in a
  // quiet week look like a crisis and forty over a quarter look like
  // nothing. Ninety days either way.
  const patternSince = new Date(now.getTime() - 90 * 86400000)
  const lastWeekStart = new Date(now.getTime() - 14 * 86400000)
  const thisWeekStart = new Date(now.getTime() - 7 * 86400000)

  const [submissions, runs, lastWeekSubs, thisWeekSubs, repeats, checked] = await Promise.all([
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
    // Step four of the loop. The check tells somebody Ravi has no CV and
    // they attach one; tomorrow it says Kavitha. Nothing noticed that the
    // answer was never "attach a CV" — it was "collect CVs at onboarding".
    prisma.check.findMany({
      // Every record type, not only submissions. The pattern detector was
      // filtered to SUBMISSION, so a requirement quality check failing the
      // same way on forty roles was invisible — which is exactly the
      // upstream problem it exists to name.
      where: { companyId, verdict: 'FAIL', at: { gte: patternSince } },
      select: { code: true, recordId: true, at: true },
    }),
    // How many records any loop has actually checked, which is what the
    // share is out of.
    prisma.check.findMany({
      where: { companyId, at: { gte: patternSince } },
      select: { recordType: true, recordId: true },
      distinct: ['recordType', 'recordId'],
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

  const found = patterns(
    repeats.map((r): Failure => ({ code: r.code, recordId: r.recordId, at: r.at })),
    checked.length
  )

  return NextResponse.json({
    data: {
      target: TARGET_PER_DAY,
      // Silence here means the loop is working. A panel that always has
      // something in it is a panel nobody reads.
      recurring: { patterns: found, headline: headline(found), recordsChecked: checked.length },
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
