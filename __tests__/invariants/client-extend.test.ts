import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { draftRefusal, earliestNewEnd, extendBody, askedBy } from '@/app/dashboard/program/extend-ask'

/**
 * Found by the screen walk of 2026-10-22: Extend on the client dashboard
 * sent a fixed three months, had no box for a reason, and every refusal
 * the extend route gives asks for one (app/dashboard/program/extend-ask).
 */

const today = new Date('2026-10-22T12:00:00Z')

describe('the client extends a contract to a day it picks, and says why', () => {
  it('extending from the client dashboard sends the end date the person picked and the reason they gave', () => {
    expect(extendBody({ newEndDate: '2027-03-31', reason: '  The go-live moved to March.  ', asked: [] }))
      .toEqual({ newEndDate: '2027-03-31', note: 'The go-live moved to March.' })
  })

  it('a refusal that asks for a reason is answered by the same box on the next press, as the field the route named', () => {
    expect(askedBy({ field: 'reason' })).toBe('reason')
    expect(askedBy({ field: 'limitReason' })).toBe('limitReason')
    expect(extendBody({ newEndDate: '2027-03-31', reason: 'The go-live moved to March.', asked: ['reason', 'limitReason'] })).toEqual({
      newEndDate: '2027-03-31',
      note: 'The go-live moved to March.',
      reason: 'The go-live moved to March.',
      limitReason: 'The go-live moved to March.',
    })
  })

  it('a refusal that asks nothing the reason can answer is said and asks for nothing', () => {
    expect(askedBy({ field: 'newEndDate' })).toBeNull()
    expect(askedBy(undefined)).toBeNull()
  })

  it('a new last day on or before the current one is refused before anything is sent, and Roll off is named', () => {
    expect(draftRefusal({ newEndDate: '2026-11-30', reason: 'The go-live moved to March.', asked: [] }, '2026-11-30T00:00:00.000Z', today))
      .toBe('The new last day has to be after the current one. To end it sooner, use Roll off.')
  })

  it('an extension with no reason is refused before anything is sent', () => {
    expect(draftRefusal({ newEndDate: '2027-03-31', reason: 'more', asked: [] }, '2026-11-30T00:00:00.000Z', today))
      .toBe('Say why it is extended, in a sentence. It is kept with the extension.')
  })

  it('a picked day and a reason go', () => {
    expect(draftRefusal({ newEndDate: '2027-03-31', reason: 'The go-live moved to March.', asked: [] }, '2026-11-30T00:00:00.000Z', today)).toBeNull()
  })

  it('the earliest day offered is the day after the current last day, or tomorrow where it has passed', () => {
    expect(earliestNewEnd('2026-11-30T00:00:00.000Z', today)).toBe('2026-12-01')
    expect(earliestNewEnd('2026-10-01T00:00:00.000Z', today)).toBe('2026-10-23')
  })

  it('the client dashboard no longer extends by a fixed three months', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/program/page.tsx'), 'utf8')
    expect(page).not.toContain('months: 3')
    expect(page).toContain('<ExtendForm')
  })
})
