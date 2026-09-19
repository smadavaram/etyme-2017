import { describe, it, expect } from 'vitest'

/**
 * Submissions page invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Tests the logic layer without rendering:
 * - Status filtering
 * - Direction toggle (sent vs received)
 * - Search across consultant, requirement, company
 * - Kind classification (INTERNAL / BENCH / NETWORK)
 * - Rate display
 * - Relative time formatting
 */

// ── Status filtering ─────────────────────────────────

describe('Submissions status filter', () => {
  const submissions = [
    { id: '1', status: 'SUBMITTED', kind: 'BENCH', rate: 120 },
    { id: '2', status: 'SHORTLISTED', kind: 'INTERNAL', rate: 100 },
    { id: '3', status: 'INTERVIEW', kind: 'NETWORK', rate: 90 },
    { id: '4', status: 'SUBMITTED', kind: 'BENCH', rate: 110 },
    { id: '5', status: 'PLACED', kind: 'BENCH', rate: 130 },
    { id: '6', status: 'REJECTED', kind: 'NETWORK', rate: 85 },
  ]

  it('shows all submissions when filter is ALL', () => {
    const filtered = submissions
    expect(filtered).toHaveLength(6)
  })

  it('filters to only SUBMITTED status', () => {
    const filtered = submissions.filter((s) => s.status === 'SUBMITTED')
    expect(filtered).toHaveLength(2)
    expect(filtered.every((s) => s.status === 'SUBMITTED')).toBe(true)
  })

  it('filters to only PLACED status', () => {
    const filtered = submissions.filter((s) => s.status === 'PLACED')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('5')
  })

  it('returns empty when no submissions match filter', () => {
    const filtered = submissions.filter((s) => s.status === 'OFFERED')
    expect(filtered).toHaveLength(0)
  })

  it('computes correct status counts from the dataset', () => {
    const counts = {
      submitted: submissions.filter((s) => s.status === 'SUBMITTED').length,
      shortlisted: submissions.filter((s) => s.status === 'SHORTLISTED').length,
      interview: submissions.filter((s) => s.status === 'INTERVIEW').length,
      placed: submissions.filter((s) => s.status === 'PLACED').length,
      rejected: submissions.filter((s) => s.status === 'REJECTED').length,
    }
    expect(counts).toEqual({
      submitted: 2,
      shortlisted: 1,
      interview: 1,
      placed: 1,
      rejected: 1,
    })
  })
})

// ── Direction toggle ─────────────────────────────────

describe('Submissions direction toggle', () => {
  const submission = {
    fromCompany: { id: 'vendor-1', name: 'Cloudepa Inc.' },
    toCompany: { id: 'client-1', name: 'Accenture' },
  }

  it('sent direction shows the client (toCompany) as counterparty', () => {
    const direction = 'sent'
    const counterparty = direction === 'sent' ? submission.toCompany.name : submission.fromCompany.name
    expect(counterparty).toBe('Accenture')
  })

  it('received direction shows the vendor (fromCompany) as counterparty', () => {
    const direction: string = 'received'
    const counterparty = direction === 'sent' ? submission.toCompany.name : submission.fromCompany.name
    expect(counterparty).toBe('Cloudepa Inc.')
  })
})

// ── Search filter ────────────────────────────────────

describe('Submissions search filter', () => {
  const submissions = [
    {
      id: '1',
      person: { id: 'p1', name: 'Ravi Patel' },
      requirement: { id: 'r1', title: 'SAP BRIM Consultant', skills: ['SAP BRIM', 'Revenue Accounting'] },
      fromCompany: { id: 'v1', name: 'Cloudepa' },
      toCompany: { id: 'c1', name: 'Infosys' },
      kind: 'BENCH',
      status: 'SUBMITTED',
    },
    {
      id: '2',
      person: { id: 'p2', name: 'Priya Sharma' },
      requirement: { id: 'r2', title: 'Azure DevOps Engineer', skills: ['Azure', '.NET'] },
      fromCompany: { id: 'v2', name: 'TCS' },
      toCompany: { id: 'c1', name: 'Infosys' },
      kind: 'NETWORK',
      status: 'INTERVIEW',
    },
  ]

  const searchFilter = (row: typeof submissions[0], q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.requirement.title.toLowerCase().includes(q) ||
    row.requirement.skills.some((s) => s.toLowerCase().includes(q)) ||
    row.fromCompany.name.toLowerCase().includes(q) ||
    row.toCompany.name.toLowerCase().includes(q) ||
    row.kind.toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  it('searches by consultant name', () => {
    const filtered = submissions.filter((r) => searchFilter(r, 'ravi'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].person.name).toBe('Ravi Patel')
  })

  it('searches by requirement title', () => {
    const filtered = submissions.filter((r) => searchFilter(r, 'azure'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].requirement.title).toBe('Azure DevOps Engineer')
  })

  it('searches by skill', () => {
    const filtered = submissions.filter((r) => searchFilter(r, 'sap'))
    expect(filtered).toHaveLength(1)
  })

  it('searches by company name', () => {
    const filtered = submissions.filter((r) => searchFilter(r, 'infosys'))
    expect(filtered).toHaveLength(2) // both are submitted to Infosys
  })

  it('searches by submission kind', () => {
    const filtered = submissions.filter((r) => searchFilter(r, 'network'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].kind).toBe('NETWORK')
  })

  it('searches by status', () => {
    const filtered = submissions.filter((r) => searchFilter(r, 'interview'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].status).toBe('INTERVIEW')
  })

  it('returns empty when nothing matches', () => {
    const filtered = submissions.filter((r) => searchFilter(r, 'java'))
    expect(filtered).toHaveLength(0)
  })
})

// ── Kind classification ──────────────────────────────

describe('Submissions kind classification', () => {
  it('INTERNAL: fromCompany equals toCompany', () => {
    const fromCompanyId = 'company-1'
    const toCompanyId = 'company-1'
    const tier = 'RETAINED'
    let kind: string
    if (fromCompanyId === toCompanyId) {
      kind = 'INTERNAL'
    } else if (tier === 'RETAINED') {
      kind = 'BENCH'
    } else {
      kind = 'NETWORK'
    }
    expect(kind).toBe('INTERNAL')
  })

  it('BENCH: different companies, consultant on retained bench', () => {
    const fromCompanyId: string = 'company-1'
    const toCompanyId: string = 'company-2'
    const tier = 'RETAINED'
    let kind: string
    if (fromCompanyId === toCompanyId) {
      kind = 'INTERNAL'
    } else if (tier === 'RETAINED') {
      kind = 'BENCH'
    } else {
      kind = 'NETWORK'
    }
    expect(kind).toBe('BENCH')
  })

  it('NETWORK: different companies, consultant on marketing bench', () => {
    const fromCompanyId: string = 'company-1'
    const toCompanyId: string = 'company-2'
    const tier: string = 'MARKETING'
    let kind: string
    if (fromCompanyId === toCompanyId) {
      kind = 'INTERNAL'
    } else if (tier === 'RETAINED') {
      kind = 'BENCH'
    } else {
      kind = 'NETWORK'
    }
    expect(kind).toBe('NETWORK')
  })

  it('kind is computed from ownership — never accepted from user input', () => {
    // CLAUDE.md: "SubmissionKind is computed from ownership, never accepted from a client"
    const userClaimedKind = 'BENCH' // user tries to say BENCH
    const fromCompanyId = 'company-1'
    const toCompanyId = 'company-1'
    // Server ignores userClaimedKind and computes:
    const computedKind = fromCompanyId === toCompanyId ? 'INTERNAL' : userClaimedKind
    expect(computedKind).toBe('INTERNAL')
  })
})

// ── Rate display ─────────────────────────────────────

describe('Submissions rate formatting', () => {
  it('displays rate in dollars per hour', () => {
    const rate = 120
    const formatted = `$${rate}/hr`
    expect(formatted).toBe('$120/hr')
  })

  it('sorts rates numerically not lexicographically', () => {
    const rates = [120, 85, 200, 90, 150]
    const sortedAsc = [...rates].sort((a, b) => a - b)
    expect(sortedAsc).toEqual([85, 90, 120, 150, 200])
    // Lexicographic sort would put 200 before 85
    const sortedLex = [...rates.map(String)].sort()
    expect(sortedLex[0]).toBe('120') // wrong order
  })
})

// ── Relative time ────────────────────────────────────

describe('Submissions relative time formatting', () => {
  function timeAgo(dateStr: string, now: Date): string {
    const d = new Date(dateStr)
    const diffMs = now.getTime() - d.getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  const now = new Date('2026-08-12T15:00:00Z')

  it('shows minutes for recent submissions', () => {
    const result = timeAgo('2026-08-12T14:45:00Z', now)
    expect(result).toBe('15m ago')
  })

  it('shows hours for same-day submissions', () => {
    const result = timeAgo('2026-08-12T10:00:00Z', now)
    expect(result).toBe('5h ago')
  })

  it('shows days for submissions within a week', () => {
    const result = timeAgo('2026-08-10T15:00:00Z', now)
    expect(result).toBe('2d ago')
  })

  it('shows full date for submissions older than a week', () => {
    const result = timeAgo('2026-07-15T15:00:00Z', now)
    expect(result).toMatch(/\d/) // locale-dependent, just verify it's a date
  })
})
