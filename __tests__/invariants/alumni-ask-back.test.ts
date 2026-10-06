import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { askBack } from '@/app/api/alumni/ask-back-standing'
import { standingAgainstLimit, ledgerStatus, type SiteLine } from '@/lib/tenure-days'
import { breakInServiceVerdict } from '@/lib/governance'

/**
 * "Ask them back" is offered from the time-limit ledger (Addendum E
 * §E.2.3), and gives the same answer as the ledger and the award.
 *
 * The client in every case: an eighteen-month limit (548 days) and a
 * ninety-day break, unless a case says otherwise.
 */

const DAY = 86_400_000
const NOW = new Date('2026-10-06T12:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * DAY)
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY)
const RULES = { capMonths: 18, breakDays: 90 }
const line = (start: Date, end: Date | null, live: boolean): SiteLine => ({ startDate: start, endDate: end, live })
const ymd = (d: Date) => d.toISOString().slice(0, 10)

describe('ask them back, read off the time-limit ledger', () => {
  it('ask them back is offered only when the ledger reads the person eligible, and shows the eligibility date instead inside a break', () => {
    const lines = [line(ago(790), ago(50), false)]
    const a = askBack(lines, RULES, NOW)
    expect(a.canReengage).toBe(false)
    expect(a.ledgerStatus).toBe('IN_BREAK')
    expect(a.eligibleDate).toBe(ymd(ahead(40)))
    expect(a.eligibleDate).toBe(ymd(standingAgainstLimit(lines, RULES, NOW).eligibleOn!))
    expect(a.reengageBlockReason).toContain('90-day break')
    expect(a.reengageBlockReason).toContain('Nov 15, 2026')
  })

  it('somebody who left under the limit and is still inside the break is shown the day, not a button, because the award would refuse them until then', () => {
    const lines = [line(ago(200), ago(10), false)]
    const a = askBack(lines, RULES, NOW)
    expect(a.canReengage).toBe(false)
    expect(a.eligibleDate).toBe(ymd(ahead(80)))
    const brk = breakInServiceVerdict({
      standing: standingAgainstLimit(lines, RULES, NOW), personName: 'P', clientName: 'C',
      breakDays: 90, now: NOW, ruleId: 'r', enforcementMode: 'BLOCK', description: '',
    })
    expect(brk.outcome).toBe('BLOCK')
  })

  it('somebody who served the break is offered ask them back, even though they were once past the time limit', () => {
    const a = askBack([line(ago(900), ago(100), false)], RULES, NOW)
    expect(a.ledgerStatus).toBe('ELIGIBLE')
    expect(a.canReengage).toBe(true)
    expect(a.eligibleDate).toBeNull()
    expect(a.reengageBlockReason).toBeNull()
  })

  it('somebody past the time limit at a client with no break rule is not offered ask them back and is given no eligibility date', () => {
    const a = askBack([line(ago(800), ago(50), false)], { capMonths: 18, breakDays: null }, NOW)
    expect(a.ledgerStatus).toBe('BREAK_REQUIRED')
    expect(a.canReengage).toBe(false)
    expect(a.eligibleDate).toBeNull()
    expect(a.reengageBlockReason).toMatch(/^Past the limit\./)
    expect(a.reengageBlockReason).toContain('no day on which they may come back')
  })

  it('somebody under the time limit at a client with no break rule is offered ask them back the day after they leave', () => {
    const a = askBack([line(ago(200), ago(1), false)], { capMonths: 18, breakDays: null }, NOW)
    expect(a.canReengage).toBe(true)
  })

  it('somebody on contract here is never offered ask them back, whatever their standing', () => {
    expect(askBack([line(ago(100), ahead(100), true)], RULES, NOW).canReengage).toBe(false)
    expect(askBack([line(ago(700), ahead(30), true)], RULES, NOW).canReengage).toBe(false)
    expect(askBack([line(ahead(10), ahead(100), true)], RULES, NOW).canReengage).toBe(false)
  })

  it('a chain whose lower rung ended while the top rung runs never puts the person in a break on the alumni page', () => {
    const a = askBack([line(ago(300), ago(20), false), line(ago(300), ahead(60), true)], RULES, NOW)
    expect(a.eligibleDate).toBeNull()
    expect(a.reengageBlockReason).toBeNull()
  })

  it('a client with no time limit and no break offers ask them back to anybody who has left', () => {
    expect(askBack([line(ago(2000), ago(1), false)], { capMonths: null, breakDays: null }, NOW).canReengage).toBe(true)
  })

  it('the status sent beside the button is the ledger’s own word for the same person', () => {
    for (const lines of [
      [line(ago(790), ago(50), false)],
      [line(ago(900), ago(100), false)],
      [line(ago(100), ago(5), false)],
      [line(ago(450), ago(95), false)],
    ]) {
      expect(askBack(lines, RULES, NOW).ledgerStatus).toBe(ledgerStatus(standingAgainstLimit(lines, RULES, NOW)))
    }
  })

  it('neither the alumni list nor the ask-back request carries its own copy of the break arithmetic', () => {
    for (const f of ['src/app/api/alumni/route.ts', 'src/app/api/alumni/ask-back/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).toContain('askBack(')
      expect(src, f).not.toMatch(/daysSinceEnd|breakDaysPolicy|capDays/)
    }
  })
})
