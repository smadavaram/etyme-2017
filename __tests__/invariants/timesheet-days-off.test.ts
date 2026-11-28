import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { daysOffFromAnswer, isOffDay, expectedHours } from '@/app/dashboard/timesheets/days-off'

/**
 * Days off are a company setting (founder, 2026-09-30: "If a company is
 * in Dubai they would have Friday off"). The timesheet screen reads them
 * for what a week expects and how a day is shaded, and never for what may
 * be filed. The week of Sunday 4 October 2026 to Saturday 10 October.
 */
const FRIDAY = '2026-10-09'
const SATURDAY = '2026-10-10'
const SUNDAY = '2026-10-04'
const page = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'dashboard', 'timesheets', 'page.tsx'), 'utf8')

describe('the timesheet screen follows the company week', () => {
  it("the timesheet screen shades the company's days off, not Saturday and Sunday by habit", () => {
    expect(page).not.toMatch(/dow === 'Sat'|dow === 'Sun'/)
    expect(page).toContain("fetch('/api/settings/week')")
    expect(page).toMatch(/isOffDay\(date, daysOff\)/)
  })

  it('a firm with Friday off sees Friday as the day off and Sunday as a working day', () => {
    const fridayOff = daysOffFromAnswer({ data: { daysOff: [5] } })
    expect(isOffDay(FRIDAY, fridayOff)).toBe(true)
    expect(isOffDay(SUNDAY, fridayOff)).toBe(false)
    expect(expectedHours(FRIDAY, fridayOff)).toBe(0)
    expect(expectedHours(SUNDAY, fridayOff)).toBe(8)
  })

  it('a company that never answered, or a seat that cannot read the setting, keeps Saturday and Sunday off', () => {
    for (const answer of [null, {}, { data: {} }, { data: { daysOff: 'Friday' } }]) {
      const off = daysOffFromAnswer(answer)
      expect(isOffDay(SATURDAY, off)).toBe(true)
      expect(isOffDay(SUNDAY, off)).toBe(true)
      expect(isOffDay(FRIDAY, off)).toBe(false)
    }
  })

  it('a company with no days off expects hours on all seven', () => {
    const none = daysOffFromAnswer({ data: { daysOff: [] } })
    for (const d of [SUNDAY, FRIDAY, SATURDAY]) expect(expectedHours(d, none)).toBe(8)
  })

  it('hours entered on a day off are still sent with the week, never dropped or refused', () => {
    // The submit handler sends every day with hours; it does not consult days off.
    const submit = page.slice(page.indexOf('async function handleSubmit'), page.indexOf("fetch('/api/timesheets'"))
    expect(submit).not.toMatch(/isOffDay|daysOff/)
    expect(submit).toContain('for (const d of weekDates) if ((hours[d] ?? 0) > 0) days[d] = hours[d]')
  })
})
