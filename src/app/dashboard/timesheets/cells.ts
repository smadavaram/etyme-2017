/**
 * What a week on the Timesheets list says about money, on the row and in
 * the export. Beside the page so a test can read it without a browser; no
 * database, no clock.
 *
 * Walk 8, 9 November 2026: Corvane's Vietnam week read "$750/hr ·
 * $30,000" where the record holds ₫75,000 an hour and the week is
 * ₫3,000,000, and a euro line read "$31/hr · $1,240". The row called
 * money's formatter with no currency, so every rate went out as dollars
 * on cents. Every amount here goes through money's one formatter with the
 * line's own currency, which knows each currency's own decimals (the dong
 * has none).
 *
 * And the list's "Export CSV" left the consultant, the client, the period,
 * the rate and the value empty on all 49 rows, with no Currency column:
 * the shared table exports its drawn columns and reads `row[column.key]`,
 * which on this list is an object or nothing. So the page draws its own
 * Export CSV, and it and "Export selected" both write `timesheetCsv`.
 */

import { compact, rate as rateWords, DEFAULT_CURRENCY } from '@/lib/money-display'
import { exportMoney } from './totals'
import { statusLine } from './status-words'

/** The currency a row's money is in: the line's own, dollars where a row says none. */
function currencyOf(c: string | null | undefined): string {
  return (c || DEFAULT_CURRENCY).toUpperCase()
}

/** "₫75,000" · "€31" · "$118": the rate cell, without the "/hr" the page draws faint beside it. */
export function rateCell(r: { cents: number | null; currency?: string | null }): string {
  if (r.cents == null) return '—'
  return compact(r.cents, currencyOf(r.currency))
}

/** "₫75,000/hr", for a sentence or a title. */
export function rateSays(r: { cents: number | null; currency?: string | null }): string {
  if (r.cents == null) return '—'
  return rateWords(r.cents, currencyOf(r.currency))
}

/** "₫3,000,000" · "€1,240" · "$4,484": what the week is worth, in the rate's own currency. */
export function valueCell(cents: number | null, currency: string | null | undefined): string {
  if (cents == null) return '—'
  return compact(cents, currencyOf(currency))
}

/** What the payer on the reader's line accepted, where it is not every hour filed. */
export interface AcceptedOnRow {
  hours: number
  filed: number
  says: string
}

/** The hours a row reads: what its payer accepted, else every hour filed. */
export function shownHours(t: { totalHours: number; accepted?: { hours: number } | null }): number {
  return t.accepted?.hours ?? t.totalHours
}

/** One week, as much of it as the export needs. */
export interface ExportWeek {
  person: { name: string }
  sellContract: { clientCompany: { name: string }; engagement: { title: string } | null }
  periodStart: string
  periodEnd: string
  totalHours: number
  status: string
  rate: { cents: number | null; currency?: string | null; withheld?: boolean }
  accepted?: { hours: number } | null
  signature?: { youSigned: boolean; signedAtTop?: boolean; waitingOn: string | null } | null
  overtime?: { billableCents: number | null } | null
}

/**
 * What a week is worth to the reader, or nothing.
 *
 * The server prices it (`acceptedWorth`, the payer's accepted hours with
 * the cut off overtime first, each week's own overtime decision) and
 * sends it as `overtime.billableCents`; where it sent none the rate times
 * the hours the row reads stands in. A rate withheld from this reader
 * values nothing, because the value is the rate's to withhold too.
 */
export function weekValue(t: Pick<ExportWeek, 'rate' | 'overtime' | 'totalHours' | 'accepted'>): number | null {
  if (t.rate.withheld) return null
  if (t.overtime) return t.overtime.billableCents
  if (t.rate.cents == null) return null
  return shownHours(t) * t.rate.cents
}

/** The export's columns, in order. The eighth is the rate column's own word, said per list. */
export const TIMESHEET_CSV_HEADER = [
  'Consultant', 'Client', 'Engagement', 'Period Start', 'Period End', 'Hours', 'Hours filed',
  'Rate', 'Value', 'Currency', 'Status',
] as const

/**
 * The weeks as a CSV: every column the row draws, the two dates, the hours
 * the row reads beside the hours filed, the rate and the value in the
 * currency's own units ("75000" for dong, "118.00" for dollars), and the
 * currency named in its own column. A blank cell is a blank on the record,
 * never a nought.
 */
export function timesheetCsv(weeks: readonly ExportWeek[], rateLabel: string): string {
  const header = TIMESHEET_CSV_HEADER.map((h, i) => (i === 7 ? rateLabel : h))
  const rows = weeks.map((t) => {
    const value = weekValue(t)
    const cents = t.rate.withheld ? null : t.rate.cents
    const priced = cents != null || value != null
    return [
      t.person.name,
      t.sellContract.clientCompany.name,
      t.sellContract.engagement?.title ?? '',
      t.periodStart.slice(0, 10),
      t.periodEnd.slice(0, 10),
      shownHours(t).toFixed(1),
      t.totalHours.toFixed(1),
      exportMoney(cents, t.rate.currency),
      exportMoney(value, t.rate.currency),
      priced ? currencyOf(t.rate.currency) : '',
      statusLine({ status: t.status, signature: t.signature ?? null }),
    ]
  })
  return [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
}
