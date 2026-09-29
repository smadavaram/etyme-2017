import { NextRequest, NextResponse } from 'next/server'
import { totals, rate } from '@/lib/money-display'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { daysFor } from '@/lib/contract-links'
import { periodFor, hoursInPeriod, type Period, type Terms } from '@/lib/periods'
import { priceByDay, ratePeriods } from '@/lib/contract-rate'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { paidBook, paidKey, type PaidLine } from '@/lib/payroll-paid'
import { sheetOvertime, premiumByDay, overtimeSaysFor, wageLineFor, EXEMPT_SELECT } from '@/lib/money/sheet-overtime'
import { methodFor } from '@/lib/money/overtime-method'
import { payLineOn, payLineSays, weeklyWorked } from '@/lib/money/pay-line'
import { acceptanceForPay, paySheet, payCutSays } from '@/lib/money/pay-hours'

/**
 * POST /api/payroll/run
 *
 * Process a payroll batch — mark cycles as completed and log the run.
 *
 * LEGACY_RULES.md §2.5 pipeline:
 *   pending → open → calculated → approved → processed → cleared
 *
 * This endpoint handles the "processed" step: takes a list of buy
 * contract IDs and marks their SALARY_CALCULATE and SALARY_PAY
 * cycles as completed for the current period.
 *
 * PR-01 user story: "As an Accountant, I want to run payroll for a
 * period — see all salaries due, approve the run, generate the
 * export file so that I process payments in one batch instead of
 * per-contract."
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'payroll.run')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'payroll.run permission required' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { buyContractIds, period, action } = body

  if (!buyContractIds || !Array.isArray(buyContractIds) || buyContractIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'buyContractIds array is required', field: 'buyContractIds' } },
      { status: 422 }
    )
  }

  if (!action || !['calculate', 'approve', 'process'].includes(action)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'action must be "calculate", "approve", or "process"', field: 'action' } },
      { status: 422 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_CONTEXT', message: 'No company context' } },
      { status: 403 }
    )
  }

  // What the run is for. A 'YYYY-MM' month, an explicit { start, end }, or
  // nothing — in which case each person's period is the one holding their
  // most recent work, the same period the payroll screen shows.
  const asked = readPeriod(period)
  if (asked === 'INVALID') {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say which pay period this run is for, as a month like 2026-07 or as a start and an end date.',
          field: 'period',
        },
      },
      { status: 422 }
    )
  }

  // Verify all buy contracts belong to this company
  const contracts = await prisma.buyContract.findMany({
    where: {
      id: { in: buyContractIds },
      companyId,
    },
    include: {
      candidates: {
        include: { person: { select: { id: true, name: true } } },
      },
      workOrder: { select: ORDER_HEADER_SELECT },
      // What the employer asserted about exemption, which decides whether
      // an hour over the line is owed a premium at all.
      exemptAssertions: { select: EXEMPT_SELECT },
      company: { select: { name: true } },
      // Where the work is and who pays it, which decides whether the US
      // forty-hour line reaches a worker no contract drew one for.
      entity: { select: { country: true } },
      sellLinks: {
        include: {
          sellContract: {
            include: {
              workLocation: { select: { country: true } },
              timesheets: {
                // What the employer accepted for pay, which is what a
                // payroll run pays — the same weeks the payroll screen
                // lists. `days`, because a week is divided by day: by the
                // link window, by the pay period and by the rate in force.
                where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
                select: {
                  id: true, personId: true, totalHours: true, days: true, leaveDays: true, periodStart: true, periodEnd: true,
                  // What the employer accepted for pay — the hours paid,
                  // never the hours filed (lib/money/pay-hours).
                  acceptedHours: true,
                  assertions: {
                    where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
                    select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true },
                  },
                },
              },
            },
          },
        },
      },
      supplierSellContract: {
        select: {
          id: true,
          overtimeAfterHours: true,
          workLocation: { select: { country: true } },
          timesheets: {
            where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
            select: {
                  id: true, personId: true, totalHours: true, days: true, leaveDays: true, periodStart: true, periodEnd: true,
                  // What the employer accepted for pay — the hours paid,
                  // never the hours filed (lib/money/pay-hours).
                  acceptedHours: true,
                  assertions: {
                    where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
                    select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true },
                  },
                },
          },
        },
      },
    },
  })

  if (contracts.length !== buyContractIds.length) {
    const found = new Set(contracts.map((c) => c.id))
    const missing = buyContractIds.filter((id: string) => !found.has(id))
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Buy contracts not found: ${missing.join(', ')}` } },
      { status: 404 }
    )
  }

  const now = new Date()

  // Every approved pay change on these lines, read once.
  const rateRows = await prisma.rateHistory.findMany({
    where: { contractType: 'BUY', contractId: { in: contracts.map((c) => c.id) } },
    select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  // And what earlier runs already paid, so no hour is paid twice.
  const book = await paidBook(companyId, contracts.map((c) => c.id))

  try {
    const result = await prisma.$transaction(async (tx) => {
      const processed: Array<{
        buyContractId: string
        buyContractCandidateId: string
        personName: string
        payPeriod: { start: string; end: string; label: string } | null
        totalHours: number
        grossPay: number
        /** Hours in the period an earlier run already paid, left out of this one. */
        alreadyPaidHours: number
        /**
         * The buy contract's own. A batch may span two, and a gross
         * total that adds them is a number nobody can stand behind.
         */
        currency: string
        cyclesCompleted: number
        /** Where the rate changed inside the period, the sentence that says so. */
        rates: string | null
        /** Hours over the weekly line whose premium this run pays. */
        overtimeHours: number
        /** The premium on them, rounded once for the row. Inside `grossPay`. */
        premiumCents: number
        /** What went over the line and how it was priced, or could not be. */
        overtime: string | null
        /** Which weekly line pay was judged on, where that needs saying. */
        payLine: string | null
        /** Where fewer hours were accepted than filed, which hours were paid, in a sentence. */
        accepted: string | null
        /** Why nothing was paid for this person, where nothing was. */
        refused: string | null
        paid: PaidLine[]
      }> = []

      for (const bc of contracts) {
        // Cycles sit on the agreement, so completing them is done once per
        // contract rather than once per person.
        const cycleKind =
          action === 'calculate'
            ? 'SALARY_CALCULATE'
            : 'SALARY_PAY'

        const periods = ratePeriods(rateRows.filter((r) => r.contractId === bc.id))
        const links = bc.sellLinks.map((l) => ({
          buyContractId: bc.id,
          sellContractId: l.sellContractId,
          effectiveFrom: l.effectiveFrom,
          effectiveTo: l.effectiveTo,
        }))
        // The weekly line: the employer's own where the buy line names
        // one, else the sell line's, else — for a nonexempt worker in
        // the US — the law's forty (lib/money/pay-line). The same order
        // the payroll file, the screen and back pay read them in.
        const sheets = [
          ...bc.sellLinks.flatMap((l) =>
            l.sellContract.timesheets.map((ts) => ({ ts, narrow: true, sell: l.sellContract }))
          ),
          ...(bc.supplierSellContract?.timesheets ?? []).map((ts) => ({
            ts, narrow: false, sell: bc.supplierSellContract!,
          })),
        ]
        const method = methodFor(bc).method

        // A run before 2026-09-29 recorded a total and not which hours,
        // and it paid every approved hour on the contract. What it
        // covered cannot be read back, so this contract is refused
        // rather than paid a second time.
        const unrecorded = book.unrecorded.get(bc.id) ?? null
        const windows: Period[] = []

        for (const cand of bc.candidates) {
          const row = bc.exemptAssertions.find((a) => a.personId === cand.personId) ?? null
          const mine = sheets
            .filter((x) => x.ts.personId === cand.personId)
            .map(({ ts, narrow, sell }) => {
              const all = (ts.days as Record<string, number>) ?? {}
              const filed = narrow && Object.keys(all).length > 0 ? daysFor(bc.id, links, all) : all
              const line = payLineOn(bc, sell, { name: cand.person.name, payCurrency: cand.payCurrency }, row)
              const leaveDays = (ts.leaveDays as Record<string, number>) ?? {}
              // The hours the employer accepted, cut off the days the way
              // pay is always cut: ordinary hours first, latest day first.
              const acceptance = acceptanceForPay(ts.assertions, ts, bc.companyId)
              const pay = acceptance === 'MANY'
                ? null
                : paySheet({ all, mine: filed, leaveDays, afterHours: line.afterHours, accepted: acceptance })
              return {
                id: ts.id,
                line,
                leaveDays,
                periodStart: ts.periodStart,
                periodEnd: ts.periodEnd,
                /** As filed, narrowed to this line — what overtime is judged on. */
                filed,
                /** As accepted — what is paid. Empty where nothing may be paid on a guess. */
                days: pay?.days ?? {},
                accepted: pay?.accepted ?? null,
                cut: pay?.cut ?? null,
                many: acceptance === 'MANY',
                totalHours: Object.keys(filed).length > 0
                  ? (pay ? pay.cut.paid : 0)
                  : acceptance && acceptance !== 'MANY' ? acceptance.hours : acceptance === 'MANY' ? 0 : Number(ts.totalHours),
              }
            })

          const terms: Terms = { ...periodTermsFor('BUY', bc), startedOn: cand.startDate }
          const anchor = asked
            ? null
            : mine.reduce<Date | null>((latest, t) => (!latest || t.periodEnd > latest ? t.periodEnd : latest), null)
          const payPeriod: Period | null =
            asked && 'month' in asked
              ? periodFor(new Date(`${asked.month}-01T00:00:00Z`), terms)
              : asked && 'start' in asked
                ? asked
                : anchor
                  ? periodFor(anchor, terms)
                  : null

          if (unrecorded) {
            processed.push({
              buyContractId: bc.id,
              buyContractCandidateId: cand.id,
              personName: cand.person.name,
              payPeriod: payPeriod ? shown(payPeriod) : null,
              totalHours: 0,
              grossPay: 0,
              alreadyPaidHours: 0,
              currency: bc.payCurrency,
              cyclesCompleted: 0,
              rates: null,
              overtimeHours: 0,
              premiumCents: 0,
              overtime: null,
              payLine: null,
              accepted: null,
              refused:
                `A payroll run on ${unrecorded} paid ${cand.person.name} without recording which hours it ` +
                `covered, so Etyme cannot tell what is still owed. Settle this contract by hand before ` +
                `running it here again.`,
              paid: [],
            })
            continue
          }
          if (payPeriod) windows.push(payPeriod)

          // Each day in the period, at the rate in force that day, less
          // anything an earlier run already paid.
          const lines: PaidLine[] = []
          let alreadyPaid = 0
          let premiumExact = 0
          const said: string[] = []
          const lineSaid: string[] = []
          const acceptedSaid: string[] = []
          const wageLine = wageLineFor(bc, cand.person.name, row)
          if (payPeriod) {
            for (const t of mine) {
              // More than one acceptance standing on the week: nothing
              // says which governs, so it is not paid on a guess.
              if (t.many) {
                const filedShare = hoursInPeriod(
                  { id: t.id, periodStart: t.periodStart, periodEnd: t.periodEnd, days: t.filed, totalHours: 0 },
                  payPeriod,
                  terms.straddle
                )
                if (filedShare && filedShare.hours > 0) {
                  acceptedSaid.push(
                    `${bc.company?.name ?? 'The employer'} has more than one acceptance standing on ${cand.person.name}'s ` +
                      `week of ${t.periodStart.toISOString().slice(0, 10)}, and nothing says which of them governs, so that ` +
                      `week is not paid here rather than paid on a guess. It is paid once all but one are withdrawn.`
                  )
                }
                continue
              }
              const share = hoursInPeriod(
                { id: t.id, periodStart: t.periodStart, periodEnd: t.periodEnd, days: t.days, totalHours: t.totalHours },
                payPeriod,
                terms.straddle
              )
              if (!share || share.hours <= 0) continue
              if (t.cut) {
                const cutNote = payCutSays(t.cut, { personName: cand.person.name, employerName: bc.company?.name ?? null })
                if (cutNote && !acceptedSaid.includes(cutNote)) acceptedSaid.push(cutNote)
              }
              const priced = priceByDay({
                contractRateCents: cand.payRate,
                periods,
                days: t.days,
                hours: Object.keys(t.days).length > 0 ? null : share.hours,
                within: share.partial ? payPeriod : null,
                periodStart: t.periodStart,
                periodEnd: t.periodEnd,
              })
              for (const d of priced.days) {
                const before = book.paid.get(paidKey(bc.id, cand.personId, t.id, d.day)) ?? 0
                const left = Math.round((d.hours - before) * 100) / 100
                alreadyPaid += Math.min(before, d.hours)
                if (left > 0) {
                  lines.push({ personId: cand.personId, timesheetId: t.id, day: d.day, hours: left, rateCents: d.rateCents })
                }
              }

              // ── The premium on the hours over the line ──────────────
              //
              // Priced on the whole week — the regular rate is a fact
              // about the week, whichever period its days fall in — and
              // paid on the days in this period that carry it, less any
              // premium an earlier run already paid on them.
              const weeks = sheetOvertime({
                days: t.filed,
                leaveDays: t.leaveDays,
                accepted: t.accepted,
                afterHours: t.line.afterHours,
                contractRateCents: cand.payRate,
                periods,
                method,
                line: wageLine,
              })
              const inPeriod = new Set(priced.days.map((d) => d.day))
              // Where the line came from, where it is the law's or where
              // the law's forty does not reach — said once per person.
              const lineNote = payLineSays(
                t.line,
                { personName: cand.person.name, employerName: bc.company?.name ?? null },
                weeklyWorked(Object.fromEntries(Object.entries(t.filed).filter(([d]) => inPeriod.has(d.slice(0, 10)))), t.leaveDays)
              )
              if (lineNote && !lineSaid.includes(lineNote)) lineSaid.push(lineNote)
              const note = overtimeSaysFor(weeks, inPeriod)
              if (note) said.push(note)
              for (const [day, p] of premiumByDay(weeks, inPeriod)) {
                const key = paidKey(bc.id, cand.personId, t.id, day)
                const unpaid = Math.round((p.hours - (book.premiumHours.get(key) ?? 0)) * 100) / 100
                if (unpaid <= 0 || p.hours <= 0) continue
                const cents = (p.premiumCents * unpaid) / p.hours
                premiumExact += cents
                const line = lines.find((l) => l.timesheetId === t.id && l.day === day)
                if (line) {
                  line.overtimeHours = unpaid
                  line.premiumCents = cents
                } else {
                  lines.push({
                    personId: cand.personId, timesheetId: t.id, day, hours: 0, rateCents: p.rateCents,
                    overtimeHours: unpaid, premiumCents: cents,
                  })
                }
              }
            }
          }

          const byRate = new Map<number, number>()
          for (const l of lines) byRate.set(l.rateCents, (byRate.get(l.rateCents) ?? 0) + l.hours)
          // Straight time rounded once per rate, as before; the premium
          // rounded once for the row.
          const premiumCents = Math.round(premiumExact)
          const grossPay =
            [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(Math.round(h * 100) / 100 * r), 0) + premiumCents
          const totalHours = Math.round(lines.reduce((n, l) => n + l.hours, 0) * 100) / 100

          processed.push({
            buyContractId: bc.id,
            buyContractCandidateId: cand.id,
            personName: cand.person.name,
            payPeriod: payPeriod ? shown(payPeriod) : null,
            totalHours,
            grossPay,
            alreadyPaidHours: Math.round(alreadyPaid * 100) / 100,
            currency: bc.payCurrency,
            cyclesCompleted: 0,
            rates:
              byRate.size > 1
                ? `Paid by day across a rate change: ${[...byRate.entries()]
                    .map(([r, h]) => `${Math.round(h * 100) / 100} hours at ${rate(r, bc.payCurrency)}`)
                    .join(' and ')}.`
                : null,
            overtimeHours: Math.round(lines.reduce((n, l) => n + (l.overtimeHours ?? 0), 0) * 100) / 100,
            premiumCents,
            overtime: said.length ? said.join(' ') : null,
            payLine: lineSaid.length ? lineSaid.join(' ') : null,
            accepted: acceptedSaid.length ? acceptedSaid.join(' ') : null,
            refused: payPeriod ? null : `No accepted hours for ${cand.person.name}, so there is no period to pay.`,
            paid: lines,
          })
        }

        // Only the cycles that fall due for the period being run. This
        // used to complete every open cycle on the contract, so one press
        // on a placement five months old closed twenty-six pay dates.
        // A pay date may be shifted a few days past the period's end onto
        // a business day; nothing belonging to the next period falls due
        // that soon.
        let completed = 0
        if (windows.length > 0) {
          const from = new Date(Math.min(...windows.map((w) => w.start.getTime())))
          const to = new Date(Math.max(...windows.map((w) => w.end.getTime())) + SHIFT_DAYS * 86_400_000)
          const updated = await tx.cycle.updateMany({
            where: {
              buyContractId: bc.id,
              kind: cycleKind,
              completedAt: null,
              dueOn: { gte: from, lte: to },
            },
            data: {
              completedAt: now,
            },
          })
          completed = updated.count
        }
        for (const p of processed) if (p.buyContractId === bc.id) p.cyclesCompleted = completed
      }

      // Log the payroll run — and, on a run that pays, every day it paid,
      // which is what the next run reads so that no hour is paid twice
      // (lib/payroll-paid).
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'PAYROLL_RUN',
          summary: `Payroll ${action}: ${processed.length} contracts, ${totals(
            processed.map((p) => ({ minor: p.grossPay, currency: p.currency }))
          )} gross total`,
          reason: `Payroll ${action} initiated by ${caller.person.name}`,
          payload: {
            action,
            period: period ?? null,
            contracts: processed.map((p) => ({
              buyContractId: p.buyContractId,
              person: p.personName,
              payPeriod: p.payPeriod,
              hours: p.totalHours,
              grossPay: p.grossPay,
              currency: p.currency,
              refused: p.refused,
              // `premiumsPriced` says this run priced overtime, so a day
              // with no premium on it had none owed — not "unknown".
              ...(action === 'process' && !p.refused ? { paid: p.paid, premiumsPriced: true } : {}),
            })),
            runBy: caller.person.id,
            runAt: now.toISOString(),
          } as any,
          reversible: action !== 'process',
        },
      })

      return processed
    })

    const totalGross = result.reduce((s, p) => s + p.grossPay, 0)
    // Said, not added. `totalGrossPay` below is kept for the callers that
    // already read it and is only a sum worth trusting while the batch is
    // one currency, which the sentence is honest about when it is not.
    const grossSays = totals(result.map((p) => ({ minor: p.grossPay, currency: p.currency })))
    const refused = result.filter((p) => p.refused)

    return NextResponse.json({
      data: {
        action,
        contractsProcessed: result.length,
        totalGrossPay: totalGross,
        totalHours: result.reduce((s, p) => s + p.totalHours, 0),
        details: result.map(({ paid, ...rest }) => rest),
        message:
          `Payroll ${action} complete: ${result.length} contracts, ${grossSays} gross` +
          (refused.length > 0 ? `. ${refused.length} left out, each with a reason on the row.` : ''),
      },
    })
  } catch (err: any) {
    reportError('Payroll run failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Payroll run failed' } },
      { status: 500 }
    )
  }
}

/** How far past a period's end its pay date may be shifted onto a business day. */
const SHIFT_DAYS = 4

type Asked = { month: string } | Period | null | 'INVALID'

function readPeriod(p: unknown): Asked {
  if (p == null || p === '') return null
  if (typeof p === 'string') return /^\d{4}-\d{2}$/.test(p) ? { month: p } : 'INVALID'
  if (typeof p === 'object') {
    const o = p as { start?: string; end?: string }
    const start = o.start ? new Date(`${String(o.start).slice(0, 10)}T00:00:00Z`) : null
    const end = o.end ? new Date(`${String(o.end).slice(0, 10)}T00:00:00Z`) : null
    if (!start || !end || isNaN(+start) || isNaN(+end) || end < start) return 'INVALID'
    return { start, end, label: `${o.start!.slice(0, 10)} to ${o.end!.slice(0, 10)}` }
  }
  return 'INVALID'
}

function shown(p: Period) {
  return { start: p.start.toISOString().slice(0, 10), end: p.end.toISOString().slice(0, 10), label: p.label }
}
