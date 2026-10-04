/**
 * What one rung of a chain may bill for one week, and when.
 *
 * The founder, 2026-09-28 (CLAUDE.md, "What each rung may bill, and
 * when"):
 *
 *   1. **A firm bills only the hours the firm above it accepted.** If
 *      Computer Systems accepts 38 of Helena Marsh's 40, Techpeple's bill
 *      to Computer Systems is for 38. Generation prices the payer's
 *      accepted hours, not the hours worked.
 *   2. **A firm bills upward on the client's signature**, without waiting
 *      for the rungs below it to accept.
 *
 * ── What it was ───────────────────────────────────────────────────────
 *
 * Generation priced the daily hours on the sheet — the hours worked — at
 * every rung, so Techpeple billed Computer Systems for forty whatever
 * Computer Systems had accepted. And the three-way check on a bill read
 * `Timesheet.status`, which turns APPROVED only once the employer at the
 * bottom has accepted: Computer Systems' bill to Northbend, raised on
 * Northbend's signature as the route intends, could not clear its own
 * receipt check until Techpeple — two rungs below the bill — had signed.
 *
 * ── Who the payer is ─────────────────────────────────────────────────
 *
 * The customer on the contract being billed: Northbend on Computer
 * Systems' contract, Computer Systems on Techpeple's. Which of the
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
 * ── When the payer accepted fewer hours than were worked ─────────────
 *
 * An acceptance is one number of hours for a range of days, with no
 * daily breakdown. Where the payer accepted exactly what was worked, the
 * days price the week as they always have — overtime, leave and straddle
 * included. Where it accepted fewer, the founder's rule of 2026-09-29
 * (rule 4) says which hours the difference came off, and the days price
 * what is left (`acceptedDays` in lib/periods):
 *
 *   - **overtime first** — the hours over the line are cut before any
 *     ordinary hour, so 42 accepted of a 45-hour week with 5 over the
 *     line bills 40 ordinary and 2 overtime;
 *   - **the later bill first** — the cut walks from the last day
 *     backward, so where a week crosses a bill's edge the earlier bill
 *     keeps its days whole as far as the cut allows;
 *   - **a partial acceptance** is priced on the days it covers, with the
 *     same two rules inside them, and bills nothing of the other days.
 *
 * What the remaining hours over the line are worth is still the week's
 * own decision (lib/overtime): a premium is billed at the premium,
 * banked hours are billed by nobody, and hours nobody has decided are
 * left off and said, exactly as on a week accepted whole.
 *
 * ── What is still refused rather than guessed ────────────────────────
 *
 * Rule 4 speaks to fewer hours. Two cases it does not reach are left off
 * the bill in a sentence:
 *
 *   - **more than one acceptance** from the payer on one week — nothing
 *     says which of them governs (the route that records them refuses a
 *     second, so this is a record written some other way);
 *   - **more hours accepted than were worked** — nothing can be cut, and
 *     where the week goes over the overtime line, crosses a bill's edge,
 *     or the acceptance covers only some days, nothing says what kind of
 *     hour the extra ones are. On a straight, whole week it is priced
 *     straight, hours × rate, as before.
 *
 * Pure. The route loads the week; this says what it may bill.
 */

import { payersRole, weekWord } from '@/lib/money/payers-acceptance'
import type { AcceptedCut } from '@/lib/periods'

/** Hours are recorded to two decimals; compare at that precision. */
const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.005
const r2 = (n: number): number => Math.round(n * 100) / 100
const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

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
  /**
   * The daily hours filed, ISO date to hours. What a cut is taken off;
   * without them a cut cannot be placed on any day.
   */
  days?: Record<string, number> | null
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

/**
 * The payer's signature, read as what the days may bill. One reading,
 * shared by generation and by the three-way check, so the two cannot
 * price the same week two ways.
 */
export type Acceptance =
  /** The payer has not signed. */
  | { kind: 'NONE' }
  /** The payer has signed more than once, and nothing says which governs. */
  | { kind: 'MANY' }
  /** Every hour worked, the whole week. */
  | { kind: 'WHOLE'; hours: number }
  /** Fewer than worked, or only some days: the days price it, cut by rule 4. */
  | { kind: 'CUT'; accepted: AcceptedCut; covered: number; partial: boolean }
  /** More than worked on the whole week, or no daily hours to cut from. */
  | { kind: 'STRAIGHT'; hours: number }
  /** More than worked on only some of the days. */
  | { kind: 'MORE_ON_SOME_DAYS'; accepted: AcceptedCut; covered: number }

export function acceptanceOf(payerCompanyId: string, week: RungWeek): Acceptance {
  const mine = payersSignatures(payerCompanyId, week)
  if (mine.length === 0) return { kind: 'NONE' }
  if (mine.length > 1) return { kind: 'MANY' }

  const s = mine[0]
  const hours = Number(s.hours)
  const whole =
    (!s.coversFrom || s.coversFrom <= week.periodStart) && (!s.coversTo || s.coversTo >= week.periodEnd)

  if (whole && same(hours, week.totalHours)) return { kind: 'WHOLE', hours }

  const from = whole || !s.coversFrom ? null : isoDay(s.coversFrom)
  const to = whole || !s.coversTo ? null : isoDay(s.coversTo)
  const daily = Object.entries(week.days ?? {}).filter(([, h]) => Number(h) > 0)

  // No daily hours: nothing to place a cut on, and nothing to say which
  // days a range covers. A whole week keeps the straight pricing it had.
  if (daily.length === 0) {
    return whole ? { kind: 'STRAIGHT', hours } : { kind: 'MORE_ON_SOME_DAYS', accepted: { hours, from, to }, covered: 0 }
  }

  const covered = r2(
    daily
      .filter(([d]) => (!from || d >= from) && (!to || d <= to))
      .reduce((n, [, h]) => n + Number(h), 0)
  )

  if (hours > covered + 0.005) {
    return whole ? { kind: 'STRAIGHT', hours } : { kind: 'MORE_ON_SOME_DAYS', accepted: { hours, from, to }, covered }
  }

  return { kind: 'CUT', accepted: { hours, from, to }, covered, partial: !whole }
}

export type RungPricing =
  /** Price the days as they always have been priced. */
  | { kind: 'AS_WORKED' }
  /** Price the days this acceptance covers, with what it did not accept cut off (rule 4). */
  | { kind: 'CUT'; accepted: AcceptedCut; says: string }
  /** Price these hours straight, at the contract's rate. */
  | { kind: 'STRAIGHT'; hours: number; says: string }
  /** The payer has not accepted the week. Not on this bill. */
  | { kind: 'WAITING'; says: string }
  /** Accepted, and the arithmetic is not decided. Not on this bill. */
  | { kind: 'HELD'; says: string }

/** "September 16" */
const dayWord = (iso: string): string => weekWord(new Date(`${iso}T00:00:00.000Z`))

/**
 * What a rung may bill for one week.
 *
 * `afterHours` is the overtime line on the contract being billed, null
 * where it has none. `worked` is the week priced from the days as
 * worked, read only for the one case rule 4 does not reach: more hours
 * accepted than were worked.
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
  const a = acceptanceOf(i.payerCompanyId, week)

  switch (a.kind) {
    case 'NONE':
      return {
        kind: 'WAITING',
        says:
          `${payerName} has not accepted ${whose}, so it is not on this bill. ` +
          `A firm bills only the hours the firm above it accepted; it bills once ${payerName} has.`,
      }

    case 'MANY':
      return {
        kind: 'HELD',
        says:
          `${payerName} has more than one acceptance standing on ${whose}, and nothing says which ` +
          `of them governs, so the week is left off this bill rather than guessed at. ` +
          `It bills once ${payerName} withdraws all but one.`,
      }

    case 'WHOLE':
      return { kind: 'AS_WORKED' }

    case 'CUT': {
      const { from, to, hours } = a.accepted
      if (!a.partial) {
        return {
          kind: 'CUT',
          accepted: a.accepted,
          says: `${payerName} accepted ${hours} of the ${week.totalHours} hours in ${whose}, so it bills ${hours}.`,
        }
      }
      const range = `${from ? dayWord(from) : 'the start of the week'} to ${to ? dayWord(to) : 'the end of the week'}`
      return {
        kind: 'CUT',
        accepted: a.accepted,
        says:
          `${payerName} accepted ${hours} hours of ${whose}, for ${range} only, so it bills ` +
          `${hours} on those days and nothing for the rest of the week.`,
      }
    }

    case 'MORE_ON_SOME_DAYS':
      return {
        kind: 'HELD',
        says:
          `${payerName} accepted ${a.accepted.hours} hours for only some of the days in ${whose}, ` +
          `more than the ${a.covered} worked on them. Nothing says what the extra hours are, ` +
          `so the week is left off this bill rather than guessed at.`,
      }

    case 'STRAIGHT': {
      const differs = `${payerName} accepted ${a.hours} of the ${week.totalHours} hours in ${whose}`
      const overTheLine =
        i.worked.overtimeHours > 0 ||
        i.worked.pendingHours > 0 ||
        i.worked.bankedHours > 0 ||
        (i.afterHours != null && a.hours > i.afterHours)
      if (overTheLine) {
        return {
          kind: 'HELD',
          says:
            `${differs}, more than were worked, and the week goes over the overtime line. Nothing ` +
            `says whether the extra hours are ordinary hours or overtime, and the two are priced ` +
            `differently, so the week is left off this bill rather than guessed at.`,
        }
      }
      if (i.worked.partial) {
        return {
          kind: 'HELD',
          says:
            `${differs}, more than were worked, and the week crosses the edge of this bill. Nothing ` +
            `says which days the extra hours belong to, so the week is left off this bill rather than guessed at.`,
        }
      }
      return { kind: 'STRAIGHT', hours: a.hours, says: `${differs}, so it bills ${a.hours}.` }
    }
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
 * and on a direct placement. Where `cut` is set the payer accepted fewer
 * hours than were worked, or only some days: the caller prices the days
 * with that cut (`billableInPeriod`, the same call generation made) and
 * checks the line against the hours that pricing bills, so a bill made
 * by the rule passes and a bill for the unreduced hours fails. `straight`
 * is true where the line was priced hours × rate with no premium on it.
 */
export function receiptFor(payerCompanyId: string, week: RungWeek): {
  signed: boolean
  hours: number
  straight: boolean
  cut: AcceptedCut | null
} {
  const a = acceptanceOf(payerCompanyId, week)
  switch (a.kind) {
    case 'NONE':
    case 'MANY':
      return { signed: false, hours: week.totalHours, straight: false, cut: null }
    case 'WHOLE':
      return { signed: true, hours: a.hours, straight: false, cut: null }
    case 'CUT':
      return { signed: true, hours: a.accepted.hours, straight: false, cut: a.accepted }
    case 'STRAIGHT':
      return { signed: true, hours: a.hours, straight: true, cut: null }
    case 'MORE_ON_SOME_DAYS':
      return { signed: true, hours: a.accepted.hours, straight: true, cut: null }
  }
}
