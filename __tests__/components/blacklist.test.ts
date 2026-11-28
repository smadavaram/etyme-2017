import { describe, it, expect } from 'vitest'

/**
 * Blacklist module invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * BUILD.md §6.10: "black_lister — filters candidates and companies out of
 * search, feeds and contracts."
 *
 * LEGACY_RULES.md §8.1: "black_list — blocks candidates or companies from
 * appearing in search, feeds or contracts for that company."
 *
 * Tests the logic layer without rendering:
 * - Target type validation
 * - Active/inactive status
 * - Expiry logic
 * - Lift workflow
 * - Self-blacklist prevention
 * - Dedup (one entry per target per company)
 * - Feed filtering
 * - Candidate search exclusion
 */

// ── Target type validation ──────────────────────────

describe('Blacklist target type validation', () => {
  const VALID_TYPES = ['PERSON', 'COMPANY']

  function isValidTargetType(type: string): boolean {
    return VALID_TYPES.includes(type.toUpperCase())
  }

  it('PERSON is a valid blacklist target type', () => {
    expect(isValidTargetType('PERSON')).toBe(true)
  })

  it('COMPANY is a valid blacklist target type', () => {
    expect(isValidTargetType('COMPANY')).toBe(true)
  })

  it('lowercase types are normalized to uppercase', () => {
    expect(isValidTargetType('person')).toBe(true)
  })

  it('VENDOR is not a valid target type', () => {
    expect(isValidTargetType('VENDOR')).toBe(false)
  })

  it('empty string is not a valid target type', () => {
    expect(isValidTargetType('')).toBe(false)
  })
})

// ── Active/inactive status ──────────────────────────

describe('Blacklist entry active status', () => {
  type BlacklistEntry = {
    liftedAt: Date | null
    expiresAt: Date | null
  }

  function isActive(entry: BlacklistEntry, now: Date = new Date()): boolean {
    if (entry.liftedAt) return false
    if (entry.expiresAt && entry.expiresAt <= now) return false
    return true
  }

  it('a permanent entry with no lift date is active', () => {
    expect(isActive({ liftedAt: null, expiresAt: null })).toBe(true)
  })

  it('a lifted entry is not active', () => {
    expect(isActive({ liftedAt: new Date('2026-01-15'), expiresAt: null })).toBe(false)
  })

  it('an expired entry is not active', () => {
    expect(isActive(
      { liftedAt: null, expiresAt: new Date('2025-01-01') },
      new Date('2026-01-01')
    )).toBe(false)
  })

  it('a temporary entry that has not expired is active', () => {
    expect(isActive(
      { liftedAt: null, expiresAt: new Date('2027-01-01') },
      new Date('2026-06-01')
    )).toBe(true)
  })

  it('a lifted entry is inactive even if its expiry has not passed', () => {
    expect(isActive({
      liftedAt: new Date('2026-01-15'),
      expiresAt: new Date('2027-01-01'),
    })).toBe(false)
  })
})

// ── Expiry logic ────────────────────────────────────

describe('Blacklist expiry logic', () => {
  function daysUntilExpiry(expiresAt: Date | null, now: Date = new Date()): number | null {
    if (!expiresAt) return null // permanent
    const diffMs = expiresAt.getTime() - now.getTime()
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  }

  function isExpiringSoon(expiresAt: Date | null, thresholdDays: number = 30, now: Date = new Date()): boolean {
    const days = daysUntilExpiry(expiresAt, now)
    if (days === null) return false // permanent entries don't expire
    return days > 0 && days <= thresholdDays
  }

  it('a permanent blacklist has null days until expiry', () => {
    expect(daysUntilExpiry(null)).toBeNull()
  })

  it('an entry expiring in 10 days returns 10', () => {
    const now = new Date('2026-06-01')
    const expires = new Date('2026-06-11')
    expect(daysUntilExpiry(expires, now)).toBe(10)
  })

  it('an already-expired entry returns a negative number', () => {
    const now = new Date('2026-06-11')
    const expires = new Date('2026-06-01')
    expect(daysUntilExpiry(expires, now)).toBeLessThan(0)
  })

  it('a permanent entry is never expiring soon', () => {
    expect(isExpiringSoon(null)).toBe(false)
  })

  it('an entry expiring in 15 days is expiring soon (within 30-day threshold)', () => {
    const now = new Date('2026-06-01')
    const expires = new Date('2026-06-16')
    expect(isExpiringSoon(expires, 30, now)).toBe(true)
  })

  it('an entry expiring in 60 days is not expiring soon (30-day threshold)', () => {
    const now = new Date('2026-06-01')
    const expires = new Date('2026-07-31')
    expect(isExpiringSoon(expires, 30, now)).toBe(false)
  })
})

// ── Lift workflow ───────────────────────────────────

describe('Blacklist lift workflow', () => {
  type Entry = {
    id: string
    liftedAt: Date | null
    liftedById: string | null
    liftReason: string | null
  }

  function liftEntry(
    entry: Entry,
    liftedById: string,
    liftReason: string
  ): { success: boolean; entry?: Entry; error?: string } {
    if (entry.liftedAt) {
      return { success: false, error: 'Entry already lifted' }
    }
    if (!liftReason.trim()) {
      return { success: false, error: 'Lift reason is required' }
    }
    return {
      success: true,
      entry: {
        ...entry,
        liftedAt: new Date(),
        liftedById,
        liftReason,
      },
    }
  }

  it('an active entry can be lifted with a reason', () => {
    const entry: Entry = { id: 'bl-1', liftedAt: null, liftedById: null, liftReason: null }
    const result = liftEntry(entry, 'user-1', 'Misidentified — wrong person')
    expect(result.success).toBe(true)
    expect(result.entry?.liftedAt).not.toBeNull()
    expect(result.entry?.liftedById).toBe('user-1')
    expect(result.entry?.liftReason).toBe('Misidentified — wrong person')
  })

  it('an already-lifted entry cannot be lifted again', () => {
    const entry: Entry = {
      id: 'bl-1',
      liftedAt: new Date('2026-01-15'),
      liftedById: 'user-2',
      liftReason: 'Original reason',
    }
    const result = liftEntry(entry, 'user-1', 'Second lift')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Entry already lifted')
  })

  it('lifting without a reason fails', () => {
    const entry: Entry = { id: 'bl-1', liftedAt: null, liftedById: null, liftReason: null }
    const result = liftEntry(entry, 'user-1', '   ')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Lift reason is required')
  })
})

// ── Self-blacklist prevention ───────────────────────

describe('Self-blacklist prevention', () => {
  function canBlacklist(
    companyId: string,
    targetType: string,
    targetId: string
  ): { allowed: boolean; error?: string } {
    if (targetType === 'COMPANY' && targetId === companyId) {
      return { allowed: false, error: 'Cannot blacklist your own company' }
    }
    return { allowed: true }
  }

  it('a company cannot blacklist itself', () => {
    const result = canBlacklist('comp-1', 'COMPANY', 'comp-1')
    expect(result.allowed).toBe(false)
  })

  it('a company can blacklist another company', () => {
    const result = canBlacklist('comp-1', 'COMPANY', 'comp-2')
    expect(result.allowed).toBe(true)
  })

  it('a company can blacklist a person (no self-check needed)', () => {
    const result = canBlacklist('comp-1', 'PERSON', 'person-1')
    expect(result.allowed).toBe(true)
  })
})

// ── Dedup ───────────────────────────────────────────

describe('Blacklist deduplication', () => {
  function isDuplicate(
    existing: Array<{ companyId: string; targetType: string; targetId: string; liftedAt: Date | null }>,
    companyId: string,
    targetType: string,
    targetId: string
  ): boolean {
    return existing.some(
      (e) =>
        e.companyId === companyId &&
        e.targetType === targetType &&
        e.targetId === targetId &&
        e.liftedAt === null
    )
  }

  const entries = [
    { companyId: 'comp-1', targetType: 'PERSON', targetId: 'p-1', liftedAt: null },
    { companyId: 'comp-1', targetType: 'COMPANY', targetId: 'comp-2', liftedAt: null },
    { companyId: 'comp-1', targetType: 'PERSON', targetId: 'p-3', liftedAt: new Date() },
  ]

  it('an active entry for the same target is a duplicate', () => {
    expect(isDuplicate(entries, 'comp-1', 'PERSON', 'p-1')).toBe(true)
  })

  it('a lifted entry for the same target is not a duplicate', () => {
    expect(isDuplicate(entries, 'comp-1', 'PERSON', 'p-3')).toBe(false)
  })

  it('the same target for a different company is not a duplicate', () => {
    expect(isDuplicate(entries, 'comp-2', 'PERSON', 'p-1')).toBe(false)
  })

  it('a new target is not a duplicate', () => {
    expect(isDuplicate(entries, 'comp-1', 'PERSON', 'p-99')).toBe(false)
  })
})

// ── Feed filtering ──────────────────────────────────

describe('Blacklist feed filtering', () => {
  type Candidate = { id: string; name: string }
  type BlacklistEntry = { targetType: string; targetId: string; liftedAt: Date | null; expiresAt: Date | null }

  function filterBlacklisted(
    candidates: Candidate[],
    blacklist: BlacklistEntry[],
    now: Date = new Date()
  ): Candidate[] {
    const blockedIds = new Set(
      blacklist
        .filter((b) => b.targetType === 'PERSON' && !b.liftedAt && (!b.expiresAt || b.expiresAt > now))
        .map((b) => b.targetId)
    )
    return candidates.filter((c) => !blockedIds.has(c.id))
  }

  const candidates: Candidate[] = [
    { id: 'p-1', name: 'Alice' },
    { id: 'p-2', name: 'Bob' },
    { id: 'p-3', name: 'Charlie' },
    { id: 'p-4', name: 'Diana' },
  ]

  const blacklist: BlacklistEntry[] = [
    { targetType: 'PERSON', targetId: 'p-2', liftedAt: null, expiresAt: null },           // permanent
    { targetType: 'PERSON', targetId: 'p-3', liftedAt: new Date(), expiresAt: null },      // lifted
    { targetType: 'COMPANY', targetId: 'comp-99', liftedAt: null, expiresAt: null },       // company, not person
  ]

  it('blacklisted candidates are excluded from the feed', () => {
    const result = filterBlacklisted(candidates, blacklist)
    expect(result.map((c) => c.name)).toEqual(['Alice', 'Charlie', 'Diana'])
  })

  it('lifted entries do not filter candidates', () => {
    const result = filterBlacklisted(candidates, blacklist)
    expect(result.some((c) => c.name === 'Charlie')).toBe(true)
  })

  it('company-targeted entries do not filter person candidates', () => {
    const result = filterBlacklisted(candidates, blacklist)
    expect(result).toHaveLength(3) // only p-2 filtered
  })

  it('expired temporary entries do not filter candidates', () => {
    const expiredBlacklist: BlacklistEntry[] = [
      { targetType: 'PERSON', targetId: 'p-1', liftedAt: null, expiresAt: new Date('2025-01-01') },
    ]
    const result = filterBlacklisted(candidates, expiredBlacklist, new Date('2026-01-01'))
    expect(result).toHaveLength(4) // all pass
  })

  it('an empty blacklist returns all candidates', () => {
    const result = filterBlacklisted(candidates, [])
    expect(result).toHaveLength(4)
  })
})

// ── Company search exclusion ────────────────────────

describe('Blacklisted company exclusion from search', () => {
  type Company = { id: string; name: string }
  type BlacklistEntry = { targetType: string; targetId: string; liftedAt: Date | null }

  function filterBlacklistedCompanies(
    companies: Company[],
    blacklist: BlacklistEntry[]
  ): Company[] {
    const blockedIds = new Set(
      blacklist
        .filter((b) => b.targetType === 'COMPANY' && !b.liftedAt)
        .map((b) => b.targetId)
    )
    return companies.filter((c) => !blockedIds.has(c.id))
  }

  const companies: Company[] = [
    { id: 'c-1', name: 'Acme Corp' },
    { id: 'c-2', name: 'Bad Vendor LLC' },
    { id: 'c-3', name: 'Good Vendor Inc' },
  ]

  it('blacklisted companies are excluded from search results', () => {
    const bl: BlacklistEntry[] = [
      { targetType: 'COMPANY', targetId: 'c-2', liftedAt: null },
    ]
    const result = filterBlacklistedCompanies(companies, bl)
    expect(result.map((c) => c.name)).toEqual(['Acme Corp', 'Good Vendor Inc'])
  })

  it('lifted company entries do not exclude from search', () => {
    const bl: BlacklistEntry[] = [
      { targetType: 'COMPANY', targetId: 'c-2', liftedAt: new Date() },
    ]
    const result = filterBlacklistedCompanies(companies, bl)
    expect(result).toHaveLength(3)
  })

  it('person-targeted entries do not affect company search', () => {
    const bl: BlacklistEntry[] = [
      { targetType: 'PERSON', targetId: 'p-1', liftedAt: null },
    ]
    const result = filterBlacklistedCompanies(companies, bl)
    expect(result).toHaveLength(3)
  })
})

// ── Reason requirement ──────────────────────────────

describe('Blacklist reason requirement', () => {
  function isValidReason(reason: string | null | undefined): boolean {
    if (!reason) return false
    return reason.trim().length > 0
  }

  it('a descriptive reason is valid', () => {
    expect(isValidReason('Non-performance on last 3 assignments')).toBe(true)
  })

  it('a null reason is invalid', () => {
    expect(isValidReason(null)).toBe(false)
  })

  it('an empty string reason is invalid', () => {
    expect(isValidReason('')).toBe(false)
  })

  it('a whitespace-only reason is invalid', () => {
    expect(isValidReason('   ')).toBe(false)
  })

  it('an undefined reason is invalid', () => {
    expect(isValidReason(undefined)).toBe(false)
  })
})
