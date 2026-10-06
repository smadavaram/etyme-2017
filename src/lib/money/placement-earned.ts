/**
 * What one placement has earned, cost and kept — every hour priced at the
 * rate in force on the day it was worked.
 *
 * ── The finding this closes ──────────────────────────────────────────
 *
 * The placement page priced cost as the hours accepted times the pay
 * line's own column, and revenue as the same hours times the sell line's
 * own column. A rate change is an approved RateHistory row and never an
 * edit to the line (lib/rate-line), so the column is the rate the line
 * *started* on. Rosa Delgado was raised from $66 to $70 on 29 July; the
 * page went on costing every week of hers at $66, so the weeks after the
 * raise were under-costed and her margin read four dollars an hour better
 * than it was for as long as she stayed. The profitability screen priced
 * the same weeks day by day and got the right figure, so one placement
 * had two margins two clicks apart.
 *
 * It was also one hours figure times two rates. Hours are a fact and
 * approvals are opinions about it: what the client approved is what is
 * billed, what the employer accepted is what is paid, and when the client
 * approves forty and the employer accepts thirty-eight the margin is
 * neither rate times one of those numbers.
 *
 * ── One reader ───────────────────────────────────────────────────────
 *
 * `priceSheets` is the pricing both screens use: `/api/profitability`
 * for the book and the placement page for one line. Each client-approved
 * week is priced on the sell line's rates by day, each employer-accepted
 * week on the buy line's rates by day (`priceByDay` in lib/contract-rate,
 * which also cuts a partial acceptance off the latest days first).
 *
 * `placementEarned` adds the refusals a single placement needs:
 *
 *   - no buy line, or one paying nothing on record: no cost and no
 *     margin. A hundred per cent margin is a missing link, never news;
 *   - billed in one currency and paid in another: no margin;
 *   - a week the client approved and the employer has not yet accepted
 *     is billed and not yet costed. The margin is taken over the weeks
 *     both sides have signed, and the sentence says how many were left
 *     out, so revenue less cost on the screen never pretends to be it.
 */

import { priceByDay, segmentsSay, type RatePeriod, type RateSegment } from '@/lib/contract-rate'
import { acceptanceForPay, payBands } from '@/lib/money/pay-hours'
import { sheetPay, overtimeSaysFor, type SheetWeek, type WageLine } from '@/lib/money/sheet-overtime'
import type { OvertimeMethod } from '@/lib/money/overtime-method'
import { totals } from '@/lib/money-display'
import { plainDate } from '@/lib/plain-date'
import { weekStart } from '@/lib/overtime'

export interface SheetAssertion {
  role: string
  /** A Prisma Decimal, a string or a number — read with Number(). */
  hours: unknown
  /** What the ledger recorded as the rate on the signature. */
  rateCents: number
  /** Who signed, and which days an acceptance covers — what payroll reads to cut a week. */
  companyId?: string
  coversFrom?: Date | null
  coversTo?: Date | null
}

export interface SheetToPrice {
  periodStart: Date
  periodEnd: Date
  /** The sheet's daily hours, `{ 'YYYY-MM-DD': hours }`, or null. */
  days: unknown
  /** LIVE assertions only. */
  assertions: SheetAssertion[]
  /** Paid leave among `days`, `{ 'YYYY-MM-DD': hours }`. Leave is paid and never crosses the overtime line. */
  leaveDays?: unknown
  /** The column that predates the ledger, read by payroll where no assertion carries the figure. */
  acceptedHours?: unknown
}

/**
 * What payroll needs to pay a week the way the run pays it: the weekly
 * line, the overtime method, the wage facts and the firm that pays.
 * Read by `placementPayTerms` (lib/money/placement-pay-terms) through the
 * same functions the payroll run calls, so nothing here restates them.
 */
export interface PayOvertime {
  /** The weekly line in force (`payLineOn`); null draws no line. */
  afterHours: number | null
  method: OvertimeMethod
  wage: WageLine
  /** The paying firm: where it has an acceptance of its own on a week, that one governs. */
  payerCompanyId: string | null
}

export interface LineRates {
  /** The line's own column — the rate it started on. */
  openingRateCents: number
  /** Approved and proposed RateHistory rows for the line; only APPROVED ones price. */
  periods: RatePeriod[]
}

export interface PricedSheet {
  periodStart: Date
  /** Of `paidCents`, the overtime premium payroll pays on the hours over the line. */
  premiumCents: number
  /** More than one acceptance stands on the week, so payroll pays none of it and neither is it costed. */
  manyAcceptances: boolean
  billedHours: number
  billedCents: number
  /** Null where the employer has not accepted this week. */
  paidHours: number | null
  paidCents: number | null
  /** True where both the client approved and the employer accepted. */
  bothSigned: boolean
  billSegments: RateSegment[]
  paySegments: RateSegment[]
}

export interface SheetPricing {
  billedHours: number
  billedCents: number
  paidHours: number
  paidCents: number
  /** True where pay was priced from the buy line; false where the ledger's own figure was all there was. */
  payFromLine: boolean
  /** The last rate the ledger recorded on an acceptance, for a placement with no buy line. */
  payRateFromLedger: number
  /** Of `paidCents`, the overtime premium, and the hours it is paid on. Nought where no overtime terms were given. */
  premiumCents: number
  overtimeHours: number
  /** Every week that went over the line as payroll pays it, for the sentence. */
  overtimeWeeks: SheetWeek[]
  sheets: PricedSheet[]
}

const daysOf = (d: unknown): Record<string, number> =>
  d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, number>) : {}

/**
 * Every week on a placement, billed at the sell line's rate on each day
 * the client approved and paid at the buy line's rate on each day the
 * employer accepted.
 *
 * `pay` null, or opening at nothing, means no buy line prices this
 * placement: the ledger's own acceptance rate is used, as the
 * profitability screen always has, and `payFromLine` says so for a
 * caller to decide how far to trust it.
 */
export function priceSheets(input: {
  sheets: SheetToPrice[]
  bill: LineRates
  pay: (LineRates & { overtime?: PayOvertime | null }) | null
}): SheetPricing {
  const payFromLine = input.pay != null && input.pay.openingRateCents > 0
  const overtime = payFromLine ? input.pay!.overtime ?? null : null
  let billedHours = 0
  let billedCents = 0
  let paidHours = 0
  let paidCents = 0
  let payRateFromLedger = 0
  let premiumCents = 0
  let overtimeHours = 0
  const overtimeWeeks: SheetWeek[] = []
  const sheets: PricedSheet[] = []

  for (const t of input.sheets) {
    const days = daysOf(t.days)
    let sheetBilledHours = 0
    let sheetBilledCents = 0
    let sheetPaidHours: number | null = null
    let sheetPaidCents: number | null = null
    let sheetPremiumCents = 0
    let manyAcceptances = false
    let clientSigned = false
    let billSegments: RateSegment[] = []
    let paySegments: RateSegment[] = []

    // Cost as payroll pays it: the week cut the way the run cuts it, the
    // straight time on the days left at each day's rate, and the premium
    // on the hours over the line — `sheetPay`, the run's own call.
    if (overtime && t.assertions.some((a) => a.role === 'EMPLOYER_ACCEPTANCE')) {
      const acceptance = acceptanceForPay(t.assertions, t, overtime.payerCompanyId)
      if (acceptance === 'MANY') {
        manyAcceptances = true
      } else if (Object.keys(days).length === 0) {
        // No days to band, so nothing can cross a line: straight time on
        // the hours accepted, the way payroll pays such a week.
        const priced = priceByDay({
          contractRateCents: input.pay!.openingRateCents, periods: input.pay!.periods,
          days, hours: acceptance ? acceptance.hours : null, periodStart: t.periodStart, periodEnd: t.periodEnd,
        })
        sheetPaidHours = priced.hours
        sheetPaidCents = priced.cents
        paySegments = priced.segments
      } else {
        const pay = sheetPay({
          days,
          leaveDays: daysOf(t.leaveDays),
          afterHours: overtime.afterHours,
          accepted: acceptance,
          contractRateCents: input.pay!.openingRateCents,
          periods: input.pay!.periods,
          method: overtime.method,
          line: overtime.wage,
        })
        const straight = priceByDay({
          contractRateCents: input.pay!.openingRateCents, periods: input.pay!.periods,
          days: pay.days, hours: null, periodStart: t.periodStart, periodEnd: t.periodEnd,
        })
        const exact = [...pay.premiums.values()].reduce((n, p) => n + p.premiumCents, 0)
        sheetPremiumCents = Math.round(exact)
        overtimeHours += [...pay.premiums.values()].reduce((n, p) => n + p.hours, 0)
        overtimeWeeks.push(...pay.weeks)
        sheetPaidHours = straight.hours
        sheetPaidCents = straight.cents + sheetPremiumCents
        paySegments = straight.segments
      }
    }

    for (const a of t.assertions) {
      const h = Number(a.hours)
      if (!Number.isFinite(h)) continue
      if (a.role === 'CLIENT_APPROVAL') {
        clientSigned = true
        const priced = priceByDay({
          contractRateCents: input.bill.openingRateCents, periods: input.bill.periods,
          days, hours: h, periodStart: t.periodStart, periodEnd: t.periodEnd,
        })
        sheetBilledHours += h
        sheetBilledCents += priced.cents
        billSegments = billSegments.concat(priced.segments)
      }
      if (a.role === 'EMPLOYER_ACCEPTANCE' && !overtime) {
        let cents: number
        if (payFromLine) {
          const priced = priceByDay({
            contractRateCents: input.pay!.openingRateCents, periods: input.pay!.periods,
            days, hours: h, periodStart: t.periodStart, periodEnd: t.periodEnd,
          })
          cents = priced.cents
          paySegments = paySegments.concat(priced.segments)
        } else {
          payRateFromLedger = a.rateCents || payRateFromLedger
          cents = Math.round(h * a.rateCents)
        }
        sheetPaidHours = (sheetPaidHours ?? 0) + h
        sheetPaidCents = (sheetPaidCents ?? 0) + cents
      }
    }

    billedHours += sheetBilledHours
    billedCents += sheetBilledCents
    paidHours += sheetPaidHours ?? 0
    paidCents += sheetPaidCents ?? 0
    premiumCents += sheetPremiumCents
    sheets.push({
      periodStart: t.periodStart,
      premiumCents: sheetPremiumCents,
      manyAcceptances,
      billedHours: sheetBilledHours,
      billedCents: sheetBilledCents,
      paidHours: sheetPaidHours,
      paidCents: sheetPaidCents,
      bothSigned: clientSigned && sheetPaidHours != null,
      billSegments,
      paySegments,
    })
  }

  return {
    billedHours, billedCents, paidHours: Math.round(paidHours * 100) / 100, paidCents, payFromLine, payRateFromLedger,
    premiumCents, overtimeHours: Math.round(overtimeHours * 100) / 100, overtimeWeeks, sheets,
  }
}

/**
 * The hours signed on a placement, over every sheet it has: what the
 * client approved and what the employer accepted. The header of a
 * placement reads this, never a sum over the dozen weeks on its card —
 * a total of the last twelve weeks shown as the placement's is the
 * figure that read 477 beside a money line pricing 1,221.
 */
export function hoursSigned(sheets: ReadonlyArray<Pick<SheetToPrice, 'assertions'>>): { approved: number; accepted: number } {
  let approved = 0
  let accepted = 0
  for (const t of sheets) {
    for (const a of t.assertions) {
      const h = Number(a.hours)
      if (!Number.isFinite(h)) continue
      if (a.role === 'CLIENT_APPROVAL') approved += h
      if (a.role === 'EMPLOYER_ACCEPTANCE') accepted += h
    }
  }
  return { approved: Math.round(approved * 100) / 100, accepted: Math.round(accepted * 100) / 100 }
}

/**
 * The first accepted week that went over forty hours worked, where the
 * pay line's overtime terms were not read. The law's forty, because a
 * nonexempt US worker is owed a premium past it whatever the contract
 * says; a line drawn lower is exactly what was not read.
 */
function overFortyUnread(sheets: SheetToPrice[]): string | null {
  for (const t of sheets) {
    if (!t.assertions.some((a) => a.role === 'EMPLOYER_ACCEPTANCE')) continue
    const over = payBands(daysOf(t.days), daysOf(t.leaveDays), 40).find((d) => d.over > 0)
    if (over) return weekStart(over.day)
  }
  return null
}

export interface PlacementEarned {
  /** Hours the client approved, and what they bill at the rate on each day. */
  hoursBilled: number
  revenueCents: number
  /** Hours the employer accepted, and what they cost. Null where no buy line prices them. */
  hoursPaid: number
  costCents: number | null
  /** Employer burden on the cost, where a burden rate was given. Null where the cost is. */
  burdenCents: number | null
  /** Revenue less cost, and burden where given, over the weeks both sides signed. Null where it cannot be stood behind. */
  marginCents: number | null
  /** The revenue of the weeks the margin covers — its denominator. Null where the margin is. */
  marginRevenueCents: number | null
  /** How many weeks the margin covers, and how many were left out because the employer has not accepted them. */
  marginWeeks: number
  weeksAwaitingPay: number
  /** Of the cost, the overtime premium payroll pays, and the hours over the line it is on. */
  overtimePremiumCents: number
  overtimeHours: number
  /** What the premium in the cost is, in a sentence. Null where no week went over the line. */
  overtimeSays: string | null
  /** Why the cost is blank, where it is. */
  costRefusedBecause: string | null
  /** Why the margin is blank, where it is. */
  marginRefusedBecause: string | null
  /** Where a rate changed inside the hours priced, the pay line's runs of days in a sentence. */
  payRateChangeSays: string | null
  billRateChangeSays: string | null
  /** One sentence about the figure, or null where there is nothing to add. */
  says: string | null
}

function mergeSegments(segments: RateSegment[]): RateSegment[] {
  const sorted = [...segments].sort((a, b) => a.from.localeCompare(b.from))
  const out: RateSegment[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && last.rateCents === s.rateCents) {
      last.to = s.to > last.to ? s.to : last.to
      last.hours = Math.round((last.hours + s.hours) * 100) / 100
      last.cents += s.cents
    } else {
      out.push({ ...s })
    }
  }
  return out
}

/**
 * One placement's revenue, cost and margin, each hour at its day's rate.
 *
 * `pay` is the buy line that funds this sell line (the `ContractLink`
 * pair), with this person's own opening rate. Null where there is none.
 */
export function placementEarned(input: {
  sheets: SheetToPrice[]
  bill: LineRates & { currency: string }
  /**
   * `overtime` is how payroll pays the line (`placementPayTerms`). Where
   * it is absent the straight time is priced and, if any accepted week
   * went over forty hours, the cost is refused rather than shown short.
   */
  pay: (LineRates & { currency: string; overtime?: PayOvertime | null }) | null
  /**
   * Employer burden as a share of pay, where the firm employs the person
   * at hop 0 (`burdenRate` in lib/order-postings, which is what the books
   * post). Absent or nought on a line bought in from a supplier, which
   * carries the burden on its own people. Each week's burden is rounded on
   * its own, the way the books post it, so the two agree to the cent.
   */
  burdenRate?: number | null
}): PlacementEarned {
  const hasPayLine = input.pay != null && input.pay.openingRateCents > 0
  const priced = priceSheets({
    sheets: input.sheets,
    bill: input.bill,
    // Only a real pay line prices cost here. The ledger's fallback is the
    // book's business, where `costKnown` carries the doubt; on one
    // placement a cost with no line behind it is not a cost.
    pay: hasPayLine ? input.pay : null,
  })

  const unreadWeek = hasPayLine && !input.pay!.overtime ? overFortyUnread(input.sheets) : null
  const many = priced.sheets.filter((s) => s.manyAcceptances)
  const costRefusedBecause = input.pay == null
    ? 'No buy line behind this placement, so nothing here knows what it costs.'
    : !hasPayLine
      ? 'The buy line pays nothing on record. That is a missing rate, not a free placement.'
      : unreadWeek
        ? `More than forty hours were worked in the week of ${plainDate(unreadWeek)}, and how this pay line prices ` +
          'overtime was not read, so the cost is left blank rather than shown at straight time.'
        : many.length > 0
          ? `The week of ${plainDate(many[0].periodStart.toISOString())} has more than one acceptance standing and ` +
            'nothing says which governs, so payroll pays none of it yet. The cost is blank until one is withdrawn.'
          : null

  const costCents = costRefusedBecause ? null : priced.paidCents

  const matched = priced.sheets.filter((s) => s.bothSigned)
  const awaiting = priced.sheets.filter((s) => s.billedHours > 0 && s.paidHours == null).length

  let marginRefusedBecause: string | null = costRefusedBecause
  if (!marginRefusedBecause && input.pay && input.bill.currency !== input.pay.currency) {
    marginRefusedBecause =
      `Billed in ${input.bill.currency} and paid in ${input.pay.currency}. One cannot be subtracted from the other.`
  }
  if (!marginRefusedBecause && matched.length === 0) {
    marginRefusedBecause = priced.sheets.length === 0
      ? 'No hours have been signed on this placement yet.'
      : 'No week has been both approved by the client and accepted by the employer yet.'
  }

  const rate = input.burdenRate && input.burdenRate > 0 ? input.burdenRate : 0
  const burdenOf = (s: PricedSheet) => (s.paidCents == null ? 0 : Math.round(s.paidCents * rate))
  const burdenCents = costCents == null ? null : priced.sheets.reduce((n, s) => n + burdenOf(s), 0)

  const marginCents = marginRefusedBecause
    ? null
    : matched.reduce((n, s) => n + s.billedCents - (s.paidCents ?? 0) - burdenOf(s), 0)

  const paySegs = mergeSegments(priced.sheets.flatMap((s) => s.paySegments))
  const billSegs = mergeSegments(priced.sheets.flatMap((s) => s.billSegments))

  const says = marginCents != null && awaiting > 0
    ? `The margin covers the ${matched.length} week${matched.length === 1 ? '' : 's'} both sides have signed. ` +
      `${awaiting} week${awaiting === 1 ? ' is' : 's are'} approved by the client and not yet accepted for pay, so ` +
      `${awaiting === 1 ? 'it is' : 'they are'} billed and not yet costed.`
    : null

  return {
    hoursBilled: priced.billedHours,
    revenueCents: priced.billedCents,
    hoursPaid: priced.paidHours,
    costCents,
    burdenCents,
    marginCents,
    marginRevenueCents: marginCents == null ? null : matched.reduce((n, s) => n + s.billedCents, 0),
    marginWeeks: marginCents == null ? 0 : matched.length,
    weeksAwaitingPay: awaiting,
    overtimePremiumCents: costCents == null ? 0 : priced.premiumCents,
    overtimeHours: costCents == null ? 0 : priced.overtimeHours,
    overtimeSays: costCents == null ? null : overtimeSaid(priced, input.pay!.currency),
    costRefusedBecause,
    marginRefusedBecause,
    payRateChangeSays: hasPayLine ? segmentsSay(paySegs, input.pay!.currency) : null,
    billRateChangeSays: segmentsSay(billSegs, input.bill.currency),
    says,
  }
}

/** The premium inside the cost, in a sentence, with the run's own words for the weeks. */
function overtimeSaid(priced: SheetPricing, currency: string): string | null {
  const weeks = overtimeSaysFor(priced.overtimeWeeks)
  if (!weeks) return null
  return priced.premiumCents > 0
    ? `The cost includes ${totals([{ minor: priced.premiumCents, currency }])} of overtime premium, as payroll pays it. ${weeks}`
    : weeks
}
