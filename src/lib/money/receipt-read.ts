/**
 * An invoice receipt as the person paying it reads it: who worked, on
 * what, the hours billed against the hours signed, the rate times the
 * hours, and whether it matches — in words.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * The founder, on the client's invoice list: "I can't see anything about
 * the job except the title — how can anyone approve such content." A row
 * read "IN-KKA8DC-20260801 · ERP finance lead" and a total. The three-way
 * check had the answer and only the detail page showed it, as eleven
 * ticks. So the row carries the check's verdict in one sentence, and the
 * detail carries one line per person-week with its own.
 *
 * Nothing is computed here that the match did not already decide: the
 * signed hours are the payer's own acceptance as the match read it, the
 * contract rate is the rate in force on the day as the match read it, and
 * whether a line matches is whether any failed check names it.
 *
 * Pure: no database.
 */

import { amount, rate as rateWords } from '@/lib/money-display'

export interface ReceiptLine {
  lineId: string
  kind: 'HOURS' | 'EXPENSE' | 'MILESTONE'
  personName: string
  jobTitle: string | null
  periodStart: string | null
  periodEnd: string | null
  hoursBilled: number
  hoursSigned: number | null
  rateCents: number
  contractRateCents: number | null
  amountCents: number
}

export interface ReceiptCheck {
  code: string
  outcome: 'PASS' | 'FAIL' | 'OVERRIDDEN'
  reason: string
  lines?: string[]
}

export interface ReceiptRead {
  people: string[]
  jobs: string[]
  /** Person-weeks of hours on it. */
  weeks: number
  hoursBilled: number
  /** Null where any hours line has no signature behind it. */
  hoursSigned: number | null
  /** True where the check passed, a recorded exception included. */
  matches: boolean
  /** "2 people · 3 weeks · all match" */
  row: string
  /** "Matches the signed hours and the contract rate" · "Bills 40 h; 38 h were signed" */
  verdict: string
  lines: (ReceiptLine & { matches: boolean; says: string })[]
}

const h = (n: number) => `${Math.round(n * 100) / 100} h`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The one sentence a line says about itself. */
function lineSays(l: ReceiptLine, failed: ReceiptCheck[], currency: string): { matches: boolean; says: string } {
  const own = failed.filter((c) => c.lines?.includes(l.lineId))
  if (l.kind === 'HOURS') {
    if (l.hoursSigned == null) return { matches: false, says: `Bills ${h(l.hoursBilled)}; nobody has signed these hours yet` }
    if (Math.abs(l.hoursSigned - l.hoursBilled) >= 0.005) {
      return { matches: false, says: `Bills ${h(l.hoursBilled)}; ${h(l.hoursSigned)} ${l.hoursSigned === 1 ? 'was' : 'were'} signed` }
    }
    if (l.contractRateCents != null && l.contractRateCents !== l.rateCents) {
      return {
        matches: false,
        says: `Bills ${rateWords(l.rateCents, currency)}; the contract rate is ${rateWords(l.contractRateCents, currency)}`,
      }
    }
    if (own.length > 0) return { matches: false, says: own[0].reason }
    return {
      matches: true,
      says: `${h(l.hoursSigned)} signed × ${rateWords(l.rateCents, currency)} = ${amount(l.amountCents, currency)}`,
    }
  }
  if (own.length > 0) return { matches: false, says: own[0].reason }
  return { matches: true, says: `${l.kind === 'EXPENSE' ? 'Approved expense' : 'Accepted milestone'}: ${amount(l.amountCents, currency)}` }
}

export function readReceipt(input: {
  matched: boolean
  checks: readonly ReceiptCheck[]
  lines: readonly ReceiptLine[]
  currency: string
}): ReceiptRead {
  const failed = input.checks.filter((c) => c.outcome === 'FAIL')
  const waived = input.checks.filter((c) => c.outcome === 'OVERRIDDEN')
  const lines = input.lines.map((l) => ({ ...l, ...lineSays(l, failed, input.currency) }))
  const hours = lines.filter((l) => l.kind === 'HOURS')
  const people = [...new Set(lines.filter((l) => l.kind !== 'MILESTONE').map((l) => l.personName))]
  const jobs = [...new Set(lines.map((l) => l.jobTitle).filter((j): j is string => !!j))]
  const hoursBilled = Math.round(hours.reduce((n, l) => n + l.hoursBilled, 0) * 100) / 100
  const hoursSigned = hours.some((l) => l.hoursSigned == null)
    ? null
    : Math.round(hours.reduce((n, l) => n + (l.hoursSigned ?? 0), 0) * 100) / 100

  const matches = input.matched
  const off = lines.filter((l) => !l.matches)
  let verdict: string
  if (lines.length === 0) {
    verdict = 'Has no lines, so there is nothing to check it against'
  } else if (matches && waived.length === 0 && off.length === 0) {
    verdict = hours.length > 0 ? 'Matches the signed hours and the contract rate' : 'Matches what was approved'
  } else if (matches) {
    verdict = `Matches, with ${plural(waived.length, 'exception', 'exceptions')} recorded by your desk`
  } else if (off.length > 0) {
    verdict = off.length === 1 ? `${off[0].personName}: ${off[0].says}` : `${plural(off.length, 'line does', 'lines do')} not match — ${off[0].personName}: ${off[0].says}`
  } else {
    verdict = failed[0]?.reason ?? 'Does not match'
  }

  const summary = [
    plural(people.length, 'person', 'people'),
    ...(hours.length > 0 ? [plural(hours.length, 'week', 'weeks')] : []),
    matches ? (off.length === 0 && waived.length === 0 ? (lines.length === 1 ? 'matches' : 'all match') : 'matches with exceptions') : 'does not match',
  ]

  return { people, jobs, weeks: hours.length, hoursBilled, hoursSigned, matches, row: summary.join(' · '), verdict, lines }
}
