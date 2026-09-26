import { fromMinor, format, formatRate as fmtRate, minorPerUnit, type Money } from '@/lib/money'

/**
 * Money on screen.
 *
 * Every dashboard page had grown its own version of this — nine local
 * helpers under six different names, each dividing by a hundred. This is
 * the one they all use now.
 *
 * Amounts arriving from the API are in minor units, because that is how the
 * database holds them.
 */

/**
 * Used where an endpoint does not yet return the currency alongside the
 * amount.
 *
 * This is a known gap, not a decision. It is a named constant rather than
 * a literal so it can be found: `grep DEFAULT_CURRENCY` lists every screen
 * still guessing, and each one is fixed by having its endpoint send the
 * currency it already stores. The schema has eleven currency fields, so the
 * data is there — it just is not being carried through yet.
 */
export const DEFAULT_CURRENCY = 'USD'

/** "$1,040.00" — a total, an invoice, a budget. */
export function amount(minor: number | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  if (minor == null) return '—'
  return format(fromMinor(minor, currency))
}

/** "$130" — dense, for tables. Drops the decimals when they are zeroes. */
export function compact(minor: number | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  if (minor == null) return '—'
  return format(fromMinor(minor, currency), { compact: true })
}

/** "$130/hr" — the commonest thing this product shows. */
export function rate(
  minor: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  per: string = 'hr'
): string {
  if (minor == null) return '—'
  return fmtRate(fromMinor(minor, currency), per)
}

/**
 * "$90–$110/hr" — a band.
 *
 * A band with one end missing is shown as the end that exists, because
 * "$90–—" reads as broken rather than as open-ended.
 */
export function range(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  per: string = 'hr'
): string {
  if (min == null && max == null) return 'Not stated'
  if (min == null) return `up to ${rate(max, currency, per)}`
  if (max == null) return `from ${rate(min, currency, per)}`
  return `${compact(min, currency)}–${rate(max, currency, per)}`
}

/**
 * "$1,040" — for amounts arriving as WHOLE currency units.
 *
 * Invoice.total and Payment.amount are Decimal columns in whole currency,
 * unlike the rate columns which are minor units. Both shapes exist in the
 * schema, so both have a named helper — the failure mode is a screen
 * guessing which one it has.
 */
export function fromUnits(value: number | null | undefined, currency: string = DEFAULT_CURRENCY): string {
  if (value == null) return '—'
  return format(fromMinor(Math.round(value * minorPerUnit(currency)), currency), { compact: true })
}

/** For a value already carrying its currency. */
export function show(m: Money): string {
  return format(m)
}

/**
 * Several amounts as one phrase — and never as one number when they are
 * in more than one currency.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * A payroll run takes a list of buy contracts the caller chose. Each
 * carries its own `payCurrency`, and the run reported
 * `contracts.reduce((s, p) => s + p.grossPay, 0)` with a dollar sign in
 * front of it. A US W-2 batched with an Indian CDD produced a total that
 * is neither dollars nor rupees, printed as dollars. The commission
 * screen adds `amountCents` across postings the same way, and postings
 * carry a currency each precisely because an order's result is only safe
 * to sum while it is one currency (see the schema note on
 * `OrderPosting.amountCents`).
 *
 * `lib/money`'s `add` throws on a mismatch, which is right for
 * arithmetic and wrong inside a payroll run — a 500 in place of a
 * sentence. So this is the display answer: group by currency, total
 * within each, and say all of them.
 *
 *   one currency   → "$12,400"
 *   two            → "$12,400 and ₹840,000"
 *   three or more  → "$12,400, ₹840,000 and £2,100"
 *   nothing        → "—"
 *
 * The order is the order the amounts arrived in, so the caller's own
 * first row leads and the phrase does not reshuffle between two reads of
 * the same screen.
 */
export function totals(
  items: ReadonlyArray<{ minor: number | null | undefined; currency?: string | null }>
): string {
  const byCurrency = new Map<string, number>()
  for (const item of items) {
    if (item.minor == null) continue
    const ccy = (item.currency ?? DEFAULT_CURRENCY).toUpperCase()
    byCurrency.set(ccy, (byCurrency.get(ccy) ?? 0) + item.minor)
  }
  const parts = [...byCurrency.entries()].map(([ccy, minor]) => amount(minor, ccy))
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// ── What a rate moved by ──────────────────────────────────────────────

/** A rate change, ready to print: the amount, the percentage, the way. */
export interface RateMovement {
  /** "+$5" · "-$2.50" · "$0" · "—" where there is nothing to compare to. */
  dollars: string
  /** "+4.0%" · "-1.9%" · "0.0%" · "—". */
  pct: string
  direction: 'up' | 'down' | 'neutral'
}

/**
 * How far a rate moved, and which way.
 *
 * ── Why this is here and not on the screen ───────────────────────────
 *
 * It was on the screen, and it printed the characters `+{compact(diff)}`
 * in the column where every rate *increase*'s amount belongs — a
 * template literal with a brace and no dollar sign, which is not an
 * expression at all, so the source text was the output. The decrease
 * branch was a number, which is why it survived every reading of the
 * page: half the column looked right.
 *
 * Nothing could have caught it where it lived. A helper inside a page
 * component is reachable only by rendering the page, and a string that
 * is wrong but well-formed renders green. Money arithmetic belongs in a
 * library with a test around it, which is the rule this file exists to
 * hold.
 *
 * ── One formatter, both ways ─────────────────────────────────────────
 *
 * The decrease branch was hand-rolled as well — a literal `$`, a divide
 * by a hundred and `toFixed(2)` — so a rise and a fall of the same size
 * printed to different precision, and neither could have shown a
 * contract in a currency that is not dollars. `compact` takes minor
 * units and brings its own symbol.
 *
 * `previous` null or zero returns em dashes rather than a number: a
 * first rate has not moved, and dividing by zero to say it moved
 * infinitely is a figure nobody can stand behind.
 */
export function rateMovement(
  current: number,
  previous: number | null | undefined,
  currency: string = DEFAULT_CURRENCY
): RateMovement {
  if (previous == null || previous === 0) {
    return { dollars: '—', pct: '—', direction: 'neutral' }
  }
  const diff = current - previous
  const pct = ((diff / previous) * 100).toFixed(1)
  if (diff > 0) return { dollars: `+${compact(diff, currency)}`, pct: `+${pct}%`, direction: 'up' }
  if (diff < 0) return { dollars: `-${compact(Math.abs(diff), currency)}`, pct: `${pct}%`, direction: 'down' }
  return { dollars: compact(0, currency), pct: '0.0%', direction: 'neutral' }
}
