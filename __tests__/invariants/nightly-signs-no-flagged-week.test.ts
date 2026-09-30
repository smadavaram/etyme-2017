import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decide } from '@/lib/auto-approval'
import { weekFlag } from '@/lib/timesheet-flag'

/**
 * The nightly job signs a week nobody answered only where the client's
 * order allows it — and never one that does not fit its contract.
 *
 * `decide` already held a flagged week; the cron route never passed it
 * the flag, so a 44-hour week on a 40-hour job, or a week past the last
 * day, was signed by silence once its window ran out (demand, 2026-09-30).
 */

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/cron/auto-approve/route.ts'), 'utf8')
const NOW = new Date('2026-09-30T12:00:00Z')
const sheet = (flag: string | null) => ({
  id: 't1', personName: 'Omar Haddad', submittedAt: new Date('2026-09-01T00:00:00Z'), totalHours: 44,
  clientApprovedAt: null, anomalyScore: null, anomalyReason: null, flag,
  windowDays: 5, autoApproves: true, clientName: 'Northbend Athletic',
})

describe('the nightly job never signs a week that does not fit its contract', () => {
  it('the nightly job never signs a week that does not fit its contract', () => {
    const flag = weekFlag({
      hours: 44, hoursPerWeek: 40, periodEnd: new Date('2026-08-29T00:00:00Z'),
      contractEnd: null, anomalyScore: null, anomalyReason: null,
    })
    expect(flag).toBe('44h claimed on a 40h-a-week job.')
    const d = decide(sheet(flag), NOW)
    expect(d.verdict).toBe('HELD')
    expect(d.says).toContain('44h claimed on a 40h-a-week job.')
  })

  it('a week past the contract’s last day is held too', () => {
    const flag = weekFlag({
      hours: 40, hoursPerWeek: 40, periodEnd: new Date('2026-09-05T00:00:00Z'),
      contractEnd: new Date('2026-09-02T00:00:00Z'), anomalyScore: null, anomalyReason: null,
    })
    expect(decide(sheet(flag), NOW).verdict).toBe('HELD')
  })

  it('an ordinary week past its window is still signed where the client’s order allows it', () => {
    expect(decide(sheet(null), NOW).verdict).toBe('APPROVE')
  })

  it('the route hands every week’s flag to the decision, read against the job’s hours and the line’s last day', () => {
    expect(ROUTE).toMatch(/flag: weekFlag\(\{/)
    expect(ROUTE).toMatch(/hoursPerWeek: t\.sellContract\.requirement\?\.hoursPerWeek \?\? null/)
    expect(ROUTE).toMatch(/contractEnd: t\.sellContract\.endDate/)
  })
})
