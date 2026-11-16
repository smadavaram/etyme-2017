import { describe, it, expect } from 'vitest'
import { pageNameOf } from '@/lib/nav-table'

// Walk of ab9440839 (2026-11-16): a client's hiring manager whose role was
// taken away read "Training is not part of your seat" from the jobs route.
// Nothing a client reads says training (record 69), and the page was Jobs.
describe('a refusal names the page the reader opened', () => {
  it('a client seat refused the jobs route reads Jobs, never Training', () => {
    expect(pageNameOf('/api/requirements', 'CLIENT')).toBe('Jobs')
  })
  it('a supplier seat refused the jobs route reads Jobs, never Training', () => {
    expect(pageNameOf('/api/requirements', 'VENDOR')).toBe('Jobs')
  })
  it('the Training page still names its own route', () => {
    expect(pageNameOf('/api/training', 'VENDOR')).toBe('Training')
  })
})
