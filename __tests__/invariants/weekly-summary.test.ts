import { describe, it, expect } from 'vitest'
import { isFirmMonday, lastWeekBefore, sumHours, summaryLine, summaryProof, type WeeklySummary } from '@/lib/agents/weekly-summary'
import { proposedDefaults, stoppedSays } from '@/lib/agents/control-view'

const s: WeeklySummary = {
  weekOf: new Date('2026-11-15T00:00:00Z'), customers: { active: 3, dormant: 1 }, suppliers: { active: 2, dormant: 0 },
  consultantsBilling: 5, hoursAccepted: 312.5, hoursWaiting: 40,
}

describe('the weekly summary', () => {
  it('runs only on the firm’s own Monday', () => {
    expect(isFirmMonday(new Date('2026-11-23T00:00:00Z'))).toBe(true)
    expect(isFirmMonday(new Date('2026-11-24T00:00:00Z'))).toBe(false)
  })
  it('reads the Sunday-to-Saturday week before that Monday', () => {
    const w = lastWeekBefore(new Date('2026-11-23T00:00:00Z'))
    expect(w.from.toISOString().slice(0, 10)).toBe('2026-11-15')
    expect(w.to.toISOString().slice(0, 10)).toBe('2026-11-22')
  })
  it('counts the hours the employer accepted, not the hours the client approved, where they differ', () => {
    expect(sumHours([{ acceptedHours: '30', totalHours: '40' }, { acceptedHours: null, totalHours: '8.25' }])).toBe(38.25)
  })
  it('says one supplier active, not “1 suppliers active”', () => {
    expect(summaryLine({ ...s, suppliers: { active: 1, dormant: 0 } })).toContain('1 supplier active, 0 dormant')
  })
  it('says every figure in one line, with the week it is for', () => {
    const line = summaryLine(s)
    expect(line).toContain('3 customers active, 1 dormant')
    expect(line).toContain('5 consultants billing')
    expect(line).toContain('312.5 hours accepted for the week of November 15')
    expect(line).toContain('40 hours waiting for acceptance')
  })
  it('says consultants billing does not apply to a firm that sells nobody’s time, instead of printing a zero', () => {
    expect(summaryLine({ ...s, consultantsBilling: null })).toContain('not applicable to this firm')
  })
  it('says the summary sends nothing and changes nothing', () => {
    expect(summaryProof(s)).toContain('sends nothing and changes nothing')
  })
})

describe('what Agent control adds', () => {
  it('a running task shows Stopped once its agent is switched off', () => {
    expect(stoppedSays('RUNNING', 'OFF', 'Timesheet chase')).toMatch(/^Stopped: Timesheet chase is switched off/)
  })
  it('a running task on drafts only shows Stopped, because nothing is sent', () => {
    expect(stoppedSays('APPROVED', 'DRAFT_ONLY', 'Timesheet chase')).toMatch(/Drafts only/)
  })
  it('a task still waiting for its yes is not shown as Stopped, and neither is a task whose agent is on', () => {
    expect(stoppedSays('PROPOSED', 'OFF', 'x')).toBeNull()
    expect(stoppedSays('RUNNING', 'ON', 'x')).toBeNull()
  })
  it('the proposed defaults of every chasing agent are listed in one place', () => {
    const keys = proposedDefaults().map((d) => d.agentKey)
    expect(keys).toEqual(expect.arrayContaining(['timesheet-chase', 'money-owed-chase', 'interview-chase', 'census-keeper', 'weekly-summary']))
  })
})
