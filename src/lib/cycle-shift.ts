/**
 * How a company wants its cycle dates to behave on a day nobody works.
 *
 * ── What the founder asked for ───────────────────────────────────────
 *
 * 2026-09-17: "If Sat or Sun — company can have settings to do before
 * weekend or after weekend. It's each company that can set up how their
 * cycles should work during holidays including company calendar."
 *
 * ── One knob per category, and why not one per kind ──────────────────
 *
 * The direction used to be decided in code: pay backward, everything else
 * forward. That default is right and stays the default — US payroll pays
 * a Saturday pay day on the Friday before, because moving it to the
 * Monday pays somebody after the period it covers, and a bill moving
 * earlier pulls a client's payment terms shorter. What was missing is
 * that a company could not say otherwise.
 *
 * Three settings, on the three words a person already reads a cycle in —
 * hours, pay, bill.
 *
 *   - One company-wide direction cannot express the behavior already
 *     shipped. A firm that pays on the Friday before still bills on the
 *     Monday after, so a single answer would either force everybody onto
 *     one direction — which changes when somebody is paid — or leave the
 *     real rule sitting in code outside the setting that claims to
 *     control it.
 *   - One per kind is six knobs per company and nothing to put in them.
 *     Nobody submits hours on the Monday after and approves them on the
 *     Friday before; the trade differs between paying and billing, not
 *     within either. CLAUDE.md names a knob per client as how the 2017
 *     engine reached four thousand commits.
 *
 * ── Three directions, not two ────────────────────────────────────────
 *
 * BEFORE, AFTER and NONE. A contract whose payment terms are counted in
 * calendar days wants the date left where it falls, and there was no way
 * to say so. `Invoice.dueAt` is already unshifted, so "leave it" is the
 * de-facto behavior of one date on the system and was the one answer a
 * company could not ask for.
 *
 * ── Whose policy applies ─────────────────────────────────────────────
 *
 * The company that holds the contract pair — the firm that sells to the
 * client and buys from the consultant or the sub-vendor. All six money
 * kinds are that firm's own operating dates: the hours it collects, the
 * invoice it raises, the payroll it runs. Holidays already union both
 * companies' calendars (`lib/holidays`), because a day the client is shut
 * is a day the work does not happen; the direction is one firm's policy
 * and not a negotiation.
 *
 * ── The boundary ─────────────────────────────────────────────────────
 *
 * This file is the company's policy and the arithmetic of a single date.
 * Generating the series is `lib/cycle-generator`, which is the money
 * desk's, and it reads `directionFor` and `shiftToWorkingDay` from here.
 */

import type { Category } from '@/lib/cycle-kinds'

/** Sunday and Saturday. */
const WEEKEND_DAYS = [0, 6]

export const SHIFT_DIRECTIONS = ['BEFORE', 'AFTER', 'NONE'] as const
export type ShiftDirection = (typeof SHIFT_DIRECTIONS)[number]

/** The three words a person reads a cycle in. */
export interface CycleShiftPolicy {
  hours: ShiftDirection
  pay: ShiftDirection
  bill: ShiftDirection
}

/**
 * What the engine did before any of this was configurable, and what every
 * company that has said nothing still gets.
 *
 * Changing these is changing when somebody is paid at every company that
 * never asked for it. It is not a default anybody may adjust quietly.
 */
export const DEFAULT_CYCLE_SHIFT: CycleShiftPolicy = {
  hours: 'AFTER',
  pay: 'BEFORE',
  bill: 'AFTER',
}

/** The words the company sees, and the reason underneath each. */
export const SHIFT_WORDS: Record<ShiftDirection, { label: string; means: string }> = {
  BEFORE: {
    label: 'The working day before',
    means: 'A Saturday date moves back to the Friday.',
  },
  AFTER: {
    label: 'The working day after',
    means: 'A Saturday date moves forward to the Monday.',
  },
  NONE: {
    label: 'Leave it where it falls',
    means: 'The date stays on the weekend or the holiday. For terms counted in calendar days.',
  },
}

/** What the three settings are called on a screen, and what each covers. */
export const SHIFT_CATEGORIES: { key: keyof CycleShiftPolicy; label: string; covers: string }[] = [
  { key: 'hours', label: 'Hours', covers: 'When hours are due, and when they must be approved.' },
  { key: 'pay', label: 'Pay', covers: 'Pay day, pay to calculate, and a supplier invoice to record.' },
  { key: 'bill', label: 'Bill', covers: 'The day an invoice is raised.' },
]

export function isShiftDirection(value: unknown): value is ShiftDirection {
  return typeof value === 'string' && (SHIFT_DIRECTIONS as readonly string[]).includes(value)
}

/** What a company row holds. Nullable because a caller may have loaded none of it. */
export interface CompanyShiftColumns {
  cycleShiftHours?: string | null
  cycleShiftPay?: string | null
  cycleShiftBill?: string | null
}

/**
 * The policy a company is actually on.
 *
 * A missing company, a missing column, or a value this build does not
 * recognize all read as the shipped default rather than as no answer. A
 * cycle date is money and a date arrived at by falling through a gap is
 * the one outcome that must not be possible.
 */
export function policyFrom(company: CompanyShiftColumns | null | undefined): CycleShiftPolicy {
  return {
    hours: isShiftDirection(company?.cycleShiftHours) ? company!.cycleShiftHours as ShiftDirection : DEFAULT_CYCLE_SHIFT.hours,
    pay: isShiftDirection(company?.cycleShiftPay) ? company!.cycleShiftPay as ShiftDirection : DEFAULT_CYCLE_SHIFT.pay,
    bill: isShiftDirection(company?.cycleShiftBill) ? company!.cycleShiftBill as ShiftDirection : DEFAULT_CYCLE_SHIFT.bill,
  }
}

/**
 * Which way a date of this kind moves at this company.
 *
 * OTHER is not configurable and moves forward, which is what it did
 * before. Nothing generated is OTHER — the generator skips anything that
 * is not a money kind — so this only ever answers for a row written by an
 * older build, and such a row should not change its behavior because
 * somebody edited a setting about pay.
 */
export function directionFor(
  category: Category,
  policy: CycleShiftPolicy = DEFAULT_CYCLE_SHIFT
): ShiftDirection {
  switch (category) {
    case 'HOURS': return policy.hours
    case 'PAY': return policy.pay
    case 'BILL': return policy.bill
    case 'OTHER': return 'AFTER'
  }
}

/**
 * The calendar day this date names, where the reader is.
 *
 * Dates here are built as local midnight and the holiday calendar is
 * keyed YYYY-MM-DD, so reading the key back with `toISOString()` converts
 * to UTC first and east of Greenwich local midnight is the previous day —
 * under `TZ=Asia/Kolkata` a due date on a holiday was never shifted at
 * all. `lib/cycle-generator` exports the same function as `localKey`;
 * when it moves onto this one there should be a single copy.
 */
export function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Whether anybody works on this day at this company. */
export function isWorkingDay(date: Date, holidays: Set<string> | ReadonlySet<string>): boolean {
  return !WEEKEND_DAYS.includes(date.getDay()) && !holidays.has(localDayKey(date))
}

/**
 * To the nearest working day, the way this company asked.
 *
 * Iterates, because the day before a holiday can be a Sunday and the day
 * after a Friday holiday is a Saturday. NONE returns the date untouched —
 * including a date that falls on Christmas Day, which is the point of it.
 */
export function shiftToWorkingDay(
  date: Date,
  holidays: Iterable<string> | Set<string> | ReadonlySet<string>,
  direction: ShiftDirection
): Date {
  if (direction === 'NONE') return new Date(date)
  const set = holidays instanceof Set ? holidays : new Set(holidays as Iterable<string>)
  const step = direction === 'BEFORE' ? -1 : 1
  const d = new Date(date)
  while (!isWorkingDay(d, set)) {
    d.setDate(d.getDate() + step)
  }
  return d
}
