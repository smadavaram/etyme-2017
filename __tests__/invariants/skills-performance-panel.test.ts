import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const panel = read('src/app/dashboard/decisions/agents/performance-panel.tsx')
const page = read('src/app/dashboard/decisions/agents/page.tsx')
const targets = read('src/app/api/decision-items/agents/targets/route.ts')

describe('the performance panel on Agent control', () => {
  it('sits on Agent control, not on the Activity log', () => {
    expect(page).toContain('<PerformancePanel')
    expect(read('src/app/dashboard/automation/page.tsx')).not.toContain('PerformancePanel')
  })

  it('draws agents and skills as a table and a feed from the same columns, the feed first on a phone', () => {
    expect(panel).toContain("from '@/components/list-surface'")
    expect(panel.match(/phoneView="feed"/g)?.length).toBe(2)
  })

  it('reads every column head and count label from the words file, never typed here', () => {
    for (const k of ['COLUMNS.planned', 'COLUMNS.actual', 'COLUMNS.variance', 'COLUMNS.varPct', 'COLUMNS.completion', 'COUNT_LABELS.ledgerActs', 'PERIOD_LABELS']) {
      expect(panel, k).toContain(k)
    }
  })

  it('uses the brand tokens and no color of its own', () => {
    expect(panel).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    expect(panel).not.toMatch(/\b(?:bg|text|border)-(?:red|green|blue|gray|slate|amber|yellow)-\d/)
  })

  it('shows no price, cost or charge', () => {
    const code = panel.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/\bprice|\bcost|\bcharge|\bdollar|\$\d/i)
  })

  it('every question the targets route asks, the panel has a field for', () => {
    for (const field of ['subjectKind', 'subjectKey', 'period', 'target', 'actingEntityId']) {
      expect(targets, field).toContain(field === 'subjectKind' || field === 'subjectKey' || field === 'period' || field === 'target' ? 'readTargetAsk' : field)
      expect(panel, field).toContain(field)
    }
  })

  it('only a seat that may set a target is offered the button, and a refused reader sees nothing', () => {
    expect(panel).toContain('{canSet && <button')
    expect(panel).toContain('if (isRefusal(e)) { setHidden(true); return }')
    expect(panel).toContain('if (hidden) return null')
    expect(page).toContain('canSet={data.canSwitch}')
  })
})
