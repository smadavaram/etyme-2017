import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startDaySays } from '@/lib/document-stages/start-day'
import { fixForReader } from '@/lib/contract-clearance'
import { desksHolding } from '@/lib/permissions'

const NOW = new Date('2026-11-03T12:00:00Z')
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the start-papers link says the start day the way a person reads it', () => {
  it('a start day already gone reads "was due to start", printed as a day, never as the stored date', () => {
    const says = startDaySays({ startDate: new Date('2026-08-09T00:00:00Z'), now: NOW, running: false, clientName: 'Northbend Athletic' })
    expect(says).toBe('You were due to start at Northbend Athletic on Aug 9, 2026.')
    expect(says).not.toContain('2026-08-09')
  })

  it('a start day gone on a running line reads "started", and a day to come reads "due to start"', () => {
    expect(startDaySays({ startDate: new Date('2026-08-09T00:00:00Z'), now: NOW, running: true, clientName: 'Northbend Athletic' })).toBe('You started at Northbend Athletic on Aug 9, 2026.')
    expect(startDaySays({ startDate: new Date('2026-11-16T00:00:00Z'), now: NOW, running: false })).toBe('You are due to start on Nov 16, 2026.')
    expect(read('src/app/api/compliance/clearance/ask.ts')).toContain('startDaySays(')
    expect(read('src/app/api/compliance/clearance/ask.ts')).not.toContain('contract.startDate.toISOString().slice(0, 10)}.`')
  })
})

describe('the start’s fix names who activates, to a reader who may not', () => {
  const startedBy = desksHolding('assignments.write', 'VENDOR')

  it('HR reads "Get an I-9 on file; then <the roles that start a placement> activates", never "then activate"', () => {
    const fix = fixForReader('Get an I-9 and E-Verify on file, then activate.', { mayStart: false, startedBy })
    expect(fix).toMatch(/^Get an I-9 and E-Verify on file; then the .+ activates\.$/)
    expect(fix).not.toContain('then activate.')
    expect(fixForReader('Chase a background check, or activate with a reason.', { mayStart: false, startedBy: ['Contract Manager', 'Delivery Manager'] }))
      .toBe('Chase a background check; or the contract manager or delivery manager activates with a reason.')
  })

  it('a seat that may start a placement still reads "then activate"', () => {
    expect(fixForReader('Get an I-9 on file, then activate.', { mayStart: true, startedBy })).toBe('Get an I-9 on file, then activate.')
    expect(read('src/app/api/compliance/route.ts').match(/fixForReader\(papers\.fix, reader\)/g)?.length).toBe(2)
  })
})
