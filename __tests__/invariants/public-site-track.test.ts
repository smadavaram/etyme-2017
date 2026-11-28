import { describe, it, expect } from 'vitest'
import { trackRecord, STARTED_STATES } from '@/lib/public-site/firm-page'

/**
 * The figures on a firm's public page: placements, working now and
 * clients (walk tpf, stop 3). A placement is work that started.
 */

const line = (state: string, client: string) => ({ state, clientCompanyId: client, endClientCompanyId: null })

describe('the track record on a firm’s public page', () => {
  it('a placement is a line running, paused or ended, and nothing else', () => {
    expect([...STARTED_STATES]).toEqual(['IN_PROGRESS', 'PAUSED', 'ENDED'])
  })

  it('a draft line is not a placement on the company page', () => {
    expect(trackRecord([line('IN_PROGRESS', 'a'), line('DRAFT', 'a')]).placements).toBe(1)
  })

  it('a line waiting on verification, or verified and not started, is not a placement', () => {
    expect(trackRecord([line('PENDING_VERIFICATION', 'a'), line('VERIFIED', 'a')]).placements).toBe(0)
  })

  it('a cancelled line is not a placement, because cancelled may mean it never started', () => {
    expect(trackRecord([line('CANCELLED', 'a')]).placements).toBe(0)
  })

  it('a client with only a draft line is not counted as a client', () => {
    expect(trackRecord([line('ENDED', 'a'), line('DRAFT', 'b')]).clients).toBe(1)
  })

  it('the walked firm reads 6 placements, 4 working now: 4 running and 2 ended, its 4 drafts left out', () => {
    const lines = [
      line('IN_PROGRESS', 'a'), line('IN_PROGRESS', 'a'), line('IN_PROGRESS', 'b'), line('IN_PROGRESS', 'c'),
      line('ENDED', 'b'), line('ENDED', 'c'),
      line('DRAFT', 'd'), line('DRAFT', 'd'), line('DRAFT', 'a'), line('DRAFT', 'e'),
    ]
    // 4 running + 2 ended = 6; clients a, b, c = 3 (d and e hold only drafts).
    expect(trackRecord(lines)).toEqual({ placements: 4 + 2, activeNow: 4, clients: 3, isNew: false })
  })

  it('a client is counted once however many lines it has, by the end client where there is one', () => {
    const lines = [
      { state: 'IN_PROGRESS', clientCompanyId: 'prime', endClientCompanyId: 'end' },
      { state: 'ENDED', clientCompanyId: 'end', endClientCompanyId: null },
    ]
    expect(trackRecord(lines).clients).toBe(1)
  })

  it('a firm with only drafts reads as new', () => {
    expect(trackRecord([line('DRAFT', 'a'), line('DRAFT', 'b')])).toEqual({ placements: 0, activeNow: 0, clients: 0, isNew: true })
  })

  it('a paused line is a placement and is not counted as working now', () => {
    expect(trackRecord([line('PAUSED', 'a')])).toEqual({ placements: 1, activeNow: 0, clients: 1, isNew: false })
  })
})
