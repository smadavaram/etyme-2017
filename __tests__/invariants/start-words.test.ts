import { describe, it, expect } from 'vitest'
import { startWords } from '@/lib/contract-clearance'

/**
 * Ingrid Sørensen's placement, walked by a tester on 2026-10-03: the
 * header read "started Oct 10, 2026" on a draft contract a week before
 * Oct 10, held up on her right to work and her I-9.
 */

const today = new Date('2026-10-03T12:00:00Z')
const held = [{ label: 'Proof of right to work' }, { label: 'I-9 and E-Verify' }]

describe('the start on a placement header', () => {
  it('says Ingrid Sørensen is due to start Oct 10, 2026 and what holds her up, never that she started', () => {
    const said = startWords({ startDate: '2026-10-10T00:00:00.000Z', state: 'DRAFT', outcome: 'BLOCK', blocking: held, today })
    expect(said).toBe('due to start Oct 10, 2026; held up: waiting on proof of right to work (I-9, checked with E-Verify)')
    expect(said).not.toMatch(/started/)
  })

  it('says started only of a running contract on or after its first day', () => {
    expect(startWords({ startDate: '2026-09-01T00:00:00.000Z', state: 'IN_PROGRESS', outcome: 'PASS', blocking: [], today }))
      .toBe('started Sep 1, 2026')
  })

  it('says a contract activated ahead of its first day is due to start', () => {
    expect(startWords({ startDate: '2026-10-10T00:00:00.000Z', state: 'IN_PROGRESS', outcome: 'PASS', blocking: [], today }))
      .toBe('due to start Oct 10, 2026')
  })

  it('says a first day that passed on a contract that never started has not started', () => {
    expect(startWords({ startDate: '2026-09-28T00:00:00.000Z', state: 'DRAFT', outcome: 'BLOCK', blocking: held, today }))
      .toBe('was due to start Sep 28, 2026 and has not started; held up: waiting on proof of right to work (I-9, checked with E-Verify)')
  })

  it('points at the checklist rather than guessing where the start is blocked by something it cannot name', () => {
    expect(startWords({ startDate: '2026-10-10T00:00:00.000Z', state: 'DRAFT', outcome: 'BLOCK', blocking: [], today }))
      .toBe('due to start Oct 10, 2026; held up: see Cleared to work below')
  })

  it('says nothing about a start nobody has set', () => {
    expect(startWords({ startDate: null, state: 'DRAFT', outcome: 'PASS', blocking: [], today })).toBeNull()
  })
})
