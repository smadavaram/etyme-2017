/**
 * Money — an amount and the currency it is in, which are one thing.
 *
 * This codebase has already shipped one bug from separating them: a $110/hr
 * requirement submitted a candidate at $1.10/hr, because one column held
 * dollars while another held cents and nothing said which. It looked
 * plausible on screen and nothing threw.
 *
 * SAP solves this in its data dictionary and the idea is worth copying:
 *
 *   An amount field must point at a currency field. The table will not
 *   activate without it, so no amount can exist without saying what it is
 *   denominated in.
 *
 *   The number of decimal places comes from the currency, not from code.
 *   Most currencies have two. Japanese yen has none. Kuwaiti dinar has
 *   three. SAP looks it up; it never hardcodes a division by a hundred.
 *
 *   One routine converts between what is stored and what is displayed.
 *   Application code never does the arithmetic by hand.
 *
 * That last point is why sixteen screens here each wrote their own
 * `/ 100`, and four of them defined a function called `money` with four
 * different signatures.
 *
 * Amounts are held in MINOR UNITS — cents, pence, yen — because that is
 * what the database holds and what avoids floating point drift. The minor
 * unit is not always a hundredth, which is the whole point.
 */

export interface Money {
  /** Whole minor units. Cents for USD, yen for JPY, fils for KWD. */
  readonly minor: number
  /** ISO 4217 code. Never optional — that is the invariant. */
  readonly currency: string
}

/**
 * How many decimal places each currency has, per ISO 4217.
 *
 * Anything not listed has two, which is true of most of the world. The
 * ones listed are the ones where assuming two is wrong — and assuming two
 * for yen makes every amount a hundred times too small.
 */
const EXPONENT: Record<string, number> = {
  // No minor unit at all.
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, RWF: 0,
  UGX: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0, KMF: 0, DJF: 0, GNF: 0,
  // Three decimal places.
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
}

/** Decimal places for a currency. Two unless the currency says otherwise. */
export function decimalsFor(currency: string): number {
  return EXPONENT[currency.toUpperCase()] ?? 2
}

/** The divisor between minor units and whole ones. 100 for USD, 1 for JPY. */
export function minorPerUnit(currency: string): number {
  return 10 ** decimalsFor(currency)
}

// ── Making money ───────────────────────────────────────────

/** From minor units already in the database. */
export function fromMinor(minor: number, currency: string): Money {
  return { minor: Math.round(minor), currency: currency.toUpperCase() }
}

/**
 * From a whole-currency number, as a person types it. 130.5 USD becomes
 * 13050 cents; 15000 JPY stays 15000 because yen has no minor unit.
 *
 * Rounds rather than truncating. Truncating loses a cent per conversion,
 * and finance notices.
 */
export function fromDecimal(value: number, currency: string): Money {
  return {
    minor: Math.round(value * minorPerUnit(currency)),
    currency: currency.toUpperCase(),
  }
}

/** From a Prisma Decimal, or anything that stringifies to a number. */
export function fromPrismaDecimal(d: { toString(): string }, currency: string): Money {
  return fromDecimal(parseFloat(d.toString()), currency)
}

/** Back to whole currency units, for arithmetic that has to leave here. */
export function toDecimal(m: Money): number {
  return m.minor / minorPerUnit(m.currency)
}

export function zero(currency: string): Money {
  return { minor: 0, currency: currency.toUpperCase() }
}

// ── The one place that formats ─────────────────────────────

export interface FormatOptions {
  /** "$130.50" with the symbol, or "130.50" without. Default true. */
  symbol?: boolean
  /** Drop ".00" on whole amounts — for dense tables. Default false. */
  compact?: boolean
}

/**
 * The single formatter. Nothing else in the codebase should divide by a
 * hundred, because nothing else knows whether a hundred is the right
 * number.
 */
export function format(m: Money, opts: FormatOptions = {}): string {
  const { symbol = true, compact = false } = opts
  const decimals = decimalsFor(m.currency)
  const value = toDecimal(m)

  const showDecimals = compact && m.minor % minorPerUnit(m.currency) === 0
    ? 0
    : decimals

  return new Intl.NumberFormat('en-US', {
    style: symbol ? 'currency' : 'decimal',
    currency: m.currency,
    minimumFractionDigits: showDecimals,
    maximumFractionDigits: showDecimals,
  }).format(value)
}

/** A rate, with its unit. The commonest thing shown in this product. */
export function formatRate(m: Money, per: string = 'hr'): string {
  return `${format(m, { compact: true })}/${per}`
}

// ── The one place that parses ──────────────────────────────

/**
 * What somebody typed into a box. Tolerates symbols, commas and spaces,
 * because people paste from spreadsheets.
 *
 * Returns null rather than throwing or guessing — an unparseable rate is a
 * question for the user, not a zero to be quietly stored.
 */
export function parse(input: string, currency: string): Money | null {
  const cleaned = input.replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const value = parseFloat(cleaned)
  if (!Number.isFinite(value)) return null
  return fromDecimal(value, currency)
}

// ── Arithmetic that cannot silently mix currencies ─────────

function sameCurrency(a: Money, b: Money, op: string): void {
  if (a.currency !== b.currency) {
    // A programming error, not user input. Adding dollars to yen has no
    // right answer, so there is nothing sensible to return.
    throw new Error(
      `Cannot ${op} ${a.currency} and ${b.currency}. Convert one of them first.`
    )
  }
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b, 'add')
  return { minor: a.minor + b.minor, currency: a.currency }
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b, 'subtract')
  return { minor: a.minor - b.minor, currency: a.currency }
}

/** A rate times hours, or an amount times a count. */
export function multiply(m: Money, factor: number): Money {
  return { minor: Math.round(m.minor * factor), currency: m.currency }
}

export function sum(items: Money[], currency: string): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency))
}

export function compare(a: Money, b: Money): number {
  sameCurrency(a, b, 'compare')
  return a.minor - b.minor
}

export function isGreater(a: Money, b: Money): boolean {
  return compare(a, b) > 0
}

export function isZero(m: Money): boolean {
  return m.minor === 0
}

/**
 * How far above or below one amount is against another, as a percentage.
 *
 * Used for rate variances. Returns null when the reference is zero, rather
 * than dividing by it and reporting Infinity as a percentage.
 */
export function percentDifference(actual: Money, reference: Money): number | null {
  sameCurrency(actual, reference, 'compare')
  if (reference.minor === 0) return null
  return Math.round(((actual.minor - reference.minor) / reference.minor) * 1000) / 10
}
