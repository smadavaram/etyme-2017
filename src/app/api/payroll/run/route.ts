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
      sellLinks: {
        include: {
          sellContract: {
            include: {
              timesheets: {
                // What the employer accepted for pay, which is what a
                // payroll run pays — the same weeks the payroll screen
                // lists. `days`, because a week is divided by day: by the
                // link window, by the pay period and by the rate in force.
                where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
                select: { id: true, personId: true, totalHours: true, days: true, periodStart: true, periodEnd: true },
              },
            },
          },
        },
      },
      supplierSellContract: {
        select: {
          id: true,
          timesheets: {
            where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
            select: { id: true, personId: true, totalHours: true, days: true, periodStart: true, periodEnd: true },
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
        const sheets = [
          ...bc.sellLinks.flatMap((l) => l.sellContract.timesheets.map((ts) => ({ ts, narrow: true }))),
          ...(bc.supplierSellContract?.timesheets ?? []).map((ts) => ({ ts, narrow: false })),
        ]

        // A run before 2026-09-29 recorded a total and not which hours,
        // and it paid every approved hour on the contract. What it
        // covered cannot be read back, so this contract is refused
        // rather than paid a second time.
        const unrecorded = book.unrecorded.get(bc.id) ?? null
        const windows: Period[] = []

        for (const cand of bc.candidates) {
          const mine = sheets
            .filter((x) => x.ts.personId === cand.personId)
            .map(({ ts, narrow }) => {
              const all = (ts.days as Record<string, number>) ?? {}
              const days = narrow && Object.keys(all).length > 0 ? daysFor(bc.id, links, all) : all
              return {
                id: ts.id,
                periodStart: ts.periodStart,
                periodEnd: ts.periodEnd,
                days,
                totalHours: Object.keys(days).length > 0
                  ? Object.values(days).reduce((a, b) => a + Number(b || 0), 0)
                  : Number(ts.totalHours),
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
          if (payPeriod) {
            for (const t of mine) {
              const share = hoursInPeriod(
                { id: t.id, periodStart: t.periodStart, periodEnd: t.periodEnd, days: t.days, totalHours: t.totalHours },
                payPeriod,
                terms.straddle
              )
              if (!share || share.hours <= 0) continue
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
            }
          }

          const byRate = new Map<number, number>()
          for (const l of lines) byRate.set(l.rateCents, (byRate.get(l.rateCents) ?? 0) + l.hours)
          const grossPay = [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(Math.round(h * 100) / 100 * r), 0)
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
              ...(action === 'process' && !p.refused ? { paid: p.paid } : {}),
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
