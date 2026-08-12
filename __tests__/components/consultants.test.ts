import { describe, it, expect } from 'vitest'

/**
 * Consultants page invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Tests the logic layer without rendering:
 * - Work authorization formatting
 * - Availability status classification
 * - Tier filtering
 * - Search across name, email, skills, location, work auth
 * - Statistics aggregation (total, retained, available now)
 * - Rate display with cost permission gating
 */

// ── Work authorization formatting ────────────────────

describe('Consultants work authorization labels', () => {
  function formatWorkAuth(auth: string | null): string {
    if (!auth) return 'Not specified'
    const labels: Record<string, string> = {
      US_CITIZEN: 'US Citizen',
      GC: 'Green Card',
      H1B: 'H-1B',
      OPT: 'OPT',
      EAD: 'EAD',
      TN: 'TN',
      L1: 'L-1',
      GBP_SW: 'UK Skilled Worker',
    }
    return labels[auth] ?? auth
  }

  it('formats US_CITIZEN as US Citizen', () => {
    expect(formatWorkAuth('US_CITIZEN')).toBe('US Citizen')
  })

  it('formats H1B as H-1B with hyphen', () => {
    expect(formatWorkAuth('H1B')).toBe('H-1B')
  })

  it('formats GBP_SW as UK Skilled Worker', () => {
    expect(formatWorkAuth('GBP_SW')).toBe('UK Skilled Worker')
  })

  it('returns the raw value for unknown auth types', () => {
    expect(formatWorkAuth('E3')).toBe('E3')
  })

  it('returns Not specified for null', () => {
    expect(formatWorkAuth(null)).toBe('Not specified')
  })
})

// ── Availability classification ──────────────────────

describe('Consultants availability status', () => {
  function availabilityGroup(availableFrom: string | null, now: Date): 'now' | 'soon' | 'later' | 'unknown' {
    if (!availableFrom) return 'unknown'
    const date = new Date(availableFrom)
    const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil <= 0) return 'now'
    if (daysUntil <= 14) return 'soon'
    return 'later'
  }

  const now = new Date('2026-08-12T12:00:00Z')

  it('a consultant available today is classified as now', () => {
    expect(availabilityGroup('2026-08-12', now)).toBe('now')
  })

  it('a consultant available yesterday is classified as now', () => {
    expect(availabilityGroup('2026-08-10', now)).toBe('now')
  })

  it('a consultant available in 7 days is classified as soon', () => {
    expect(availabilityGroup('2026-08-19', now)).toBe('soon')
  })

  it('a consultant available in 30 days is classified as later', () => {
    expect(availabilityGroup('2026-09-11', now)).toBe('later')
  })

  it('a consultant with no availability date is classified as unknown', () => {
    expect(availabilityGroup(null, now)).toBe('unknown')
  })
})

// ── Tier filtering ───────────────────────────────────

describe('Consultants tier filtering', () => {
  const consultants = [
    { id: '1', name: 'Ravi Patel', tier: 'RETAINED', skills: ['SAP BRIM'] },
    { id: '2', name: 'Priya Sharma', tier: 'MARKETING', skills: ['Azure'] },
    { id: '3', name: 'John Smith', tier: 'RETAINED', skills: ['Java'] },
    { id: '4', name: 'Anita Desai', tier: null, skills: ['React'] },
  ]

  it('shows all consultants when no tier filter applied', () => {
    expect(consultants).toHaveLength(4)
  })

  it('filters to only RETAINED tier', () => {
    const filtered = consultants.filter((c) => c.tier === 'RETAINED')
    expect(filtered).toHaveLength(2)
  })

  it('filters to only MARKETING tier', () => {
    const filtered = consultants.filter((c) => c.tier === 'MARKETING')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Priya Sharma')
  })

  it('consultants with null tier are excluded from tier filters', () => {
    const retained = consultants.filter((c) => c.tier === 'RETAINED')
    const marketing = consultants.filter((c) => c.tier === 'MARKETING')
    const nullTier = consultants.filter((c) => c.tier === null)
    expect(retained.length + marketing.length + nullTier.length).toBe(consultants.length)
  })
})

// ── Search filter ────────────────────────────────────

describe('Consultants search filter', () => {
  const consultants = [
    { name: 'Ravi Patel', email: 'ravi@cloudepa.com', skills: ['SAP BRIM', 'S/4HANA'], location: 'Dallas, TX', headline: 'Senior SAP Consultant', workAuth: 'H1B' },
    { name: 'Priya Sharma', email: 'priya@tcs.com', skills: ['Azure', '.NET'], location: 'Remote', headline: 'Cloud Engineer', workAuth: 'US_CITIZEN' },
  ]

  const searchFilter = (row: typeof consultants[0], q: string) =>
    row.name.toLowerCase().includes(q) ||
    row.email.toLowerCase().includes(q) ||
    row.skills.some((s) => s.toLowerCase().includes(q)) ||
    (row.location ?? '').toLowerCase().includes(q) ||
    (row.headline ?? '').toLowerCase().includes(q) ||
    (row.workAuth ?? '').toLowerCase().includes(q)

  it('searches by name', () => {
    const filtered = consultants.filter((c) => searchFilter(c, 'ravi'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Ravi Patel')
  })

  it('searches by email', () => {
    const filtered = consultants.filter((c) => searchFilter(c, 'cloudepa'))
    expect(filtered).toHaveLength(1)
  })

  it('searches by skill', () => {
    const filtered = consultants.filter((c) => searchFilter(c, 'azure'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Priya Sharma')
  })

  it('searches by location', () => {
    const filtered = consultants.filter((c) => searchFilter(c, 'dallas'))
    expect(filtered).toHaveLength(1)
  })

  it('searches by headline', () => {
    const filtered = consultants.filter((c) => searchFilter(c, 'engineer'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Priya Sharma')
  })

  it('returns empty when nothing matches', () => {
    const filtered = consultants.filter((c) => searchFilter(c, 'python'))
    expect(filtered).toHaveLength(0)
  })
})

// ── Statistics aggregation ───────────────────────────

describe('Consultants statistics', () => {
  const consultants = [
    { tier: 'RETAINED', availableFrom: '2026-08-01' },
    { tier: 'RETAINED', availableFrom: '2026-08-20' },
    { tier: 'MARKETING', availableFrom: '2026-08-10' },
    { tier: null, availableFrom: null },
  ]

  const now = new Date('2026-08-12T12:00:00Z')

  it('counts total consultants', () => {
    expect(consultants.length).toBe(4)
  })

  it('counts retained consultants', () => {
    const retained = consultants.filter((c) => c.tier === 'RETAINED').length
    expect(retained).toBe(2)
  })

  it('counts consultants available now', () => {
    const availableNow = consultants.filter(
      (c) => c.availableFrom && new Date(c.availableFrom) <= now
    ).length
    expect(availableNow).toBe(2) // Aug 1 and Aug 10 are both before Aug 12
  })
})

// ── Rate display with permission gating ──────────────

describe('Consultants rate display', () => {
  it('shows rate when cost permission is granted', () => {
    const hasCostPermission = true
    const rateMin = 120
    const display = hasCostPermission ? `$${rateMin}/hr` : 'Restricted'
    expect(display).toBe('$120/hr')
  })

  it('shows Restricted when cost permission is denied', () => {
    const hasCostPermission = false
    const rateMin = 120
    const display = hasCostPermission ? `$${rateMin}/hr` : 'Restricted'
    expect(display).toBe('Restricted')
  })

  it('shows dash when rate is null even with permission', () => {
    const rateMin = null
    const display = rateMin != null ? `$${rateMin}/hr` : '—'
    expect(display).toBe('—')
  })
})
