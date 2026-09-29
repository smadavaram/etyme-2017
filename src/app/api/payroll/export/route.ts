import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { buildExport, toCsv, missingIds, type Provider, type SheetToPay } from '@/lib/payroll-export'
import { policyOf, splitWeeks, weekStart, type Decision } from '@/lib/overtime'
import { priceByDay, rateInForce, ratePeriods } from '@/lib/contract-rate'
import type { ExemptAssertion, ExemptionBasis, ExemptStatus, WageRuleName } from '@/lib/worker-classification'
import { workedByWeek } from '@/lib/money/sheet-overtime'
import { methodFor } from '@/lib/money/overtime-method'
import { payLineFor, payLineSays, weeklyWorked } from '@/lib/money/pay-line'
import { acceptanceForPay, payBands, payCut, paidDayMaps, heldSays } from '@/lib/money/pay-hours'

/**
 * GET /api/payroll/export?provider=ADP&from=&to=
 *
 * What is owed, in a shape ADP or Paychex will take.
 *
 * Etyme does not run payroll and should not — withholding, filings and
 * year-end are somebody else's whole business and are regulated
 * differently in every state. What it knows is the part the provider
 * cannot work out: the hours, whose signature stands behind them, at
 * what rate, against which order.
 *
 * Add `?format=csv` for the file itself. Without it, the JSON — so a
 * screen can show what is about to go and who is being left out before
 * anybody downloads anything.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Payroll export')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const url = new URL(request.url)

  const provider = (['ADP', 'PAYCHEX', 'GENERIC'].includes(url.searchParams.get('provider') ?? '')
    ? url.searchParams.get('provider')
    : 'GENERIC') as Provider

  const from = url.searchParams.get('from')
    ? new Date(url.searchParams.get('from')!)
    : new Date(Date.now() - 30 * 86_400_000)
  const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : new Date()

  // Sheets on contracts this company sells. A prime exporting payroll
  // exports its own employees, never its sub-vendor's — the sub pays
  // those, and reading them here would be reading another company's
  // wage bill.
  const sheets = await prisma.timesheet.findMany({
    where: {
      sellContract: { companyId },
      periodEnd: { gte: from, lte: to },
    },
    select: {
      periodStart: true, periodEnd: true, totalHours: true,
      acceptedHours: true, employerAcceptedAt: true,
      // The employer's acceptance in the ledger: the hours paid, cut the
      // way pay is always cut (lib/money/pay-hours).
      assertions: {
        where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
        select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true },
      },
      // The daily hours and what the client decided about the weeks that
      // went over the line. Overtime is a weekly fact and a semi-monthly
      // sheet holds two of them, so the file is built from weeks.
      days: true, leaveDays: true,
      sellContractId: true,
      overtimeDecisions: true,
      personId: true,
      person: { select: { name: true } },
      sellContract: {
        select: {
          id: true, billCurrency: true,
          overtimeAfterHours: true, overtimeMultiplierBps: true,
          // Where the work is done: one of the facts that decides whether
          // the US forty-hour line reaches a worker no contract drew one for.
          workLocation: { select: { country: true } },
          company: { select: { name: true } },
          clientCompany: { select: { name: true } },
          costCenter: { select: { code: true } },
          internalOrder: { select: { code: true } },
          workOrder: { select: { number: true } },
          // ── What we actually pay, and who we pay it to ────────────
          //
          // The buy leg. This route used to put `billRate` on the file,
          // which paid every consultant what the client was charged for
          // them. The pay rate, the contract type and the employer's own
          // exempt assertion all live here and nowhere else.
          buyLinks: {
            select: {
              effectiveFrom: true, effectiveTo: true,
              buyContract: {
                select: {
                  id: true, companyId: true, contractType: true, payCurrency: true,
                  payModel: true,
                  // What an overtime hour is worth to the WORKER, which
                  // is a different fact from what the client is billed
                  // for one. Statute sets a floor; this may be better.
                  overtimeAfterHours: true, overtimeMultiplierBps: true,
                  // The paying firm's choice of overtime method, with who
                  // chose it and why — methodFor applies a choice only
                  // where all three are there, so the file pays the method
                  // the run pays.
                  overtimeMethod: true, overtimeMethodById: true, overtimeMethodReason: true,
                  entity: { select: { country: true } },
                  candidates: { select: { personId: true, payRate: true, payCurrency: true, state: true } },
                  exemptAssertions: {
                    select: {
                      personId: true, status: true, basis: true, wageRule: true, note: true,
                      assertedAt: true, reviewBy: true, assertedByCompanyId: true,
                      assertedByCompany: { select: { name: true } },
                      assertedBy: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { periodEnd: 'asc' },
    take: 5000,
  })

  // Every approved pay change on the buy lines behind these sheets, read
  // once. A pay rise is effective-dated, so each week — and inside a week
  // that crosses one, each day — is paid at the rate in force.
  const buyIds = [...new Set(sheets.flatMap((s) => s.sellContract.buyLinks.map((l) => l.buyContract.id)))]
  const rateRows = buyIds.length
    ? await prisma.rateHistory.findMany({
        where: { contractType: 'BUY', contractId: { in: buyIds } },
        select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
      })
    : []

  const rows: SheetToPay[] = sheets.map((s) => {
    // The buy contract in force over this work, and this person on it.
    // Null all the way down where nothing on the buy side describes
    // them, which `buildExport` refuses rather than filling in from the
    // sell side.
    const link =
      s.sellContract.buyLinks.find(
        (l) =>
          l.effectiveFrom <= s.periodEnd && (l.effectiveTo == null || l.effectiveTo >= s.periodStart)
      ) ?? s.sellContract.buyLinks[0] ?? null
    const buy = link?.buyContract ?? null
    const candidate = buy?.candidates.find((c) => c.personId === s.personId) ?? null
    const row = buy?.exemptAssertions.find((a) => a.personId === s.personId) ?? null

    const assertion: ExemptAssertion | null = row
      ? {
          status: row.status as ExemptStatus,
          basis: (row.basis as ExemptionBasis | null) ?? null,
          assertedByCompanyId: row.assertedByCompanyId,
          assertedByCompanyName: row.assertedByCompany?.name ?? null,
          assertedByName: row.assertedBy?.name ?? null,
          assertedAt: row.assertedAt,
          note: row.note,
          reviewBy: row.reviewBy,
        }
      : null

    // What the client decided about each week that went over the line.
    // A billing fact on the sell leg — read so the file can say what the
    // employer still owes on top of it, never to price the wage.
    const decisions: Decision[] = s.overtimeDecisions
      .filter((d) => d.sellContractId === s.sellContractId)
      .map((d) => ({
        weekOf: d.weekOf.toISOString().slice(0, 10),
        treatment: d.treatment as Decision['treatment'],
        appliedBps: d.appliedBps,
        overtimeHours: Number(d.overtimeHours),
        accrualBps: d.accrualBps,
      }))

    // ── Whose line is the pay side judged on ────────────────────────
    //
    // The employer's own, where the buy contract names one. A client
    // billed after forty and a worker paid a premium after forty-five
    // are two thresholds and two different facts, and using the client's
    // for both was only ever right because they usually match.
    //
    // Where the buy contract says nothing, the sell contract's line
    // stands in — it is the only weekly line anybody has written down
    // for this placement, and it is what the approval desk decided
    // against.
    //
    // And where neither says, a nonexempt US worker is still owed a
    // premium after forty, because the law draws the line the contracts
    // did not (lib/money/pay-line). The client's bill is not touched: the
    // sell line's own terms are read here for pay only.
    const payLine = payLineFor({
      buyAfterHours: buy?.overtimeAfterHours ?? null,
      sellAfterHours: s.sellContract.overtimeAfterHours,
      personName: s.person.name,
      employerName: s.sellContract.company?.name ?? null,
      contractType: buy?.contractType ?? 'UNKNOWN',
      weAreTheEmployer: buy?.companyId === companyId,
      exemptStatus: row?.status ?? null,
      where: {
        wageRule: row ? row.wageRule : null,
        payCurrency: candidate?.payCurrency ?? buy?.payCurrency ?? null,
        entityCountry: buy?.entity?.country ?? null,
        siteCountry: s.sellContract.workLocation?.country ?? null,
      },
    })
    const drawnBy = payLine.source === 'BUY' ? policyOf(buy!) : policyOf(s.sellContract)
    const payPolicy = { ...drawnBy, afterHours: payLine.afterHours }

    const split = splitWeeks((s.days as Record<string, number>) ?? {}, payPolicy, {
      leaveDays: (s.leaveDays as Record<string, number>) ?? {},
      decisions,
    })

    // ── The hours accepted, not the hours filed ─────────────────────
    //
    // Cut here, on the days, by the same allocation the run and the
    // screen use: ordinary hours first, latest day first, the hours over
    // the line kept. A week that as accepted no longer goes over the line
    // has its premium held, and the whole sheet is left off in a sentence.
    const acceptance = acceptanceForPay(s.assertions, s, companyId)
    const cut =
      acceptance === 'MANY'
        ? null
        : payCut(
            payBands((s.days as Record<string, number>) ?? {}, (s.leaveDays as Record<string, number>) ?? {}, payLine.afterHours),
            acceptance,
            payLine.afterHours
          )
    const paidMaps = cut ? paidDayMaps(cut) : { days: {}, leaveDays: {} }
    const cutWeeks = new Map((cut?.weeks ?? []).map((w) => [w.weekOf, w]))
    const daysKnown = Object.keys((s.days as Record<string, number>) ?? {}).length > 0

    // ── Each week at the rate in force over it ─────────────────────
    const periods = buy ? ratePeriods(rateRows.filter((r) => r.contractId === buy.id)) : []
    const recorded = candidate?.payRate ?? null
    const allDays = (s.days as Record<string, number>) ?? {}
    const weekRate = (weekOf: string, regularAndLeave: number) => {
      if (recorded == null || recorded <= 0) return { payRateCents: null, rates: null }
      // The week's ordinary hours are its earliest ones: the overtime line
      // is crossed at the end of a week, not the start.
      const mine = Object.entries(daysKnown ? paidMaps.days : allDays)
        .filter(([day, h]) => weekStart(day.slice(0, 10)) === weekOf && Number(h) > 0)
        .sort((a, b) => a[0].localeCompare(b[0]))
      let budget = regularAndLeave
      const regular: Record<string, number> = {}
      for (const [day, h] of mine) {
        if (budget <= 0) break
        const take = Math.min(Number(h), budget)
        regular[day] = take
        budget = Math.round((budget - take) * 100) / 100
      }
      const priced = priceByDay({ contractRateCents: recorded, periods, days: regular })
      const first = rateInForce(recorded, periods, new Date(`${weekOf}T00:00:00Z`)).rateCents
      return priced.straddles
        ? {
            payRateCents: priced.days.length ? priced.days[0].rateCents : first,
            rates: priced.segments.map((g) => ({ rateCents: g.rateCents, hours: g.hours })),
          }
        : { payRateCents: priced.days.length ? priced.firstRateCents : first, rates: null }
    }

    // Every hour worked in each week, each day at its own rate, so a
    // week paid at two rates that went over the line has its overtime
    // priced on the regular rate rather than on its first day's rate.
    const workedWeeks =
      recorded != null && recorded > 0
        ? workedByWeek({
            days: daysKnown ? paidMaps.days : allDays,
            leaveDays: daysKnown ? paidMaps.leaveDays : (s.leaveDays as Record<string, number>) ?? {},
            contractRateCents: recorded,
            periods,
          })
        : new Map()

    return {
      personId: s.personId,
      personName: s.person.name,
      // No payroll id model yet — reported as missing rather than
      // guessed, because ADP matches on their file number and a row
      // without one is a row their import drops silently.
      payrollId: null,
      // From the buy contract, never assumed. Assuming W2 is how a
      // corp-to-corp company lands on a wage file as a person.
      contractType: buy?.contractType ?? 'UNKNOWN',
      // We employ them where the buy contract is ours. A sub-vendor's
      // own employee is paid by the sub-vendor.
      weAreTheEmployer: buy?.companyId === companyId,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      weeks: split.weeks.map((w) => {
        // As accepted, where the days say; as filed where a sheet carries
        // no daily hours and the acceptance is cut from the weeks below.
        const c = daysKnown ? cutWeeks.get(w.weekOf) : null
        const regularHours = c ? c.regular : w.regularHours
        const leaveHours = c ? c.leave : w.leaveHours
        return {
          weekOf: w.weekOf,
          regularHours,
          leaveHours,
          overHours: c ? c.over : w.overHours,
          client: { treatment: w.treatment, appliedBps: w.appliedBps },
          ...weekRate(w.weekOf, regularHours + leaveHours),
          worked: workedWeeks.get(w.weekOf) ?? null,
          held: c?.underTheLine
            ? heldSays(c, { personName: s.person.name, employerName: s.sellContract.company?.name ?? null }, payLine.afterHours)
            : null,
        }
      }),
      // Already the hours accepted where the days were cut above.
      weeksAreAccepted: daysKnown && acceptance !== 'MANY',
      cannotPay:
        acceptance === 'MANY'
          ? `${s.sellContract.company?.name ?? 'The employer'} has more than one acceptance standing on ${s.person.name}'s ` +
            `week, and nothing says which of them governs, so it is not paid on a guess.`
          : null,
      submittedHours: Number(s.totalHours),
      acceptedHours: acceptance && acceptance !== 'MANY' ? acceptance.hours : s.acceptedHours ? Number(s.acceptedHours) : null,
      employerAcceptedAt: s.employerAcceptedAt,
      // The rate in force when the sheet began — what a week with no
      // rate of its own falls back to. The line's recorded rate is its
      // opening rate and is never overwritten by a change.
      payRateCents: recorded == null ? null : rateInForce(recorded, periods, s.periodStart).rateCents,
      // Only where the employer actually named a threshold. A default
      // multiplier with no line to apply it to is not a term anybody
      // agreed, and would quietly multiply a rate nobody set.
      contractPremiumBps: buy?.overtimeAfterHours != null ? buy.overtimeMultiplierBps : null,
      // Where the line is the law's, or why the law's forty does not reach
      // this worker. Travels with the file as a note.
      lineSays: payLineSays(
        payLine,
        { personName: s.person.name, employerName: s.sellContract.company?.name ?? null },
        weeklyWorked(allDays, (s.leaveDays as Record<string, number>) ?? {})
      ),
      // The US regular rate, for every line today — see methodFor.
      overtimeMethod: methodFor(buy).method,
      payModel: buy?.payModel ?? 'FIXED_HOURLY',
      // Nothing in the schema records a salary basis, so the honest,
      // conservative read: paid by the hour unless somebody says.
      paidOnSalaryBasis: false,
      rule: (row?.wageRule as WageRuleName) ?? 'US_FLSA',
      assertion,
      currency: buy?.payCurrency ?? s.sellContract.billCurrency,
      // Either cost object. A project pot and a standing department are
      // both real and the client's ledger cares which.
      costCode:
        s.sellContract.internalOrder?.code ?? s.sellContract.costCenter?.code ?? null,
      orderNumber: s.sellContract.workOrder?.number ?? null,
      employerName: s.sellContract.company?.name ?? null,
      clientName: s.sellContract.clientCompany?.name ?? null,
    }
  })

  const built = buildExport(provider, rows)

  if (url.searchParams.get('format') === 'csv') {
    return new NextResponse(toCsv(built), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="payroll-${provider.toLowerCase()}-${to.toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({
    data: {
      ...built,
      from: from.toISOString(),
      to: to.toISOString(),
      // Said before the file is built rather than after it is rejected.
      missingPayrollIds: missingIds(built),
      note:
        'Etyme does not run payroll. This is what is owed, for your provider to process.',
    },
  })
}
