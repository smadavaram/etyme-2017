import { describe, it, expect } from 'vitest'
import { figuresOfLine, figuresOfRecord, figureDifferences } from '@/lib/skills/checkers/weekly-summary'
import { summaryLine, type WeeklySummary } from '@/lib/agents/weekly-summary'

const week: WeeklySummary = {
  weekOf: new Date('2026-11-15T00:00:00Z'), customers: { active: 2, dormant: 1 }, suppliers: { active: 1, dormant: 0 },
  consultantsBilling: 3, hoursAccepted: 36.5, hoursWaiting: 24,
}

describe('the weekly summary checker’s reading of a line', () => {
  it('a line the agent writes reads back as the same eight figures the record gives', () => {
    expect(figureDifferences(figuresOfLine(summaryLine(week))!, figuresOfRecord(week))).toEqual([])
  })
  it('a firm that bills nobody reads consultants billing as not applicable, never as zero', () => {
    const none = { ...week, consultantsBilling: null }
    expect(figuresOfLine(summaryLine(none))!.find(([l]) => l === 'consultants billing')![1]).toBe('not applicable')
    expect(figureDifferences(figuresOfLine(summaryLine(none))!, figuresOfRecord({ ...none, consultantsBilling: 0 }))).toEqual(['consultants billing: the line says not applicable, the record says 0'])
  })
  it('one wrong hours figure is named, and nothing else is', () => {
    const d = figureDifferences(figuresOfLine(summaryLine(week))!, figuresOfRecord({ ...week, hoursWaiting: 30 }))
    expect(d).toEqual(['hours waiting: the line says 24, the record says 30'])
  })
  it('a sentence that is not a weekly summary line has no figures to compare', () => {
    expect(figuresOfLine('Drafted one chase')).toBeNull()
  })
  it('one customer and one supplier read in the singular and still parse', () => {
    expect(figuresOfLine(summaryLine({ ...week, customers: { active: 1, dormant: 0 }, suppliers: { active: 1, dormant: 0 }, consultantsBilling: 1, hoursAccepted: 1, hoursWaiting: 1 }))).not.toBeNull()
  })
})
