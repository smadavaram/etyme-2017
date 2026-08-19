import { describe, it, expect } from 'vitest'
import {
  mintKey,
  hashKey,
  keyMatches,
  looksLikeKey,
  checkKey,
  suggestedDurationDays,
  reviewKey,
  sign,
  verifySignature,
  shouldRetry,
  nextAttemptDelaySeconds,
  MAX_ATTEMPTS,
} from '@/lib/service-accounts'

/**
 * Integrations need an identity of their own. Giving one a person's
 * account is how a leaver's departure breaks the nightly ERP feed — or
 * worse, does not, and their access outlives them by two years.
 */

const NOW = new Date('2026-08-19T00:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

describe('minting a key', () => {
  it('never stores the key itself, only a hash of it', () => {
    // A system that can show you a key again is one that can be made to
    // show it to somebody else.
    const k = mintKey()
    expect(k.hash).not.toContain(k.key)
    expect(k.hash).toHaveLength(64)
  })

  it('gives every key a prefix long enough to identify and too short to use', () => {
    const k = mintKey()
    expect(k.prefix.length).toBeLessThan(k.key.length / 2)
    expect(k.key.startsWith(k.prefix)).toBe(true)
  })

  it('never mints the same key twice', () => {
    const keys = new Set(Array.from({ length: 200 }, () => mintKey().key))
    expect(keys.size).toBe(200)
  })

  it('recognises its own keys and not somebody else’s', () => {
    expect(looksLikeKey(mintKey().key)).toBe(true)
    expect(looksLikeKey('sk_live_abc123')).toBe(false)
    expect(looksLikeKey('etyk_short')).toBe(false)
  })

  it('matches a key against its stored hash', () => {
    const k = mintKey()
    expect(keyMatches(k.key, k.hash)).toBe(true)
    expect(keyMatches(mintKey().key, k.hash)).toBe(false)
  })

  it('refuses a hash of the wrong shape rather than throwing', () => {
    expect(keyMatches('anything', 'not-a-hash')).toBe(false)
  })
})

describe('whether a key may be used', () => {
  const base = { revokedAt: null, expiresAt: null, permissions: ['invoices.read'] }

  it('lets a live key through', () => {
    expect(checkKey(base, NOW).usable).toBe(true)
  })

  it('refuses a revoked key and says it was somebody’s decision', () => {
    const v = checkKey({ ...base, revokedAt: days(-1) }, NOW)
    expect(v.usable).toBe(false)
    expect(v.reason).toMatch(/revoked/i)
  })

  it('refuses an expired key and says renewing it is easy', () => {
    // A different problem from a revoked key, leading to different work.
    const v = checkKey({ ...base, expiresAt: days(-3) }, NOW)
    expect(v.usable).toBe(false)
    expect(v.reason).toMatch(/expired on 2026-08-16/)
  })

  it('refuses a key nobody finished giving permissions to', () => {
    const v = checkKey({ ...base, permissions: [] }, NOW)
    expect(v.usable).toBe(false)
    expect(v.reason).toMatch(/nothing it can do/i)
  })
})

describe('how long a key should run', () => {
  it('gives a read-only feed a year', () => {
    expect(suggestedDurationDays(['invoices.read', 'timesheets.read'])).toBe(365)
  })

  it('gives a key that can change things ninety days', () => {
    // A dashboard feed and a key that can record payments are different
    // risks, and giving both a year pretends otherwise.
    expect(suggestedDurationDays(['payments.record'])).toBe(90)
    expect(suggestedDurationDays(['invoices.read', 'invoices.issue'])).toBe(90)
    expect(suggestedDurationDays(['*'])).toBe(90)
  })
})

describe('whether a key is still doing a job', () => {
  it('reports a key issued weeks ago and never used', () => {
    // The loudest finding: an integration was set up and either abandoned
    // or never finished, and the key has been sitting there since.
    const r = reviewKey({ createdAt: days(-40), lastUsedAt: null, expiresAt: null }, NOW)
    expect(r.finding).toBe('NEVER_USED')
  })

  it('does not complain about a key issued this week and not used yet', () => {
    expect(reviewKey({ createdAt: days(-3), lastUsedAt: null, expiresAt: null }, NOW).finding).toBe('OK')
  })

  it('reports a key that has not been used in three months', () => {
    const r = reviewKey({ createdAt: days(-400), lastUsedAt: days(-100), expiresAt: null }, NOW)
    expect(r.finding).toBe('DORMANT')
  })

  it('warns before a working key expires, because the feed stops that morning', () => {
    const r = reviewKey({ createdAt: days(-300), lastUsedAt: days(-1), expiresAt: days(10) }, NOW)
    expect(r.finding).toBe('EXPIRING')
    expect(r.detail).toMatch(/feed stops/i)
  })

  it('reports an expired key that is still on file', () => {
    const r = reviewKey({ createdAt: days(-400), lastUsedAt: days(-30), expiresAt: days(-5) }, NOW)
    expect(r.finding).toBe('EXPIRED')
  })

  it('says nothing about a key in normal use', () => {
    expect(reviewKey({ createdAt: days(-100), lastUsedAt: days(-1), expiresAt: days(200) }, NOW).finding).toBe('OK')
  })
})

describe('signing what we send', () => {
  const secret = 'whsec_test'
  const payload = JSON.stringify({ type: 'invoice.paid', amount: 1200 })
  const t = 1_755_561_600

  it('accepts a payload we signed', () => {
    // Without a signature the receiver cannot tell our delivery from
    // anybody else's POST to an open endpoint.
    const header = sign(payload, secret, t)
    expect(verifySignature(payload, header, secret, t).valid).toBe(true)
  })

  it('rejects a payload that was altered in transit', () => {
    const header = sign(payload, secret, t)
    expect(verifySignature(payload.replace('1200', '12000'), header, secret, t).valid).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    const header = sign(payload, 'whsec_other', t)
    expect(verifySignature(payload, header, secret, t).valid).toBe(false)
  })

  it('rejects a genuine payload replayed hours later', () => {
    // The timestamp is inside the signed material precisely so this fails.
    const header = sign(payload, secret, t)
    const v = verifySignature(payload, header, secret, t + 3600)
    expect(v.valid).toBe(false)
    expect(v.reason).toMatch(/time window/i)
  })

  it('rejects a malformed header rather than throwing', () => {
    expect(verifySignature(payload, 'garbage', secret, t).valid).toBe(false)
  })
})

describe('retrying a delivery', () => {
  it('retries when the receiver said nothing at all', () => {
    expect(shouldRetry(null, 1).retry).toBe(true)
  })

  it('retries a server error, because that is usually temporary', () => {
    expect(shouldRetry(503, 2).retry).toBe(true)
  })

  it('does not retry a refusal, because retrying will not change their mind', () => {
    // Hammering a rejection also looks like an attack from their side.
    const r = shouldRetry(400, 1)
    expect(r.retry).toBe(false)
    expect(r.why).toMatch(/will not change/i)
  })

  it('does retry a timeout or a rate limit, which are refusals that mean "later"', () => {
    expect(shouldRetry(408, 1).retry).toBe(true)
    expect(shouldRetry(429, 1).retry).toBe(true)
  })

  it('gives up rather than retrying forever', () => {
    expect(shouldRetry(503, MAX_ATTEMPTS).retry).toBe(false)
  })

  it('backs off further each time', () => {
    const delays = [1, 2, 3, 4, 5].map(nextAttemptDelaySeconds)
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1])
    }
  })

  it('spans long enough to survive a deploy', () => {
    const total = [1, 2, 3, 4, 5].reduce((s, a) => s + nextAttemptDelaySeconds(a), 0)
    expect(total).toBeGreaterThan(3600)
  })
})
