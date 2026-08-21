import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { periodFor, hoursInPeriod, type Terms } from '@/lib/periods'
import { rateInForce } from '@/lib/contract-rate'

/**
 * GET /api/payroll
 *
 * Lists pay items for buy-side contracts.
 *
 * The legacy Salary model is consolidated: payroll runs through
 * BuyContract + approved Timesheets linked via ContractLink.
 *
 * Pipeline (LEGACY_RULES.md §2.5):
 *   pending → open → calculated → approved → processed → cleared
 *
 * Each pay item = one BuyContract for one pay period, computed from
 * approved sell-side timesheets linked via ContractLink.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'payroll.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'payroll.read permission required' } },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const companyId = url.searchParams.get('companyId') ?? caller.company?.id
  const status = url.searchParams.get('status')
  const period = url.searchParams.get('period') // YYYY-MM

  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'companyId required' } },
      { status: 422 }
    )
  }

  // Find all active buy contracts for this company
  const buyContracts = await prisma.buyContract.findMany({
    where: {
      companyId,
      state: { in: ['IN_PROGRESS', 'BENCH_PAID', 'INTERNAL', 'TRAINING'] },
    },
    include: {
      candidates: {
        include: { person: { select: { id: true, name: true, primaryEmail: true } } },
      },
      vendorCompany: { select: { id: true, name: true } },
      entity: { select: { id: true, name: true } },
      sellLinks: {
        include: {
          sellContract: {
            include: {
              timesheets: {
                where: { status: 'APPROVED' },
                select: {
                  id: true,
                  personId: true,
                  totalHours: true,
                  periodStart: true,
                  periodEnd: true,
                  // The daily breakdown, so a week crossing a pay period
                  // boundary gives each period exactly its own days.
                  days: true,
                  approvedAt: true,
                },
              },
              clientCompany: { select: { id: true, name: true } },
              engagement: { select: { id: true, title: true } },
            },
          },
        },
      },
      buyCycles: {
        where: {
          kind: { in: ['SALARY_CALCULATE', 'SALARY_PAY'] },
        },
        orderBy: { dueOn: 'desc' },
      },
    },
    orderBy: { startDate: 'desc' },
  })

  // One pay item PER CANDIDATE, not per contract. A buy contract may cover
  // several people at different rates, so a single gross figure for the
  // agreement would be meaningless — and paying everyone the first person's
  // rate would be a real financial error.
  //
  // Hours are matched to the candidate by personId. The linked sell
  // contracts carry timesheets for whoever worked them, so the person is
  // what ties an approved timesheet to the rate it should be paid at.
  // Rate history for every pay contract on this run, read once.
  //
  // A pay rise is effective-dated and approved, so the hour worked in
  // March is paid at March's rate however many amendments have landed
  // since. Billing already resolved this; payroll did not.
  const rateHistory = await prisma.rateHistory.findMany({
    where: { contractType: 'BUY', contractId: { in: buyContracts.map((b) => b.id) } },
    select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })

  const rateRows = new Map<string, typeof rateHistory>()
  for (const r of rateHistory) {
    rateRows.set(r.contractId, [...(rateRows.get(r.contractId) ?? []), r])
  }

  const payItems = buyContracts.flatMap((bc) => {
    const nextSalaryCycle = bc.buyCycles.find(
      (c) => c.kind === 'SALARY_PAY' && !c.completedAt
    )
    const nextCalcCycle = bc.buyCycles.find(
      (c) => c.kind === 'SALARY_CALCULATE' && !c.completedAt
    )

    return bc.candidates.map((cand) => {
      const linkedTimesheets = bc.sellLinks.flatMap((link) =>
        link.sellContract.timesheets
          .filter((ts) => ts.personId === cand.personId)
          .map((ts) => ({
            id: ts.id,
            totalHours: Number(ts.totalHours),
            rawStart: ts.periodStart,
            rawEnd: ts.periodEnd,
            days: (ts.days as Record<string, number>) ?? {},
            periodStart: ts.periodStart.toISOString(),
            periodEnd: ts.periodEnd.toISOString(),
            approvedAt: ts.approvedAt?.toISOString() ?? null,
            sellContractId: link.sellContractId,
            clientCompany: link.sellContract.clientCompany,
            engagement: link.sellContract.engagement,
            billRate: link.sellContract.billRate,
          }))
      )

      // ── The pay period the contract says it is ────────────────────
      //
      // This matched the period string against the start of a timesheet:
      //
      //   linkedTimesheets.filter((ts) => ts.periodStart.startsWith(period))
      //
      // Two things wrong with it, and one is serious.
      //
      // A week running 27 July to 2 August starts in July, so all forty
      // hours were paid in July and none in August — the same boundary
      // bug billing had, on the side the consultant checks.
      //
      // And with no period at all it summed every timesheet ever linked
      // to the contract. On this seed that is 200 hours instead of 160.
      // On a book with a year of history it is a five-figure overpayment
      // on the default view of the screen.
      const terms: Terms = {
        frequency: bc.payFrequency as Terms['frequency'],
        anchor: bc.payAnchor as Terms['anchor'],
        straddle: bc.payStraddle as Terms['straddle'],
        startedOn: cand.startDate,
      }

      // The period asked for, or the one containing the most recent work.
      // Never "all of it".
      const anchorDate = period
        ? new Date(`${period}-01T00:00:00Z`)
        : linkedTimesheets.reduce<Date | null>(
            (latest, ts) => (!latest || ts.rawEnd > latest ? ts.rawEnd : latest),
            null
          )

      const payPeriod = anchorDate ? periodFor(anchorDate, terms) : null

      const shares = payPeriod
        ? linkedTimesheets
            .map((ts) => ({
              ts,
              share: hoursInPeriod(
                { id: ts.id, periodStart: ts.rawStart, periodEnd: ts.rawEnd, days: ts.days, totalHours: ts.totalHours },
                payPeriod,
                terms.straddle
              ),
            }))
            .filter((x) => x.share !== null && x.share.hours > 0)
        : []

      const filteredTimesheets = shares.map((x) => ({
        ...x.ts,
        totalHours: x.share!.hours,
        partPeriod: x.share!.partial,
        note: x.share!.note,
      }))

      const totalApprovedHours =
        Math.round(shares.reduce((sum, x) => sum + x.share!.hours, 0) * 100) / 100

      // Gross pay at the rate in force when the work was done, in cents.
      //
      // It used the candidate's rate as it stands today, so a pay rise
      // agreed in August silently repaid every hour worked since March.
      const grossPay = Math.round(
        shares.reduce((sum, x) => {
          const rate = rateInForce(
            cand.payRate,
            (rateRows.get(bc.id) ?? []).map((r) => ({
              id: r.id, rateCents: r.rate, fromDate: r.fromDate,
              toDate: r.toDate, approvalState: r.approvalState,
            })),
            x.ts.rawStart
          ).rateCents
          return sum + x.share!.hours * rate
        }, 0)
      )

      let payStatus: string
      if (filteredTimesheets.length === 0) {
        payStatus = 'NO_HOURS'
      } else if (nextCalcCycle && !nextCalcCycle.completedAt) {
        payStatus = 'PENDING'
      } else if (nextSalaryCycle && !nextSalaryCycle.completedAt) {
        payStatus = 'CALCULATED'
      } else {
        payStatus = 'PROCESSED'
      }

      return {
        buyContractId: bc.id,
        buyContractCandidateId: cand.id,
        // What is actually being paid for. A pay slip with no period on
        // it is the first thing a consultant queries.
        payPeriod: payPeriod
          ? { start: payPeriod.start.toISOString(), end: payPeriod.end.toISOString(), label: payPeriod.label }
          : null,
        person: cand.person,
        contractType: bc.contractType,
        state: bc.state,
        payRate: cand.payRate,
        payCurrency: cand.payCurrency,
        vendorCompany: bc.vendorCompany,
        entity: bc.entity,
        startDate: cand.startDate.toISOString(),
        endDate: cand.endDate?.toISOString() ?? null,
        candidateState: cand.state,
        timesheets: filteredTimesheets,
        totalApprovedHours,
        grossPay,
        payStatus,
        nextPayDate: nextSalaryCycle?.dueOn.toISOString() ?? null,
        nextCalcDate: nextCalcCycle?.dueOn.toISOString() ?? null,
      }
    })
  })

  // Filter by status if specified
  const filtered = status
    ? payItems.filter((p) => p.payStatus === status.toUpperCase())
    : payItems

  // Summary stats
  const summary = {
    totalContracts: filtered.length,
    totalGrossPay: filtered.reduce((sum, p) => sum + p.grossPay, 0),
    totalHours: filtered.reduce((sum, p) => sum + p.totalApprovedHours, 0),
    byContractType: Object.fromEntries(
      ['W2', 'C2C', 'IND_1099'].map((type) => {
        const items = filtered.filter((p) => p.contractType === type)
        return [type, {
          count: items.length,
          grossPay: items.reduce((s, p) => s + p.grossPay, 0),
          hours: items.reduce((s, p) => s + p.totalApprovedHours, 0),
        }]
      })
    ),
    byStatus: Object.fromEntries(
      ['PENDING', 'CALCULATED', 'PROCESSED', 'NO_HOURS'].map((s) => [
        s,
        filtered.filter((p) => p.payStatus === s).length,
      ])
    ),
  }

  return NextResponse.json({
    data: {
      payItems: filtered,
      summary,
      period: period ?? 'all',
    },
  })
}
