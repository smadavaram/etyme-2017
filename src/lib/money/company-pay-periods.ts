/**
 * A company's pay rhythm and its rule for a pay day on a day nobody
 * works, read once so a screen can list many periods with one query.
 *
 * The same pieces as `payPeriodAt` in lib/payroll-settings, which answers
 * for one day: the rhythm through `rhythmFrom`, the direction and days off
 * through `policyFrom`, and the company's own holiday calendar through
 * `loadCompanyHolidays`. The arithmetic is lib/money/pay-periods, which
 * walks `payPeriodHolding`. A test holds the two doors to one answer.
 *
 * Only the company's own calendar is read. A contract's pay dates in
 * lib/contract-cycles also add the client's holidays: that is the
 * generator's, and a payroll period is the company's own.
 */

import { prisma } from '@/lib/db'
import { rhythmFrom, type DayOffRule, type PayRhythm } from '@/lib/pay-dates'
import { policyFrom } from '@/lib/cycle-shift'
import { loadCompanyHolidays } from '@/lib/holidays'
import { paysByPeriod } from '@/lib/money/pay-periods'

export interface CompanyPayPeriods {
  rhythm: PayRhythm
  rule: DayOffRule
  /** True where the company lists pay by its own periods (`paysByPeriod`). */
  byPeriod: boolean
}

/**
 * The company's rhythm and day-off rule, with holidays for every year
 * from `fromYear` to `toYear`. Default: three years either side of today,
 * which holds every period a payroll page lists.
 */
export async function companyPayPeriods(
  companyId: string,
  years: { fromYear?: number; toYear?: number } = {},
): Promise<CompanyPayPeriods> {
  const row = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      payPeriod: true, payCalcOffsetDays: true, payDayOffsetDays: true, payDaysOfMonth: true,
      payCalcDaysBefore: true, payFirstPeriodStart: true,
      cycleShiftHours: true, cycleShiftPay: true, cycleShiftBill: true, daysOff: true,
    },
  })
  const rhythm = rhythmFrom(row)
  const byPeriod = paysByPeriod(rhythm)
  const policy = policyFrom(row)
  if (!byPeriod) return { rhythm, rule: { direction: policy.pay, daysOff: policy.daysOff }, byPeriod }
  const y = new Date().getUTCFullYear()
  const holidays = await loadCompanyHolidays(companyId, years.fromYear ?? y - 3, years.toYear ?? y + 3)
  return { rhythm, rule: { holidays, direction: policy.pay, daysOff: policy.daysOff }, byPeriod }
}
