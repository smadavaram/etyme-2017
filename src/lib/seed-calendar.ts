/**
 * The days nobody works, on every seeded firm's calendar.
 *
 * ── Why the demo could not show this ─────────────────────────────────
 *
 * `lib/cycle-generator` shifts a due date off a weekend and off both
 * companies' holidays, and `lib/cycle-shift` lets a company say which way
 * it moves. Neither could be demonstrated: no seeded company had a single
 * holiday, so every one of the 5,077 seeded cycle dates was computed
 * against weekends alone. A setting with nothing behind it is not a
 * feature, and a client asked to believe their pay day moves off
 * Thanksgiving has nothing on the screen that says it does.
 *
 * ── Written before the placements, on purpose ────────────────────────
 *
 * Cycle dates are generated once, when a contract is written, and nothing
 * regenerates them afterwards — which is correct: dates already issued
 * keep their dates. So the calendar has to exist before the first
 * contract, and `seedWorld` calls this immediately after the firms are
 * created and before anybody is placed.
 *
 * A world seeded before this file existed keeps its dates. To move them,
 * drop the world and seed it again — the same cost `lib/seed-days`
 * already documents for the birthday.
 *
 * ── Default aggressively ─────────────────────────────────────────────
 *
 * Eleven US federal holidays, because the customers are US enterprises
 * and this is the one calendar every one of them keeps. A company that
 * needs a different answer adds its own days from settings; a company
 * that needs another country's gets them with `country` set, which is
 * what `appliesTo` in `lib/holidays` reads so a Tokyo holiday does not
 * move a US site's pay day.
 */

import { prisma as db } from '@/lib/db'
import { seedToday } from '@/lib/seed-days'

/** Midnight UTC, so a key read back is the same day it was written. */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

/** The nth given weekday of a month. `nth` of -1 is the last one. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  if (nth > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1))
    const shift = (weekday - first.getUTCDay() + 7) % 7
    return new Date(Date.UTC(year, month - 1, 1 + shift + (nth - 1) * 7))
  }
  const last = new Date(Date.UTC(year, month, 0))
  const back = (last.getUTCDay() - weekday + 7) % 7
  return new Date(Date.UTC(year, month - 1, last.getUTCDate() - back))
}

/** The eleven, for one year. */
export function federalHolidays(year: number): { date: Date; name: string }[] {
  return [
    { date: utc(year, 1, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 1, 1, 3), name: 'Martin Luther King Jr. Day' },
    { date: nthWeekday(year, 2, 1, 3), name: "Presidents' Day" },
    { date: nthWeekday(year, 5, 1, -1), name: 'Memorial Day' },
    { date: utc(year, 6, 19), name: 'Juneteenth' },
    { date: utc(year, 7, 4), name: 'Independence Day' },
    { date: nthWeekday(year, 9, 1, 1), name: 'Labor Day' },
    { date: nthWeekday(year, 10, 1, 2), name: 'Columbus Day' },
    { date: utc(year, 11, 11), name: 'Veterans Day' },
    { date: nthWeekday(year, 11, 4, 4), name: 'Thanksgiving' },
    { date: utc(year, 12, 25), name: 'Christmas Day' },
  ]
}

/** YYYY-MM-DD, the key the generator compares against. */
const key = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The calendar the rest of the seed generates against.
 *
 * Module-level for the same reason `lib/seed-days` keeps the world's
 * birthday there: three seed files write contracts and all three have to
 * shift dates off the same days, and threading a set through four
 * signatures to say one thing is how a seed grows a parameter nobody
 * passes. Set by `seedCalendar` at the top of a run; empty before it,
 * which is exactly right — a world with no calendar shifts off weekends
 * only, which is what every world seeded before this file did.
 */
let calendar = new Set<string>()

/** Every day off on this world's calendar, as YYYY-MM-DD. */
export function holidayKeys(): Set<string> {
  return calendar
}

/** Back to weekends only. For a test that wants a world without one. */
export function forgetCalendar(): void {
  calendar = new Set<string>()
}

/**
 * Every seeded firm's calendar, and the keys to generate against.
 *
 * The years covered are the ones the seeded world actually spans: a year
 * behind for the placements that have ended, three ahead for the ones
 * that run on.
 */
export async function seedCalendar(
  firmBySlug: Map<string, { id: string }>
): Promise<{ days: number; keys: Set<string> }> {
  const born = seedToday().getUTCFullYear()
  const years = [born - 2, born - 1, born, born + 1, born + 2, born + 3]

  const keys = new Set<string>()
  let days = 0

  for (const firm of firmBySlug.values()) {
    for (const y of years) {
      for (const h of federalHolidays(y)) {
        keys.add(key(h.date))
        const already = await db.holiday.findFirst({
          where: { companyId: firm.id, date: h.date },
          select: { id: true },
        })
        if (already) continue
        await db.holiday.create({
          data: {
            companyId: firm.id, date: h.date, name: h.name,
            // Not recurring, even for the ones that fall on the same date
            // every year. Expanding a recurring row builds the date in
            // local time and looks it up by UTC key, which under
            // `TZ=Asia/Kolkata` matches nothing — the timezone fragility
            // `lib/cycle-generator` documents. An explicit date per year
            // is exact everywhere and costs eleven rows.
            isRecurring: false,
            country: 'US',
          },
        })
        days++
      }
    }
  }

  // One day off that is not this country's, so `appliesTo` has something
  // to refuse. Sundara Systems has an offshore practice; its Republic Day
  // is on its own calendar and must not move a US site's pay day.
  const offshore = firmBySlug.get('sundara')
  if (offshore) {
    for (const y of years) {
      const date = utc(y, 1, 26)
      if (await db.holiday.findFirst({ where: { companyId: offshore.id, date } })) continue
      await db.holiday.create({
        data: { companyId: offshore.id, date, name: 'Republic Day', isRecurring: false, country: 'IN' },
      })
      days++
    }
  }

  // Merged, never replaced. The world seed writes the calendar once; a
  // demo seeded afterwards in the same process adds its own firms' days
  // without taking the world's away.
  for (const k of keys) calendar.add(k)
  return { days, keys }
}
