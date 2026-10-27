/**
 * The door to a company's reporting currency and its exchange rates.
 *
 * Spend in many currencies rolls up into one at the rates the company set
 * (lib/money/reporting-currency, money's). Those rates are the company's
 * own figures, so who set each and when is recorded beside it, and the
 * rollup can say so. This file only checks what was asked for, in
 * sentences; the route writes it (PATCH /api/settings/reporting-currency).
 *
 * Pure: no database.
 */

export interface RateAsk {
  /** ISO code of the currency converted from. */
  from: string
  /** Units of the reporting currency per one unit of `from`. */
  rate: number
  /** The day it applies from; today where absent. */
  effectiveOn: Date
  source: string | null
}

export interface ReportingAsk {
  /** The currency to report in; null puts it back to the home currency; undefined leaves it. */
  reportingCurrency?: string | null
  rates: RateAsk[]
}

const ISO = /^[A-Z]{3}$/

/**
 * What a PATCH body asks for, or the sentence that refuses it. Rates are
 * into the reporting currency the same body sets, or the one already set
 * (`current`) where it sets none.
 */
export function readReportingAsk(
  body: unknown,
  current: string,
  today: Date = new Date()
): { ok: true; ask: ReportingAsk; into: string } | { ok: false; says: string } {
  const b = (body ?? {}) as Record<string, unknown>
  let reportingCurrency: string | null | undefined
  if (b.reportingCurrency === null) reportingCurrency = null
  else if (b.reportingCurrency !== undefined) {
    const code = String(b.reportingCurrency).trim().toUpperCase()
    if (!ISO.test(code)) return { ok: false, says: `“${String(b.reportingCurrency)}” is not a currency code. Use three letters, such as USD or EUR.` }
    reportingCurrency = code
  }
  const into = (reportingCurrency ?? current).toUpperCase()

  const raw = b.rates === undefined ? [] : b.rates
  if (!Array.isArray(raw)) return { ok: false, says: 'Rates are a list: each a currency, the rate into the reporting currency, and the day it applies from.' }
  const rates: RateAsk[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const from = String(r?.from ?? '').trim().toUpperCase()
    if (!ISO.test(from)) return { ok: false, says: `“${String(r?.from ?? '')}” is not a currency code. Use three letters, such as INR.` }
    if (from === into) return { ok: false, says: `${from} is the reporting currency, so it needs no rate.` }
    const rate = Number(r?.rate)
    if (!Number.isFinite(rate) || rate <= 0) return { ok: false, says: `The rate for ${from} must be a number above zero: how many ${into} one ${from} is worth.` }
    const effectiveOn = r?.effectiveOn === undefined ? today : new Date(String(r.effectiveOn))
    if (Number.isNaN(effectiveOn.getTime())) return { ok: false, says: `The day the ${from} rate applies from is not a date.` }
    const day = new Date(Date.UTC(effectiveOn.getUTCFullYear(), effectiveOn.getUTCMonth(), effectiveOn.getUTCDate()))
    const source = typeof r?.source === 'string' && r.source.trim() ? r.source.trim().slice(0, 120) : null
    rates.push({ from, rate, effectiveOn: day, source })
  }
  if (reportingCurrency === undefined && rates.length === 0) {
    return { ok: false, says: 'Nothing to change: send a reporting currency, rates, or both.' }
  }
  return { ok: true, ask: { reportingCurrency, rates }, into }
}
