/**
 * What the Payroll page says after Calculate or Process, read from the
 * run route's own reply, and when its year-end card may say "more than
 * one currency".
 *
 * The founder's walk, 2026-11-15 (layer 2, item 6): Calculate and
 * Process changed the row and said nothing; and "More than one currency
 * in the year" was printed for a firm with nothing posted in any. Etyme
 * moves no money, so Process says the period's pay day, the day the
 * Payroll row and the pay file name, never the day it was pressed.
 *
 * Pure: no database, no React.
 */
import { totals } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'

export interface RunReplyRow {
  personName: string
  grossPay: number
  totalHours: number
  currency?: string | null
  refused?: string | null
}

function names(list: readonly string[]): string {
  const seen = Array.from(new Set(list))
  if (seen.length <= 3) return seen.length <= 1 ? (seen[0] ?? '') : `${seen.slice(0, -1).join(', ')} and ${seen[seen.length - 1]}`
  return `${seen.slice(0, 2).join(', ')} and ${seen.length - 2} others`
}

/**
 * "Worked out pay for Amara Velde: $1,800.00 for 40 hours, to be paid Fri, Nov 27."
 * "Processed pay for Amara Velde: $1,800.00 for 40 hours, paid on the pay day, Fri, Nov 27."
 * "Nothing was paid. Each row says why." where nobody had pay to process.
 * `payOn` is the period's pay day ("YYYY-MM-DD"), null where the run was for a calendar month.
 */
export function payrollRunSays(
  action: 'calculate' | 'approve' | 'process',
  reply: { details?: readonly RunReplyRow[] | null; payOn?: string | null },
): string {
  const rows = (reply.details ?? []).filter((r) => !r.refused && r.grossPay > 0)
  if (rows.length === 0) {
    return action === 'process' ? 'Nothing was paid. Each row says why.' : 'Nothing was worked out. Each row says why.'
  }
  const money = totals(rows.map((r) => ({ minor: r.grossPay, currency: r.currency ?? null })))
  const hours = Math.round(rows.reduce((n, r) => n + r.totalHours, 0) * 100) / 100
  const what = `${names(rows.map((r) => r.personName))}: ${money} for ${hours} hour${hours === 1 ? '' : 's'}`
  const day = reply.payOn ? formatDay(reply.payOn, { weekday: true }) : null
  if (action === 'process') return `Processed pay for ${what}${day ? `, paid on the pay day, ${day}` : ''}.`
  if (action === 'approve') return `Approved pay for ${what}${day ? `, to be paid ${day}` : ''}.`
  return `Worked out pay for ${what}${day ? `, to be paid ${day}` : ''}.`
}

/**
 * Whether the year's postings were in more than one currency: two
 * currencies among the people paid, or one person paid in two (whose
 * summary then carries no currency). Nothing posted is never "more than one".
 */
export function postedInMoreThanOneCurrency(
  summaries: ReadonlyArray<{ currency: string | null; postings: number }>,
): boolean {
  const posted = summaries.filter((s) => s.postings > 0)
  if (posted.some((s) => s.currency == null)) return true
  return new Set(posted.map((s) => (s.currency as string).toUpperCase())).size > 1
}
