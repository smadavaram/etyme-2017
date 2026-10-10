/**
 * The company's payroll: how often pay is run, when it is worked out and
 * when it is paid. One door for reading and writing all of it.
 *
 * The founder, 2026-10-07: "Give choice to businesses when they want to
 * configure payroll." The pack's rhythm is the default — every other
 * week, worked out the Wednesday and paid the Friday after the period's
 * Saturday — and a company may change it.
 *
 * The arithmetic is lib/pay-dates, which imports nothing so the settings
 * screen can preview with it. This file adds the row: the defaults where
 * a company said nothing, and who changed it and when. Money's cycle
 * generator reads a company's answers here (`paySettingsFor`) and its
 * dates from `payDatesFor`.
 *
 * Who must be paid how often is a law in some US states. The screen says
 * so as a fact beside the choice; turning it into a rule per state is
 * etyme-regulatory's, not this door's.
 */

import { prisma } from '@/lib/db'
import { checkPaySettings, rhythmFrom, type PayChanges, type PayRhythm } from '@/lib/pay-dates'

export {
  DEFAULT_PAY_RHYTHM,
  PAY_PERIODS,
  PAY_PERIOD_WORDS,
  PAY_BEFORE_WORKED_OUT,
  DAY_OF_MONTH_RANGE,
  STATE_PAY_NOTE,
  MEANS_MONTH_END,
  MAX_OFFSET_DAYS,
  checkPaySettings,
  rhythmFrom,
  payDatesFor,
  payDatesInMonth,
} from '@/lib/pay-dates'
export type { PayPeriod, PayRhythm, PayChanges, PayCheck, PayDates } from '@/lib/pay-dates'

export interface PaySettings extends PayRhythm {
  /** When somebody last answered. Null: nobody has, and the defaults stand. */
  setAt: Date | null
  setById: string | null
}

const SELECT = {
  payPeriod: true,
  payCalcOffsetDays: true,
  payDayOffsetDays: true,
  payDaysOfMonth: true,
  payCalcDaysBefore: true,
  paySettingsSetAt: true,
  paySettingsSetById: true,
} as const

/** What a company row holds, with who set it. */
export function paySettingsFrom(row: {
  payPeriod?: string | null
  payCalcOffsetDays?: number | null
  payDayOffsetDays?: number | null
  payDaysOfMonth?: number[] | null
  payCalcDaysBefore?: number | null
  paySettingsSetAt?: Date | null
  paySettingsSetById?: string | null
} | null | undefined): PaySettings {
  return {
    ...rhythmFrom(row),
    setAt: row?.paySettingsSetAt ?? null,
    setById: row?.paySettingsSetById ?? null,
  }
}

/** Everything this company answered about its payroll, or the defaults. */
export async function paySettingsFor(companyId: string): Promise<PaySettings> {
  const row = await prisma.company.findUnique({ where: { id: companyId }, select: SELECT })
  return paySettingsFrom(row)
}

/**
 * Change the answers, recording who and when. Refuses in a sentence, and
 * writes nothing on a refusal.
 */
export async function setPaySettings(
  companyId: string,
  byId: string,
  changes: PayChanges,
): Promise<{ ok: true; settings: PaySettings; changed: string[] } | { ok: false; field: string; message: string }> {
  const current = await paySettingsFor(companyId)
  const check = checkPaySettings(changes, current)
  if (!check.ok) return check
  if (check.changed.length === 0) return { ok: false, field: '', message: 'Nothing to change.' }
  const r = check.rhythm
  const row = await prisma.company.update({
    where: { id: companyId },
    data: {
      payPeriod: r.payPeriod,
      payCalcOffsetDays: r.payCalcOffsetDays,
      payDayOffsetDays: r.payDayOffsetDays,
      payDaysOfMonth: r.payDaysOfMonth,
      payCalcDaysBefore: r.payCalcDaysBefore,
      paySettingsSetAt: new Date(),
      paySettingsSetById: byId,
    },
    select: SELECT,
  })
  return { ok: true, settings: paySettingsFrom(row), changed: check.changed }
}
