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

/**
 * UK bank holidays for a year.
 *
 * England and Wales. Scotland and Northern Ireland differ on two days
 * each, and a company that needs those adds them — seeding one nation's
 * calendar for all four would be confidently wrong rather than merely
 * incomplete.
 *
 * Easter is computed rather than tabulated, because a table runs out and
 * nobody notices until an invoice run fires on Good Friday.
 */
export function ukBankHolidays(year: number): { date: string; name: string }[] {
  const easter = easterSunday(year)
  const goodFriday = addDays(easter, -2)
  const easterMonday = addDays(easter, 1)

  // Christmas and Boxing Day are settled together, not one at a time.
  // In 2027 the 25th is a Saturday and the 26th a Sunday, so both would
  // move to Monday the 27th and collide — the actual rule gives them the
  // next two working days, Monday and Tuesday.
  const [christmas, boxing] = consecutiveSubstitutes(
    new Date(Date.UTC(year, 11, 25)),
    new Date(Date.UTC(year, 11, 26))
  )

  const movable = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: nthWeekday(year, 4, 1, 1), name: 'Early May bank holiday' },
    { date: lastWeekday(year, 4, 1), name: 'Spring bank holiday' },
    { date: lastWeekday(year, 7, 1), name: 'Summer bank holiday' },
  ].map((d) => ({ ...d, date: iso(nextWorkingDayIfWeekend(new Date(d.date + 'T00:00:00Z'))) }))

  // Good Friday and Easter Monday are already weekdays by construction and
  // are never substituted.
  const days = [
    movable[0],
    { date: iso(goodFriday), name: 'Good Friday' },
    { date: iso(easterMonday), name: 'Easter Monday' },
    movable[1],
    movable[2],
    movable[3],
    { date: iso(christmas), name: 'Christmas Day' },
    { date: iso(boxing), name: 'Boxing Day' },
  ]

  return days.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * India's three national holidays.
 *
 * Deliberately only three. India's calendar is largely state and religion
 * specific — Diwali, Holi, Eid and Pongal move and differ by state — so
 * seeding a guess would put confident wrong dates in front of somebody who
 * would then trust them. These three are national, fixed, and true
 * everywhere; a company adds its own.
 */
export function indiaNationalHolidays(year: number): { date: string; name: string }[] {
  return [
    { date: `${year}-01-26`, name: 'Republic Day' },
    { date: `${year}-08-15`, name: 'Independence Day' },
    { date: `${year}-10-02`, name: 'Gandhi Jayanti' },
  ]
}

/** Whether we have a calendar for a country at all. */
export function holidaysFor(country: string, year: number): { date: string; name: string }[] | null {
  switch (country.toUpperCase()) {
    case 'US': return usFederalHolidays(year)
    case 'GB':
    case 'UK': return ukBankHolidays(year)
    case 'IN': return indiaNationalHolidays(year)
    // Saying no is better than seeding another country's dates. A wrong
    // calendar looks deliberate and nobody checks it again.
    default: return null
  }
}

/** Anonymous Gregorian computus. Works for any year we care about. */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Two holidays that must not land on the same day.
 *
 * Each moves off the weekend, and the second moves again if the first
 * took its place. Christmas and Boxing Day are the pair this exists for.
 */
function consecutiveSubstitutes(first: Date, second: Date): [Date, Date] {
  const a = nextWorkingDayIfWeekend(first)
  let b = nextWorkingDayIfWeekend(second)
  while (iso(b) <= iso(a)) b = nextWorkingDayIfWeekend(addDays(b, 1))
  return [a, b]
}

/** A weekend holiday moves to the next weekday. */
function nextWorkingDayIfWeekend(d: Date): Date {
  const day = d.getUTCDay()
  if (day === 6) return addDays(d, 2)
  if (day === 0) return addDays(d, 1)
  return d
}
