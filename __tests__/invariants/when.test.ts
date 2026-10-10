import { describe, it, expect } from 'vitest'
import { dayFor, momentFor, knowsWhere } from '@/lib/when'

/**
 * Server-written text said UTC to everybody. An interview at 9am Pacific
 * told a reader in London the wrong day, and the mistake is invisible to
 * whoever wrote it because their own machine agrees with them.
 */

// 2026-09-10 02:00 UTC — still the 9th in Los Angeles.
const ACROSS_MIDNIGHT = new Date('2026-09-10T02:00:00Z')

describe('telling somebody when, in their own day', () => {
  it('gives a reader in Los Angeles the day it is for them', () => {
    expect(dayFor(ACROSS_MIDNIGHT, 'America/Los_Angeles')).toBe('2026-09-09')
  })

  it('gives a reader in London the day it is for them, which is a different one', () => {
    expect(dayFor(ACROSS_MIDNIGHT, 'Europe/London')).toBe('2026-09-10')
  })

  it('falls back to UTC when nobody has been asked where they are', () => {
    expect(dayFor(ACROSS_MIDNIGHT, null)).toBe('2026-09-10')
  })

  it('names the zone, because a bare time looks right to everybody and is wrong for half of them', () => {
    // Asserted as "some zone is named", not as "PDT". Which form a
    // runtime gives — PDT or GMT-7 — depends on its ICU build, and
    // pinning the abbreviation makes this pass on my machine and fail on
    // the one that matters.
    const la = momentFor(ACROSS_MIDNIGHT, 'America/Los_Angeles')
    expect(la).toMatch(/(GMT[+-]\d|[A-Z]{3,4}$)/)
    // And two readers are genuinely told different things.
    expect(la).not.toBe(momentFor(ACROSS_MIDNIGHT, 'Europe/London'))
  })

  it('says a time in American English, month before day, on a twelve-hour clock', () => {
    expect(momentFor(ACROSS_MIDNIGHT, 'America/Los_Angeles')).toMatch(/^Wed, Sep 9, 7:00 PM /)
    expect(momentFor(ACROSS_MIDNIGHT, 'UTC')).toBe('Thu, Sep 10, 2:00 AM UTC')
  })

  it('names the place beside an offset where the runtime knows no zone name for it', () => {
    const london = momentFor(ACROSS_MIDNIGHT, 'Europe/London')
    expect(london).toMatch(/^Thu, Sep 10, 3:00 AM /)
    expect(london).toMatch(/BST$|\(London time\)$/)
    expect(momentFor(ACROSS_MIDNIGHT, 'Asia/Kolkata')).toMatch(/7:30 AM .*\(Kolkata time\)$|7:30 AM IST$/)
  })

  it('does not throw on a zone the runtime has never heard of', () => {
    // A typo in a settings field must not take down a notification.
    expect(dayFor(ACROSS_MIDNIGHT, 'Mars/Olympus_Mons')).toBe('2026-09-10')
  })

  it('says plainly whether we know where somebody is', () => {
    expect(knowsWhere('Asia/Kolkata')).toBe(true)
    expect(knowsWhere(null)).toBe(false)
    expect(knowsWhere('  ')).toBe(false)
  })
})
