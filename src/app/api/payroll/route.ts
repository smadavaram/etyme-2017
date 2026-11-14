import { totals, amount as amountOf } from '@/lib/money-display'
import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { pairsFor, AGREED_SPREAD } from '@/lib/money/margin'
import { spreadOn, blendedSpread } from '@/lib/money/placement-margin'
import { resolveOwnCompany } from '@/lib/resolve-client-company'
import { prisma } from '@/lib/db'
import { daysFor } from '@/lib/contract-links'
import { periodFor, hoursInPeriod, type Period, type Terms } from '@/lib/periods'
import { rateInForce, priceByDay, ratePeriods } from '@/lib/contract-rate'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { sheetOvertime, premiumByDay, overtimeSaysFor, wageLineFor, EXEMPT_SELECT } from '@/lib/money/sheet-overtime'
import { methodFor } from '@/lib/money/overtime-method'
import { payLineOn, payLineSays, weeklyWorked } from '@/lib/money/pay-line'
import { acceptanceForPay, paySheet, payCutSays, straightTimeWeeks } from '@/lib/money/pay-hours'
import { cutOvertimeFor } from '@/lib/cut-overtime-choice'
import { weekStart } from '@/lib/overtime'
import { nextOpen, overdueOpen, todayUtc } from '@/lib/money/next-cycle'
import { paidByPayroll, notPayrollSays } from '@/lib/money/paid-through'
import { ACTIVE_PAY_STATES, STOPPED_PAY_STATES, onPayrollFor, stoppedSince, periodPayStatus, payrollClientFor, periodStatusFromRuns, notAcceptedSays } from '@/lib/money/payroll-rows'
import { plainDate, daySpan } from '@/lib/plain-date'
import { paidBook, paidKey, PAYROLL_RUN } from '@/lib/payroll-paid'
import { workedOutKeys, isWorkedOut } from '@/lib/money/payroll-worked-out'
import { companyPayPeriods } from '@/lib/money/company-pay-periods'
import {
  periodsAround, periodHolding, periodLabel, periodWords, periodShownSays, calendarMonthSays,
  nothingToPaySays, isDayKey, payFileCsv, payFileName, PAY_FILE_NOTE, pickerPeriods, unpaidPeriodWords, type PayPeriodOn,
} from '@/lib/money/pay-periods'
import { PAY_PERIOD_WORDS } from '@/lib/pay-dates'
import { payLeftInPeriod, partPaidSays, type PricedDay, type PremiumDay } from '@/lib/money/period-pay-left'

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
      { error: { code: 'FORBIDDEN', message: refusalFor(caller, { doing: 'Reading payroll', needs: 'payroll.read' }) } },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  // `payroll.read` says this person may read payroll. It does not say
  // whose — and this took the company straight from the query string, so
  // any owner (who holds `*`) could read any other firm's pay rates by
  // editing the URL. The screen sends back the id the server gave it, so
  // requiring it to match costs nothing.
  const { companyId, error: notYours } = resolveOwnCompany(
    caller,
    url.searchParams.get('companyId')
  )
  if (notYours) return notYours
  const status = url.searchParams.get('status')
  // A calendar month, "2026-12"; or a day, "2026-12-06", which asks for
  // the company's own pay period holding it; or nothing.
  const period = url.searchParams.get('period')
  const dayAsked = isDayKey(period) ? period : null
  const companyName = caller.company?.id === companyId ? caller.company.name : 'Your company'

  // ── The company's own pay periods (2026-11-14) ─────────────────────
  //
  // The founder, for Tapin: "W2 first, outside payroll provider,
  // biweekly". A company paying every week or every other week, whose
  // Owner said which Sunday the first period starts on, has its pay
  // listed by its own periods (lib/money/pay-periods). Every line is cut
  // to the company's period, whatever rhythm the line was written with:
  // payroll is run by the company's period, and a line's own pay dates
  // are neither read for it nor rewritten.
  const thisYear = new Date().getUTCFullYear()
  const askedYear = dayAsked ? Number(dayAsked.slice(0, 4)) : thisYear
  const co = await companyPayPeriods(companyId, {
    fromYear: Math.min(thisYear, askedYear) - 3,
    toYear: Math.max(thisYear, askedYear) + 3,
  })
  if (dayAsked && !co.byPeriod) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          field: 'period',
          message: `${calendarMonthSays(companyName, co.rhythm)} Pick a calendar month instead.`,
        },
      },
      { status: 422 }
    )
  }
  const shownPeriod: PayPeriodOn | null = dayAsked ? periodHolding(dayAsked, co.rhythm, co.rule) : null
  const asPeriod = (p: PayPeriodOn): Period => ({
    start: new Date(`${p.start}T00:00:00.000Z`),
    end: new Date(`${p.end}T00:00:00.000Z`),
    label: periodLabel(p),
  })
  const todayKey = todayUtc().toISOString().slice(0, 10)

  // Every buy contract that is working, and every one that stopped and
  // may still have a period on this run. This read working contracts
  // only, so a placement that ended dropped off the runs for the months
  // it worked — Karthik Menon read as nobody on Teleworld's payroll for
  // the three months he was paid for. Which stopped ones are actually
  // shown is `onPayrollFor`'s answer, below (lib/money/payroll-rows).
  const since = shownPeriod
    ? new Date(Date.parse(`${shownPeriod.start}T00:00:00.000Z`) - 31 * 86_400_000)
    : stoppedSince(period)
  const buyContracts = await prisma.buyContract.findMany({
    where: {
      companyId,
      OR: [
        { state: { in: [...ACTIVE_PAY_STATES] } },
        {
          state: { in: [...STOPPED_PAY_STATES] },
          ...(since ? { OR: [{ endDate: null }, { endDate: { gte: since } }] } : {}),
        },
      ],
    },
    include: {
      candidates: {
        include: { person: { select: { id: true, name: true, primaryEmail: true } } },
      },
      vendorCompany: { select: { id: true, name: true } },
      // Its country, with the site's and the pay currency, decides whether
      // the US forty-hour line reaches a worker no contract drew one for.
      entity: { select: { id: true, name: true, country: true } },
      // The document this pay line is on, where there is one. A W2 has
      // none — you do not raise a purchase order to your own employee —
      // and then the line's own columns answer, as they always did.
      workOrder: { select: ORDER_HEADER_SELECT },
      // Whether an hour over the line is owed a premium at all.
      exemptAssertions: { select: EXEMPT_SELECT },
      company: { select: { name: true } },
      // The rung below, where this firm buys from another. The hours are
      // filed on the supplier's contract, so a corp-to-corp buy contract
      // reaching only its own sell side finds nothing and reports a
      // supplier as owed zero. See lib/work-chain.
      supplierSellContract: {
        select: {
          id: true,
          timesheets: {
            where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
            select: {
              id: true, personId: true, totalHours: true, acceptedHours: true,
              periodStart: true, periodEnd: true, days: true, leaveDays: true, approvedAt: true,
              // Every live acceptance: the hours paid are the employer's
              // accepted hours, cut the way pay is cut (lib/money/pay-hours),
              // and two standing acceptances are not paid on a guess.
              assertions: {
                where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
                select: { companyId: true, role: true, hours: true, rateCents: true, coversFrom: true, coversTo: true },
              },
            },
          },
          clientCompany: { select: { id: true, name: true } },
          // The client the work is for. The supplier's `clientCompany` is
          // this firm itself, so it is never the client on a pay row.
          endClientCompany: { select: { id: true, name: true } },
          engagement: { select: { id: true, title: true } },
          billRate: true,
          overtimeAfterHours: true,
          workLocation: { select: { country: true } },
        },
      },
      sellLinks: {
        include: {
          sellContract: {
            include: {
              timesheets: {
                // The employer's live acceptance in the ledger. Pay
                // follows who actually employs the person, which in a
                // chain is rarely the company that billed the client.
                where: {
                  assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } },
                },
                select: {
                  id: true,
                  personId: true,
                  totalHours: true,
                  // What the employer agreed to pay for, where it differs
                  // from what the client approved — two hours of travel
                  // nobody agreed to bill. Null means as submitted.
                  acceptedHours: true,
                  // What the employer actually stands behind, at their
                  // own rate. Not the client's number and never was.
                  assertions: {
                    where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
                    select: { companyId: true, role: true, hours: true, rateCents: true, coversFrom: true, coversTo: true },
                  },
                  periodStart: true,
                  periodEnd: true,
                  // The daily breakdown, so a week crossing a pay period
                  // boundary gives each period exactly its own days.
                  days: true,
                  // Paid leave inside those days: paid, never worked, so
                  // it neither crosses the line nor sets the regular rate.
                  leaveDays: true,
                  approvedAt: true,
                },
              },
              clientCompany: { select: { id: true, name: true } },
              endClientCompany: { select: { id: true, name: true } },
              engagement: { select: { id: true, title: true } },
              workLocation: { select: { country: true } },
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

  // What the runs recorded, for a period with no pay day of its own: an
  // open-ended placement has none, and its months read "Processed" before
  // anybody paid her (walk, 2026-11-14). The paid book says what a run
  // paid; the calculate runs say what was worked out (lib/payroll-paid).
  const book = await paidBook(companyId, buyContracts.map((b) => b.id))
  const workedOut = workedOutKeys(
    (
      await prisma.automationLog.findMany({
        where: { companyId, action: PAYROLL_RUN, payload: { path: ['action'], equals: 'calculate' } },
        select: { payload: true },
      })
    ).map((r) => r.payload as { contracts?: any[] } | null)
  )

  // Weeks filed and not accepted yet. They are not paid, and the row
  // names each one inside its period rather than reading as complete.
  const sourceIds = [
    ...new Set(
      buyContracts.flatMap((bc) => [
        ...bc.sellLinks.map((l) => l.sellContractId),
        ...(bc.supplierSellContract ? [bc.supplierSellContract.id] : []),
      ])
    ),
  ]
  const notAcceptedSheets = sourceIds.length
    ? await prisma.timesheet.findMany({
        where: {
          sellContractId: { in: sourceIds },
          status: { in: ['SUBMITTED', 'APPROVED'] },
          submittedAt: { not: null },
          assertions: { none: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } },
        },
        select: {
          id: true, personId: true, sellContractId: true, periodStart: true, periodEnd: true,
          totalHours: true, days: true, clientApprovedAt: true,
        },
      })
    : []

  // Payroll pays our own employees and nobody else. A worker bought from
  // a supplier, through their own company or as a 1099 individual is paid
  // on an invoice receipt, so a line like that is one plain sentence here
  // and never a row a run could pay (lib/money/paid-through) — the same
  // week is never paid twice, once by payroll and once by invoice.
  const paidElsewhere = buyContracts
    .filter((bc) => !paidByPayroll(bc) && (ACTIVE_PAY_STATES as readonly string[]).includes(bc.state))
    .flatMap((bc) =>
      bc.candidates.map((cand) => ({
        buyContractId: bc.id,
        person: { id: cand.person.id, name: cand.person.name },
        contractType: bc.contractType,
        vendorCompany: bc.vendorCompany,
        says: notPayrollSays({
          personName: cand.person.name,
          contractType: bc.contractType,
          vendorName: bc.vendorCompany?.name ?? null,
        }),
      }))
    )

  // Days holding accepted hours nobody has paid, on a company that pays by
  // its own periods: every period holding one is offered on the picker,
  // however far back (lib/money/pay-periods, `pickerPeriods`).
  const unpaidDays = new Set<string>()

  const payItems = buyContracts.filter((bc) => paidByPayroll(bc)).flatMap((bc) => {
    // Whether anything is still open decides the status, as it always
    // did. What the screen calls "next" is the earliest open date from
    // today on — never the last one generated — and open dates before
    // today are overdue, said beside it (lib/money/next-cycle).
    const nextSalaryCycle = nextOpen(bc.buyCycles, 'SALARY_PAY')
    const nextCalcCycle = nextOpen(bc.buyCycles, 'SALARY_CALCULATE')
    const today = todayUtc()
    const comingPay = nextOpen(bc.buyCycles, 'SALARY_PAY', today)
    const comingCalc = nextOpen(bc.buyCycles, 'SALARY_CALCULATE', today)
    const overduePay = overdueOpen(bc.buyCycles, 'SALARY_PAY', today)

    // The client the work is for: this firm's own sell line's end client,
    // else the firm it bills. On a corp-to-corp line the hours sit on the
    // supplier's contract, whose client is this firm — which is how the
    // column came to name the employer (lib/money/payroll-rows).
    const client = payrollClientFor({
      employerId: bc.companyId,
      own: bc.sellLinks.map((l) => ({
        clientCompany: l.sellContract.clientCompany,
        endClientCompany: l.sellContract.endClientCompany,
      })),
      supplier: bc.supplierSellContract
        ? {
            clientCompany: bc.supplierSellContract.clientCompany,
            endClientCompany: bc.supplierSellContract.endClientCompany,
          }
        : null,
    })

    return bc.candidates.map((cand) => {
      // The link windows, so a timesheet is only counted for the period
      // this contract was actually paying for. effectiveFrom and
      // effectiveTo were written by award, convert and import and read
      // by nothing — see lib/contract-links.
      const links = bc.sellLinks.map((l) => ({
        buyContractId: bc.id,
        sellContractId: l.sellContractId,
        effectiveFrom: l.effectiveFrom,
        effectiveTo: l.effectiveTo,
      }))

      // Our own sell side, plus the supplier's where we buy from one.
      //
      // Both are legitimate sources of the same week: on a W2 placement
      // the hours sit on our own contract, and on a corp-to-corp one
      // they sit on the supplier's, because that is the firm the person
      // actually works for.
      type Source = {
        sellContractId: string
        sellContract: (typeof bc.sellLinks)[number]['sellContract']
        /** True where this is the supplier's contract, whose client is us. */
        supplier?: boolean
      }
      const sources: Source[] = [
        ...bc.sellLinks.map((l) => ({
          sellContractId: l.sellContractId,
          sellContract: l.sellContract,
        })),
        ...(bc.supplierSellContract
          ? [{
              supplier: true,
              sellContractId: bc.supplierSellContract.id,
              // The supplier's contract is read with the same fields this
              // loop uses and nothing more — never their margin.
              sellContract: bc.supplierSellContract as unknown as Source['sellContract'],
            }]
          : []),
      ]

      // What the employer asserted about exemption, which decides whether
      // an hour over forty is owed a premium where no contract drew a line.
      const row = bc.exemptAssertions.find((a) => a.personId === cand.personId) ?? null
      const linkedTimesheets = sources.flatMap((link) =>
        link.sellContract.timesheets
          .filter((ts) => ts.personId === cand.personId)
          .map((ts) => {
            const all = (ts.days as Record<string, number>) ?? {}
            // Narrowed to the days this contract was in force for.
            //
            // The map rather than the total, because the pay-period
            // calculation below re-derives hours from `days` — handing
            // it a corrected total would lose the correction on the
            // next line.
            const filedDays = Object.keys(all).length > 0 ? daysFor(bc.id, links, all) : all
            // The weekly line: the employer's own, else the sell line's,
            // else the law's forty for a nonexempt US worker.
            const line = payLineOn(bc, link.sellContract, { name: cand.person.name, payCurrency: cand.payCurrency }, row)
            const leaveDays = ((ts as { leaveDays?: unknown }).leaveDays ?? {}) as Record<string, number>
            // What the employer accepted, cut the way the run cuts it,
            // under the pay line's own rule for a week accepted short.
            // The screen shows the hours the run will pay, never the hours filed.
            const acceptance = acceptanceForPay(ts.assertions, ts, bc.companyId)
            const pay = acceptance === 'MANY'
              ? null
              : paySheet({
                  all, mine: filedDays, leaveDays, afterHours: line.afterHours, accepted: acceptance,
                  cutOvertime: cutOvertimeFor(bc).rule,
                })
            const mineDays = pay?.days ?? {}
            const mineHours = Object.keys(all).length > 0
              ? (pay ? pay.cut.paid : 0)
              : acceptance === 'MANY' ? 0 : Number(acceptance?.hours ?? ts.totalHours)
            return {
            id: ts.id,
            line,
            filed: filedDays,
            accepted: pay?.accepted ?? null,
            cut: pay?.cut ?? null,
            many: acceptance === 'MANY',
            leaveDays,
            totalHours: mineHours,
            rawStart: ts.periodStart,
            rawEnd: ts.periodEnd,
            days: mineDays,
            periodStart: ts.periodStart.toISOString(),
            periodEnd: ts.periodEnd.toISOString(),
            approvedAt: ts.approvedAt?.toISOString() ?? null,
            sellContractId: link.sellContractId,
            // The client the work is for, never this firm itself.
            clientCompany: link.supplier
              ? client
              : (link.sellContract.endClientCompany ?? link.sellContract.clientCompany ?? client),
            engagement: link.sellContract.engagement,
            billRate: link.sellContract.billRate,
            }
          })
      )

      if (co.byPeriod) {
        for (const ts of linkedTimesheets) {
          if (ts.many) continue
          const dayKeys = Object.keys(ts.days ?? {})
          if (dayKeys.length === 0) {
            // A week filed as a total: unpaid while no run paid any day of it.
            const anyPaid = [...book.paid.keys()].some((k) => k.startsWith(`${bc.id}|${cand.personId}|${ts.id}|`))
            if (ts.totalHours > 0 && !anyPaid) unpaidDays.add(weekStart(ts.rawStart.toISOString().slice(0, 10)))
            continue
          }
          for (const day of dayKeys) {
            const hours = Number((ts.days as Record<string, number>)[day] ?? 0)
            const key = day.slice(0, 10)
            if (hours > 0 && (book.paid.get(paidKey(bc.id, cand.personId, ts.id, key)) ?? 0) + 0.005 < hours) unpaidDays.add(key)
          }
        }
      }

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
      // The rhythm is the order's where this contract is on one — the
      // order we raised to the sub-vendor is billed by them on the
      // rhythm we pay it on, one document and two words for one fact.
      // The date the period is counted from stays this candidate's own:
      // a line is a person and an order is not.
      const terms: Terms = {
        ...periodTermsFor('BUY', bc),
        startedOn: cand.startDate,
      }

      // The period asked for, or the one containing the most recent work.
      // Never "all of it".
      const anchorDate = dayAsked
        ? null
        : period
          ? new Date(`${period}-01T00:00:00Z`)
          : linkedTimesheets.reduce<Date | null>(
              (latest, ts) => (!latest || ts.rawEnd > latest ? ts.rawEnd : latest),
              null
            )

      // The company's own period: the one asked for, or on the view of
      // every period, the one holding the most recent week's Sunday. A
      // calendar month asked for stays a calendar month.
      const companyHeld: PayPeriodOn | null = shownPeriod
        ?? (co.byPeriod && !period && anchorDate
          ? periodHolding(weekStart(anchorDate.toISOString().slice(0, 10)), co.rhythm, co.rule)
          : null)
      const payPeriod = companyHeld ? asPeriod(companyHeld) : anchorDate ? periodFor(anchorDate, terms) : null

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

      // The working of the cut stays here; the row carries its sentence.
      const filteredTimesheets = shares.map(({ ts: { cut: _cut, filed: _filed, line: _line, ...ts }, share }) => ({
        ...ts,
        totalHours: share!.hours,
        partPeriod: share!.partial,
        note: share!.note,
      }))

      const totalApprovedHours =
        Math.round(shares.reduce((sum, x) => sum + x.share!.hours, 0) * 100) / 100

      // Gross pay at the rate in force on each day the work was done, in
      // cents.
      //
      // It used the candidate's rate as it stands today, so a pay rise
      // agreed in August silently repaid every hour worked since March.
      // Then it used the rate on the week's first day, so a rise effective
      // on a Wednesday paid that Wednesday to Friday at the old rate. Each
      // day is priced on its own now (lib/contract-rate, priceByDay).
      const periods = ratePeriods(rateRows.get(bc.id) ?? [])
      const priced = shares.map((x) =>
        priceByDay({
          contractRateCents: cand.payRate,
          periods,
          days: x.ts.days,
          hours: Object.keys(x.ts.days ?? {}).length > 0 ? null : x.share!.hours,
          within: x.share!.partial ? payPeriod : null,
          periodStart: x.ts.rawStart,
          periodEnd: x.ts.rawEnd,
        })
      )
      const byRate = new Map<number, number>()
      for (const p of priced) for (const d of p.days) byRate.set(d.rateCents, (byRate.get(d.rateCents) ?? 0) + d.hours)

      // The premium on hours over the line, priced on the whole week by
      // the line's method — the US regular rate unless the firm chose
      // otherwise — and counted on the days in this period that carry
      // it. The same call the run makes, so the two show one figure.
      const wageLine = wageLineFor(bc, cand.person.name, row)
      const method = methodFor(bc).method
      let premiumExact = 0
      let overtimeHours = 0
      const said: string[] = []
      const lineSaid: string[] = []
      // Each day's premium, by the key the paid book keeps, so what is
      // still to pay is the run's own subtraction (lib/money/period-pay-left).
      const premiumDays: PremiumDay[] = []
      shares.forEach((x, i) => {
        const weeks = sheetOvertime({
          days: x.ts.filed,
          leaveDays: x.ts.leaveDays,
          accepted: x.ts.accepted,
          afterHours: x.ts.line.afterHours,
          contractRateCents: cand.payRate,
          periods,
          method,
          line: wageLine,
        })
        const inPeriod = new Set(priced[i].days.map((d) => d.day))
        for (const [day, p] of premiumByDay(weeks, inPeriod)) {
          premiumExact += p.premiumCents
          overtimeHours += p.hours
          premiumDays.push({ key: paidKey(bc.id, cand.personId, x.ts.id, day), hours: p.hours, premiumCents: p.premiumCents })
        }
        const note = overtimeSaysFor(weeks, inPeriod)
        if (note) said.push(note)
        // Where the weekly line came from, where it is the law's, or why
        // the law's forty does not reach this worker. Said once.
        const lineNote = payLineSays(
          x.ts.line,
          { personName: cand.person.name, employerName: bc.company?.name ?? null },
          weeklyWorked(Object.fromEntries(Object.entries(x.ts.filed).filter(([d]) => inPeriod.has(d.slice(0, 10)))), x.ts.leaveDays)
        )
        if (lineNote && !lineSaid.includes(lineNote)) lineSaid.push(lineNote)
      })
      // Where the employer accepted fewer hours than were filed, which
      // hours are paid; and a week with two standing acceptances, which is
      // not paid on a guess. The same sentences the run says.
      const acceptedSaid: string[] = []
      for (const x of shares) {
        if (!x.ts.cut) continue
        const note = payCutSays(x.ts.cut, { personName: cand.person.name, employerName: bc.company?.name ?? null })
        if (note && !acceptedSaid.includes(note)) acceptedSaid.push(note)
      }
      // A week worked over the line and accepted at or under it is paid
      // at straight time, because an acceptance at or under the line is
      // the hours worked. The row says so in the week's own sentence.
      const straightSaid: string[] = []
      shares.forEach((x, i) => {
        if (!x.ts.cut) return
        for (const w of straightTimeWeeks(x.ts.cut)) {
          if (!priced[i].days.some((d) => weekStart(d.day) === w.weekOf)) continue
          if (!straightSaid.includes(w.says)) straightSaid.push(w.says)
        }
      })
      if (payPeriod) {
        for (const ts of linkedTimesheets.filter((t) => t.many)) {
          const filedShare = hoursInPeriod(
            { id: ts.id, periodStart: ts.rawStart, periodEnd: ts.rawEnd, days: ts.filed, totalHours: 0 },
            payPeriod,
            terms.straddle
          )
          if (!filedShare || filedShare.hours <= 0) continue
          acceptedSaid.push(
            `${bc.company?.name ?? 'The employer'} has more than one acceptance standing on ${cand.person.name}'s ` +
              `week of ${plainDate(ts.periodStart)}, and nothing says which of them governs, so that ` +
              `week is not paid here rather than paid on a guess. It is paid once all but one are withdrawn.`
          )
        }
      }

      // Each week filed inside the period and not accepted yet: left out
      // of gross pay, as before, and now named in one sentence.
      const notAcceptedSaid: string[] = []
      if (payPeriod) {
        for (const ts of notAcceptedSheets.filter((t) => t.personId === cand.personId)) {
          const src = sources.find((s) => s.sellContractId === ts.sellContractId)
          if (!src) continue
          const all = (ts.days as Record<string, number>) ?? {}
          const filed = !src.supplier && Object.keys(all).length > 0 ? daysFor(bc.id, links, all) : all
          const share = hoursInPeriod(
            { id: ts.id, periodStart: ts.periodStart, periodEnd: ts.periodEnd, days: filed, totalHours: Number(ts.totalHours) },
            payPeriod,
            terms.straddle
          )
          if (!share || share.hours <= 0) continue
          const clientCo = src.supplier ? client : (src.sellContract.endClientCompany ?? src.sellContract.clientCompany ?? client)
          notAcceptedSaid.push(
            notAcceptedSays({
              personName: cand.person.name,
              week: daySpan(ts.periodStart.toISOString(), ts.periodEnd.toISOString()),
              hours: share.hours,
              clientApproved: ts.clientApprovedAt != null,
              clientName: clientCo?.name ?? null,
              employerName: bc.company?.name ?? null,
            })
          )
        }
      }

      // Rounded once for the row.
      const premiumCents = Math.round(premiumExact)
      const grossPay =
        [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(Math.round(h * 100) / 100 * r), 0) + premiumCents
      // What earlier runs paid in this period and what is still to pay, so
      // a week paid already is never shown, filed or counted as due again.
      const pricedDays: PricedDay[] = shares.flatMap((x, i) =>
        priced[i].days.map((d) => ({ key: paidKey(bc.id, cand.personId, x.ts.id, d.day), hours: d.hours, rateCents: d.rateCents }))
      )
      const left = payLeftInPeriod(pricedDays, premiumDays, book)
      // The rate a reader sees on the row: the one in force at the end of
      // the period, which is the one the next hour will be paid at.
      const rateNow = payPeriod
        ? rateInForce(cand.payRate, periods, payPeriod.end).rateCents
        : rateInForce(cand.payRate, periods, new Date()).rateCents

      // The period's own pay day decides, where the line has one: a month
      // the run has settled is processed, whatever older date was never
      // marked (lib/money/payroll-rows).
      //
      // A company period is not the line's own: the line's pay dates were
      // cut on the rhythm it was written with, so they say nothing about
      // this period, and what the runs recorded for it decides.
      const own = payPeriod && !companyHeld
        ? periodPayStatus(bc.buyCycles, payPeriod, (d) => periodFor(d, terms), cand.startDate)
        : null
      let payStatus: string
      if (filteredTimesheets.length === 0) {
        payStatus = 'NO_HOURS'
      } else if (own) {
        payStatus = own
      } else if (!companyHeld && nextCalcCycle && !nextCalcCycle.completedAt) {
        payStatus = 'PENDING'
      } else if (!companyHeld && nextSalaryCycle && !nextSalaryCycle.completedAt) {
        payStatus = 'CALCULATED'
      } else if (book.unrecorded.has(bc.id)) {
        // A run before 2026-09-29 paid this line without saying which
        // hours; the run route refuses it, and the row keeps its old word.
        payStatus = 'PROCESSED'
      } else {
        // No pay day for this period: what the runs recorded decides, and
        // a period nobody paid is pending, never processed.
        payStatus = periodStatusFromRuns({
          days: shares.flatMap((x, i) =>
            priced[i].days.map((d) => ({ key: paidKey(bc.id, cand.personId, x.ts.id, d.day), hours: d.hours }))
          ),
          paid: book.paid,
          workedOut: payPeriod
            ? isWorkedOut(workedOut, {
                buyContractId: bc.id, buyContractCandidateId: cand.id,
                start: payPeriod.start.toISOString(), end: payPeriod.end.toISOString(),
              })
            : false,
        })
      }

      return {
        buyContractId: bc.id,
        buyContractCandidateId: cand.id,
        // Whether this row is on the run at all; read and dropped below.
        onRun: onPayrollFor(
          { state: bc.state, startDate: cand.startDate, endDate: cand.endDate ?? bc.endDate },
          { period: payPeriod, asked: Boolean(period), hours: totalApprovedHours, settled: own === 'PROCESSED' }
        ),
        // The client the work is for, with or without hours this period.
        client,
        // The contract the carry hangs off. The off-cycle screen needs
        // it, and the timesheets below already knew it.
        sellContractId: filteredTimesheets[0]?.sellContractId ?? null,
        // What is actually being paid for. A pay slip with no period on
        // it is the first thing a consultant queries.
        payPeriod: payPeriod
          ? { start: payPeriod.start.toISOString(), end: payPeriod.end.toISOString(), label: payPeriod.label }
          : null,
        person: cand.person,
        contractType: bc.contractType,
        state: bc.state,
        payRate: rateNow,
        // Where the rate changed inside the period, each rate and its hours.
        rates: byRate.size > 1
          ? [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rateCents, hours]) => ({ rateCents, hours: Math.round(hours * 100) / 100 }))
          : null,
        payCurrency: cand.payCurrency,
        vendorCompany: bc.vendorCompany,
        entity: bc.entity,
        startDate: cand.startDate.toISOString(),
        endDate: cand.endDate?.toISOString() ?? null,
        candidateState: cand.state,
        timesheets: filteredTimesheets,
        totalApprovedHours,
        grossPay,
        // Hours over the line in the period and the premium on them,
        // already inside grossPay; and the sentence saying how each week
        // was priced, or why one could not be.
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        premiumCents,
        overtime: said.length ? said.join(' ') : null,
        // Which weekly line the period was judged on, where that needs
        // saying: the law's forty, or why the law's forty does not apply.
        payLine: lineSaid.length ? lineSaid.join(' ') : null,
        // Where fewer hours were accepted than filed, which were paid.
        accepted: acceptedSaid.length ? acceptedSaid.join(' ') : null,
        // Each week filed in the period and not accepted yet, which gross
        // pay leaves out: the person, the week, the hours, who must act.
        notAccepted: notAcceptedSaid.length ? notAcceptedSaid.join(' ') : null,
        // Each week worked over the line and accepted at or under it:
        // "38 of 45 hours accepted; paid at straight time because the
        // accepted week is not over 40."
        straightTime: straightSaid.length ? straightSaid.join(' ') : null,
        payStatus,
        // What earlier runs paid in this period, null where nothing was;
        // what a run would pay now; and, where both, one sentence.
        paidSoFar: left.paid,
        toPay: left.toPay,
        partPaid: partPaidSays(left, (c) => amountOf(c, cand.payCurrency)),
        // On a company period, its own work-out day and pay day, moved off
        // a day nobody works by the one rule every pay date follows.
        nextPayDate: companyHeld ? `${companyHeld.payOn}T00:00:00.000Z` : comingPay?.dueOn.toISOString() ?? null,
        nextCalcDate: companyHeld ? `${companyHeld.calcOn}T00:00:00.000Z` : comingCalc?.dueOn.toISOString() ?? null,
        // Pay dates before today still open: how many, and the oldest.
        payDatesOverdue: companyHeld
          ? companyHeld.payOn < todayKey && (payStatus === 'PENDING' || payStatus === 'CALCULATED')
            ? { count: 1, earliest: `${companyHeld.payOn}T00:00:00.000Z` }
            : { count: 0, earliest: null }
          : {
              count: overduePay.count,
              earliest: overduePay.earliest?.toISOString() ?? null,
            },
      }
    })
  })

  // A stopped placement off this run, and the working flag, dropped.
  const onRun = payItems.filter((p) => p.onRun).map(({ onRun: _onRun, ...p }) => p)

  // Filter by status if specified
  const filtered = status
    ? onRun.filter((p) => p.payStatus === status.toUpperCase())
    : onRun

  // Summary stats
  // Rupees and dollars are never added: the gross is said per currency, and
  // `totalGrossPay` is a sum only where every line is in one currency
  // (`currency`); with two it is null and `grossSays` names each.
  const currencies = [...new Set(filtered.map((p) => p.payCurrency))]
  const oneCurrency = currencies.length === 1 ? currencies[0] : currencies.length === 0 ? 'USD' : null
  const saysGross = (items: typeof filtered) => totals(items.map((p) => ({ minor: p.grossPay, currency: p.payCurrency })))
  const summary = {
    totalContracts: filtered.length,
    currency: oneCurrency,
    grossSays: filtered.length === 0 ? amountOf(0, 'USD') : saysGross(filtered),
    totalGrossPay: oneCurrency ? filtered.reduce((sum, p) => sum + p.grossPay, 0) : null,
    totalHours: filtered.reduce((sum, p) => sum + p.totalApprovedHours, 0),
    byContractType: Object.fromEntries(
      ['W2', 'C2C', 'IND_1099'].map((type) => {
        const items = filtered.filter((p) => p.contractType === type)
        return [type, {
          count: items.length,
          grossSays: items.length === 0 ? null : saysGross(items),
          grossPay: oneCurrency ? items.reduce((s, p) => s + p.grossPay, 0) : null,
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

  // ── The spread, from the one margin service ─────────────────────────
  //
  // The page averaged each week's bill rate in the browser and read a
  // missing one as nought, so a placement with no bill rate showed a
  // spread of a hundred per cent of nothing, and every payroll desk read
  // the bill rate on every week. The payroll desks pay people and do not
  // read the margin (lib/company-roles), so a seat without `margin.read`
  // or `pnl.read` gets neither the rate nor the spread; one with it gets
  // the agreed spread as `spreadOn` computes it for Profitability, so the
  // two screens cannot disagree (lib/money/margin).
  const readsMargin = hasPermission(caller.permissions, 'margin.read') || hasPermission(caller.permissions, 'pnl.read')
  const pairs = readsMargin ? (await pairsFor(companyId, 'ALL')).all : []
  const items = filtered.map((p) => {
    const timesheets = readsMargin ? p.timesheets : p.timesheets.map(({ billRate: _rate, ...t }) => t)
    if (!readsMargin) return { ...p, timesheets, agreed: null }
    const theirs = pairs.filter((x) => x.buy?.id === p.buyContractId && x.sell.personId === p.person.id)
    return {
      ...p,
      timesheets,
      agreed: theirs.length === 1 ? spreadOn(theirs[0]) : theirs.length > 1 ? blendedSpread(theirs, 'ALL') : null,
    }
  })

  // ── The pay file for one of the company's periods ───────────────────
  //
  // Built from these rows and nothing else, so every figure on the file is
  // the figure on the screen (lib/money/pay-periods, `payFileCsv`).
  if (url.searchParams.get('format') === 'csv') {
    if (!shownPeriod) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', field: 'period', message: 'Pick one of your pay periods to download its pay file.' } },
        { status: 422 }
      )
    }
    return new NextResponse(payFileCsv(items, shownPeriod), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${payFileName(shownPeriod)}"`,
      },
    })
  }

  // The company's own periods for the picker: the current one first, the
  // next, then the earlier ones. Null where pay is listed by month.
  // Then every earlier period that still holds accepted hours nobody paid.
  const around = co.byPeriod ? periodsAround(todayKey, co.rhythm, co.rule, { earlier: 6, later: 1 }) : null
  const said = (p: PayPeriodOn) => ({ ...p, label: periodLabel(p), words: periodWords(p) })
  const payPeriods = around
    ? {
        current: around[0].start,
        periods: pickerPeriods(around, unpaidDays, co.rhythm, co.rule).map((p) => ({
          ...said(p),
          // Said only where its pay day has passed: the current period's
          // hours are unpaid because its pay day has not come yet.
          unpaid: p.unpaid && p.payOn < todayKey,
          words: p.unpaid && p.payOn < todayKey ? unpaidPeriodWords(p) : periodWords(p),
        })),
        shown: shownPeriod ? said(shownPeriod) : null,
      }
    : null

  // The sentence over the rows: the period shown and its pay day; or, on a
  // month, why the page lists by month, and where the Owner sets the day.
  const periodSays = shownPeriod
    ? periodShownSays(companyName, co.rhythm, shownPeriod)
    : co.byPeriod
      ? `${companyName} pays ${PAY_PERIOD_WORDS[co.rhythm.payPeriod].toLowerCase()}, so pay is worked out and paid ` +
        'by pay period. Pick one above to run it; a calendar month is shown here for reading only.'
      : calendarMonthSays(companyName, co.rhythm)
  const nothingToPay = shownPeriod && !onRun.some((p) => p.totalApprovedHours > 0) ? nothingToPaySays(shownPeriod) : null

  return NextResponse.json({
    data: {
      periodSays,
      payPeriods,
      // Whether Calculate and Process may be offered on this view: on a
      // company that pays by its own periods, only on one of them.
      runsHere: co.byPeriod ? Boolean(shownPeriod) && !nothingToPay : true,
      nothingToPay,
      payFileNote: PAY_FILE_NOTE,
      payItems: items,
      /** The column's name, from the service every screen reads it from. */
      spreadLabel: readsMargin ? AGREED_SPREAD : null,
      paidElsewhere,
      summary,
      period: period ?? 'all',
    },
  })
}
