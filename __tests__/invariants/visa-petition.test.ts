import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { applyMove, byCalendar, statusWord, MOVES } from '@/lib/visa-petition'

/**
 * A visa petition from filing to the day it runs out.
 *
 * Seven statuses, one reader, no writer: an H-1B could not be filed
 * here, an RFE could not be recorded, and the watch job counted down to
 * an expiry nobody had entered.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const priya = { personName: 'Priya Raman', type: 'H1B' }
const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('the moves, in the order the process goes', () => {
  it('a filed petition can get a request for evidence, be approved, or be denied', () => {
    expect(MOVES.FILED).toEqual(['RFE', 'APPROVED', 'DENIED'])
  })
  it('a request for evidence is recorded, then answered, and the petition is still waiting', () => {
    expect(applyMove('FILED', 'RFE', priya)).toMatchObject({ ok: true, status: 'RFE', event: 'RFE_ISSUED' })
    expect(applyMove('RFE', 'RFE_ANSWERED', priya)).toMatchObject({ ok: true, status: 'RFE', event: 'RFE_RESPONDED', says: "Priya Raman's H1B: evidence sent." })
  })
  it('an approval comes with the date it runs out, or it is not recorded', () => {
    expect(applyMove('RFE', 'APPROVED', priya)).toMatchObject({ ok: false, code: 'DATE_REQUIRED' })
    expect(applyMove('RFE', 'APPROVED', { ...priya, expiresAt: d('2029-09-30') })).toMatchObject({ ok: true, status: 'APPROVED', event: 'APPROVED' })
  })
  it('stamping is after approval; working on it is after either', () => {
    expect(applyMove('APPROVED', 'STAMPED', priya)).toMatchObject({ ok: true, status: 'STAMPED' })
    expect(applyMove('STAMPED', 'ACTIVE', priya)).toMatchObject({ ok: true, status: 'ACTIVE', event: 'ACTIVATED' })
    expect(applyMove('FILED', 'STAMPED', priya)).toMatchObject({ ok: false, code: 'NOT_NEXT' })
  })
  it('a move that is not next is refused in a sentence that says what is', () => {
    const v = applyMove('FILED', 'STAMPED', priya)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.message).toBe("Priya Raman's H1B is filed. From here it can be request for evidence received, or approved, or denied.")
  })
  it('a denied or expired petition is over', () => {
    expect(applyMove('DENIED', 'APPROVED', priya)).toMatchObject({ ok: false })
    expect(applyMove('EXPIRED', 'ACTIVE', priya)).toMatchObject({ ok: false })
  })
})

describe('the calendar moves the last two', () => {
  const now = d('2026-09-14')
  it('inside ninety days of running out, an active petition is running out', () => {
    expect(byCalendar('ACTIVE', d('2026-11-30'), now)).toBe('EXPIRING')
  })
  it('past the date, it is expired, whatever it was', () => {
    expect(byCalendar('ACTIVE', d('2026-09-01'), now)).toBe('EXPIRED')
    expect(byCalendar('EXPIRING', d('2026-09-01'), now)).toBe('EXPIRED')
    expect(byCalendar('EXPIRED', d('2026-09-01'), now)).toBeNull()
  })
  it('a petition with a year to run, or none filed with a date, is left alone', () => {
    expect(byCalendar('ACTIVE', d('2027-09-30'), now)).toBeNull()
    expect(byCalendar('FILED', null, now)).toBeNull()
  })
})

describe('what people read', () => {
  it('a status is a phrase, not an enum', () => {
    expect(['FILED', 'RFE', 'EXPIRING'].map(statusWord)).toEqual(['Filed', 'Evidence requested', 'Running out'])
  })
  it('the compliance page has a Visas tab to file and move petitions from', () => {
    const page = read('src/app/dashboard/compliance/page.tsx')
    expect(page).toContain("{ key: 'visas' as const, label: 'Visas' }")
    expect(page).toContain("post('/api/compliance/petitions', form)")
  })
  it('the watch job moves petitions by the calendar and writes an event', () => {
    const watch = read('src/app/api/cron/visa-watch/route.ts')
    expect(watch).toContain('byCalendar(')
    expect(watch).toContain("next === 'EXPIRED' ? 'EXPIRED' : 'EXPIRING'")
  })
})
