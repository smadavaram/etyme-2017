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

export interface SheetAssertion {
  role: string
  /** A Prisma Decimal, a string or a number — read with Number(). */
  hours: unknown
  /** What the ledger recorded as the rate on the signature. */
  rateCents: number
}

export interface SheetToPrice {
  periodStart: Date
  periodEnd: Date
  /** The sheet's daily hours, `{ 'YYYY-MM-DD': hours }`, or null. */
  days: unknown
  /** LIVE assertions only. */
  assertions: SheetAssertion[]
}

export interface LineRates {
  /** The line's own column — the rate it started on. */
  openingRateCents: number
  /** Approved and proposed RateHistory rows for the line; only APPROVED ones price. */
  periods: RatePeriod[]
}

export interface PricedSheet {
  periodStart: Date
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
  pay: LineRates | null
}): SheetPricing {
  const payFromLine = input.pay != null && input.pay.openingRateCents > 0
  let billedHours = 0
  let billedCents = 0
  let paidHours = 0
  let paidCents = 0
  let payRateFromLedger = 0
  const sheets: PricedSheet[] = []

  for (const t of input.sheets) {
    const days = daysOf(t.days)
    let sheetBilledHours = 0
    let sheetBilledCents = 0
    let sheetPaidHours: number | null = null
    let sheetPaidCents: number | null = null
    let clientSigned = false
    let billSegments: RateSegment[] = []
    let paySegments: RateSegment[] = []

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
      if (a.role === 'EMPLOYER_ACCEPTANCE') {
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
    sheets.push({
      periodStart: t.periodStart,
      billedHours: sheetBilledHours,
      billedCents: sheetBilledCents,
      paidHours: sheetPaidHours,
      paidCents: sheetPaidCents,
      bothSigned: clientSigned && sheetPaidHours != null,
      billSegments,
      paySegments,
    })
  }

  return { billedHours, billedCents, paidHours, paidCents, payFromLine, payRateFromLedger, sheets }
}

export interface PlacementEarned {
  /** Hours the client approved, and what they bill at the rate on each day. */
  hoursBilled: number
  revenueCents: number
  /** Hours the employer accepted, and what they cost. Null where no buy line prices them. */
  hoursPaid: number
  costCents: number | null
  /** Revenue less cost over the weeks both sides signed. Null where it cannot be stood behind. */
  marginCents: number | null
  /** How many weeks the margin covers, and how many were left out because the employer has not accepted them. */
  marginWeeks: number
  weeksAwaitingPay: number
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
  pay: (LineRates & { currency: string }) | null
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

  const costRefusedBecause = input.pay == null
    ? 'No buy line behind this placement, so nothing here knows what it costs.'
    : !hasPayLine
      ? 'The buy line pays nothing on record. That is a missing rate, not a free placement.'
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

  const marginCents = marginRefusedBecause
    ? null
    : matched.reduce((n, s) => n + s.billedCents - (s.paidCents ?? 0), 0)

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
    marginCents,
    marginWeeks: marginCents == null ? 0 : matched.length,
    weeksAwaitingPay: awaiting,
    costRefusedBecause,
    marginRefusedBecause,
    payRateChangeSays: hasPayLine ? segmentsSay(paySegs, input.pay!.currency) : null,
    billRateChangeSays: segmentsSay(billSegs, input.bill.currency),
    says,
  }
}
