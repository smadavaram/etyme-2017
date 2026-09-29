/**
 * What one rung of a chain may bill for one week, and when.
 *
 * The founder, 2026-09-28 (CLAUDE.md, "What each rung may bill, and
 * when"):
 *
 *   1. **A firm bills only the hours the firm above it accepted.** If
 *      Computer Systems accepts 38 of Helena Marsh's 40, CloudEPA's bill
 *      to Computer Systems is for 38. Generation prices the payer's
 *      accepted hours, not the hours worked.
 *   2. **A firm bills upward on the client's signature**, without waiting
 *      for the rungs below it to accept.
 *
 * ── What it was ───────────────────────────────────────────────────────
 *
 * Generation priced the daily hours on the sheet — the hours worked — at
 * every rung, so CloudEPA billed Computer Systems for forty whatever
 * Computer Systems had accepted. And the three-way check on a bill read
 * `Timesheet.status`, which turns APPROVED only once the employer at the
 * bottom has accepted: Computer Systems' bill to Northbend, raised on
 * Northbend's signature as the route intends, could not clear its own
 * receipt check until CloudEPA — two rungs below the bill — had signed.
 *
 * ── Who the payer is ─────────────────────────────────────────────────
 *
 * The customer on the contract being billed: Northbend on Computer
 * Systems' contract, Computer Systems on CloudEPA's. Which of the
 * payer's signatures counts is `payersRole`, the same answer the
 * invoice-receipt match uses — CLIENT_APPROVAL where the payer is the
 * end client, PASS_THROUGH where it is a firm in the middle.
 *
 * **The top rung is covered too** (ruling relayed 2026-09-29): for the
 * top of a chain, and for a direct placement, the firm above is the
 * client. When Northbend signs 38 of 40, Computer Systems bills
 * Northbend for 38. The same refusals apply there as on every other
 * rung.
 *
 * ── What is refused rather than guessed ──────────────────────────────
 *
 * An acceptance is one number of hours for the week, with no daily
 * breakdown. Where the payer accepted exactly what was worked, the days
 * price the week as they always have — overtime, leave and straddle
 * included. Where it accepted a different number, that number is priced
 * straight, hours × rate, and only where nothing else is in question.
 * Three cases would need somebody to say where the difference came off,
 * and nobody has, so the week is left off the bill in a sentence:
 *
 *   - the week went over the overtime line, or the accepted number does
 *     — whether the two hours came off the ordinary hours or the
 *     premium ones changes the money;
 *   - only part of the week falls in the bill — which days the
 *     difference came off decides which bill it belongs to;
 *   - the acceptance covers only some of the week's days, or there is
 *     more than one of them.
 *
 * Pure. The route loads the week; this says what it may bill.
 */

import { payersRole, weekWord } from '@/lib/money/payers-acceptance'

/** Hours are recorded to two decimals; compare at that precision. */
const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.005

/** One live signature on the week, as billing needs to read it. */
export interface Signature {
  companyId: string
  role: string
  hours: unknown
  coversFrom?: Date | null
  coversTo?: Date | null
}

/** The week, as seen from the contract being billed. */
export interface RungWeek {
  periodStart: Date
  periodEnd: Date
  /** The hours filed — what was worked. */
  totalHours: number
  personName: string
  /** The contract the hours are filed on — the employer's, at the bottom. */
  hoursContract: { companyId: string; clientCompanyId: string; endClientCompanyId: string | null }
  /** Every LIVE signature on the week. Only the payer's is read. */
  assertions: Signature[]
}

/** The payer's own signatures on the week, in the role its position calls for. */
export function payersSignatures(payerCompanyId: string, week: RungWeek): Signature[] {
  const role = payersRole(payerCompanyId, { sellContract: week.hoursContract })
  return week.assertions.filter((a) => a.companyId === payerCompanyId && a.role === role)
}

/**
 * True where the payer is the end client: the top of a chain, or a
 * direct placement. Priced by the same rule as every other rung — the
 * client is the firm above it.
 */
export function billsTheClient(payerCompanyId: string, week: RungWeek): boolean {
  return payersRole(payerCompanyId, { sellContract: week.hoursContract }) === 'CLIENT_APPROVAL'
}

/** What the week looks like priced from the days, for the cases that need it. */
export interface Worked {
  /** Only part of the week falls in this bill. */
  partial: boolean
  overtimeHours: number
  pendingHours: number
  bankedHours: number
}

export type RungPricing =
  /** Price the days as they always have been priced. */
  | { kind: 'AS_WORKED' }
  /** Price these hours straight, at the contract's rate. */
  | { kind: 'ACCEPTED'; hours: number; says: string }
  /** The payer has not accepted the week. Not on this bill. */
  | { kind: 'WAITING'; says: string }
  /** Accepted, and the arithmetic is not decided. Not on this bill. */
  | { kind: 'HELD'; says: string }

/**
 * What a rung may bill for one week.
 *
 * `afterHours` is the overtime line on the contract being billed, null
 * where it has none.
 */
export function whatTheRungBills(i: {
  payerCompanyId: string
  payerName: string
  week: RungWeek
  worked: Worked
  afterHours: number | null
}): RungPricing {
  const { week, payerName } = i

  const whose = `${week.personName}’s week of ${weekWord(week.periodStart)}`
  const mine = payersSignatures(i.payerCompanyId, week)

  if (mine.length === 0) {
    return {
      kind: 'WAITING',
      says:
        `${payerName} has not accepted ${whose}, so it is not on this bill. ` +
        `A firm bills only the hours the firm above it accepted; it bills once ${payerName} has.`,
    }
  }

  const covers = (s: Signature) =>
    (!s.coversFrom || s.coversFrom <= week.periodStart) && (!s.coversTo || s.coversTo >= week.periodEnd)

  if (mine.length > 1 || !covers(mine[0])) {
    return {
      kind: 'HELD',
      says:
        `${payerName} accepted only some of the days in ${whose}, and nothing says which ` +
        `hours those were, so the week is left off this bill rather than guessed at. ` +
        `It bills once ${payerName} accepts the whole week.`,
    }
  }

  const accepted = Number(mine[0].hours)

  // Accepted as worked: the days price it, overtime and all, exactly as
  // they would have before.
  if (same(accepted, week.totalHours)) return { kind: 'AS_WORKED' }

  const differs = `${payerName} accepted ${accepted} of the ${week.totalHours} hours in ${whose}`

  const overTheLine =
    i.worked.overtimeHours > 0 ||
    i.worked.pendingHours > 0 ||
    i.worked.bankedHours > 0 ||
    (i.afterHours != null && accepted > i.afterHours)
  if (overTheLine) {
    return {
      kind: 'HELD',
      says:
        `${differs}, and the week goes over the overtime line. Nothing records whether the ` +
        `difference came off the ordinary hours or the overtime, and the two are priced ` +
        `differently, so the week is left off this bill rather than guessed at.`,
    }
  }

  if (i.worked.partial) {
    return {
      kind: 'HELD',
      says:
        `${differs}, and the week crosses the edge of this bill. Nothing records which days ` +
        `the difference came off, so the week is left off this bill rather than guessed at.`,
    }
  }

  return {
    kind: 'ACCEPTED',
    hours: accepted,
    says: `${differs}, so it bills ${accepted}.`,
  }
}

/**
 * The receipt behind one line of a bill, for the three-way check.
 *
 * The payer's own signature on the week — never `Timesheet.status`,
 * which turns APPROVED only once the employer at the bottom has
 * accepted, and so held every bill upward for the rungs below it.
 *
 * `hours` is what the line is checked against: the payer's accepted
 * hours, at every rung — the client's signed hours at the top of a chain
 * and on a direct placement. `straight` is true where those hours differ
 * from the hours worked, so the line was priced hours × rate with no
 * premium on it.
 */
export function receiptFor(payerCompanyId: string, week: RungWeek): {
  signed: boolean
  hours: number
  straight: boolean
} {
  const mine = payersSignatures(payerCompanyId, week)
  if (mine.length !== 1) return { signed: false, hours: week.totalHours, straight: false }
  const accepted = Number(mine[0].hours)
  return { signed: true, hours: accepted, straight: !same(accepted, week.totalHours) }
}
