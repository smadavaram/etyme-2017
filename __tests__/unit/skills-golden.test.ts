import { describe, it, expect } from 'vitest'
import { diffSnapshots, canonical, type GoldenSnapshot } from '@/lib/skills/golden'

const base = (): GoldenSnapshot => ({
  recordActions: [
    { order: 1, action: 'DRAFTED', recordType: 'Timesheet', summary: 'Chase drafted for Ana' },
    { order: 2, action: 'DRAFTED', recordType: 'Timesheet', summary: 'Chase drafted for Ben' },
  ],
  tasks: [{ kind: 'TIMESHEET_CHASE', status: 'PROPOSED', plan: { messages: [{ template: 'a' }], retries: 1 } }],
  cards: [{ kind: 'TIMESHEET_CHASE', owedSeat: 'AP & Payroll' }],
  mail: [{ to: 'ana@x.example', template: 'timesheet-chase' }],
  automation: [{ action: 'CHASE', summary: 'Chased one week', reason: 'Week was not filed', reversible: false }],
})

describe('the golden snapshot', () => {
  it('two snapshots of the same run are equal', () => {
    expect(diffSnapshots(base(), base())).toEqual([])
  })
  it('a plan whose keys came in another order is the same plan', () => {
    const b = base()
    b.tasks[0].plan = { retries: 1, messages: [{ template: 'a' }] }
    expect(diffSnapshots(base(), b)).toEqual([])
    expect(canonical({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 })
  })
  it('one changed summary on a ledger row is named by its row', () => {
    const b = base()
    b.recordActions[1].summary = 'Chase drafted for Bo'
    const d = diffSnapshots(base(), b)
    expect(d).toHaveLength(1)
    expect(d[0]).toContain('recordActions row 2')
  })
  it('one extra ledger row is caught', () => {
    const b = base()
    b.recordActions.push({ order: 3, action: 'DRAFTED', recordType: 'Timesheet', summary: 'x' })
    expect(diffSnapshots(base(), b)[0]).toContain('2 rows before, 3 after')
  })
  it('a card owed to a different seat is caught', () => {
    const b = base()
    b.cards[0].owedSeat = 'Owner'
    expect(diffSnapshots(base(), b)[0]).toContain('cards row 1')
  })
  it('a letter sent to someone else, or under another template, is caught', () => {
    const b = base(); b.mail[0].to = 'zed@x.example'
    const c = base(); c.mail[0].template = 'other'
    expect(diffSnapshots(base(), b)).toHaveLength(1)
    expect(diffSnapshots(base(), c)).toHaveLength(1)
  })
  it('a task that changed status or plan, and an activity log row that changed, are caught', () => {
    const b = base(); b.tasks[0].status = 'APPROVED'
    const c = base(); c.tasks[0].plan = { retries: 2 }
    const d = base(); d.automation[0].reversible = true
    for (const x of [b, c, d]) expect(diffSnapshots(base(), x)).toHaveLength(1)
  })
})
