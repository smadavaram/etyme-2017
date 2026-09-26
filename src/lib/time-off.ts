/**
 * Hours banked instead of billed, and hours taken back out.
 *
 * ── A ledger, not a balance ──────────────────────────────────────────
 *
 * There is no balance column anywhere, and there is not going to be
 * one. A balance is a cache of a sum, it goes wrong silently, and it
 * cannot answer "what was banked in March" at all — which is one of the
 * two questions anybody asks of a bank of hours. So the balance is the
 * sum of the rows, computed here, every time.
 *
 * Every row is signed: an accrual is positive, a draw is negative, and
 * a payout and an expiry are both negative and mean entirely different
 * things to the person, which is why `kind` is stored rather than
 * inferred from the sign.
 *
 * ── The bank belongs to one counterparty ─────────────────────────────
 *
 * Unlike tenure, which is the person's and aggregates across every
 * supplier, banked time off is a commercial obligation of one company
 * to one person. Twelve hours owed by Brightmoor are not twelve hours
 * owed by anybody else, and summing them across firms would invent an
 * obligation nobody took on.
 *
 * ── Two ways this goes wrong, both guarded ───────────────────────────
 *
 * **It banks twice.** Approval runs again — a retry, a second
 * signature, a re-approval after an amendment — and the same overtime
 * week banks its hours a second time. `TimeOffEntry.decisionId` is
 * unique for exactly this: a decision banks once, ever. The check here
 * is the readable half; the unique index is the half that holds under a
 * race.
 *
 * **It goes negative.** Two draws read the same balance and both pass.
 * Postgres at READ COMMITTED will happily let them, so the caller locks
 * the person's rows inside the transaction (`SELECT … FOR UPDATE`)
 * before it asks this file anything. This file is the arithmetic and
 * the sentence; the lock is the route's job and is not optional.
 */

/** Hours are Decimal(7,2) in the database; keep the arithmetic there too. */
const round2 = (n: number): number => {
  const r = Math.round(n * 100) / 100
  // Negative zero is a real value in JavaScript and it fails an equality
  // check against zero, which is how a ledger that nets to nothing reads
  // as wrong on a screen and in a test.
  return r === 0 ? 0 : r
}

export type EntryKind = 'ACCRUAL' | 'DRAW' | 'PAYOUT' | 'EXPIRY' | 'ADJUSTMENT'

export interface Entry {
  kind: EntryKind
  /** Signed. Positive adds, negative takes away. */
  hours: number
  /** The day it counts from. Hours that have not taken effect are not spendable. */
  effectiveOn?: Date | string | null
  /** Null never lapses. */
  expiresOn?: Date | string | null
}

const day = (d: Date | string | null | undefined): string | null => {
  if (!d) return null
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
}

/**
 * What is in the bank, on a day.
 *
 * Hours dated after `on` are not counted: an accrual effective next
 * Monday is not spendable this Friday, and showing it as available is
 * how somebody books leave they do not have.
 *
 * Expiry is *not* netted off here. A lapsed accrual is written off with
 * an EXPIRY row of its own, because a balance that quietly shrinks and
 * a balance that shrinks with a reason are different products.
 */
export function balanceOf(entries: Entry[], on?: Date | string): number {
  const asOf = day(on ?? null)
  return round2(
    entries.reduce((n, e) => {
      const from = day(e.effectiveOn ?? null)
      if (asOf && from && from > asOf) return n
      return n + Number(e.hours ?? 0)
    }, 0)
  )
}

/** The same sum, cut by kind, for a screen that shows where it came from. */
export function summaryOf(entries: Entry[], on?: Date | string): {
  balanceHours: number
  accruedHours: number
  takenHours: number
  paidOutHours: number
  lapsedHours: number
} {
  const at = (kind: EntryKind) =>
    round2(entries.filter((e) => e.kind === kind).reduce((n, e) => n + Number(e.hours ?? 0), 0))
  return {
    balanceHours: balanceOf(entries, on),
    accruedHours: at('ACCRUAL'),
    takenHours: round2(-at('DRAW')),
    paidOutHours: round2(-at('PAYOUT')),
    lapsedHours: round2(-at('EXPIRY')),
  }
}

/**
 * How many hours an overtime decision banks.
 *
 * One hour off per overtime hour unless somebody says otherwise. A bank
 * that quietly multiplies itself is the same error as a rate that does,
 * so the accrual rate is snapshotted on the decision and read from
 * there — never from a policy that could have moved since.
 */
export function accrualFor(decision: {
  treatment: string
  overtimeHours: number | string
  accrualBps?: number | null
}): number {
  if (decision.treatment !== 'TIME_OFF') return 0
  const hours = Number(decision.overtimeHours ?? 0)
  if (!Number.isFinite(hours) || hours <= 0) return 0
  return round2(hours * ((decision.accrualBps ?? 10_000) / 10_000))
}

/** Hours in a day map — the sheet's `leaveDays`, or any slice of it. */
export function hoursIn(days: Record<string, number> | null | undefined): number {
  return round2(
    Object.values(days ?? {}).reduce((n, h) => {
      const x = Number(h)
      return Number.isFinite(x) && x > 0 ? n + x : n
    }, 0)
  )
}

export interface Verdict {
  ok: boolean
  says: string
}

/**
 * Whether somebody may take the leave they have filed.
 *
 * The refusal names both numbers, because "insufficient balance" tells
 * a recruiter nothing they can act on and "Priya has 6 hours banked and
 * this week files 8" tells them exactly what to fix.
 */
export function mayDraw(input: {
  personName: string
  balanceHours: number
  askingHours: number
}): Verdict {
  const { personName } = input
  const balance = round2(input.balanceHours)
  const asking = round2(input.askingHours)

  if (asking <= 0) return { ok: true, says: 'No paid leave on this sheet.' }

  if (asking > balance) {
    const short = round2(asking - balance)
    return {
      ok: false,
      says:
        `${personName} has ${hrs(balance)} of banked time off and this sheet takes ${hrs(asking)} — ` +
        `${hrs(short)} more than there is. Correct the week, or bank the hours first.`,
    }
  }

  return {
    ok: true,
    says: `${hrs(asking)} of banked time off, leaving ${hrs(round2(balance - asking))}.`,
  }
}

/**
 * The draw a sheet makes, once.
 *
 * `already` is what this sheet has drawn before — a re-approval must
 * not take the hours twice, and the difference is what is still to
 * take. Negative differences are refused rather than written as a
 * refund: giving hours back is an ADJUSTMENT somebody signs for.
 */
export function drawFor(input: {
  personName: string
  leaveDays: Record<string, number> | null | undefined
  balanceHours: number
  alreadyDrawnHours?: number
}): Verdict & { hours: number } {
  const asking = hoursIn(input.leaveDays)
  const already = round2(input.alreadyDrawnHours ?? 0)
  const outstanding = round2(asking - already)

  if (outstanding <= 0) return { ok: true, hours: 0, says: 'Already taken from the bank.' }

  const may = mayDraw({
    personName: input.personName,
    balanceHours: input.balanceHours,
    askingHours: outstanding,
  })
  return { ...may, hours: may.ok ? outstanding : 0 }
}

/** What the bank says on a screen, to the person it belongs to. */
export function saysBalance(personName: string, balanceHours: number): string {
  const b = round2(balanceHours)
  if (b <= 0) return `${personName} has no banked time off.`
  return `${personName} has ${hrs(b)} of banked time off.`
}

function hrs(n: number): string {
  const x = round2(n)
  return `${x} ${x === 1 ? 'hour' : 'hours'}`
}
