/**
 * What is owed, in a shape ADP or Paychex will take.
 *
 * Etyme does not run payroll and should not: withholding, filings and
 * year-end are somebody's whole business, they are regulated differently
 * in every state, and getting them wrong costs a client more than this
 * product is worth.
 *
 * What it does is know what is owed and to whom, which is the part the
 * payroll provider cannot work out — the hours, whose signature stands
 * behind them, at what rate, against which order.
 *
 * ── The one thing this must never do ─────────────────────────────────
 *
 * Export an hour nobody accepted. A payroll file is acted on: it becomes
 * a bank transfer, usually the same week, and nobody reads it first. So
 * the only hours in it are ones the employer has accepted for pay, and
 * an unaccepted sheet is left out and reported rather than included with
 * a flag somebody was supposed to notice.
 *
 * ── The three things that were wrong here, and now are not ───────────
 *
 * **It paid people the bill rate.** `rateCents` was the sell contract's
 * `billRate`, so every file this produced paid a consultant what the
 * client was charged for them — $132 an hour against a $96 pay rate on
 * the seeded world, on a document that becomes a bank transfer the same
 * week. Pay comes off the buy leg now, and a person with no pay rate
 * there is left off and named rather than paid at the client's price.
 *
 * **It called everybody a W2.** The contract type was hardcoded, so a
 * corp-to-corp consultant — a company — could land on an ADP run as a
 * wage. `weekWage` refuses that as NOT_A_WAGE and this gates on it, the
 * way the 1099 half of `worker-classification` already refused to issue
 * one a NEC.
 *
 * **It valued every hour flat.** A 45-hour week billed at $4,750 paid
 * $4,500 and nothing said so. Hours over the line are priced by
 * `weekWage` against the wage rules, at the pay rate, from the
 * employer's own exempt assertion — never by mirroring what the client
 * agreed to be billed, which is a fact about a different contract.
 *
 * Every figure it produces is a floor rather than an answer: §207(e)
 * folds bonuses and shift differentials into the regular rate, and
 * states price overtime differently. The caveats travel with the file.
 */

import { paidByPayroll } from '@/lib/money/paid-through'
import {
  weekWage,
  type ClientChoice,
  type ExemptAssertion,
  type WageRuleName,
  type WeekOfHours,
} from '@/lib/worker-classification'
import {
  DEFAULT_OVERTIME_METHOD,
  weekOvertime,
  weekOvertimeSays,
  cutOrdinary,
  overDaysOf,
  type DayHours,
  type OvertimeMethod,
} from '@/lib/money/overtime-method'
import { premiumTerms } from '@/lib/money/sheet-overtime'
import { payCut, straightTimeSays, type CutOvertime, type PayCut, type PayWeek } from '@/lib/money/pay-hours'
import type { DayBands } from '@/lib/periods'
import { plainDate } from '@/lib/plain-date'

export type Provider = 'ADP' | 'PAYCHEX' | 'GENERIC'

export interface Line {
  /** The provider's own id for this person, where the client has set one. */
  payrollId: string | null
  /**
   * Who the line pays, where the caller knows. One person paid at two
   * rates is two lines and still one person, so a count of people is a
   * count of these, never of lines.
   */
  personId?: string | null
  personName: string
  /** W2 · C2C · IND_1099 — the provider needs to know which. */
  contractType: string
  periodStart: Date
  periodEnd: Date
  /** Ordinary hours the employer accepted, including paid leave. */
  hours: number
  /** Hours over the weekly line. Their own column on the file. */
  overtimeHours: number
  /**
   * Cents an hour, from the BUY leg.
   *
   * This used to be the sell contract's bill rate, so every payroll file
   * this system produced paid consultants what the client was charged
   * for them. On the seeded world that is $132 an hour against a $96
   * pay rate — a thirty-eight per cent overpayment, on a file that
   * becomes a bank transfer the same week.
   */
  rateCents: number
  /** Ordinary hours at the pay rate. */
  regularCents: number
  /** What the hours over the line must be paid, at minimum. */
  overtimeCents: number
  totalCents: number
  /**
   * The part of the statutory premium the client's own choice did not
   * price, at the pay rate. Not a margin figure — see `weekWage`.
   */
  uncoveredPremiumCents: number
  currency: string
  /** Where the cost lands in the client's books. */
  costCode: string | null
  /** The order this bills under, for reconciliation. */
  orderNumber: string | null
  /** Things true of these figures that the figures cannot say themselves. */
  notes: string[]
}

export interface Skipped {
  personName: string
  periodEnd: Date
  why: string
  /** What somebody has to do about it. */
  action?: string | null
}

export interface Export {
  provider: Provider
  lines: Line[]
  skipped: Skipped[]
  totalHours: number
  /** Hours over the line, across the file. */
  totalOvertimeHours: number
  totalCents: number
  /** Across the file: what mirroring the client's choice would have underpaid. */
  uncoveredPremiumCents: number
  says: string
  /** Every caveat on every line, said once. */
  caveats: string[]
}

/**
 * One person's week, as this file needs to read it.
 *
 * Weeks rather than a sheet total, because overtime is a weekly fact and
 * a semi-monthly sheet holds two and a bit of them. Split by
 * `lib/overtime` before it gets here — this file does not re-derive what
 * the approval desk already decided.
 */
export interface WeekToPay extends WeekOfHours {
  /** What the CLIENT decided about this week, on the sell leg. */
  client: ClientChoice
  /**
   * The pay rate in force over this week, where the caller priced it by
   * day. A week with one rate is paid at it, overtime and all. A week
   * that crosses a change carries the rate on its first day here, which
   * is what its overtime is priced at — see `rates`.
   */
  payRateCents?: number | null
  /**
   * The week's ordinary and leave hours split at a rate change, earliest
   * first. Present only where the week crossed one.
   *
   * Overtime in such a week is priced from `worked`, below.
   */
  rates?: Array<{ rateCents: number; hours: number }> | null
  /**
   * Every hour WORKED this week — never paid leave — each day at the
   * rate in force that day, earliest first. Where these carry more than
   * one rate and the week went over the line, its overtime is priced by
   * the line's method (lib/money/overtime-method): the US regular rate
   * unless the paying firm chose otherwise.
   */
  worked?: DayHours[] | null
  /**
   * Set where the week was worked over the line and accepted at or under
   * it: the sentence saying its hours are paid at straight time, because
   * an acceptance at or under the line is the hours worked
   * (lib/money/pay-hours). The week is on the file, with no hours over
   * the line, and the sentence travels on the line as a note.
   */
  straightTime?: string | null
}

export interface SheetToPay {
  /** Who the sheet pays. Absent in callers that only have a name. */
  personId?: string | null
  personName: string
  payrollId: string | null
  /** From the buy contract. Never assumed: assuming W2 is how a company lands on a wage file. */
  contractType: string
  /** False where somebody else employs them — a sub-vendor, or their own company. */
  weAreTheEmployer: boolean
  periodStart: Date
  periodEnd: Date
  weeks: WeekToPay[]
  submittedHours: number
  /** What the employer accepted for pay, where it differs from what was filed. */
  acceptedHours: number | null
  /**
   * How a week accepted short is cut, read off the pay line by
   * `cutOvertimeFor`. Required, so the file never pays the default to a
   * worker whose employer chose otherwise.
   */
  cutOvertime: CutOvertime
  /**
   * True where the caller already cut the weeks to the hours accepted,
   * on the days (lib/money/pay-hours) — so this file does not cut them
   * a second time from the weeks.
   */
  weeksAreAccepted?: boolean
  /** Why the sheet cannot be paid as accepted, where it cannot. Left off, in this sentence. */
  cannotPay?: string | null
  employerAcceptedAt: Date | null
  /** Cents an hour from the buy leg. Null where nothing says what they are paid. */
  payRateCents: number | null
  /**
   * What an overtime hour is worth to the WORKER, in basis points of
   * their pay rate, from the buy contract.
   *
   * Statute sets a floor and not a ceiling. Where an employer agreed
   * more than the floor — double time past sixty, a premium after eight
   * in a day — the worker is owed the better of the two, and until this
   * column existed payroll had nothing to value that from except the
   * client's billing terms, which are not a wage.
   *
   * Null or absent means the contract says nothing, and the floor
   * stands: the absence of a term is not a waiver of one.
   */
  contractPremiumBps?: number | null
  /**
   * How overtime in a week paid at two rates is priced. Absent is the US
   * regular rate — the default, and today the only answer, because no
   * buy line can yet record a different choice with who made it.
   */
  overtimeMethod?: OvertimeMethod | null
  /**
   * Which weekly line the sheet was judged on, where that needs saying —
   * the law's forty where no contract drew one, or why the law's forty
   * does not reach this worker. Travels on the line as a note.
   */
  lineSays?: string | null
  payModel: string
  paidOnSalaryBasis: boolean
  rule: WageRuleName
  /** What the employer asserted about exemption. Null means nobody has said. */
  assertion: ExemptAssertion | null
  currency: string
  costCode: string | null
  orderNumber: string | null
  employerName?: string | null
  clientName?: string | null
}

/**
 * Build the run.
 *
 * ── What this refuses to put on a file ───────────────────────────────
 *
 * A week nobody accepted. A person with no pay rate on the buy side —
 * the bill rate is what the client is charged and is not anybody's wage.
 * A corp-to-corp consultant or a sub-vendor's employee, who are settled
 * by invoice and whose wage duty belongs to whoever signs their
 * paycheck. And a week over the line on somebody nobody has classified,
 * because the two lawful answers are "salary, no premium" and "money, at
 * time and a half", and picking one to keep the file moving is picking
 * one at random.
 *
 * Every refusal is named. A payroll file that quietly omits somebody is
 * how a contractor goes unpaid for a fortnight and nobody can say why.
 *
 * ── Why the whole sheet goes when one week cannot be priced ───────────
 *
 * Paying three weeks of four and saying nothing looks like a full
 * payment to everybody who reads the file, including the person being
 * paid. A partial wage nobody flagged is worse than a line that did not
 * go, because the second gets fixed.
 */
export function buildExport(provider: Provider, sheets: SheetToPay[]): Export {
  const lines: Line[] = []
  const skipped: Skipped[] = []

  for (const s of sheets) {
    // Payroll pays our own employees and nobody else (lib/money/paid-through).
    // A corp-to-corp company and a 1099 individual are paid on their own
    // invoice, received as an invoice receipt — never on a wage file too.
    if (!paidByPayroll({ contractType: s.contractType })) {
      const t = String(s.contractType).toUpperCase()
      skipped.push({
        personName: s.personName,
        periodEnd: s.periodEnd,
        why:
          t === 'C2C' || t === 'CORP_TO_CORP'
            ? `${s.personName} works through their own company, so this is an invoice receipt to settle and not a wage to run.`
            : t === 'IND_1099'
              ? `${s.personName} is an independent contractor paid on their own invoice, so this is an invoice receipt to settle and not a wage to run.`
              : `Nothing on ${s.personName}'s line says they are our employee, so this is not a wage to run on a guess.`,
        action: 'Settle it through accounts payable, not payroll.',
      })
      continue
    }

    if (!s.employerAcceptedAt) {
      skipped.push({
        personName: s.personName,
        periodEnd: s.periodEnd,
        why: 'Nobody has accepted these hours for pay yet.',
        action: 'Accept the hours on the timesheet, then run this again.',
      })
      continue
    }

    // ── The pay rate, and never the bill rate ───────────────────────
    if (!s.payRateCents || s.payRateCents <= 0) {
      skipped.push({
        personName: s.personName,
        periodEnd: s.periodEnd,
        why:
          `Nothing on the buy side says what ${s.personName} is paid, and what the client is ` +
          'billed for them is not their wage.',
        action: `Put a pay rate on ${s.personName}'s buy contract, then run this again.`,
      })
      continue
    }

    if (s.cannotPay) {
      skipped.push({
        personName: s.personName,
        periodEnd: s.periodEnd,
        why: s.cannotPay,
        action: 'Withdraw all but one acceptance on the week, then run this again.',
      })
      continue
    }

    // A week worked over the line and accepted at or under it arrives
    // here with nothing over the line: its hours are paid at straight
    // time, and its sentence goes on the line as a note.
    const weeks = s.weeksAreAccepted ? s.weeks.map((w) => ({ ...w })) : payable(s)

    const hours = round2(weeks.reduce((n, w) => n + w.regularHours + w.leaveHours, 0))
    const overtimeHours = round2(weeks.reduce((n, w) => n + w.overHours, 0))

    if (hours + overtimeHours <= 0) {
      skipped.push({
        personName: s.personName,
        periodEnd: s.periodEnd,
        why: 'Accepted at zero hours.',
        action: null,
      })
      continue
    }

    // Each week at the rate in force over it. A pay rise effective on a
    // Wednesday used to reach the file only from the next sheet on.
    const rateOf = (w: WeekToPay) => (w.payRateCents && w.payRateCents > 0 ? w.payRateCents : s.payRateCents!)

    // ── What the law says each week is worth ────────────────────────
    const verdicts = weeks.map((w) =>
      weekWage(w, {
        personName: s.personName,
        contractType: s.contractType,
        weAreTheEmployer: s.weAreTheEmployer,
        pay: {
          payModel: s.payModel,
          payRateCents: rateOf(w),
          paidOnSalaryBasis: s.paidOnSalaryBasis,
        },
        rule: s.rule,
        assertion: s.assertion,
        client: w.client,
        employerName: s.employerName,
        clientName: s.clientName,
      })
    )

    const refused = verdicts.find((v) => !v.ok)
    if (refused) {
      skipped.push({
        personName: s.personName,
        periodEnd: s.periodEnd,
        why: refused.says,
        action: refused.action,
      })
      continue
    }

    // ── The floor, and the better thing the employer agreed ─────────
    //
    // `weekWage` prices what the law requires. A buy contract may have
    // promised more, and a promise is not undone by a statute that
    // happens to ask for less, so the worker gets the greater of the two
    // — computed week by week, because a semi-monthly sheet can hold one
    // week the floor governs and one the contract does.
    const bps = s.contractPremiumBps ?? null
    const overtimeOf = (w: WeekToPay, i: number) => {
      const statutory = verdicts[i].overtimeCents ?? 0
      const agreed =
        bps == null ? 0 : Math.round(w.overHours * rateOf(w) * (bps / 10_000))
      return Math.max(statutory, agreed)
    }

    const contractGoverns =
      bps != null &&
      weeks.some((w, i) => {
        const agreed = Math.round(w.overHours * rateOf(w) * (bps / 10_000))
        return w.overHours > 0 && agreed > (verdicts[i].overtimeCents ?? 0)
      })

    const notes = [...new Set(verdicts.flatMap((v) => v.caveats))]
    if (s.lineSays) notes.push(s.lineSays)
    for (const w of weeks) if (w.straightTime) notes.push(w.straightTime)
    if (contractGoverns) {
      notes.push(
        `${s.personName}'s buy contract prices an overtime hour above what the law requires, ` +
          'so their own terms govern these hours. A statute asking for less does not undo a ' +
          'promise an employer made.'
      )
    }
    // ── A week paid at two rates that went over the line ────────────
    //
    // Its overtime is priced by the line's method, on every hour worked
    // that week: straight time for each hour at its own day's rate, plus
    // the premium on the regular rate (or on what the firm chose, never
    // below what the law requires on the regular rate). Exact until the
    // line is written, then rounded once.
    const method = s.overtimeMethod ?? DEFAULT_OVERTIME_METHOD
    const twoRates = weeks.map((w, i) => {
      const worked = (w.worked ?? []).filter((d) => d.hours > 0)
      if (w.overHours <= 0 || new Set(worked.map((d) => d.rateCents)).size < 2) return null
      const terms = premiumTerms(verdicts[i], bps)
      const ot = weekOvertime({
        worked,
        overHours: w.overHours,
        multiplierBps: terms.multiplierBps,
        floorBps: terms.floorBps,
        method,
      })
      notes.push(weekOvertimeSays(w.weekOf, ot, s.currency))
      return ot
    })

    // ── One line per rate ───────────────────────────────────────────
    //
    // A provider file multiplies hours by a rate, so hours paid at two
    // rates are two lines. Ordinary hours land on the rate they were
    // worked at; a week's overtime lands on the rate it was priced at,
    // and in a week paid at two rates on the rate of the day each
    // overtime hour was worked.
    const byRate = new Map<number, { hours: number; overtimeHours: number; regularCents: number; overtimeExact: number; uncovered: number }>()
    const at = (r: number) => {
      if (!byRate.has(r)) byRate.set(r, { hours: 0, overtimeHours: 0, regularCents: 0, overtimeExact: 0, uncovered: 0 })
      return byRate.get(r)!
    }
    weeks.forEach((w, i) => {
      const base = rateOf(w)
      if (w.rates && w.rates.length > 1) {
        for (const seg of w.rates) {
          const b = at(seg.rateCents)
          b.hours = round2(b.hours + seg.hours)
          b.regularCents += Math.round(seg.hours * seg.rateCents)
        }
      } else {
        const b = at(base)
        b.hours = round2(b.hours + w.regularHours + w.leaveHours)
        b.regularCents += verdicts[i].regularCents ?? 0
      }
      const ot = twoRates[i]
      if (ot) {
        for (const d of ot.overDays) {
          const o = at(d.rateCents)
          o.overtimeHours = round2(o.overtimeHours + d.hours)
          o.overtimeExact += d.hours * d.rateCents + d.premiumCents
        }
      } else {
        const b = at(base)
        b.overtimeHours = round2(b.overtimeHours + w.overHours)
        b.overtimeExact += overtimeOf(w, i)
      }
      at(base).uncovered += verdicts[i].uncoveredPremiumCents ?? 0
    })

    for (const [rateCents, b] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
      if (b.hours + b.overtimeHours <= 0) continue
      // Rounded once, here, per line.
      const overtimeCents = Math.round(b.overtimeExact)
      lines.push({
        payrollId: s.payrollId,
        personId: s.personId ?? null,
        personName: s.personName,
        contractType: s.contractType,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        hours: b.hours,
        overtimeHours: b.overtimeHours,
        rateCents,
        regularCents: b.regularCents,
        overtimeCents,
        totalCents: b.regularCents + overtimeCents,
        uncoveredPremiumCents: b.uncovered,
        currency: s.currency,
        costCode: s.costCode,
        orderNumber: s.orderNumber,
        notes,
      })
    }
  }

  const totalHours = round2(lines.reduce((n, l) => n + l.hours, 0))
  const totalOvertimeHours = round2(lines.reduce((n, l) => n + l.overtimeHours, 0))
  const totalCents = lines.reduce((n, l) => n + l.totalCents, 0)
  const uncoveredPremiumCents = lines.reduce((n, l) => n + l.uncoveredPremiumCents, 0)

  return {
    provider,
    lines,
    skipped,
    totalHours,
    totalOvertimeHours,
    totalCents,
    uncoveredPremiumCents,
    // People, not lines: somebody paid at two rates is two lines.
    says: exportSays(new Set(lines.map(whoIs)).size, skipped.length, totalHours, totalOvertimeHours, totalCents, provider),
    caveats: [...new Set(lines.flatMap((l) => l.notes))],
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * The weeks as the employer accepted them, where the caller handed over
 * weeks and not days.
 *
 * The cut is the one pay always takes (lib/money/pay-hours), under the
 * sheet's `cutOvertime`: by default the hours over the line go first, so
 * overtime is paid only on the accepted hours above it. Where the paying
 * firm chose to keep the week's overtime: ordinary
 * hours first, latest week first — worked hours, then paid leave — and
 * the hours over the line only once no ordinary hour is left. A week
 * that, as accepted, is at or under its line is paid at straight time,
 * with the sentence saying why.
 *
 * This is the same allocation the run and the screen take on the days,
 * with a week standing in for its days: the latest week's ordinary hours
 * are its latest ordinary hours.
 */
function payable(s: SheetToPay): WeekToPay[] {
  const weeks = s.weeks.map((w) => ({ ...w }))
  if (s.acceptedHours == null) return weeks

  const bands = weeks.map((w) => ({ day: w.weekOf, week: w.weekOf, regular: w.regularHours, leave: w.leaveHours, over: w.overHours }))
  const cut = payCut(bands, { hours: s.acceptedHours, from: null, to: null }, null, s.cutOvertime)
  const kept = new Map(cut.days.map((d) => [d.week, d]))

  return weeks.map((w) => {
    const k = kept.get(w.weekOf) ?? { regular: 0, leave: 0, over: 0 }
    const off = round2(w.regularHours - k.regular)
    const out: WeekToPay = { ...w, regularHours: k.regular, leaveHours: k.leave, overHours: k.over }
    // The same hours come off the week's latest rate first, so a week
    // split at a rate change is cut where the week was cut.
    if (w.rates && w.rates.length > 1 && off > 0) {
      let left = off
      const rates = w.rates.map((r) => ({ ...r }))
      for (let j = rates.length - 1; j >= 0 && left > 0; j--) {
        const take = Math.min(left, rates[j].hours)
        rates[j].hours = round2(rates[j].hours - take)
        left = round2(left - take)
      }
      out.rates = rates.filter((r) => r.hours > 0)
    }
    // And off the worked days the week's overtime is priced from, at the
    // same place: the ordinary hours, never the ones over the line.
    if (w.worked && off > 0) out.worked = cutOrdinary(w.worked, w.overHours, off)
    // A week that went over its line worked exactly the line in ordinary
    // hours, so its ordinary hours as filed ARE its line. As accepted, it
    // is at or under that line where what is left worked is no more — and
    // then it is paid at straight time, because an acceptance at or under
    // the line is the hours worked: its hours past the line as filed are
    // ordinary hours of a week that does not go over it.
    const line = w.regularHours
    if (w.overHours > 0 && k.over > 0 && round2(k.regular + k.over) <= line) {
      out.regularHours = round2(k.regular + k.over)
      out.overHours = 0
      // The hours moved were the week's last ones worked; where the week
      // is split at a rate change they join the rate they were worked at.
      if (w.rates && w.rates.length > 1) {
        const rates = (out.rates ?? []).map((r) => ({ ...r }))
        const worked = out.worked ?? w.worked
        const moved = worked && worked.length > 0
          ? overDaysOf(worked, k.over)
          : [{ day: w.weekOf, hours: k.over, rateCents: w.rates[w.rates.length - 1].rateCents }]
        for (const d of moved) {
          const seg = rates.find((r) => r.rateCents === d.rateCents)
          if (seg) seg.hours = round2(seg.hours + d.hours)
          else rates.push({ rateCents: d.rateCents, hours: d.hours })
        }
        out.rates = rates
      }
      out.straightTime = straightTimeSays(
        {
          weekOf: w.weekOf,
          filedWorked: round2(w.regularHours + w.overHours),
          filedOver: w.overHours,
          filedLeave: w.leaveHours,
          regular: out.regularHours,
          leave: k.leave,
          over: 0,
          underTheLine: true,
        },
        line,
        s.personName
      )
    }
    return out
  })
}

function exportSays(
  n: number,
  skippedCount: number,
  hours: number,
  overtimeHours: number,
  cents: number,
  provider: Provider
): string {
  if (n === 0) {
    return skippedCount > 0
      ? `Nothing to send. ${skippedCount} ${skippedCount === 1 ? 'person is' : 'people are'} left out, each for a reason on the row.`
      : 'Nothing to send. No accepted hours in this period.'
  }

  const money = `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const ot = overtimeHours > 0 ? `, ${overtimeHours} of them over the line` : ''
  // Never "nobody has accepted their hours" any more: a row is left out
  // for one of four reasons now, and saying the wrong one sends somebody
  // to the wrong desk.
  const tail = skippedCount ? ` ${skippedCount} left out, each with a reason on the row.` : ''

  return `${n} ${n === 1 ? 'person' : 'people'}, ${hours} hours${ot}, ${money} for ${provider}.${tail}`
}

/**
 * The file itself.
 *
 * CSV, because every provider takes it and because a human can open it
 * and check before it becomes a bank transfer. Column names follow each
 * provider's own import template rather than ours — a file the provider
 * rejects is a file somebody has to rekey.
 */
export function toCsv(e: Export): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const money = (c: number) => (c / 100).toFixed(2)

  // Overtime hours get their own column, and on Paychex their own row,
  // because that is how both providers price them. A file that put
  // forty-five hours in "Reg Hours" paid the premium to nobody and left
  // the employer owing it.
  const rows: string[][] =
    e.provider === 'ADP'
      ? [
          ['Co Code', 'File #', 'Name', 'Reg Hours', 'O/T Hours', 'Rate', 'Period Start', 'Period End', 'Dept'],
          ...e.lines.map((l) => [
            '', l.payrollId ?? '', l.personName, String(l.hours), String(l.overtimeHours),
            money(l.rateCents), iso(l.periodStart), iso(l.periodEnd), l.costCode ?? '',
          ]),
        ]
      : e.provider === 'PAYCHEX'
        ? [
            ['Employee ID', 'Employee Name', 'Earnings Code', 'Hours', 'Rate', 'Amount', 'Pay Period End', 'Cost Center'],
            ...e.lines.flatMap((l) => [
              [
                l.payrollId ?? '', l.personName, 'REG', String(l.hours),
                money(l.rateCents), money(l.regularCents), iso(l.periodEnd), l.costCode ?? '',
              ],
              ...(l.overtimeHours > 0
                ? [[
                    l.payrollId ?? '', l.personName, 'OT', String(l.overtimeHours),
                    money(l.rateCents), money(l.overtimeCents), iso(l.periodEnd), l.costCode ?? '',
                  ]]
                : []),
            ]),
          ]
        : [
            ['payroll_id', 'name', 'contract_type', 'period_start', 'period_end', 'hours', 'overtime_hours', 'rate', 'regular_amount', 'overtime_amount', 'currency', 'cost_code', 'order'],
            ...e.lines.map((l) => [
              l.payrollId ?? '', l.personName, l.contractType, iso(l.periodStart), iso(l.periodEnd),
              String(l.hours), String(l.overtimeHours), money(l.rateCents),
              money(l.regularCents), money(l.overtimeCents),
              l.currency, l.costCode ?? '', l.orderNumber ?? '',
            ]),
          ]

  return rows.map((r) => r.map(cell).join(',')).join('\n')
}

/** A field that will survive somebody's name containing a comma. */
function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * Who has no payroll id yet.
 *
 * Reported before the file is built rather than after it is rejected.
 * ADP matches on their file number, and a row without one is a row their
 * import drops silently.
 */
export function missingIds(e: Export): string[] {
  // Once per person, however many rates they were paid at.
  const seen = new Set<string>()
  const out: string[] = []
  for (const l of e.lines) {
    if (l.payrollId || seen.has(whoIs(l))) continue
    seen.add(whoIs(l))
    out.push(l.personName)
  }
  return out
}

/** One person, whatever lines they are on: their id where known, else their payroll id and name. */
function whoIs(l: Line): string {
  return l.personId ?? `${l.payrollId ?? ''}|${l.personName}`
}

// ═════════════════════════════════════════════════════════════════════
// STATUTORY — what the bureau needs, prepared by us and filed by them
// ═════════════════════════════════════════════════════════════════════
//
// ── The boundary, said once and repeated on every artifact ───────────
//
// **Etyme never files anything.** Not a 941, not a state deposit, not a
// W-2, not a 1099. Withholding, deposits and year-end are somebody's
// whole business, they are regulated differently in every state, and a
// staffing platform that grows a filing engine inside it becomes a bad
// filing engine attached to a good staffing platform. Getting it wrong
// costs a client more than this product is worth.
//
// What we have, and the bureau does not, is what was actually earned and
// by whom: hours somebody accepted, at a rate somebody agreed, posted to
// a period. That is the input to every return, and it is the part that is
// wrong in most bureaus' files because it arrives by email as a
// spreadsheet.
//
// So "done" here is not "we file". It is: the handoff is real, the
// numbers come from postings rather than from a rate card, and every
// screen and file says plainly who files it.
//
// ── Why the summaries come from PAY postings ─────────────────────────
//
// A rate card says what somebody should have earned. A posting says what
// they did. Those differ every time a timesheet is reversed, a rate
// amendment lands late, or an off-cycle payment is made — which is to
// say, on most real assignments. A wage figure built from a rate card is
// wrong in exactly the cases somebody will look closely at.

/** The sentence that goes on every statutory screen and every file. */
export const BUREAU_NOTICE =
  'Prepared for your payroll bureau. Nothing here is filed by Etyme — we hold what was ' +
  'earned and by whom; the bureau holds the withholding, the deposits and the returns.'

export type WorkerTaxTreatment =
  /** An employee. The bureau issues a W-2. */
  | 'W2'
  /** An individual engaged directly. Reportable on a 1099-NEC. */
  | 'IND_1099'
  /** A company. Not reportable on a 1099-NEC for services. */
  | 'C2C'
  /** Something we do not have a rule for. Named rather than guessed. */
  | 'UNKNOWN'

export function treatmentOf(contractType: string): WorkerTaxTreatment {
  const t = String(contractType).toUpperCase()
  if (t === 'W2' || t === 'W2_HOURLY' || t === 'W2_SALARY') return 'W2'
  if (t === 'C1099' || t === '1099' || t === 'IND_1099') return 'IND_1099'
  if (t === 'C2C' || t === 'CORP_TO_CORP') return 'C2C'
  return 'UNKNOWN'
}

/**
 * The 1099-NEC reporting floor, in cents.
 *
 * Six hundred dollars. A payee under it is not reportable — and is listed
 * separately rather than dropped, because "not on the file" and "not in
 * the data" look identical to whoever is reconciling, and one of them is
 * a missing person.
 */
export const NEC_THRESHOLD_CENTS = 60_000

export interface PayPosting {
  personId: string
  personName: string
  /** The person's own tax identification, where it is held. Never printed. */
  hasTaxId: boolean
  contractType: string
  /** Signed cents as the ledger holds them — pay is negative. */
  amountCents: number
  currency: string
  /** The date the money belongs to, which is what decides the tax year. */
  postedAt: Date
}

/** Said on the screen where the year-end figure is shown. */
export const WAGES_YEAR_PAID = 'Wages count in the year they were paid.'

/** A pay posting with what is needed to find the day it was paid. */
export interface DatablePosting extends PayPosting {
  id: string
  source: string
  sourceId: string
  buyContractId: string | null
  /** The week behind a TIMESHEET posting, read off its acceptance. */
  timesheetId: string | null
  /** The hours that acceptance priced. */
  acceptedHours: number | null
}

/** Hours of one week one processed payroll run paid, and the day it ran. */
export interface RunPaidHours {
  buyContractId: string
  personId: string
  timesheetId: string
  hours: number
  paidAt: Date
}

export interface PostingAside {
  personId: string
  personName: string
  /** The magnitude, in minor units — never signed. */
  amountCents: number
  currency: string
}

/**
 * Drop postings a reversal cancelled. The reversing rows themselves are
 * already excluded by the query; this drops the row each one cancelled,
 * so a corrected month is not counted twice.
 */
export function dropReversed<T extends { id: string }>(rows: readonly T[], cancelled: ReadonlySet<string | null>): T[] {
  return rows.filter((r) => !cancelled.has(r.id))
}

/**
 * The pay day written into an off-cycle payment's key:
 * `offcycle:{sellContract}:{person}:{YYYY-MM-DD}:{reason}…` — set by
 * `api/payroll/off-cycle`. Null for anything else.
 */
export function offCyclePaidOn(sourceId: string): Date | null {
  const parts = sourceId.split(':')
  if (parts[0] !== 'offcycle' || parts.length < 4) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[3])) return null
  const d = new Date(`${parts[3]}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Date every wage posting by the day it was paid.
 *
 * Wages go on the W-2 for the year they are paid (US law, which the
 * founder's standing rule follows). A posting is dated by the week the
 * hours were worked, which is right for margin and wrong for a W-2: a
 * week worked in December and paid in January belongs to January's year.
 *
 * - A W-2 week (TIMESHEET) is dated by the processed payroll runs that
 *   paid its hours, and where two runs paid parts of it, its amount is
 *   split between them by hours, to the cent. Hours accepted and not yet
 *   paid are in no year: returned as `unpaid`. A contract behind a run
 *   that recorded no lines has no knowable paid day: returned as
 *   `undated`, never placed in a year on a guess.
 * - An off-cycle payment is dated by its own pay day.
 * - Anything else on a W-2 line keeps its posting date.
 * - 1099 and corp-to-corp postings are dropped here. Those are paid on
 *   the supplier's invoice, received as an invoice receipt, and counted
 *   in the year that receipt was paid (`receiptPayments`); counting the
 *   posting as well would count the same work twice.
 *
 * Pure: no database.
 */
export function datePaidWages(
  postings: readonly DatablePosting[],
  runs: readonly RunPaidHours[],
  unrecordedContracts: ReadonlySet<string>
): { postings: PayPosting[]; unpaid: PostingAside[]; undated: PostingAside[] } {
  const out: PayPosting[] = []
  const unpaid: PostingAside[] = []
  const undated: PostingAside[] = []
  const strip = (p: DatablePosting): PayPosting => ({
    personId: p.personId, personName: p.personName, hasTaxId: p.hasTaxId,
    contractType: p.contractType, amountCents: p.amountCents, currency: p.currency, postedAt: p.postedAt,
  })
  const aside = (p: DatablePosting, amountCents: number): PostingAside => ({
    personId: p.personId, personName: p.personName, amountCents: Math.abs(amountCents), currency: p.currency,
  })

  for (const p of postings) {
    if (!(WAGE_CONTRACT_TYPES as readonly string[]).includes(p.contractType)) continue
    if (p.source === 'PAYROLL') {
      const on = offCyclePaidOn(p.sourceId)
      out.push({ ...strip(p), postedAt: on ?? p.postedAt })
      continue
    }
    if (p.source !== 'TIMESHEET' || !p.timesheetId || !p.buyContractId) {
      out.push(strip(p))
      continue
    }

    const byDay = new Map<string, number>()
    for (const r of runs) {
      if (r.buyContractId !== p.buyContractId || r.personId !== p.personId || r.timesheetId !== p.timesheetId) continue
      if (!(r.hours > 0)) continue
      const k = r.paidAt.toISOString().slice(0, 10)
      byDay.set(k, (byDay.get(k) ?? 0) + r.hours)
    }
    if (byDay.size === 0) {
      if (unrecordedContracts.has(p.buyContractId)) undated.push(aside(p, p.amountCents))
      else unpaid.push(aside(p, p.amountCents))
      continue
    }

    const paidHours = [...byDay.values()].reduce((n, h) => n + h, 0)
    const accepted = p.acceptedHours && p.acceptedHours > 0 ? p.acceptedHours : paidHours
    // Hours paid past the acceptance do not make the posting bigger: the
    // shares are scaled to the whole posting, and nothing is left waiting.
    const base = Math.max(accepted, paidHours)
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const sign = p.amountCents < 0 ? -1 : 1
    const whole = Math.abs(p.amountCents)
    let given = 0
    days.forEach(([day, h], i) => {
      const lastPaid = i === days.length - 1
      const share = lastPaid && paidHours >= accepted
        ? whole - given
        : Math.round((whole * h) / base)
      given += share
      out.push({ ...strip(p), amountCents: sign * share, postedAt: new Date(`${day}T00:00:00Z`) })
    })
    if (given < whole) unpaid.push(aside(p, sign * (whole - given)))
  }

  return { postings: out, unpaid, undated }
}

/** An invoice receipt on a 1099 or corp-to-corp line, and what paid it. */
export interface ReceiptForYear {
  id: string
  number: string
  contractType: string
  /** Who the form is for: the person on a 1099 line, the corporation on a C2C one. */
  payeeId: string
  payeeName: string
  currency: string
  totalCents: number
  paidCents: number
  /** Set only when paid in full. */
  paidAt: Date | null
  status: string
  /** Each part a paid payment run settled, on the day the run paid. */
  runPayments: Array<{ amountCents: number; paidAt: Date }>
}

/** Contract types paid on an invoice receipt, reported (or not) on a 1099. */
export const RECEIPT_CONTRACT_TYPES = ['IND_1099', 'C2C'] as const

/**
 * What 1099 and corp-to-corp payees were paid, dated the day it was paid.
 *
 * A 1099-NEC reports what was paid in the year, as a W-2 does. The
 * payment is the recorded settlement of the supplier's invoice: each
 * paid payment run on its own day, and the rest on the day the receipt
 * was paid in full. A receipt not yet paid is in no year and is returned
 * as `waiting`. A part payment recorded without a date — the AP desk can
 * record one, and only full payment carries a date — is returned as
 * `undated` rather than placed in a year on a guess.
 *
 * Pure: no database.
 */
export function receiptPayments(receipts: readonly ReceiptForYear[]): {
  postings: PayPosting[]
  waiting: PostingAside[]
  undated: PostingAside[]
} {
  const postings: PayPosting[] = []
  const waiting: PostingAside[] = []
  const undated: PostingAside[] = []
  for (const r of receipts) {
    if (!(RECEIPT_CONTRACT_TYPES as readonly string[]).includes(r.contractType)) continue
    if (r.status === 'CANCELLED') continue
    const row = (amountCents: number, on: Date): PayPosting => ({
      personId: r.payeeId, personName: r.payeeName, hasTaxId: false, contractType: r.contractType,
      amountCents: -Math.abs(amountCents), currency: r.currency, postedAt: on,
    })
    const aside = (amountCents: number): PostingAside => ({
      personId: r.payeeId, personName: r.payeeName, amountCents: Math.abs(amountCents), currency: r.currency,
    })
    const paid = Math.max(0, Math.min(r.paidCents, r.totalCents))
    let dated = 0
    for (const p of r.runPayments) {
      const take = Math.min(p.amountCents, paid - dated)
      if (take <= 0) continue
      postings.push(row(take, p.paidAt))
      dated += take
    }
    const rest = paid - dated
    if (rest > 0) {
      if (r.paidAt) postings.push(row(rest, r.paidAt))
      else undated.push(aside(rest))
    }
    if (r.totalCents - paid > 0) waiting.push(aside(r.totalCents - paid))
  }
  return { postings, waiting, undated }
}

export type StatutoryForm = 'W2' | '1099_NEC' | 'NONE'

export interface WageSummary {
  personId: string
  personName: string
  year: number
  treatment: WorkerTaxTreatment
  /** What the bureau puts on the form. Null where no honest figure exists. */
  grossCents: number | null
  currency: string | null
  /** The form the bureau issues, if any. */
  form: StatutoryForm
  /** The box on that form, where it has one. */
  box: string | null
  /** True where the amount is real but below the reporting floor. */
  belowThreshold: boolean
  /** True where the bureau will need a tax id we do not hold. */
  missingTaxId: boolean
  postings: number
  /** Why the figure is what it is, or why there is none. */
  says: string
}

/**
 * One person, one year, from the postings alone.
 *
 * ── The corp-to-corp rule, which surprises people ────────────────────
 *
 * A corporation is not reportable on a 1099-NEC for services. The
 * instructions exempt payments to corporations from the general
 * information-reporting requirement, which is why a C2C sub-vendor gets
 * an invoice, gets paid, and gets no form. Issuing one anyway is not
 * harmless: it asserts a relationship with an individual that the
 * arrangement does not have, and that assertion is the shape of a
 * misclassification finding.
 *
 * So C2C returns NONE, with the reason said out loud rather than an empty
 * row somebody reads as an oversight.
 */
export function wageSummary(
  personId: string,
  postings: PayPosting[],
  year: number
): WageSummary {
  const theirs = postings.filter(
    (p) => p.personId === personId && p.postedAt.getUTCFullYear() === year
  )

  const name = theirs[0]?.personName ?? postings.find((p) => p.personId === personId)?.personName ?? 'Unknown'
  const treatment = treatmentOf(theirs[0]?.contractType ?? 'UNKNOWN')

  if (theirs.length === 0) {
    return {
      personId, personName: name, year, treatment,
      grossCents: null, currency: null, form: 'NONE', box: null,
      belowThreshold: false, missingTaxId: false, postings: 0,
      says: `Nothing was posted for ${name} in ${year}, so there is nothing to report.`,
    }
  }

  const currencies = [...new Set(theirs.map((p) => p.currency.toUpperCase()))]
  if (currencies.length > 1) {
    return {
      personId, personName: name, year, treatment,
      grossCents: null, currency: null, form: 'NONE', box: null,
      belowThreshold: false, missingTaxId: false, postings: theirs.length,
      says:
        `${name} was paid in ${currencies.join(' and ')} during ${year}. A single wage ` +
        `figure across two currencies is a figure of nothing, and which return each part ` +
        `belongs on is a question about where they were employed — so no total is given. ` +
        `Split the year by the paying entity.`,
    }
  }

  // Pay postings are negative in the ledger. The gross is their magnitude.
  const gross = theirs.reduce((n, p) => n + Math.abs(p.amountCents), 0)
  const missingTaxId = theirs.some((p) => !p.hasTaxId)

  if (treatment === 'C2C') {
    return {
      personId, personName: name, year, treatment,
      grossCents: gross, currency: currencies[0], form: 'NONE', box: null,
      belowThreshold: false, missingTaxId: false, postings: theirs.length,
      says:
        `${name} is engaged corp-to-corp, so no 1099-NEC is issued. Payments to a ` +
        `corporation for services are outside the information-reporting requirement, and ` +
        `issuing a form anyway asserts a relationship with an individual that this ` +
        `arrangement does not have — which is the shape of a misclassification finding. ` +
        `The amount is shown because somebody will ask.`,
    }
  }

  if (treatment === 'UNKNOWN') {
    return {
      personId, personName: name, year, treatment,
      grossCents: gross, currency: currencies[0], form: 'NONE', box: null,
      belowThreshold: false, missingTaxId, postings: theirs.length,
      says:
        `Nothing here knows how a "${theirs[0].contractType}" engagement is reported. The ` +
        `amount is real; the form is not guessed. Somebody has to say what this ` +
        `arrangement is before the bureau can file anything for it.`,
    }
  }

  if (treatment === 'W2') {
    return {
      personId, personName: name, year, treatment,
      grossCents: gross, currency: currencies[0], form: 'W2', box: 'Box 1 — wages, tips, other compensation',
      belowThreshold: false, missingTaxId, postings: theirs.length,
      says:
        `${cents(gross)} of ${currencies[0]} wages across ${theirs.length} posting` +
        `${theirs.length === 1 ? '' : 's'}. This is gross earnings only — withholding, ` +
        `pre-tax deductions and the employer's own taxes are the bureau's figures and are ` +
        `deliberately not here.`,
    }
  }

  const below = gross < NEC_THRESHOLD_CENTS
  return {
    personId, personName: name, year, treatment,
    grossCents: gross, currency: currencies[0],
    form: below ? 'NONE' : '1099_NEC',
    box: below ? null : 'Box 1 — nonemployee compensation',
    belowThreshold: below,
    missingTaxId, postings: theirs.length,
    says: below
      ? `${cents(gross)} — under the ${cents(NEC_THRESHOLD_CENTS)} reporting floor, so no ` +
        `1099-NEC. Listed rather than dropped: "not on the file" and "not in the data" look ` +
        `identical to whoever reconciles, and one of them is a missing person.`
      : `${cents(gross)} of nonemployee compensation.` +
        (missingTaxId
          ? ` No taxpayer identification number is held, which the bureau needs before it ` +
            `can file and which triggers backup withholding until it arrives.`
          : ''),
  }
}

export interface YearEndPack {
  year: number
  summaries: WageSummary[]
  w2Count: number
  necCount: number
  /** People with a real amount and no form, and why. */
  noForm: WageSummary[]
  /** People the bureau cannot file for without something we do not hold. */
  blocked: WageSummary[]
  totalReportableCents: number
  currency: string | null
  notice: string
  says: string
}

/** Everybody, one year, ready to hand over. */
export function yearEndPack(postings: PayPosting[], year: number): YearEndPack {
  const ids = [...new Set(postings.map((p) => p.personId))]
  const summaries = ids
    .map((id) => wageSummary(id, postings, year))
    .filter((s) => s.postings > 0)
    .sort((a, b) => (b.grossCents ?? 0) - (a.grossCents ?? 0))

  const w2 = summaries.filter((s) => s.form === 'W2')
  const nec = summaries.filter((s) => s.form === '1099_NEC')
  const noForm = summaries.filter((s) => s.form === 'NONE')
  const blocked = summaries.filter((s) => s.form !== 'NONE' && s.missingTaxId)

  const currencies = [...new Set(summaries.map((s) => s.currency).filter(Boolean))] as string[]
  const single = currencies.length === 1 ? currencies[0] : null
  const total = single
    ? [...w2, ...nec].reduce((n, s) => n + (s.grossCents ?? 0), 0)
    : 0

  return {
    year,
    summaries,
    w2Count: w2.length,
    necCount: nec.length,
    noForm,
    blocked,
    totalReportableCents: total,
    currency: single,
    notice: BUREAU_NOTICE,
    says:
      summaries.length === 0
        ? `Nothing was posted in ${year}.`
        : `${year}: ${w2.length} W-2${w2.length === 1 ? '' : 's'} and ${nec.length} ` +
          `1099-NEC${nec.length === 1 ? '' : 's'} for your bureau to issue` +
          (single ? `, ${cents(total)} ${single} reportable in total` : '') +
          `. ${noForm.length} ${noForm.length === 1 ? 'person needs' : 'people need'} no ` +
          `form, each for a stated reason.` +
          (blocked.length > 0
            ? ` ${blocked.length} cannot be filed until a taxpayer identification number is held.`
            : '') +
          ` ${BUREAU_NOTICE}`,
  }
}

/** The file the bureau ingests. One row per person, one year. */
export function yearEndCsv(pack: YearEndPack): string {
  const rows: string[][] = [
    ['# ' + BUREAU_NOTICE],
    ['person_id', 'name', 'tax_year', 'treatment', 'form', 'box', 'gross', 'currency', 'has_tax_id', 'note'],
    ...pack.summaries.map((s) => [
      s.personId,
      s.personName,
      String(s.year),
      s.treatment,
      s.form,
      s.box ?? '',
      s.grossCents == null ? '' : (s.grossCents / 100).toFixed(2),
      s.currency ?? '',
      s.missingTaxId ? 'no' : 'yes',
      s.says,
    ]),
  ]
  return rows.map((r) => r.map(cell).join(',')).join('\n')
}

// ── The deposit calendar ──────────────────────────────────────────────
//
// Also the bureau's job. We hold it because a firm that does not know
// when its own deposits fall due cannot tell whether the bureau is doing
// what it is paid for — and because the schedule follows from the wages
// we already have.
//
// Two schedules, chosen by a lookback at total tax liability. Monthly
// deposits by the 15th of the following month; semiweekly deposits on the
// Wednesday or Friday after the payday, depending which half of the week
// it fell in. Weekends and holidays push to the next business day.

export type DepositSchedule = 'MONTHLY' | 'SEMIWEEKLY'

/**
 * The lookback threshold, in cents.
 *
 * Fifty thousand dollars of employment tax liability in the lookback
 * period. At or below it, monthly; above it, semiweekly. It is a rule
 * with a number in it and the number is stated here rather than buried,
 * because it changes and somebody will have to find it.
 */
export const SEMIWEEKLY_THRESHOLD_CENTS = 5_000_000

export function depositSchedule(lookbackLiabilityCents: number): {
  schedule: DepositSchedule
  says: string
} {
  return lookbackLiabilityCents > SEMIWEEKLY_THRESHOLD_CENTS
    ? {
        schedule: 'SEMIWEEKLY',
        says:
          `${cents(lookbackLiabilityCents)} of employment tax in the lookback period, above ` +
          `the ${cents(SEMIWEEKLY_THRESHOLD_CENTS)} line, so deposits are semiweekly — ` +
          `Wednesday for a Wednesday-to-Friday payday, Friday for a Saturday-to-Tuesday one.`,
      }
    : {
        schedule: 'MONTHLY',
        says:
          `${cents(lookbackLiabilityCents)} of employment tax in the lookback period, at or ` +
          `under the ${cents(SEMIWEEKLY_THRESHOLD_CENTS)} line, so deposits are monthly — ` +
          `the 15th of the month after the wages were paid.`,
      }
}

/** Contract types whose pay is wages, and so sets an employment-tax deposit. */
export const WAGE_CONTRACT_TYPES = ['W2', 'C2H_W2'] as const

export interface PayDayRow {
  /** The scheduled pay day, already moved off a weekend by the generator (pay moves backward). */
  dueOn: Date
  /** When a run settled it: the day the wages were actually paid. */
  completedAt: Date | null
  contractType: string
}

export interface DepositPayDay {
  payDay: Date
  /** True where a run settled it; false where it is only scheduled. */
  paid: boolean
}

/**
 * The pay days a deposit deadline hangs off, for a year.
 *
 * A deposit follows the day wages are paid, and that is a pay day on the
 * line — a `SALARY_PAY` cycle — never the date an acceptance was posted.
 * Reading postings listed a deposit for every week of hours, Mondays for
 * a firm filing Monday weeks and Saturdays for one filing from Saturday,
 * for workers paid once a month.
 *
 * A settled pay day is dated the day the run paid it, which is the day
 * the worker's own page says. One not yet settled is dated when it is
 * due and says so, and is listed only once it is under a month away.
 * Corp-to-corp and 1099 payments are not wages and set no deposit.
 */
export function depositPayDays(rows: readonly PayDayRow[], year: number, today: Date, horizonDays = 31): DepositPayDay[] {
  const from = Date.UTC(year, 0, 1)
  const to = Date.UTC(year + 1, 0, 1)
  const horizon = today.getTime() + horizonDays * 86_400_000
  const seen = new Map<string, DepositPayDay>()
  for (const r of rows) {
    if (!(WAGE_CONTRACT_TYPES as readonly string[]).includes(r.contractType)) continue
    const at = r.completedAt ?? r.dueOn
    const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
    if (day.getTime() < from || day.getTime() >= to) continue
    if (!r.completedAt && day.getTime() > horizon) continue
    const k = `${isoDay(day)}|${r.completedAt ? 'paid' : 'due'}`
    if (!seen.has(k)) seen.set(k, { payDay: day, paid: r.completedAt != null })
  }
  return [...seen.values()].sort((a, b) => a.payDay.getTime() - b.payDay.getTime() || Number(b.paid) - Number(a.paid))
}

export interface DepositDeadline {
  payDay: Date
  schedule: DepositSchedule
  /** The statutory date before any business-day shift. */
  statutoryDue: Date
  /** The date the money actually has to be there. */
  dueOn: Date
  /** True where the statutory date fell on a weekend or a holiday. */
  shifted: boolean
  says: string
}

/**
 * When a deposit for a given payday falls due.
 *
 * Holidays are passed in rather than assumed. A federal holiday calendar
 * baked in here would be wrong for a firm operating anywhere else, and
 * this codebase already keeps holidays per company.
 */
export function depositDeadline(
  payDay: Date,
  schedule: DepositSchedule,
  holidays: readonly Date[] = []
): DepositDeadline {
  const statutory =
    schedule === 'MONTHLY'
      ? new Date(Date.UTC(payDay.getUTCFullYear(), payDay.getUTCMonth() + 1, 15))
      : semiweeklyDue(payDay)

  const dueOn = nextBusinessDay(statutory, holidays)
  const shifted = dueOn.getTime() !== statutory.getTime()

  return {
    payDay,
    schedule,
    statutoryDue: statutory,
    dueOn,
    shifted,
    says:
      `Wages paid ${plainDate(isoDay(payDay))} deposit by ${plainDate(isoDay(dueOn))}` +
      (shifted
        ? ` — the statutory date of ${plainDate(isoDay(statutory))} is not a business day, so it moves forward.`
        : '.') +
      ` ${BUREAU_NOTICE}`,
  }
}

/**
 * Semiweekly: Wednesday-to-Friday paydays deposit the following
 * Wednesday; Saturday-to-Tuesday paydays deposit the following Friday.
 */
function semiweeklyDue(payDay: Date): Date {
  const dow = payDay.getUTCDay() // 0 Sunday … 6 Saturday
  const wedToFri = dow >= 3 && dow <= 5
  const target = wedToFri ? 3 : 5 // Wednesday or Friday
  const d = new Date(payDay.getTime())
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (d.getUTCDay() !== target)
  return d
}

// Saturday and Sunday here are the bank's week, not the firm's days off:
// a firm with Friday off still deposits with the IRS on a Friday.
function nextBusinessDay(d: Date, holidays: readonly Date[]): Date {
  const stamps = new Set(holidays.map((h) => isoDay(h)))
  const out = new Date(d.getTime())
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6 || stamps.has(isoDay(out))) {
    out.setUTCDate(out.getUTCDate() + 1)
  }
  return out
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function cents(n: number): string {
  return `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}


// ── Wages a run paid with no posting behind them ─────────────────────

/** What processed runs paid one person in one year, from the runs' own lines. */
export interface RunPaidTotal {
  personId: string
  personName: string
  currency: string
  /** Exact, before rounding once at the end. */
  paidCents: number
}

/**
 * Blank the W-2 figure where the runs paid more than the postings hold.
 *
 * The W-2 reads wage postings, and a run pays from accepted hours. Where
 * a run paid days that have no wage posting behind them — every seeded
 * month on the demo, and any placement with no master contract to post
 * to — the posting total is short of what was paid. The tester read "2026
 * W-2 wages $720" for Helena Marsh, on assignment since March and paid
 * every month. A W-2 figure short by eleven months is a number nobody can
 * stand behind: it is shown as no figure, with the sentence saying what
 * the runs paid and what the postings hold, and it leaves the total.
 *
 * Pure: no database.
 */
export function blankShortWages(pack: YearEndPack, paidByRuns: readonly RunPaidTotal[]): {
  pack: YearEndPack
  short: { personId: string; personName: string; says: string }[]
} {
  const short: { personId: string; personName: string; says: string }[] = []
  const summaries = pack.summaries.map((s) => {
    if (s.form !== 'W2' || s.grossCents == null) return s
    const ran = paidByRuns.find((r) => r.personId === s.personId && r.currency === s.currency)
    if (!ran) return s
    const ranCents = Math.round(ran.paidCents)
    // A dollar of rounding between a run's per-rate total and the weekly postings is not a gap.
    if (ranCents <= s.grossCents + 100) return s
    const says =
      `Payroll runs paid ${s.personName} ${cents(ranCents)} ${s.currency} in ${pack.year}, and only ` +
      `${cents(s.grossCents)} has a wage posting behind it, so no W-2 figure is shown until the postings are complete.`
    short.push({ personId: s.personId, personName: s.personName, says })
    return { ...s, grossCents: null, says }
  })
  // People a run paid who have no posting at all.
  for (const r of paidByRuns) {
    if (pack.summaries.some((s) => s.personId === r.personId)) continue
    if (Math.round(r.paidCents) <= 0) continue
    short.push({
      personId: r.personId,
      personName: r.personName,
      says:
        `Payroll runs paid ${r.personName} ${cents(Math.round(r.paidCents))} ${r.currency} in ${pack.year} with no wage ` +
        `posting behind it, so there is no W-2 figure for them here yet.`,
    })
  }
  if (short.length === 0) return { pack, short }
  const w2 = summaries.filter((s) => s.form === 'W2')
  const nec = summaries.filter((s) => s.form === '1099_NEC')
  const total = pack.currency ? [...w2, ...nec].reduce((n, s) => n + (s.grossCents ?? 0), 0) : 0
  return {
    pack: {
      ...pack,
      summaries,
      totalReportableCents: total,
      says:
        pack.says +
        ` ${short.length} ${short.length === 1 ? 'person has' : 'people have'} no W-2 figure yet: the runs paid more than the wage postings hold.`,
    },
    short,
  }
}

// ── Which sheets a file window takes, and which of their days ─────────
//
// Decided 2026-10-06. A sheet is in the file when any of its days falls
// in the window, and only the days inside the window are paid. Picking a
// sheet by its last day missed a Sunday-to-Saturday week around a
// Monday-to-Friday window, and paid a whole week to the window it ended
// in. The week is still judged whole against the overtime line first;
// the window only chooses which of its days are on this file.

/** A calendar day as YYYY-MM-DD, in UTC. */
const dayKey = (d: Date): string => d.toISOString().slice(0, 10)

/** Whether a sheet has any day in the window. Days as YYYY-MM-DD, both ends inclusive. */
export function overlapsWindow(sheet: { periodStart: Date; periodEnd: Date }, from: string, to: string): boolean {
  return dayKey(sheet.periodStart) <= to && dayKey(sheet.periodEnd) >= from
}

/**
 * A pay cut kept to the days inside the window. Each week keeps what it
 * was judged to be as a whole — its hours filed, and whether it was
 * accepted under the line — and is paid only on its days in the window.
 * A week with no day in the window is dropped.
 */
export function cutInWindow(cut: PayCut, bands: readonly DayBands[], from: string, to: string): PayCut {
  const inside = (day: string) => day >= from && day <= to
  const days = cut.days.filter((d) => inside(d.day)).map((d) => ({ ...d }))
  const r2 = (n: number) => Math.round(n * 100) / 100

  const weeks: PayWeek[] = []
  for (const w of cut.weeks) {
    const mine = days.filter((d) => d.week === w.weekOf)
    if (mine.length === 0) continue
    weeks.push({
      ...w,
      regular: r2(mine.reduce((n, d) => n + d.regular, 0)),
      leave: r2(mine.reduce((n, d) => n + d.leave, 0)),
      over: r2(mine.reduce((n, d) => n + d.over, 0)),
    })
  }

  return {
    ...cut,
    days,
    weeks,
    filed: r2(bands.filter((d) => inside(d.day)).reduce((n, d) => n + d.regular + d.leave + d.over, 0)),
    paid: r2(days.reduce((n, d) => n + d.regular + d.leave + d.over, 0)),
  }
}
