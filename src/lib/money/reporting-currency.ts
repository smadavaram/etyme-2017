/**
 * Spend in one currency — the region rollup's single figure.
 *
 * A company with plants in eight countries pays in eight currencies. The
 * per-currency totals are the facts; one figure in the company's
 * reporting currency is a view of them, at rates the company chose. So:
 *
 *  - **The rates are the company's, and data.** A company keeps the rates
 *    it reports at (`FxRate`, units of the reporting currency per one unit
 *    of the other, effective from a day). Nothing here fetches a market
 *    rate, ever: a figure that moves because a page was reloaded in a
 *    different week is not a figure anybody can stand behind.
 *  - **A company that has set none reads the shipped sample table**,
 *    labeled as sample and dated, and the figure says so in its own
 *    sentence. It is never presented as a market rate.
 *  - **The company's rates and the sample are never mixed.** A company
 *    that priced three currencies and not the fourth gets the fourth
 *    named as missing, not filled in from the sample.
 *  - **One missing rate blanks the figure.** The per-currency totals stay;
 *    the one figure is null and the sentence names the currency. Leaving
 *    the dong out of a total would understate spend by a whole region and
 *    look fine, which is the worst kind of wrong.
 *  - **Each currency is converted once, on its own total**, and rounded
 *    once, so the figure does not drift by a minor unit per row.
 *  - **The figure says which rates it used**: each currency's rate, the
 *    day it took effect and where it came from.
 *
 * Integer minor units in and out; the exponent is the currency's own
 * (`minorPerUnit` in lib/money), so a dong is never multiplied by a
 * hundred on its way in.
 */

import { prisma } from '@/lib/db'
import { format, fromMinor, minorPerUnit, type Money } from '@/lib/money'

/** One rate: units of `to` per one unit of `from`, from a day on. */
export interface ReportingRate {
  from: string
  to: string
  rate: number
  effectiveOn: Date
  /** Where it came from: "manual", a contract clause, "sample". */
  source: string | null
  /** When it was recorded. */
  recordedAt: Date | null
  /**
   * Who set it. Null until `FxRate` carries who set it (a schema request
   * for the architect): the reader says "not recorded" rather than
   * naming somebody it cannot.
   */
  setBy: string | null
}

/** A company's rate table, or the shipped sample. */
export interface RateTable {
  /** The currency every rate in the table converts into. */
  reportingCurrency: string
  rates: readonly ReportingRate[]
  /** True for the shipped table. A screen says so every time it is used. */
  sample: boolean
  /** The sentence a screen prints beside the figure. */
  label: string
}

/** The default reporting currency where a company has said nothing. */
export const DEFAULT_REPORTING_CURRENCY = 'USD'

/**
 * The shipped sample table, written on the day below for the demo and for
 * a company that has set no rates of its own. **Not market rates**: round
 * figures of the right size, so a rollup has a shape before a finance team
 * types its own. Never read as a quote, and never refreshed by code.
 */
export const SAMPLE_RATES_WRITTEN_ON = new Date('2026-10-01T00:00:00Z')

const SAMPLE_USD_PER_UNIT: Readonly<Record<string, number>> = {
  MXN: 0.055,
  BRL: 0.18,
  COP: 0.00025,
  VND: 0.00004,
  INR: 0.012,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  JPY: 0.0067,
  KRW: 0.00073,
}

export const SAMPLE_RATE_TABLE: RateTable = {
  reportingCurrency: 'USD',
  rates: Object.entries(SAMPLE_USD_PER_UNIT).map(([from, rate]) => ({
    from, to: 'USD', rate, effectiveOn: SAMPLE_RATES_WRITTEN_ON, source: 'sample', recordedAt: SAMPLE_RATES_WRITTEN_ON, setBy: null,
  })),
  sample: true,
  label: 'Sample rates written October 1, 2026, not market rates. Set your own rates to report at.',
}

/** How one currency was converted, or why it was not. */
export interface CurrencyLine {
  currency: string
  /** The total in this currency, its own minor units. Always present. */
  minor: number
  /** Units of the reporting currency per one unit of this one; null where none was found. */
  rate: number | null
  /** The total in the reporting currency's minor units; null where there is no rate. */
  reportingMinor: number | null
  /** The rate's day, source, and who set it, so the figure says what it used. */
  rateFrom: { effectiveOn: Date; source: string | null; setBy: string | null; inverted: boolean } | null
}

export interface ReportingSpend {
  reportingCurrency: string
  /** The one figure; null where any currency has no rate. */
  total: Money | null
  /** Every currency's own total, kept beside the figure whatever happens. */
  byCurrency: CurrencyLine[]
  /** Currencies with spend and no rate. Non-empty exactly when `total` is null. */
  missing: string[]
  /** Whether the rates were the company's own or the shipped sample. */
  sampleRates: boolean
  /** One sentence for the screen: the figure and the rates, or what is missing. */
  says: string
}

const up = (c: string) => c.trim().toUpperCase()

/**
 * The rate from one currency into another on a day: the latest one taking
 * effect on or before it, written either way round (a firm that keeps
 * USD to INR need not also keep INR to USD). A rate of zero or less is no
 * rate. Never a rate set for a later day; never a chain through a third
 * currency, because that is a rate nobody set.
 */
export function rateFor(
  table: readonly ReportingRate[],
  from: string,
  to: string,
  on: Date,
): { rate: number; row: ReportingRate; inverted: boolean } | null {
  const f = up(from), t = up(to)
  const usable = (r: ReportingRate) => Number.isFinite(r.rate) && r.rate > 0 && r.effectiveOn.getTime() <= on.getTime()
  const latest = (rows: ReportingRate[]) =>
    rows.filter(usable).sort((a, b) => b.effectiveOn.getTime() - a.effectiveOn.getTime())[0] ?? null
  const direct = latest(table.filter((r) => up(r.from) === f && up(r.to) === t))
  const back = latest(table.filter((r) => up(r.from) === t && up(r.to) === f))
  // Both written: the later one is the company's current decision.
  if (direct && (!back || direct.effectiveOn.getTime() >= back.effectiveOn.getTime())) {
    return { rate: direct.rate, row: direct, inverted: false }
  }
  if (back) return { rate: 1 / back.rate, row: back, inverted: true }
  return null
}

/** A total in one currency, converted into another's minor units, rounded once. */
function convert(minor: number, from: string, to: string, rate: number): number {
  return Math.round((minor / minorPerUnit(from)) * rate * minorPerUnit(to))
}

/**
 * Spend in many currencies as one figure in the reporting currency.
 *
 * `amounts` are integer minor units, each with its currency, in any
 * order and any number per currency. `rates` is the company's table
 * (`reportingRatesFor`), or the shipped sample where none is passed. `on`
 * is the day the rollup is for; a rate taking effect after it is not used.
 *
 * Refuses rather than fabricates: one currency with no rate makes the
 * figure null and names the currency; the per-currency totals stay.
 */
export function spendInReporting(
  amounts: readonly { currency: string; minor: number }[],
  reportingCurrency: string,
  rates: RateTable | readonly ReportingRate[] = SAMPLE_RATE_TABLE,
  on: Date = new Date(),
): ReportingSpend {
  const into = up(reportingCurrency)
  const table: RateTable = Array.isArray(rates)
    ? { reportingCurrency: into, rates: rates as readonly ReportingRate[], sample: false, label: 'Rates you set.' }
    : (rates as RateTable)

  const totals = new Map<string, number>()
  for (const a of amounts) {
    if (!Number.isInteger(a.minor)) {
      throw new Error(`An amount in ${a.currency} is not whole minor units (${a.minor}). Money is stored as integers.`)
    }
    const c = up(a.currency)
    totals.set(c, (totals.get(c) ?? 0) + a.minor)
  }

  const byCurrency: CurrencyLine[] = [...totals.entries()]
    .sort(([a], [b]) => (a === into ? -1 : b === into ? 1 : a.localeCompare(b)))
    .map(([currency, minor]) => {
      if (currency === into) {
        return { currency, minor, rate: 1, reportingMinor: minor, rateFrom: null }
      }
      const found = rateFor(table.rates, currency, into, on)
      if (!found) return { currency, minor, rate: null, reportingMinor: null, rateFrom: null }
      return {
        currency, minor, rate: found.rate,
        reportingMinor: convert(minor, currency, into, found.rate),
        rateFrom: { effectiveOn: found.row.effectiveOn, source: found.row.source, setBy: found.row.setBy, inverted: found.inverted },
      }
    })

  // A zero total in a currency with no rate still needs no rate: nothing
  // to convert is not a guess.
  const missing = byCurrency.filter((l) => l.reportingMinor === null && l.minor !== 0).map((l) => l.currency)
  const total = missing.length
    ? null
    : fromMinor(byCurrency.reduce((n, l) => n + (l.reportingMinor ?? 0), 0), into)

  const converted = byCurrency.filter((l) => l.currency !== into && l.rate !== null && l.minor !== 0)
  const ratesSaid = converted.length === 0
    ? 'No rate was needed.'
    : table.sample
      ? `At ${table.label.charAt(0).toLowerCase()}${table.label.slice(1)}`
      : `At the rates you set: ${converted.map((l) => `${l.currency} ${l.rate} from ${l.rateFrom!.effectiveOn.toISOString().slice(0, 10)}`).join(', ')}.`

  const says = missing.length
    ? `No one figure in ${into}: there is no rate for ${list(missing)}${table.sample ? ' in the sample table' : ''}. ` +
      `${missing.length === 1 ? 'Its spend is' : 'Their spend is'} shown in ${missing.length === 1 ? 'its own currency' : 'their own currencies'}; set a rate to ${into} to add ${missing.length === 1 ? 'it' : 'them'} in.`
    : `${format(total!)} in ${into}. ${ratesSaid}`

  return { reportingCurrency: into, total, byCurrency, missing, sampleRates: table.sample && converted.length > 0, says }
}

function list(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/**
 * A company's reporting currency and the rates it reports at, read from
 * the record: its home currency, and every `FxRate` it keeps taking effect
 * on or before `on`. A company with no rates of its own reads the shipped
 * sample, labeled; one with any rates reads only its own.
 */
export async function reportingRatesFor(companyId: string, on: Date = new Date()): Promise<RateTable> {
  const [company, rows] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { homeCurrency: true } }),
    prisma.fxRate.findMany({
      where: { companyId, effectiveOn: { lte: on } },
      select: { fromCurrency: true, toCurrency: true, rate: true, effectiveOn: true, source: true, createdAt: true },
      orderBy: { effectiveOn: 'desc' },
    }),
  ])
  const reportingCurrency = up(company?.homeCurrency || DEFAULT_REPORTING_CURRENCY)
  if (rows.length === 0) {
    return reportingCurrency === SAMPLE_RATE_TABLE.reportingCurrency
      ? SAMPLE_RATE_TABLE
      : { ...SAMPLE_RATE_TABLE, reportingCurrency }
  }
  return {
    reportingCurrency,
    rates: rows.map((r) => ({
      from: r.fromCurrency, to: r.toCurrency, rate: Number(r.rate), effectiveOn: r.effectiveOn,
      source: r.source, recordedAt: r.createdAt, setBy: null,
    })),
    sample: false,
    label: 'Rates you set.',
  }
}
