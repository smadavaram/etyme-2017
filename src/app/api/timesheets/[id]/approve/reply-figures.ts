import { wholeFromMinor } from '@/lib/money'

/**
 * Two figures the week's approval says back, each read from what the
 * press decided rather than from what was filed.
 *
 * Found by money, 2026-11-08: a firm that accepted 38 of 40 hours read
 * "Accepted 40h", the hours filed; and the reply's `billAmount` divided
 * minor units by a hundred, so a week billed in dong (no minor unit) was
 * reported at a hundredth of its value. Pure.
 */

/** The hours an acceptance stands for: what was accepted, else (all of it) what was filed. */
export function hoursAccepted(accepted: { hours: number | null | undefined }, filed: number): number {
  return accepted.hours ?? filed
}

/** A week's value in whole units of its own currency, never by assuming cents. */
export function billAmountOf(totalMinor: number, currency: string): number {
  return wholeFromMinor(totalMinor, currency)
}
