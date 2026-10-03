import { describe, it, expect } from 'vitest'
import { readVerdict } from '@/lib/attestation'
import { heldWord } from '@/lib/document-request'

/**
 * A worker's paperwork page read "On file until 2027-06-07" and
 * "Sterling reported clear on 2026-03-06" while the rest of the page said
 * "Oct 9" (tester, 2026-09-30). A day on a person's screen reads the way
 * a person says it.
 */
describe('dates on paperwork read as a person says them', () => {
  it('names the screening company, its reference and the day in words: Sterling reported clear on Mar 6, 2026', () => {
    const v = readVerdict({
      key: 'BACKGROUND_CHECK', status: 'CLEAR', provider: 'Sterling', reference: '4471',
      on: new Date('2026-03-06T00:00:00Z'),
    })
    expect(v.says).toBe('Sterling reported clear on Mar 6, 2026, reference 4471.')
    expect(v.says).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('says no screening company is named rather than letting a clear read as a provider’s verdict', () => {
    const v = readVerdict({ key: 'BACKGROUND_CHECK', status: 'CLEAR', on: new Date('2026-03-06T00:00:00Z') })
    expect(v.rendered).toBe(false)
    expect(v.says).toContain('No screening company is named on it')
  })

  it('writes a document on file for years as On file until Jun 7, 2027', () => {
    expect(heldWord(new Date('2027-06-07T00:00:00Z'), new Date('2026-09-30T00:00:00Z'))).toBe('On file until Jun 7, 2027')
  })
})
