/**
 * The lines of a typed-in invoice receipt, and the exceptions recorded on
 * one — what can be said about them with no database.
 *
 * A supplier's invoice reaches the record two ways: sent here as an
 * `Invoice`, whose lines name the week, the expense or the milestone they
 * bill, or typed in by the payer as a `VendorBill`. The second was a total
 * and a period, so it could be held to its amount and to nothing else —
 * not which week, not which expense, not which milestone. With lines it is
 * matched line by line by the same engine as the first
 * (`threeWayMatch` in lib/three-way-match), and a total-only receipt keeps
 * the amount check it has today.
 *
 * Amounts on a line are minor units, as everywhere in the schema; the
 * clerk may type them in whole currency (`amount`), the way the header's
 * `total` is typed, and they are converted once here.
 */

import { decimalsFor } from '@/lib/money'
import { amount as said } from '@/lib/money-display'
import { OVERRIDABLE, type MatchCode, type MatchOverride } from '@/lib/three-way-match'

/** One line as typed in, or as stored. Exactly one of the three ids is set. */
export interface KeyedLine {
  /** The stored row's id; a line still being recorded is `line-1`, `line-2`… */
  id: string
  timesheetId: string | null
  expenseId: string | null
  milestoneId: string | null
  personId: string | null
  /** Hours and rate on an hours line; null on an expense or milestone line, which bills a sum. */
  hours: number | null
  rateCents: number | null
  amountCents: number
}

export type LinesRead =
  | { ok: true; lines: KeyedLine[] }
  | { ok: false; says: string; field: string }

/** The most lines one receipt is read with. A supplier's invoice is a page, not a ledger. */
export const MOST_LINES = 200

/**
 * Read the lines the clerk typed in. Null where the receipt has none —
 * it is then a total, checked on its amount as before.
 *
 * Each line bills exactly one thing: a week (`timesheetId`, with the hours
 * and the rate the supplier's invoice states), an approved expense
 * (`expenseId`) or an accepted milestone (`milestoneId`), each with its
 * amount. A line that names two, or none, is refused in a sentence rather
 * than guessed at.
 */
export function readLines(raw: unknown, currency: string): LinesRead | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) {
    return { ok: false, says: 'The lines of an invoice receipt are a list, one line per week, expense or milestone.', field: 'lines' }
  }
  if (raw.length === 0) return null
  if (raw.length > MOST_LINES) {
    return { ok: false, says: `An invoice receipt is read with at most ${MOST_LINES} lines. Record it as two receipts.`, field: 'lines' }
  }
  const exp = 10 ** decimalsFor(currency)
  const lines: KeyedLine[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = (raw[i] ?? {}) as Record<string, unknown>
    const n = i + 1
    const field = `lines.${i}`
    const id = (k: string) => (r[k] == null || r[k] === '' ? null : String(r[k]))
    const timesheetId = id('timesheetId')
    const expenseId = id('expenseId')
    const milestoneId = id('milestoneId')
    const named = [timesheetId, expenseId, milestoneId].filter(Boolean).length
    if (named !== 1) {
      return {
        ok: false, field,
        says: `Line ${n} must bill one thing: the week it is for, the approved expense, or the accepted milestone — ${named === 0 ? 'it names none' : 'it names more than one'}.`,
      }
    }

    let amountCents: number
    if (r.amountCents != null) {
      amountCents = Number(r.amountCents)
      if (!Number.isInteger(amountCents)) {
        return { ok: false, field: `${field}.amountCents`, says: `Line ${n}’s amount in cents must be a whole number of cents.` }
      }
    } else {
      const v = Number(r.amount)
      if (r.amount == null || !Number.isFinite(v)) {
        return { ok: false, field: `${field}.amount`, says: `Line ${n} needs the amount the supplier’s invoice states for it.` }
      }
      amountCents = Math.round(v * exp)
    }
    if (amountCents <= 0) {
      return { ok: false, field: `${field}.amount`, says: `Line ${n} is for a positive amount.` }
    }

    let hours: number | null = null
    let rateCents: number | null = null
    if (timesheetId) {
      hours = Number(r.hours)
      rateCents = Number(r.rateCents)
      if (r.hours == null || !Number.isFinite(hours) || hours <= 0) {
        return { ok: false, field: `${field}.hours`, says: `Line ${n} bills a week, so it needs the hours the supplier’s invoice states.` }
      }
      if (Math.round(hours * 100) !== hours * 100) {
        return { ok: false, field: `${field}.hours`, says: `Line ${n}’s hours are recorded to two decimals at most.` }
      }
      if (r.rateCents == null || !Number.isInteger(rateCents) || rateCents <= 0) {
        return { ok: false, field: `${field}.rateCents`, says: `Line ${n} bills a week, so it needs the hourly rate the supplier’s invoice states, in cents.` }
      }
    } else if (r.hours != null || r.rateCents != null) {
      return {
        ok: false, field,
        says: `Line ${n} bills ${expenseId ? 'an expense' : 'a milestone'}, which is a sum, not hours at a rate. Give its amount only.`,
      }
    }

    lines.push({
      id: `line-${n}`,
      timesheetId, expenseId, milestoneId,
      personId: id('personId'),
      hours, rateCents, amountCents,
    })
  }
  return { ok: true, lines }
}

// ── Exceptions on a typed-in receipt ─────────────────────────────────

export interface StoredWaiver {
  code: string
  reason: string
  byName: string
  at: Date
  /** What the receipt was worth when the exception was granted. */
  totalCentsAtOverride: number
}

/**
 * The exceptions that still describe this receipt, and the ones that do
 * not.
 *
 * A waiver is a person's judgment about one receipt for one sum. A
 * receipt whose total has changed since is a different claim, and the
 * judgment is not carried across to it: the exception is void, said in
 * a sentence, and somebody records it again if it still stands. A waiver
 * on a check nobody may waive is never honored, whatever a row says —
 * the engine ignores it too.
 */
export function liveWaivers(
  stored: readonly StoredWaiver[],
  totalCents: number,
  currency: string,
): { live: MatchOverride[]; voided: string | null } {
  const live: MatchOverride[] = []
  const stale: StoredWaiver[] = []
  for (const w of stored) {
    if (!(w.code in OVERRIDABLE) || !OVERRIDABLE[w.code as MatchCode]) continue
    if (w.totalCentsAtOverride !== totalCents) { stale.push(w); continue }
    live.push({ code: w.code as MatchCode, reason: w.reason, byName: w.byName, at: w.at })
  }
  const first = stale[0]
  return {
    live,
    voided: first
      ? `The exception ${first.byName} recorded was for ${said(first.totalCentsAtOverride, currency)}; the receipt is now ` +
        `${said(totalCents, currency)}, so it no longer covers it. Record the exception again if it still stands.`
      : null,
  }
}
