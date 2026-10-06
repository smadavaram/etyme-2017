import { describe, it, expect } from 'vitest'
import { standingAgainstLimit, ledgerStatus, linesCounted, daysFor, type SiteLine, type LimitRules } from '@/lib/tenure-days'
import { tenureCapVerdict, breakInServiceVerdict } from '@/lib/governance'
import { statusLabel } from '@/app/dashboard/tenure/words'

/**
 * One reading of a person against a client's time limit and break, for
 * every door that asks — the submission, the award, the activation, the
 * extension and the ledger (Addendum E).
 *
 * Before this the award refused for ever anybody once past the limit,
 * while the ledger and the submission door called a served break
 * eligible; and the break was counted from a rung that had ended while
 * another rung was still running, which blocked somebody mid-placement.
 *
 * The client in every case: an eighteen-month limit (548 days) and a
 * ninety-day break, both BLOCK, unless a case says otherwise.
 */

const DAY = 86_400_000
const NOW = new Date('2026-10-06T12:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * DAY)
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY)
const RULES = { capMonths: 18, breakDays: 90 }

const line = (start: Date, end: Date | null, live: boolean): SiteLine => ({ startDate: start, endDate: end, live })

function verdicts(lines: SiteLine[], rules: LimitRules = RULES) {
  const standing = standingAgainstLimit(lines, rules, NOW)
  const common = { standing, personName: 'Kwame Mensah', clientName: 'Northbend Athletic', ruleId: 'r', enforcementMode: 'BLOCK' as const, description: '' }
  return {
    standing,
    ledger: ledgerStatus(standing),
    cap: rules.capMonths != null ? tenureCapVerdict({ ...common, capMonths: rules.capMonths, breakDays: rules.breakDays }) : null,
    brk: rules.breakDays != null ? breakInServiceVerdict({ ...common, breakDays: rules.breakDays, now: NOW }) : null,
  }
}

describe('where a person stands against the client’s time limit and break', () => {
  it('somebody on site past the time limit is refused at award, and may come back the day their stretch ends plus the break', () => {
    const v = verdicts([line(ago(600), ahead(30), true)])
    expect(v.standing.state).toBe('PAST_ON_SITE')
    expect(v.standing.eligibleOn?.toISOString()).toBe(ahead(120).toISOString())
    expect(v.cap?.outcome).toBe('BLOCK')
    expect(v.cap?.reason).toContain('Feb 3, 2027')
    expect(v.ledger).toBe('BREAK_REQUIRED')
  })

  it('somebody on site past the limit on a contract with no end has no day yet on which they may come back', () => {
    const v = verdicts([line(ago(600), null, true)])
    expect(v.standing.state).toBe('PAST_ON_SITE')
    expect(v.standing.eligibleOn).toBeNull()
    expect(v.cap?.outcome).toBe('BLOCK')
    expect(v.cap?.reason).toMatch(/no end date, so there is no day yet/)
  })

  it('somebody past the limit who has left is refused until the break ends, and the day is their last day plus the break', () => {
    const v = verdicts([line(ago(790), ago(50), false)])
    expect(v.standing.state).toBe('IN_BREAK')
    expect(v.standing.eligibleOn?.toISOString()).toBe(ahead(40).toISOString())
    expect(v.cap?.outcome).toBe('BLOCK')
    expect(v.brk?.outcome).toBe('BLOCK')
    expect(v.brk?.reason).toContain('Nov 15, 2026')
    expect(v.ledger).toBe('IN_BREAK')
  })

  it('somebody whose break has been served is eligible again, and the days the limit counts start again from nought', () => {
    const v = verdicts([line(ago(830), ago(91), false)])
    expect(v.standing.state).toBe('BREAK_SERVED')
    expect(v.standing.countedDays).toBe(0)
    expect(v.standing.daysOnSite).toBe(739)
    expect(v.cap?.outcome).toBe('PASS')
    expect(v.cap?.reason).toMatch(/counts again from nought/)
    expect(v.brk?.outcome).toBe('PASS')
    expect(v.ledger).toBe('ELIGIBLE')
  })

  it('somebody who came back after a served break is counted from the day they came back, not from their first day years before', () => {
    const v = verdicts([line(ago(900), ago(300), false), line(ago(100), ahead(200), true)])
    expect(v.standing.state).toBe('UNDER')
    expect(v.standing.countedDays).toBe(100)
    expect(v.standing.daysOnSite).toBe(700)
    expect(v.cap?.outcome).toBe('PASS')
    expect(v.brk?.outcome).toBe('PASS')
    expect(v.ledger).toBe('OK')
  })

  it('a contract booked before a served break does not bring the day the limit falls forward', () => {
    const lines = [line(ago(900), ago(300), false), line(ago(100), ahead(200), true)]
    const s = standingAgainstLimit(lines, RULES, NOW)
    expect(linesCounted(lines, s)).toHaveLength(1)
  })

  it('a gap shorter than the break resets nothing: the days on either side are added together', () => {
    const v = verdicts([line(ago(600), ago(300), false), line(ago(260), ahead(60), true)])
    expect(v.standing.countedDays).toBe(560)
    expect(v.standing.countedDays).toBeGreaterThanOrEqual(daysFor(18))
    expect(v.standing.state).toBe('PAST_ON_SITE')
    expect(v.cap?.outcome).toBe('BLOCK')
  })

  it('past the limit with no break rule is refused with no day of eligibility, because nothing the client set resets the count', () => {
    const v = verdicts([line(ago(790), ago(400), false)], { capMonths: 12, breakDays: null })
    expect(v.standing.state).toBe('PAST_NO_RETURN')
    expect(v.standing.eligibleOn).toBeNull()
    expect(v.cap?.outcome).toBe('BLOCK')
    expect(v.cap?.reason).toMatch(/set no break after the limit, so nothing resets the count/)
    // The ledger agrees: past the limit, never "eligible".
    expect(v.ledger).toBe('BREAK_REQUIRED')
  })

  it('a break starts only when no line is live: a chain’s rung that ended while another rung runs is not a break', () => {
    // The prime's line ended ten days ago; the person carries on under
    // the sub-vendor's line, which is still running.
    const v = verdicts([line(ago(200), ago(10), false), line(ago(200), ahead(100), true)])
    expect(v.standing.onSiteNow).toBe(true)
    expect(v.standing.state).toBe('UNDER')
    expect(v.brk?.outcome).toBe('PASS')
    expect(v.brk?.reason).toMatch(/no break is running/)
    expect(v.ledger).toBe('OK')
  })

  it('a paused contract is still a live line, so no break is running', () => {
    const v = verdicts([line(ago(120), ago(20), false), line(ago(60), ahead(60), true)])
    expect(v.brk?.outcome).toBe('PASS')
  })

  it('somebody under the limit inside the break is refused by the break rule and passed by the time limit, and the ledger shows the day', () => {
    const v = verdicts([line(ago(200), ago(30), false)])
    expect(v.standing.state).toBe('IN_BREAK')
    expect(v.cap?.outcome).toBe('PASS')
    expect(v.brk?.outcome).toBe('BLOCK')
    expect(v.ledger).toBe('IN_BREAK')
    expect(v.standing.eligibleOn?.toISOString()).toBe(ahead(60).toISOString())
  })

  it('tenure from two suppliers adds together and a chain’s two rungs on the same days count once', () => {
    const v = verdicts([
      line(ago(500), ago(300), false),
      line(ago(300), ahead(30), true),
      line(ago(300), ahead(30), true),
    ])
    expect(v.standing.countedDays).toBe(500)
    expect(v.standing.state).toBe('APPROACHING')
    expect(v.cap?.outcome).toBe('WARN')
    expect(v.cap?.reason).toContain('% of the time limit)')
    expect(v.ledger).toBe('WARNING')
  })

  it('a client that set its time limit to warn is warned, not refused', () => {
    const standing = standingAgainstLimit([line(ago(600), ahead(30), true)], RULES, NOW)
    const v = tenureCapVerdict({ standing, personName: 'P', clientName: 'C', ruleId: 'r', enforcementMode: 'WARN', description: '', capMonths: 18, breakDays: 90 })
    expect(v.outcome).toBe('WARN')
    expect(v.overridable).toBe(true)
  })

  it('somebody never on site at the client owes no break', () => {
    const v = verdicts([])
    expect(v.standing.state).toBe('UNDER')
    expect(v.brk?.outcome).toBe('PASS')
    expect(v.cap?.outcome).toBe('PASS')
  })

  it('the ledger calls somebody away past the limit with no break rule “Past the limit”, never “Break required” or “Eligible”', () => {
    expect(statusLabel('BREAK_REQUIRED', false)).toBe('Past the limit')
    expect(statusLabel('BREAK_REQUIRED', true)).toBe('Break required')
  })
})
