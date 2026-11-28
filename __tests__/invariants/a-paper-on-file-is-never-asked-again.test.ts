import { describe, it, expect } from 'vitest'
import { stillOwed, paperAskSays, isPaperAskTitle, holdsToday, type AskedItem } from '@/app/api/conversations/twin/paper-asks'

/**
 * The fifth screen walk (2026-11-04, C8): Rosa Delgado's greeting still
 * said "Brightmoor Staffing needs one paper from you: a product
 * confidentiality undertaking" after Brightmoor accepted it. A paper
 * request in "Since you last looked" is read against the record today.
 */
const NOW = new Date('2026-11-04T12:00:00Z')
const UNDERTAKING: AskedItem = { key: 'CONFIDENTIALITY_UNDERTAKING', label: 'Product confidentiality undertaking', state: 'PENDING' }
const W9: AskedItem = { key: 'W9', label: 'W-9', state: 'PENDING' }
const held = (key: string, over: Partial<{ validFrom: Date | null; expiresAt: Date | null; accepted: boolean }> = {}) =>
  ({ key, validFrom: null, expiresAt: null, accepted: true, ...over })

describe('a paper on file is never asked for again in the greeting', () => {
  it('a request whose only paper is now accepted on the record leaves nothing owed, so the greeting does not say it', () => {
    expect(stillOwed([UNDERTAKING], [held('CONFIDENTIALITY_UNDERTAKING')], NOW)).toEqual([])
  })

  it('a request item already accepted on the request itself is not owed', () => {
    expect(stillOwed([{ ...UNDERTAKING, state: 'ACCEPTED' }], [], NOW)).toEqual([])
  })

  it('a paper the person sent and nobody has looked at yet is not owed by her; she is not asked for it again', () => {
    expect(stillOwed([{ ...UNDERTAKING, state: 'RECEIVED' }], [], NOW)).toEqual([])
  })

  it('a paper sent back is still owed, and so is one nobody has answered', () => {
    expect(stillOwed([{ ...UNDERTAKING, state: 'REJECTED' }, W9], [], NOW).map((i) => i.key)).toEqual(['CONFIDENTIALITY_UNDERTAKING', 'W9'])
  })

  it('a paper on file that has run out, or that has not started yet, does not count, so it is still asked for', () => {
    expect(holdsToday(held('W9', { expiresAt: new Date('2026-11-01T00:00:00Z') }), NOW)).toBe(false)
    expect(holdsToday(held('W9', { validFrom: new Date('2026-12-01T00:00:00Z') }), NOW)).toBe(false)
    expect(holdsToday(held('W9', { accepted: false }), NOW)).toBe(false)
    expect(stillOwed([W9], [held('W9', { expiresAt: new Date('2026-11-01T00:00:00Z') })], NOW)).toEqual([W9])
  })

  it('where some of the papers are now on file, the notice names only what is left, in the request\'s own words', () => {
    const left = stillOwed([UNDERTAKING, W9], [held('CONFIDENTIALITY_UNDERTAKING')], NOW)
    expect(paperAskSays('Brightmoor Staffing', left)).toBe('Brightmoor Staffing needs one paper from you: a W-9')
  })

  it('only a paper request\'s notice is read this way; every other notice keeps its own words', () => {
    expect(isPaperAskTitle('Brightmoor Staffing needs one paper from you: a product confidentiality undertaking')).toBe(true)
    expect(isPaperAskTitle('Northbend Athletic signed your week of Oct 25')).toBe(false)
  })
})
