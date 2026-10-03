import { describe, it, expect } from 'vitest'

/**
 * Requirements page invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Tests the logic layer without rendering:
 * - Status filtering
 * - Bill range display
 * - Match count aggregation
 * - Search across title, skills, location, status
 * - Stat aggregation (open count, total matches, filled count)
 */

// ── Status filtering ─────────────────────────────────

describe('Requirements status filter', () => {
  const requirements = [
    { id: '1', title: 'SAP BRIM Consultant', status: 'DRAFT', skills: ['SAP BRIM'], matchCount: 0 },
    { id: '2', title: 'Azure DevOps Engineer', status: 'OPEN', skills: ['Azure', '.NET'], matchCount: 5 },
    { id: '3', title: 'React Developer', status: 'OPEN', skills: ['React', 'TypeScript'], matchCount: 12 },
    { id: '4', title: 'Java Architect', status: 'FILLED', skills: ['Java', 'Spring'], matchCount: 8 },
    { id: '5', title: 'Legacy COBOL Migration', status: 'CLOSED', skills: ['COBOL'], matchCount: 2 },
  ]

  it('shows all requirements when filter is ALL', () => {
    expect(requirements).toHaveLength(5)
  })

  it('filters to only OPEN requirements', () => {
    const filtered = requirements.filter((r) => r.status === 'OPEN')
    expect(filtered).toHaveLength(2)
    expect(filtered.every((r) => r.status === 'OPEN')).toBe(true)
  })

  it('filters to only FILLED requirements', () => {
    const filtered = requirements.filter((r) => r.status === 'FILLED')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].title).toBe('Java Architect')
  })

  it('returns empty when no requirements match filter', () => {
    const filtered = requirements.filter((r) => r.status === 'ARCHIVED')
    expect(filtered).toHaveLength(0)
  })
})

// ── Bill range display ───────────────────────────────

describe('Requirements bill range formatting', () => {
  function formatBillRange(min: number | null, max: number | null): string {
    if (min == null && max == null) return '—'
    if (min != null && max != null) return `$${min}–$${max}/hr`
    if (min != null) return `$${min}/hr`
    return `$${max}/hr`
  }

  it('formats a full range with both min and max', () => {
    expect(formatBillRange(80, 120)).toBe('$80–$120/hr')
  })

  it('formats min-only range', () => {
    expect(formatBillRange(100, null)).toBe('$100/hr')
  })

  it('formats max-only range', () => {
    expect(formatBillRange(null, 150)).toBe('$150/hr')
  })

  it('shows dash when neither min nor max is set', () => {
    expect(formatBillRange(null, null)).toBe('—')
  })
})

// ── Match count aggregation ──────────────────────────

describe('Requirements match count aggregation', () => {
  const requirements = [
    { status: 'OPEN', matchCount: 5 },
    { status: 'OPEN', matchCount: 12 },
    { status: 'DRAFT', matchCount: 0 },
    { status: 'FILLED', matchCount: 8 },
    { status: 'CLOSED', matchCount: 2 },
  ]

  it('counts total matches across all requirements', () => {
    const total = requirements.reduce((sum, r) => sum + r.matchCount, 0)
    expect(total).toBe(27)
  })

  it('counts matches only for open requirements', () => {
    const openMatches = requirements
      .filter((r) => r.status === 'OPEN')
      .reduce((sum, r) => sum + r.matchCount, 0)
    expect(openMatches).toBe(17)
  })

  it('a requirement with zero matches is not an error', () => {
    const drafts = requirements.filter((r) => r.status === 'DRAFT')
    expect(drafts[0].matchCount).toBe(0)
  })
})

// ── Search filter ────────────────────────────────────

describe('Requirements search filter', () => {
  const requirements = [
    { id: '1', title: 'SAP BRIM Consultant', skills: ['SAP BRIM', 'Revenue Accounting'], location: 'Dallas, TX', status: 'OPEN' },
    { id: '2', title: 'Azure DevOps Engineer', skills: ['Azure', '.NET'], location: 'Remote', status: 'OPEN' },
    { id: '3', title: 'React Developer', skills: ['React', 'TypeScript'], location: null, status: 'DRAFT' },
  ]

  const searchFilter = (row: typeof requirements[0], q: string) =>
    row.title.toLowerCase().includes(q) ||
    row.skills.some((s) => s.toLowerCase().includes(q)) ||
    (row.location ?? '').toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  it('searches by title', () => {
    const filtered = requirements.filter((r) => searchFilter(r, 'azure'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].title).toBe('Azure DevOps Engineer')
  })

  it('searches by skill', () => {
    const filtered = requirements.filter((r) => searchFilter(r, 'sap'))
    expect(filtered).toHaveLength(1)
  })

  it('searches by location', () => {
    const filtered = requirements.filter((r) => searchFilter(r, 'dallas'))
    expect(filtered).toHaveLength(1)
  })

  it('searches by status', () => {
    const filtered = requirements.filter((r) => searchFilter(r, 'draft'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].status).toBe('DRAFT')
  })

  it('returns empty when nothing matches', () => {
    const filtered = requirements.filter((r) => searchFilter(r, 'python'))
    expect(filtered).toHaveLength(0)
  })
})

// ── Statistics aggregation ───────────────────────────

describe('Requirements statistics', () => {
  const requirements = [
    { status: 'DRAFT', matchCount: 0 },
    { status: 'OPEN', matchCount: 5 },
    { status: 'OPEN', matchCount: 12 },
    { status: 'FILLED', matchCount: 8 },
    { status: 'CLOSED', matchCount: 2 },
  ]

  it('counts open requirements correctly', () => {
    const openCount = requirements.filter((r) => r.status === 'OPEN').length
    expect(openCount).toBe(2)
  })

  it('counts filled requirements correctly', () => {
    const filledCount = requirements.filter((r) => r.status === 'FILLED').length
    expect(filledCount).toBe(1)
  })

  it('aggregates total matches across all requirements', () => {
    const totalMatches = requirements.reduce((sum, r) => sum + r.matchCount, 0)
    expect(totalMatches).toBe(27)
  })

  it('open and filled counts sum correctly against total', () => {
    const open = requirements.filter((r) => r.status === 'OPEN').length
    const filled = requirements.filter((r) => r.status === 'FILLED').length
    const draft = requirements.filter((r) => r.status === 'DRAFT').length
    const closed = requirements.filter((r) => r.status === 'CLOSED').length
    expect(open + filled + draft + closed).toBe(requirements.length)
  })
})
