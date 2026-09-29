/**
 * Back pay for a pay change dated before days already paid.
 *
 * ── The founder's rule, 2026-09-29 ────────────────────────────────────
 *
 * "A raise dated in the past has its back pay worked out and put forward
 * as a one-off payment for a desk to approve, never paid silently."
 *
 * So this works it out and proposes it, and nothing else. The payment is
 * an off-cycle payment (`POST /api/payroll/off-cycle`, reason
 * RATE_AMENDMENT_LATE — "a rate change that landed after the cut-off"),
 * made by a desk that holds `payroll.run`, one per pay period because an
 * off-cycle payment posts to the period the money belongs to.
 *
 * ── What it is, per paid day ──────────────────────────────────────────
 *
 *   hours paid × (rate in force now − what was paid for them)
 *   + premium hours paid × (premium per hour now − premium paid)
 *
 * "What was paid" is read from the payroll runs' own record of each day
 * (lib/payroll-paid) plus any back pay already approved, so a second
 * change is measured from the first one's back pay and nothing is
 * proposed twice. The premium per hour now is the week's, under the
 * line's overtime method (lib/money/overtime-method) — a rise on a
 * Wednesday moves the regular rate of the whole week, so the premium on
 * a Friday already paid moves with it.
 *
 * Straight time is counted only on days inside the change; the premium
 * on any paid overtime day in a week the change reaches.
 *
 * ── What it refuses to put a number on ────────────────────────────────
 *
 *   a line with a payroll run behind it that recorded no days — nobody
 *     can say what was paid, so nobody can say what is owed;
 *   overtime on days paid by a run from before the run priced overtime —
 *     those days had no premium at all, which is unpaid overtime rather
 *     than back pay for a rate change, and it is said, not folded in;
 *   a line the firm pays by invoice — a supplier or the worker's own
 *     company bills the difference on its invoice; payroll back pay is
 *     for somebody on this firm's payroll;
 *   a change that lowers pay — money paid above the new rate is not
 *     recovered by an off-cycle payment, and nothing is proposed.
 *
 * Exact until a period's payment is written, then rounded once per
 * payment.
 */

import { prisma } from '@/lib/db'
import { amount, rate } from '@/lib/money-display'
import { daysFor } from '@/lib/contract-links'
import { periodFor, type Terms } from '@/lib/periods'
import { rateInForce, ratePeriods } from '@/lib/contract-rate'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { paidBook, paidKey, type PaidEntry, type BackPaidLine } from '@/lib/payroll-paid'
import { weekStart } from '@/lib/overtime'
import { sheetOvertime, premiumByDay, wageLineFor, EXEMPT_SELECT } from '@/lib/money/sheet-overtime'
import { methodFor } from '@/lib/money/overtime-method'

const round2 = (n: number) => Math.round(n * 100) / 100
const dayDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`)

/** "June 15, 2026". American, and never the day of the week guessed in local time. */
export function longDay(iso: string): string {
  return dayDate(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// ── The arithmetic ────────────────────────────────────────────────────

export interface PaidDay {
  personId: string
  sellContractId: string
  timesheetId: string
  day: string
  weekOf: string
  period: { start: string; label: string }
  paid: PaidEntry
  rateNowCents: number
  /** The week's premium per overtime hour now, on this day. 0 where none. */
  premiumPerHourNowCents: number
  /** Overtime hours on this day now, whether or not their premium was paid. */
  overHoursNow: number
  /** The day is on or after the change and inside it. */
  inChange: boolean
  /** The day's week has a day inside the change. */
  weekInChange: boolean
}

export interface BackPayLine extends BackPaidLine {
  weekOf: string
  sellContractId: string
}

export interface BackPayPeriod {
  /** The period the money belongs to — what the off-cycle payment posts to. */
  periodStart: string
  label: string
  sellContractId: string
  personId: string
  weeks: string[]
  /** Rounded once, here. */
  amountCents: number
  lines: BackPayLine[]
}

export interface BackPayFigure {
  periods: BackPayPeriod[]
  /** The sum of the periods' rounded amounts. */
  totalCents: number
  weeks: string[]
  /** Periods where the change lowered pay below what was paid. Not proposed. */
  overpaid: Array<{ label: string; cents: number }>
  /** Overtime hours on days paid before the run priced overtime. */
  unpricedOvertimeHours: number
}

/**
 * The difference on every paid day the change reaches, per pay period.
 *
 * Pure: the caller reads the paid days and the rates; this subtracts.
 */
export function backPayOf(days: PaidDay[]): BackPayFigure {
  const byPeriod = new Map<string, { start: string; label: string; sellContractId: string; personId: string; exact: number; lines: BackPayLine[] }>()
  let unpricedOvertimeHours = 0

  for (const d of days) {
    const straight = d.inChange ? d.paid.hours * d.rateNowCents - d.paid.straightCents : 0
    let premium = 0
    if (d.weekInChange && d.overHoursNow > 0) {
      if (d.paid.premiumRecorded) {
        premium = d.premiumPerHourNowCents * d.paid.premiumHours - d.paid.premiumCents
      } else {
        unpricedOvertimeHours += Math.min(d.overHoursNow, d.paid.hours)
      }
    }
    // A thousandth of a cent is floating point, not money.
    if (Math.abs(straight) < 0.001 && Math.abs(premium) < 0.001) continue
    const key = `${d.personId}|${d.sellContractId}|${d.period.start}`
    const p = byPeriod.get(key) ?? {
      start: d.period.start, label: d.period.label, sellContractId: d.sellContractId, personId: d.personId, exact: 0, lines: [],
    }
    p.exact += straight + premium
    p.lines.push({
      buyContractId: '',
      personId: d.personId,
      sellContractId: d.sellContractId,
      timesheetId: d.timesheetId,
      day: d.day,
      weekOf: d.weekOf,
      straightCents: straight,
      premiumCents: premium,
    })
    byPeriod.set(key, p)
  }

  const periods: BackPayPeriod[] = []
  const overpaid: Array<{ label: string; cents: number }> = []
  for (const p of [...byPeriod.values()].sort((a, b) => a.start.localeCompare(b.start))) {
    const cents = Math.round(p.exact)
    if (cents <= 0) {
      if (cents < 0) overpaid.push({ label: p.label, cents: -cents })
      continue
    }
    periods.push({
      periodStart: p.start,
      label: p.label,
      sellContractId: p.sellContractId,
      personId: p.personId,
      weeks: [...new Set(p.lines.map((l) => l.weekOf))].sort(),
      amountCents: cents,
      lines: p.lines.sort((a, b) => a.day.localeCompare(b.day)),
    })
  }

  return {
    periods,
    totalCents: periods.reduce((n, p) => n + p.amountCents, 0),
    weeks: [...new Set(periods.flatMap((p) => p.weeks))].sort(),
    overpaid,
    unpricedOvertimeHours: round2(unpricedOvertimeHours),
  }
}

/** The weeks, the way a person says them: "the weeks of June 15 and June 22, 2026". */
export function weeksSay(weeks: string[]): string {
  if (weeks.length === 0) return 'no weeks'
  const named = weeks.map(longDay)
  if (named.length === 1) return `the week of ${named[0]}`
  return `the weeks of ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
}

/** The proposal, in the sentence the approval and the Rate History screen both say. */
export function backPaySays(f: BackPayFigure, input: { personName: string; toCents: number; currency: string }): string {
  const parts: string[] = []
  if (f.totalCents > 0) {
    parts.push(
      `Back pay of ${amount(f.totalCents, input.currency)} is proposed for ${input.personName}, for ` +
        `${weeksSay(f.weeks)}, which ${f.weeks.length === 1 ? 'was' : 'were'} paid before the change to ` +
        `${rate(input.toCents, input.currency)} was approved. A payroll desk approves it as ` +
        `${f.periods.length === 1 ? 'an off-cycle payment' : `${f.periods.length} off-cycle payments, one per pay period`}; ` +
        `nothing is paid until then.`
    )
  } else {
    parts.push(`No back pay is owed to ${input.personName}: no day this change reaches was paid at the old rate.`)
  }
  for (const o of f.overpaid) {
    parts.push(
      `${o.label} was paid ${amount(o.cents, input.currency)} more than the new rate. Etyme does not recover ` +
        `pay through an off-cycle payment, so nothing is proposed for it.`
    )
  }
  if (f.unpricedOvertimeHours > 0) {
    parts.push(
      `${f.unpricedOvertimeHours} overtime hours were paid by a run from before overtime was priced, with no ` +
        `premium at all. That is owed on its own, not as back pay for this change, and is not in this figure.`
    )
  }
  return parts.join(' ')
}

// ── Reading it off the books ──────────────────────────────────────────

export type BackPayProposal =
  | {
      applies: true
      rateHistoryId: string
      buyContractId: string
      personName: string
      currency: string
      fromCents: number | null
      toCents: number
      effectiveFrom: string
      figure: BackPayFigure
      says: string
    }
  | { applies: false; rateHistoryId: string; says: string }

/**
 * Back pay for one approved pay change, as a proposal. Writes nothing.
 */
export async function proposeBackPay(rateHistoryId: string): Promise<BackPayProposal | null> {
  const change = await prisma.rateHistory.findUnique({ where: { id: rateHistoryId } })
  if (!change || change.contractType.toUpperCase() !== 'BUY') return null
  if (change.approvalState !== 'APPROVED') {
    return { applies: false, rateHistoryId, says: 'A change nobody has approved pays nothing, so it owes no back pay.' }
  }

  const bc = await prisma.buyContract.findUnique({
    where: { id: change.contractId },
    include: {
      candidates: { include: { person: { select: { id: true, name: true } } } },
      workOrder: { select: ORDER_HEADER_SELECT },
      exemptAssertions: { select: EXEMPT_SELECT },
      company: { select: { name: true } },
      sellLinks: {
        include: {
          sellContract: {
            select: {
              id: true,
              companyId: true,
              overtimeAfterHours: true,
              timesheets: {
                where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
                select: { id: true, personId: true, days: true, leaveDays: true },
              },
            },
          },
        },
      },
    },
  })
  if (!bc) return null

  if (bc.vendorCompanyId || bc.supplierSellContractId || bc.contractType === 'C2C' || bc.contractType === 'IND_1099') {
    return {
      applies: false,
      rateHistoryId,
      says:
        'This line is paid by invoice, not by payroll, so the difference is billed on the next invoice ' +
        'by whoever employs the worker. No payroll back pay is proposed.',
    }
  }

  const book = await paidBook(bc.companyId, [bc.id])
  if (book.unrecorded.has(bc.id)) {
    return {
      applies: false,
      rateHistoryId,
      says:
        `A payroll run on ${book.unrecorded.get(bc.id)} paid this line without recording which days it ` +
        `covered, so what was paid — and so what is owed — cannot be worked out here. Settle back pay by hand.`,
    }
  }

  const rows = await prisma.rateHistory.findMany({
    where: { contractType: 'BUY', contractId: bc.id },
    select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  const periods = ratePeriods(rows)
  const from = change.fromDate.toISOString().slice(0, 10)
  const to = change.toDate ? change.toDate.toISOString().slice(0, 10) : null
  const inChange = (day: string) => day >= from && (to === null || day <= to)
  const links = bc.sellLinks.map((l) => ({
    buyContractId: bc.id,
    sellContractId: l.sellContractId,
    effectiveFrom: l.effectiveFrom,
    effectiveTo: l.effectiveTo,
  }))
  const method = methodFor(bc).method

  const days: PaidDay[] = []
  let personName = ''
  let currency = bc.payCurrency
  for (const cand of bc.candidates) {
    const terms: Terms = { ...periodTermsFor('BUY', bc), startedOn: cand.startDate }
    const line = wageLineFor(bc, cand.person.name, bc.exemptAssertions.find((a) => a.personId === cand.personId))
    for (const l of bc.sellLinks) {
      // Only the firm's own sell lines: that is where its payroll's hours are.
      if (l.sellContract.companyId !== bc.companyId) continue
      for (const t of l.sellContract.timesheets) {
        if (t.personId !== cand.personId) continue
        const all = (t.days ?? {}) as Record<string, number>
        const mine = Object.keys(all).length > 0 ? daysFor(bc.id, links, all) : all
        const weeks = sheetOvertime({
          days: mine,
          leaveDays: (t.leaveDays ?? {}) as Record<string, number>,
          afterHours: bc.overtimeAfterHours ?? l.sellContract.overtimeAfterHours ?? null,
          contractRateCents: cand.payRate,
          periods,
          method,
          line,
        })
        const premiums = premiumByDay(weeks)
        const touched = new Set(Object.keys(mine).map((d) => d.slice(0, 10)).filter(inChange).map(weekStart))
        for (const dayKey of Object.keys(mine)) {
          const day = dayKey.slice(0, 10)
          const paid = book.entries.get(paidKey(bc.id, cand.personId, t.id, day))
          if (!paid) continue
          const week = weekStart(day)
          if (!inChange(day) && !touched.has(week)) continue
          const p = premiums.get(day)
          const period = periodFor(dayDate(day), terms)
          days.push({
            personId: cand.personId,
            sellContractId: l.sellContractId,
            timesheetId: t.id,
            day,
            weekOf: week,
            period: { start: period.start.toISOString().slice(0, 10), label: period.label },
            paid,
            rateNowCents: rateInForce(cand.payRate, periods, dayDate(day)).rateCents,
            premiumPerHourNowCents: p && p.hours > 0 ? p.premiumCents / p.hours : 0,
            overHoursNow: p?.hours ?? 0,
            inChange: inChange(day),
            weekInChange: touched.has(week),
          })
        }
      }
      personName = personName || cand.person.name
      currency = cand.payCurrency || currency
    }
  }

  const figure = backPayOf(days)
  for (const p of figure.periods) for (const l of p.lines) l.buyContractId = bc.id
  const name = personName || bc.candidates[0]?.person.name || 'the worker'
  return {
    applies: true,
    rateHistoryId,
    buyContractId: bc.id,
    personName: name,
    currency,
    fromCents: change.previousRate,
    toCents: change.rate,
    effectiveFrom: from,
    figure,
    says: backPaySays(figure, { personName: name, toCents: change.rate, currency }),
  }
}
