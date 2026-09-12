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
