import { prisma } from '@/lib/db'
import { rateInForce, ratePeriods, type RateRow } from '@/lib/contract-rate'
import { weekStart, weekEnd } from '@/lib/overtime'
import { iso } from '@/lib/periods'
import { formatRange } from '@/lib/format-date'
import { weeksLineOf } from '@/lib/money/weeks-read'
import { billCountsAsBilled, billIsDraftedNotSent } from '@/lib/money/order-ledger'

/**
 * Signed, billed, and signed-and-not-billed: one reader, per sell line.
 *
 * ── The fault this exists for ────────────────────────────────────────
 *
 * The founder's scale audit, 2026-11-08. Rosa Delgado had 1,181 hours
 * signed by Northbend and 80 billed; the $123,312 of signed time between
 * them was totaled nowhere. Talvern's Marta and Adaeze read $0 invoiced
 * against weeks their client had signed. And Brightmoor's Today page put
 * $138,212 of unbilled time beside two draft bills whose totals were
 * $14,900, so the draft numbers read as the figure.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 *   Signed   = hours the client signed at the top (the live
 *              CLIENT_APPROVAL), on the weeks this line bills: its own
 *              where the person is its own, the bottom rung's where a
 *              supplier stands between (lib/money/weeks-read).
 *   Billed   = hours and money on this line's bills that were sent
 *              (lib/money/order-ledger's `billCountsAsBilled`, the same
 *              rule an order's Billed reads). A draft is not billed.
 *   Signed and not billed = Signed − Billed, week by week. A week a draft
 *              holds is in it, and says which draft and what that draft
 *              holds for it: never the draft's number as the total.
 *
 * Money is in the line's own currency, never added across currencies. A
 * week a draft holds is valued at what the draft priced it; any other is
 * valued at the rate in force on the week's first day, straight time,
 * and the basis says so once. Hours over the 40-hour week are counted in
 * `overLineHours`, because the bill decides whether they carry a premium
 * and this figure does not guess it.
 *
 * Aging is by week: how many whole weeks since the Saturday that ended
 * the week, in five bands.
 *
 * `lineBillingFrom` is the arithmetic and has no database; `signedAndBilled`
 * is the read.
 */

export const STRAIGHT_TIME_WEEK = 40

/** Said once beside any figure this reader prices. */
export const UNBILLED_BASIS =
  'Signed and not billed: each week the client signed that no sent bill carries, at the rate in force that week, ' +
  'straight time. A week on a draft is valued at what the draft priced it. A draft is not billed until it is sent.'

export const AGE_BANDS = ['1 week or less', '2 to 4 weeks', '5 to 8 weeks', '9 to 13 weeks', 'Over 13 weeks'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

export function ageBand(weeks: number): AgeBand {
  if (weeks <= 1) return AGE_BANDS[0]
  if (weeks <= 4) return AGE_BANDS[1]
  if (weeks <= 8) return AGE_BANDS[2]
  if (weeks <= 13) return AGE_BANDS[3]
  return AGE_BANDS[4]
}

const A_DAY = 86_400_000

/** Whole weeks between the Saturday that ended a week and today. Never below nought. */
export function ageInWeeks(weekEndIso: string, today: Date): number {
  const end = Date.parse(`${weekEndIso}T00:00:00Z`)
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.max(0, Math.floor((day - end) / (7 * A_DAY)))
}

// ── Inputs to the arithmetic ─────────────────────────────────────────

export interface SheetIn {
  timesheetId: string
  periodStart: Date
  /** Hours the client signed; null where nobody has signed the week at the top. */
  signedHours: number | null
}

export interface BillLineIn {
  timesheetId: string | null
  hours: number
  amountMinor: number
  invoice: { id: string; number: string; status: string; currency: string }
}

export interface LineIn {
  sellContractId: string
  personId: string
  personName: string
  currency: string
  /** The line's own rate, minor units an hour. */
  rateMinor: number
  rates: RateRow[]
  sheets: SheetIn[]
  /** Invoice lines on this sell line. Lines with no week (an expense, a milestone) are left out of hours. */
  billLines: BillLineIn[]
}

// ── Output ───────────────────────────────────────────────────────────

export interface UnbilledWeek {
  timesheetId: string
  week: { start: string; end: string; says: string }
  signedHours: number
  /** Hours of the week a sent bill already carries. */
  billedHours: number
  /** Signed − billed. */
  hours: number
  /** Of those, hours over the 40-hour week. */
  overLineHours: number
  /** What it is worth: the draft's figure where a draft holds it, else hours × rate, straight time. */
  amountMinor: number
  /** A draft holding this week, and what it holds for it. */
  onDraft: { invoiceId: string; number: string; status: string; hours: number; amountMinor: number } | null
  ageWeeks: number
  band: AgeBand
}

export interface LineBilling {
  sellContractId: string
  personId: string
  personName: string
  currency: string
  signed: { hours: number; weeks: number }
  billed: { hours: number; amountMinor: number }
  drafted: { hours: number; amountMinor: number; bills: { invoiceId: string; number: string; status: string; hours: number; amountMinor: number }[] }
  notBilled: {
    hours: number
    amountMinor: number
    overLineHours: number
    /** Of the not-billed hours, those a draft holds. */
    onDraftHours: number
    weeks: UnbilledWeek[]
    aging: { band: AgeBand; weeks: number; hours: number; amountMinor: number }[]
  }
  /** A sentence naming what is not billed; null where everything signed is billed. */
  says: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Pure: one line's signed, billed and signed-and-not-billed, its weeks aged. */
export function lineBillingFrom(line: LineIn, today: Date): LineBilling {
  const ccy = line.currency.toUpperCase()
  const periods = ratePeriods(line.rates)
  const hourLines = line.billLines.filter((b) => b.timesheetId)
  const sent = hourLines.filter((b) => billCountsAsBilled(b.invoice.status) && b.invoice.currency.toUpperCase() === ccy)
  const drafts = hourLines.filter((b) => billIsDraftedNotSent(b.invoice.status) && b.invoice.currency.toUpperCase() === ccy)

  const draftBills = new Map<string, { invoiceId: string; number: string; status: string; hours: number; amountMinor: number }>()
  for (const d of drafts) {
    const at = draftBills.get(d.invoice.id) ?? { invoiceId: d.invoice.id, number: d.invoice.number, status: d.invoice.status, hours: 0, amountMinor: 0 }
    at.hours = round2(at.hours + d.hours)
    at.amountMinor += d.amountMinor
    draftBills.set(d.invoice.id, at)
  }

  const signedSheets = line.sheets.filter((s) => s.signedHours != null)
  const weeks: UnbilledWeek[] = []
  for (const s of [...signedSheets].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())) {
    const signed = s.signedHours ?? 0
    const billedHours = round2(sent.filter((b) => b.timesheetId === s.timesheetId).reduce((n, b) => n + b.hours, 0))
    const hours = round2(Math.max(0, signed - billedHours))
    if (hours <= 0) continue
    const start = weekStart(iso(s.periodStart))
    const end = weekEnd(start)
    const onThisWeek = drafts.filter((d) => d.timesheetId === s.timesheetId)
    const draftHours = round2(onThisWeek.reduce((n, d) => n + d.hours, 0))
    const draftMinor = onThisWeek.reduce((n, d) => n + d.amountMinor, 0)
    const rate = rateInForce(line.rateMinor, periods, new Date(`${start}T00:00:00Z`)).rateCents
    // What the draft does not hold is valued at the rate, straight time.
    const rest = round2(Math.max(0, hours - draftHours))
    const amountMinor = draftMinor + Math.round(rest * rate)
    const first = onThisWeek[0]?.invoice
    const age = ageInWeeks(end, today)
    weeks.push({
      timesheetId: s.timesheetId,
      week: { start, end, says: formatRange(start, end) },
      signedHours: signed,
      billedHours,
      hours,
      overLineHours: round2(Math.min(hours, Math.max(0, signed - STRAIGHT_TIME_WEEK))),
      amountMinor,
      onDraft: first ? { invoiceId: first.id, number: first.number, status: first.status, hours: draftHours, amountMinor: draftMinor } : null,
      ageWeeks: age,
      band: ageBand(age),
    })
  }

  const aging = AGE_BANDS.map((band) => {
    const inBand = weeks.filter((w) => w.band === band)
    return {
      band,
      weeks: inBand.length,
      hours: round2(inBand.reduce((n, w) => n + w.hours, 0)),
      amountMinor: inBand.reduce((n, w) => n + w.amountMinor, 0),
    }
  })

  const notBilledHours = round2(weeks.reduce((n, w) => n + w.hours, 0))
  const onDraftHours = round2(weeks.reduce((n, w) => n + Math.min(w.hours, w.onDraft?.hours ?? 0), 0))
  const notBilled = {
    hours: notBilledHours,
    amountMinor: weeks.reduce((n, w) => n + w.amountMinor, 0),
    overLineHours: round2(weeks.reduce((n, w) => n + w.overLineHours, 0)),
    onDraftHours,
    weeks,
    aging,
  }
  const says = weeks.length === 0
    ? null
    : `${weeks.length} signed week${weeks.length === 1 ? '' : 's'} of ${line.personName}’s ` +
      `${weeks.length === 1 ? 'is' : 'are'} not on a sent bill, ${notBilledHours} hours` +
      (onDraftHours > 0 ? `, ${onDraftHours} of them on a draft nobody has sent` : '') + '.'

  return {
    sellContractId: line.sellContractId,
    personId: line.personId,
    personName: line.personName,
    currency: ccy,
    signed: { hours: round2(signedSheets.reduce((n, s) => n + (s.signedHours ?? 0), 0)), weeks: signedSheets.length },
    billed: { hours: round2(sent.reduce((n, b) => n + b.hours, 0)), amountMinor: sent.reduce((n, b) => n + b.amountMinor, 0) },
    drafted: {
      hours: round2(drafts.reduce((n, b) => n + b.hours, 0)),
      amountMinor: drafts.reduce((n, b) => n + b.amountMinor, 0),
      bills: [...draftBills.values()],
    },
    notBilled,
    says,
  }
}

/** Pure: lines rolled up one currency at a time, never added across currencies. */
export function rollUp(lines: readonly LineBilling[]): {
  currency: string
  signedHours: number
  billedHours: number
  billedMinor: number
  notBilledHours: number
  notBilledMinor: number
  onDraftHours: number
  aging: { band: AgeBand; weeks: number; hours: number; amountMinor: number }[]
}[] {
  const by = new Map<string, ReturnType<typeof rollUp>[number]>()
  for (const l of lines) {
    const t = by.get(l.currency) ?? {
      currency: l.currency, signedHours: 0, billedHours: 0, billedMinor: 0, notBilledHours: 0, notBilledMinor: 0, onDraftHours: 0,
      aging: AGE_BANDS.map((band) => ({ band, weeks: 0, hours: 0, amountMinor: 0 })),
    }
    t.signedHours = round2(t.signedHours + l.signed.hours)
    t.billedHours = round2(t.billedHours + l.billed.hours)
    t.billedMinor += l.billed.amountMinor
    t.notBilledHours = round2(t.notBilledHours + l.notBilled.hours)
    t.notBilledMinor += l.notBilled.amountMinor
    t.onDraftHours = round2(t.onDraftHours + l.notBilled.onDraftHours)
    for (const a of l.notBilled.aging) {
      const at = t.aging.find((x) => x.band === a.band)!
      at.weeks += a.weeks
      at.hours = round2(at.hours + a.hours)
      at.amountMinor += a.amountMinor
    }
    by.set(l.currency, t)
  }
  return [...by.values()]
}

// ── The read ─────────────────────────────────────────────────────────

/**
 * Signed, billed and signed-and-not-billed for each of these sell lines.
 * Reads only. A line that does not exist is absent from the map. The
 * caller decides who may read it; nothing here checks a seat.
 */
export async function signedAndBilled(sellContractIds: readonly string[], today: Date = new Date()): Promise<Map<string, LineBilling>> {
  const ids = [...new Set(sellContractIds)]
  const out = new Map<string, LineBilling>()
  if (ids.length === 0) return out
  const [lines, weekLine] = await Promise.all([
    prisma.sellContract.findMany({
      where: { id: { in: ids } },
      select: { id: true, billRate: true, billCurrency: true, person: { select: { id: true, name: true } } },
    }),
    weeksLineOf(ids),
  ])
  const filedOn = [...new Set(weekLine.values())]
  const [sheets, billLines, rates] = await Promise.all([
    prisma.timesheet.findMany({
      where: { sellContractId: { in: filedOn } },
      select: {
        id: true, sellContractId: true, periodStart: true,
        assertions: { where: { role: 'CLIENT_APPROVAL', state: 'LIVE' }, select: { hours: true }, take: 1 },
      },
    }),
    prisma.invoiceLine.findMany({
      where: { sellContractId: { in: ids } },
      select: {
        sellContractId: true, timesheetId: true, hours: true, amountCents: true,
        invoice: { select: { id: true, number: true, status: true, currency: true } },
      },
    }),
    prisma.rateHistory.findMany({
      where: { contractType: 'SELL', contractId: { in: ids } },
      select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    }),
  ])
  for (const l of lines) {
    const filed = weekLine.get(l.id) ?? l.id
    out.set(l.id, lineBillingFrom({
      sellContractId: l.id,
      personId: l.person.id,
      personName: l.person.name,
      currency: (l.billCurrency || 'USD').toUpperCase(),
      rateMinor: l.billRate,
      rates: rates.filter((r) => r.contractId === l.id),
      sheets: sheets
        .filter((s) => s.sellContractId === filed)
        .map((s) => ({
          timesheetId: s.id,
          periodStart: s.periodStart,
          signedHours: s.assertions[0] ? Number(s.assertions[0].hours) : null,
        })),
      billLines: billLines
        .filter((b) => b.sellContractId === l.id)
        .map((b) => ({ timesheetId: b.timesheetId, hours: Number(b.hours), amountMinor: b.amountCents, invoice: b.invoice })),
    }, today))
  }
  return out
}
