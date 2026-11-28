import { minorPerUnit } from '@/lib/money'

/**
 * How a rate box on a match reads in the putting-forward firm's own
 * currency: the sign before the box, and the figure it opens on, in whole
 * units by the currency's own exponent ("90" for $90.00, "170000" for
 * ₫170,000), never minor units divided by a hundred behind a "$". Pure.
 */

/** "$", "₫", "₹": the currency's own sign, as money's formatter writes it. */
export function currencySign(currency: string): string {
  const part = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' })
    .formatToParts(0)
    .find((p) => p.type === 'currency')
  return part?.value ?? currency
}

/** The figure a box opens on: whole units of the currency, or empty where nothing is stated. */
export function typedFromMinor(minor: number | null | undefined, currency: string): string {
  if (minor == null) return ''
  return String(Math.round(minor / minorPerUnit(currency || 'USD')))
}
