/**
 * Sharing documents with someone who does not work here.
 *
 * An immigration lawyer needs the passport, the degree evaluation and the
 * last I-797. An accountant needs the incorporation papers. Neither will
 * make an account — asked to, they say "just email them", and then the
 * files sit in an inbox forever with no record of who opened them.
 *
 * So the bar is that this must be EASIER than attaching them to an email,
 * or nobody uses it. A link is easier. These tests are about what makes a
 * link safe enough to send.
 */

import { describe, it, expect } from 'vitest'
import {
  newToken, clampExpiry, checkShare, daysLeft, summarise,
  isShareableKind, MAX_DAYS, DEFAULT_DAYS,
} from '@/lib/document-share'

const NOW = new Date('2026-08-16T00:00:00Z')
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000)

describe('The link is the only credential, so it has to be unguessable', () => {

  it('a token is long', () => {
    expect(newToken().length).toBeGreaterThan(40)
  })

  it('two tokens are never the same', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken()))
    expect(seen.size).toBe(200)
  })

  it('a token is safe to put in a URL', () => {
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('A share always ends', () => {

  it('saying nothing gives thirty days', () => {
    expect(daysLeft(clampExpiry(null, NOW), NOW)).toBe(DEFAULT_DAYS)
  })

  it('a year is cut back to the maximum', () => {
    // A share with no real end is a leak with a delay on it.
    expect(daysLeft(clampExpiry(365, NOW), NOW)).toBe(MAX_DAYS)
  })

  it('zero days is not a way to make it permanent', () => {
    expect(daysLeft(clampExpiry(0, NOW), NOW)).toBe(1)
  })

  it('a sensible request is honoured', () => {
    expect(daysLeft(clampExpiry(90, NOW), NOW)).toBe(90)
  })
})

describe('Opening the link', () => {

  it('a live share can be read', () => {
    const v = checkShare({ expiresAt: later(10), revokedAt: null }, NOW)
    expect(v.readable).toBe(true)
    expect(v.state).toBe('ACTIVE')
  })

  it('an expired one cannot, and says when it went', () => {
    const v = checkShare({ expiresAt: later(-1), revokedAt: null }, NOW)
    expect(v.readable).toBe(false)
    expect(v.message).toContain('expired on 2026-08-15')
    expect(v.message).toContain('Ask for a new one')
  })

  it('a withdrawn one says so differently', () => {
    // Different conversations. An expired link is reissued; a withdrawn one
    // was taken away on purpose and the recipient should ring somebody.
    const v = checkShare({ expiresAt: later(10), revokedAt: later(-1) }, NOW)
    expect(v.state).toBe('REVOKED')
    expect(v.message).toContain('withdrawn')
  })

  it('withdrawing beats expiry, even on a link with time left', () => {
    const v = checkShare({ expiresAt: later(60), revokedAt: later(-2) }, NOW)
    expect(v.state).toBe('REVOKED')
  })

  it('a share expiring exactly now is already closed', () => {
    expect(checkShare({ expiresAt: NOW, revokedAt: null }, NOW).readable).toBe(false)
  })
})

describe('How a share is going, for whoever sent it', () => {

  it('a share nobody opened, about to expire, is the one worth chasing', () => {
    // The lawyer did not get it, or it went to spam, and nobody finds out
    // until the petition is late.
    const s = summarise({ expiresAt: later(3), revokedAt: null }, [], NOW)
    expect(s.needsChasing).toBe(true)
  })

  it('a share nobody opened but with weeks left is not urgent yet', () => {
    expect(summarise({ expiresAt: later(25), revokedAt: null }, [], NOW).needsChasing).toBe(false)
  })

  it('a share that was opened does not need chasing, however soon it ends', () => {
    const s = summarise({ expiresAt: later(1), revokedAt: null }, [{ at: later(-2) }], NOW)
    expect(s.needsChasing).toBe(false)
  })

  it('an expired share is not chased — it is reissued', () => {
    expect(summarise({ expiresAt: later(-1), revokedAt: null }, [], NOW).needsChasing).toBe(false)
  })

  it('it reports when it was last opened', () => {
    const s = summarise(
      { expiresAt: later(10), revokedAt: null },
      [{ at: later(-5) }, { at: later(-1) }, { at: later(-9) }],
      NOW
    )
    expect(s.openedCount).toBe(3)
    expect(s.lastOpenedAt).toEqual(later(-1))
  })

  it('a share nobody opened has no last-opened date, rather than a fake one', () => {
    expect(summarise({ expiresAt: later(10), revokedAt: null }, [], NOW).lastOpenedAt).toBeNull()
  })
})

describe('Only real document kinds can be put in a package', () => {

  it('the three kinds this schema holds are allowed', () => {
    expect(isShareableKind('VERIFICATION_DOC')).toBe(true)
    expect(isShareableKind('VISA_DOCUMENT')).toBe(true)
    expect(isShareableKind('DOC_INSTANCE')).toBe(true)
  })

  it('anything else is refused', () => {
    expect(isShareableKind('BANK_DETAILS')).toBe(false)
    expect(isShareableKind('')).toBe(false)
  })
})
