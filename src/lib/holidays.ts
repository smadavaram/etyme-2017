import { prisma } from '@/lib/db'

/**
 * Load holidays for a company as a Set of ISO date strings.
 * Used by the cycle generator for business-day shifting.
 *
 * Recurring holidays are expanded for the target year range.
 * The Set contains strings like "2026-12-25", "2027-01-01".
 */
export async function loadCompanyHolidays(
  companyId: string,
  startYear: number,
  endYear: number
): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: { companyId },
    select: { date: true, isRecurring: true },
  })

  const set = new Set<string>()

  for (const h of holidays) {
    const dateStr = h.date.toISOString().slice(0, 10)
    set.add(dateStr)

    // For recurring holidays, expand into each year in the range
    if (h.isRecurring) {
      const month = h.date.getMonth()
      const day = h.date.getDate()
      for (let y = startYear; y <= endYear; y++) {
        const expanded = new Date(y, month, day)
        set.add(expanded.toISOString().slice(0, 10))
      }
    }
  }

  return set
}

/**
 * Load holidays for BOTH companies in a contract relationship.
 * A contract between a US vendor and a Japanese client should respect
 * both sets of holidays for cycle generation.
 */
export async function loadContractHolidays(
  vendorCompanyId: string,
  clientCompanyId: string,
  startYear: number,
  endYear: number
): Promise<Set<string>> {
  const [vendorHolidays, clientHolidays] = await Promise.all([
    loadCompanyHolidays(vendorCompanyId, startYear, endYear),
    loadCompanyHolidays(clientCompanyId, startYear, endYear),
  ])

  // Union both sets
  for (const d of clientHolidays) {
    vendorHolidays.add(d)
  }

  return vendorHolidays
}

/**
 * US federal holidays — a convenience seed for US-based companies.
 * Returns holidays for the specified year.
 */
export function usFederalHolidays(year: number): { date: string; name: string }[] {
  return [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: nthWeekday(year, 0, 1, 3), name: 'Martin Luther King Jr. Day' }, // 3rd Monday Jan
    { date: nthWeekday(year, 1, 1, 3), name: "Presidents' Day" }, // 3rd Monday Feb
    { date: lastWeekday(year, 4, 1), name: 'Memorial Day' }, // Last Monday May
    { date: `${year}-06-19`, name: 'Juneteenth' },
    { date: `${year}-07-04`, name: 'Independence Day' },
    { date: nthWeekday(year, 8, 1, 1), name: 'Labor Day' }, // 1st Monday Sep
    { date: nthWeekday(year, 9, 1, 2), name: 'Columbus Day' }, // 2nd Monday Oct
    { date: `${year}-11-11`, name: 'Veterans Day' },
    { date: nthWeekday(year, 10, 4, 4), name: 'Thanksgiving Day' }, // 4th Thursday Nov
    { date: `${year}-12-25`, name: 'Christmas Day' },
  ]
}

/** Nth occurrence of a weekday in a month. month is 0-indexed. weekday: 0=Sun..6=Sat */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const d = new Date(year, month, 1)
  let count = 0
  while (count < n) {
    if (d.getDay() === weekday) count++
    if (count < n) d.setDate(d.getDate() + 1)
  }
  return d.toISOString().slice(0, 10)
}

/** Last occurrence of a weekday in a month */
function lastWeekday(year: number, month: number, weekday: number): string {
  const d = new Date(year, month + 1, 0) // last day of month
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() - 1)
  }
  return d.toISOString().slice(0, 10)
}
