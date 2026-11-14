/**
 * What is still to pay in one pay period, and what was paid already.
 *
 * Found by hand (2026-11-14): week one of a two-week period was paid,
 * week two was accepted late, and the Payroll row, the pay file and cash
 * flow still read the whole period. A payroll provider paying from the
 * file would have paid week one twice, and cash flow counted it as due.
 *
 * The run pays each day's hours less what an earlier run paid on that
 * day, and each day's premium less the premium already paid on it
 * (app/api/payroll/run). This is that subtraction, for a reader that
 * shows it before the run. It prices nothing: the days come priced, at
 * the rate in force on the day worked, and the premium comes worked out
 * on the whole week. Rounding is the run's: straight time once per rate,
 * the premium once for the row.
 *
 * What was paid already is read off the paid book as the runs wrote it,
 * back pay included, so it can differ from the period's gross less what
 * is still to pay: a raise dated in the past is owed as back pay, never
 * hidden inside either figure.
 *
 * Pure: no database.
 */

import type { PaidBook } from '@/lib/payroll-paid'

/** One day's hours in the period at the rate in force that day, by `paidKey`. */
export interface PricedDay {
  key: string
  hours: number
  rateCents: number
}

/** One day's premium on hours over the line, exact, by `paidKey`. */
export interface PremiumDay {
  key: string
  hours: number
  premiumCents: number
}

export interface PayLeft {
  /** What earlier runs paid on these days; null where nothing was. */
  paid: { hours: number; grossCents: number } | null
  /** What a run would pay now. */
  toPay: {
    hours: number
    grossCents: number
    overtimeHours: number
    premiumCents: number
    /** Each rate and its hours still to pay, where more than one. */
    rates: { rateCents: number; hours: number }[] | null
    /** The one rate still to pay at, where there is one. */
    rateCents: number | null
  }
  /** True where some of the period was paid and some is still to pay. */
  part: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function payLeftInPeriod(
  days: readonly PricedDay[],
  premiums: readonly PremiumDay[],
  book: Pick<PaidBook, 'paid' | 'premiumHours' | 'entries'>,
): PayLeft {
  const byRate = new Map<number, number>()
  let paidHours = 0
  for (const d of days) {
    const before = book.paid.get(d.key) ?? 0
    const left = r2(d.hours - before)
    paidHours += Math.min(before, d.hours)
    if (left > 0) byRate.set(d.rateCents, (byRate.get(d.rateCents) ?? 0) + left)
  }

  let premiumExact = 0
  let overtimeHours = 0
  for (const p of premiums) {
    const unpaid = r2(p.hours - (book.premiumHours.get(p.key) ?? 0))
    if (unpaid <= 0 || p.hours <= 0) continue
    premiumExact += (p.premiumCents * unpaid) / p.hours
    overtimeHours += unpaid
  }

  // What the runs paid on these days, straight time and premium, back pay
  // included, rounded once.
  let paidCentsExact = 0
  const seen = new Set<string>()
  for (const k of [...days.map((d) => d.key), ...premiums.map((p) => p.key)]) {
    if (seen.has(k)) continue
    seen.add(k)
    const e = book.entries.get(k)
    if (e) paidCentsExact += e.straightCents + e.premiumCents
  }
  const paidCents = Math.round(paidCentsExact)

  const premiumCents = Math.round(premiumExact)
  const grossCents = [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(r2(h) * r), 0) + premiumCents
  const hours = r2([...byRate.values()].reduce((n, h) => n + h, 0))
  const rates = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rateCents, h]) => ({ rateCents, hours: r2(h) }))
  const paid = paidHours > 0 || paidCents > 0 ? { hours: r2(paidHours), grossCents: paidCents } : null
  return {
    paid,
    toPay: {
      hours,
      grossCents,
      overtimeHours: r2(overtimeHours),
      premiumCents,
      rates: rates.length > 1 ? rates : null,
      rateCents: rates.length === 1 ? rates[0].rateCents : null,
    },
    part: paid !== null && grossCents > 0,
  }
}

/**
 * The sentence on a row part paid: "Paid already: $800.00 for 40 hours.
 * Still to pay: $1,100.00 for 40 hours." Null where nothing was paid yet,
 * or nothing is left.
 */
export function partPaidSays(left: PayLeft, money: (cents: number) => string): string | null {
  if (!left.part || !left.paid) return null
  const h = (n: number) => `${n} hour${n === 1 ? '' : 's'}`
  return `Paid already: ${money(left.paid.grossCents)} for ${h(left.paid.hours)}. ` +
    `Still to pay: ${money(left.toPay.grossCents)} for ${h(left.toPay.hours)}.`
}

/**
 * What a Payroll row still owes, in minor units: what is still to pay
 * where the row says it, else its gross. What cash flow and the forecast
 * read, so a paid week is never counted as due.
 */
export function owedOnRow(row: { grossPay?: unknown; toPay?: { grossCents?: unknown } | null }): number {
  const left = row.toPay?.grossCents
  if (typeof left === 'number') return left
  return typeof row.grossPay === 'number' ? row.grossPay : 0
}
