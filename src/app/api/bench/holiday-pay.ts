import { prisma } from '@/lib/db'
import { loadCompanyHolidays } from '@/lib/holidays'
import { daysOffFor } from '@/lib/days-off'
import { latestPerPerson, personAnswer, turnedSays, asSwitch } from '@/lib/bench-holiday-switch'
import type { HolidayPay } from '@/lib/bench-policy'
import type { HolidayAnswerRow } from '@/lib/bench-profit'

/**
 * Each person's holiday answer, for the bench figures that count days.
 *
 * The founder, 2026-10-03: holidays on the bench are a company setting,
 * off by default, switched on per person; an integrator pays its people
 * for holidays by default. Whether one person is paid is `holidayPayFor`
 * (through `personAnswer` in lib/bench-holiday-switch, the same door the
 * settings route answers from), and the days are the firm's calendar from
 * lib/holidays.
 *
 * ── Which calendar ───────────────────────────────────────────────────
 *
 * A person on the bench is at no client's site, so the calendar is the
 * firm's own, filtered to the firm's country where it has one. A firm
 * with no country on record reads every holiday on its calendar — which
 * for a firm with one country's days is exactly right, and is said in the
 * basis on bench profit.
 *
 * The days counted are the firm's own working days (`daysOffFor` in
 * lib/days-off): a firm with Friday off has no bench Friday and a bench
 * Saturday. A firm that never set its week reads Saturday and Sunday off.
 *
 * Read by /api/bench/burn and /api/bench/profit. Both already put every
 * person whose pay they show on the access trail, so this read adds none.
 */
export interface BenchHolidays {
  /** The answer for `benchDays`, for one person. */
  payOf(personId: string): HolidayPay
  /** The same answer, as a row says it. */
  answerOf(personId: string): HolidayAnswerRow
}

export async function benchHolidays(input: {
  companyId: string
  companyKind: string
  country: string | null
  /** The earliest day any figure counts from, so the calendar covers it. */
  from: Date
  to: Date
}): Promise<BenchHolidays> {
  const [rows, calendar, daysOff] = await Promise.all([
    prisma.benchHolidaySwitch.findMany({
      where: { companyId: input.companyId },
      select: { personId: true, paid: true, setAt: true, setBy: { select: { name: true } } },
    }),
    loadCompanyHolidays(input.companyId, input.from.getUTCFullYear(), input.to.getUTCFullYear(), input.country),
    daysOffFor(input.companyId),
  ])
  const firmTurns = rows.filter((r) => r.personId == null)
  const latest = latestPerPerson(rows)
  const answerOf = (personId: string): HolidayAnswerRow => {
    const row = latest.get(personId) ?? null
    const a = personAnswer(input.companyKind, firmTurns, row)
    return { paid: a.paid, source: a.source, says: a.says, turned: row ? turnedSays(asSwitch(row)) : null }
  }
  return {
    answerOf,
    payOf: (personId) => ({ paid: answerOf(personId).paid, calendar, daysOff }),
  }
}
