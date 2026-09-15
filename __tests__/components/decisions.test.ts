import { describe, it, expect } from 'vitest'

/**
 * Decisions module invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * BUILD.md §3 — The machine: "GET /api/decisions — what needs a person right now"
 *
 * Tests the logic layer without rendering:
 * - Decision type classification
 * - Urgency assignment
 * - Priority sorting
 * - Counts by type
 * - Amount aggregation
 * - Time-based urgency escalation
 * - Permission-based visibility
 */

// ── Decision types ──────────────────────────────────

describe('Decision type classification', () => {
  const VALID_TYPES = [
    'TIMESHEET_APPROVAL',
    'EXPENSE_APPROVAL',
    'ROLLOFF_ACTION',
    'SUBMISSION_REVIEW',
    'INVOICE_OVERDUE',
    'RATE_CONFIRMATION',
  ]

  function isValidType(type: string): boolean {
    return VALID_TYPES.includes(type)
  }

  function typeLabel(type: string): string {
    const map: Record<string, string> = {
      TIMESHEET_APPROVAL: 'Timesheet',
      EXPENSE_APPROVAL:   'Expense',
      ROLLOFF_ACTION:     'Rolloff',
      SUBMISSION_REVIEW:  'Submission',
      INVOICE_OVERDUE:    'Invoice',
      RATE_CONFIRMATION:  'Rate',
    }
    return map[type] ?? type
  }

  it('TIMESHEET_APPROVAL is a valid decision type', () => {
    expect(isValidType('TIMESHEET_APPROVAL')).toBe(true)
  })

  it('ROLLOFF_ACTION is a valid decision type', () => {
    expect(isValidType('ROLLOFF_ACTION')).toBe(true)
  })

  it('INVOICE_OVERDUE is a valid decision type', () => {
    expect(isValidType('INVOICE_OVERDUE')).toBe(true)
  })

  it('UNKNOWN is not a valid decision type', () => {
    expect(isValidType('UNKNOWN')).toBe(false)
  })

  it('decision types map to human-readable labels', () => {
    expect(typeLabel('TIMESHEET_APPROVAL')).toBe('Timesheet')
    expect(typeLabel('ROLLOFF_ACTION')).toBe('Rolloff')
  })
})

// ── Urgency assignment ──────────────────────────────

describe('Urgency assignment', () => {
  function timesheetUrgency(daysSinceSubmit: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (daysSinceSubmit >= 5) return 'HIGH'
    if (daysSinceSubmit >= 2) return 'MEDIUM'
    return 'LOW'
  }

  function rolloffUrgency(daysUntilEnd: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (daysUntilEnd <= 7) return 'HIGH'
    if (daysUntilEnd <= 14) return 'MEDIUM'
    return 'LOW'
  }

  function invoiceUrgency(daysOverdue: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (daysOverdue >= 60) return 'HIGH'
    if (daysOverdue >= 30) return 'MEDIUM'
    return 'LOW'
  }

  it('a timesheet submitted 7 days ago is HIGH urgency', () => {
    expect(timesheetUrgency(7)).toBe('HIGH')
  })

  it('a timesheet submitted 3 days ago is MEDIUM urgency', () => {
    expect(timesheetUrgency(3)).toBe('MEDIUM')
  })

  it('a timesheet submitted today is LOW urgency', () => {
    expect(timesheetUrgency(0)).toBe('LOW')
  })

  it('a contract ending in 5 days is HIGH urgency', () => {
    expect(rolloffUrgency(5)).toBe('HIGH')
  })

  it('a contract ending in 10 days is MEDIUM urgency', () => {
    expect(rolloffUrgency(10)).toBe('MEDIUM')
  })

  it('a contract ending in 21 days is LOW urgency', () => {
    expect(rolloffUrgency(21)).toBe('LOW')
  })

  it('an invoice 90 days overdue is HIGH urgency', () => {
    expect(invoiceUrgency(90)).toBe('HIGH')
  })

  it('an invoice 45 days overdue is MEDIUM urgency', () => {
    expect(invoiceUrgency(45)).toBe('MEDIUM')
  })

  it('an invoice 10 days overdue is LOW urgency', () => {
    expect(invoiceUrgency(10)).toBe('LOW')
  })
})

// ── Priority sorting ────────────────────────────────

describe('Decision priority sorting', () => {
  type Decision = { type: string; urgency: string; createdAt: string }

  function sortDecisions(decisions: Decision[]): Decision[] {
    const urgencyOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return [...decisions].sort((a, b) => {
      const urgDiff = (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3)
      if (urgDiff !== 0) return urgDiff
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  }

  it('HIGH urgency items come before MEDIUM', () => {
    const result = sortDecisions([
      { type: 'A', urgency: 'MEDIUM', createdAt: '2026-01-01' },
      { type: 'B', urgency: 'HIGH', createdAt: '2026-01-02' },
    ])
    expect(result[0].type).toBe('B')
  })

  it('MEDIUM urgency items come before LOW', () => {
    const result = sortDecisions([
      { type: 'A', urgency: 'LOW', createdAt: '2026-01-01' },
      { type: 'B', urgency: 'MEDIUM', createdAt: '2026-01-02' },
    ])
    expect(result[0].type).toBe('B')
  })

  it('within the same urgency, older items come first', () => {
    const result = sortDecisions([
      { type: 'A', urgency: 'HIGH', createdAt: '2026-01-05' },
      { type: 'B', urgency: 'HIGH', createdAt: '2026-01-01' },
    ])
    expect(result[0].type).toBe('B')
  })

  it('an empty list stays empty', () => {
    expect(sortDecisions([])).toEqual([])
  })
})

// ── Counts by type ──────────────────────────────────

describe('Decision counts by type', () => {
  type Decision = { type: string }

  function countByType(decisions: Decision[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const d of decisions) {
      counts[d.type] = (counts[d.type] ?? 0) + 1
    }
    return counts
  }

  const decisions: Decision[] = [
    { type: 'TIMESHEET_APPROVAL' },
    { type: 'TIMESHEET_APPROVAL' },
    { type: 'EXPENSE_APPROVAL' },
    { type: 'ROLLOFF_ACTION' },
    { type: 'ROLLOFF_ACTION' },
    { type: 'ROLLOFF_ACTION' },
  ]

  it('counts timesheets correctly', () => {
    expect(countByType(decisions).TIMESHEET_APPROVAL).toBe(2)
  })

  it('counts expenses correctly', () => {
    expect(countByType(decisions).EXPENSE_APPROVAL).toBe(1)
  })

  it('counts rolloffs correctly', () => {
    expect(countByType(decisions).ROLLOFF_ACTION).toBe(3)
  })

  it('missing types have no count', () => {
    expect(countByType(decisions).INVOICE_OVERDUE).toBeUndefined()
  })
})

// ── Amount aggregation ──────────────────────────────

describe('Decision amount aggregation', () => {
  type Decision = { amount: number | null }

  function totalAmount(decisions: Decision[]): number {
    return decisions
      .filter((d) => d.amount != null)
      .reduce((sum, d) => sum + (d.amount ?? 0), 0)
  }

  it('sums amounts correctly', () => {
    const decisions: Decision[] = [
      { amount: 1200 },
      { amount: 800 },
      { amount: null }, // no amount (submission)
      { amount: 350 },
    ]
    expect(totalAmount(decisions)).toBe(2350)
  })

  it('returns zero when all amounts are null', () => {
    const decisions: Decision[] = [
      { amount: null },
      { amount: null },
    ]
    expect(totalAmount(decisions)).toBe(0)
  })

  it('returns zero for an empty list', () => {
    expect(totalAmount([])).toBe(0)
  })
})

// ── Time-based urgency escalation ───────────────────

describe('Time-based urgency escalation', () => {
  function computeUrgency(type: string, daysDelta: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    switch (type) {
      case 'TIMESHEET_APPROVAL':
        return daysDelta >= 5 ? 'HIGH' : daysDelta >= 2 ? 'MEDIUM' : 'LOW'
      case 'EXPENSE_APPROVAL':
        return daysDelta >= 5 ? 'HIGH' : 'MEDIUM'
      case 'ROLLOFF_ACTION':
        return daysDelta <= 7 ? 'HIGH' : daysDelta <= 14 ? 'MEDIUM' : 'LOW'
      case 'INVOICE_OVERDUE':
        return daysDelta >= 60 ? 'HIGH' : daysDelta >= 30 ? 'MEDIUM' : 'LOW'
      default:
        return 'LOW'
    }
  }

  it('a stale timesheet escalates from LOW to HIGH over 5 days', () => {
    expect(computeUrgency('TIMESHEET_APPROVAL', 0)).toBe('LOW')
    expect(computeUrgency('TIMESHEET_APPROVAL', 2)).toBe('MEDIUM')
    expect(computeUrgency('TIMESHEET_APPROVAL', 5)).toBe('HIGH')
  })

  it('a rolloff gets more urgent as the end date approaches', () => {
    expect(computeUrgency('ROLLOFF_ACTION', 20)).toBe('LOW')
    expect(computeUrgency('ROLLOFF_ACTION', 10)).toBe('MEDIUM')
    expect(computeUrgency('ROLLOFF_ACTION', 3)).toBe('HIGH')
  })

  it('an overdue invoice escalates at 30 and 60 day marks', () => {
    expect(computeUrgency('INVOICE_OVERDUE', 15)).toBe('LOW')
    expect(computeUrgency('INVOICE_OVERDUE', 30)).toBe('MEDIUM')
    expect(computeUrgency('INVOICE_OVERDUE', 60)).toBe('HIGH')
  })
})

// ── Permission-based visibility ─────────────────────

describe('Decision visibility by permission', () => {
  const TYPE_PERMISSIONS: Record<string, string[]> = {
    TIMESHEET_APPROVAL: ['timesheets.approve'],
    EXPENSE_APPROVAL:   ['invoices.read'],
    ROLLOFF_ACTION:     ['assignments.read'],
    SUBMISSION_REVIEW:  ['submissions.read'],
    INVOICE_OVERDUE:    ['invoices.read'],
  }

  function visibleTypes(userPermissions: string[]): string[] {
    if (userPermissions.includes('*')) return Object.keys(TYPE_PERMISSIONS)
    return Object.entries(TYPE_PERMISSIONS)
      .filter(([, required]) => required.some((p) => userPermissions.includes(p)))
      .map(([type]) => type)
  }

  it('an admin with all permissions sees all decision types', () => {
    expect(visibleTypes(['*'])).toHaveLength(5)
  })

  it('a recruiter sees only submissions', () => {
    const recruiterPerms = ['submissions.read', 'consultants.read']
    const types = visibleTypes(recruiterPerms)
    expect(types).toContain('SUBMISSION_REVIEW')
    expect(types).not.toContain('TIMESHEET_APPROVAL')
  })

  it('an accountant sees timesheets, expenses, and invoices', () => {
    const accountantPerms = ['timesheets.approve', 'invoices.read']
    const types = visibleTypes(accountantPerms)
    expect(types).toContain('TIMESHEET_APPROVAL')
    expect(types).toContain('EXPENSE_APPROVAL')
    expect(types).toContain('INVOICE_OVERDUE')
    expect(types).not.toContain('SUBMISSION_REVIEW')
  })

  it('a user with no matching permissions sees nothing', () => {
    expect(visibleTypes(['settings.manage'])).toHaveLength(0)
  })
})
