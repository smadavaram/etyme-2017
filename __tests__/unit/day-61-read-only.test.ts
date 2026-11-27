import { describe, it, expect } from 'vitest'
import { startsNewWork, readOnlyRuleOn, READ_ONLY_SAYS, OPEN_AT_DAY_61 } from '@/lib/tenant-state'

describe('the day 61 read-only rule, as a pure question', () => {
  it('a new placement is new work and is refused on day 61', () => {
    expect(startsNewWork('POST', '/api/placements')).toBe(true)
  })
  it('a new job request and a new submission are new work', () => {
    expect(startsNewWork('POST', '/api/requisitions')).toBe(true)
    expect(startsNewWork('POST', '/api/submissions')).toBe(true)
  })
  it('filing a timesheet on an existing placement is allowed on day 61', () => {
    expect(startsNewWork('POST', '/api/timesheets')).toBe(false)
    expect(startsNewWork('PATCH', '/api/timesheets/abc')).toBe(false)
  })
  it('issuing an invoice and approving a week already worked are allowed on day 61', () => {
    expect(startsNewWork('POST', '/api/invoices/generate')).toBe(false)
    expect(startsNewWork('POST', '/api/week-approvals/abc')).toBe(false)
  })
  it('reading is never refused, whatever the route', () => {
    expect(startsNewWork('GET', '/api/placements')).toBe(false)
    expect(startsNewWork('HEAD', '/api/submissions')).toBe(false)
  })
  it('the Owner can still reach Settings to choose a plan', () => {
    expect(startsNewWork('POST', '/api/settings/plugins')).toBe(false)
  })
  it('the twin approvals route is not on the open list, so the agents stop', () => {
    expect(startsNewWork('POST', '/api/twin/approvals/abc')).toBe(true)
  })
  it('every route left open says why', () => {
    for (const why of Object.values(OPEN_AT_DAY_61)) expect(why.length).toBeGreaterThan(10)
  })
  it('the refusal names the step', () => {
    expect(READ_ONLY_SAYS).toBe('Your 60 days ended. The Owner can choose a plan in Settings.')
  })
  it('the rule is on unless its one switch says off', () => {
    expect(readOnlyRuleOn({})).toBe(true)
    expect(readOnlyRuleOn({ ETYME_DAY61_READ_ONLY: 'on' })).toBe(true)
    expect(readOnlyRuleOn({ ETYME_DAY61_READ_ONLY: 'off' })).toBe(false)
  })
})
