import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as listTimesheets } from '@/app/api/timesheets/route'

/**
 * "Flagged entries are shown first", on Northbend Athletic's own desk.
 * The seeded 44-hour week sat third, behind two plain ones.
 */

const NIKE_HIRING = 'world-nike-hiring@demo.etyme.local'

describe('Northbend reads its flagged weeks first', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 240_000)

  it('the 44-hour week is at the top of Northbend’s timesheets, and every flagged week is listed before every unflagged one', async () => {
    as(NIKE_HIRING)
    const r = await json(await listTimesheets(req('GET', '/api/timesheets?limit=50')))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    const rows: Array<{ totalHours: number; flag: string | null }> = r.body.data.timesheets
    expect(rows.length).toBeGreaterThan(2)
    const over = rows.findIndex((t) => t.totalHours === 44)
    expect(over, 'the seeded 44-hour week is on the list').toBeGreaterThanOrEqual(0)
    expect(rows[over].flag).toMatch(/^44h claimed on a \d+h-a-week job\.$/)
    const firstPlain = rows.findIndex((t) => t.flag === null)
    const lastFlagged = rows.map((t) => t.flag !== null).lastIndexOf(true)
    expect(firstPlain === -1 || lastFlagged < firstPlain).toBe(true)
    expect(over).toBeLessThanOrEqual(lastFlagged)
  })
})
