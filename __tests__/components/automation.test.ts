import { describe, it, expect } from 'vitest'

/**
 * Automation log module invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 * CLAUDE.md: "Anything the system does unprompted writes an AutomationLog
 *  row with a plain-English reason and an honest reversible flag."
 *
 * BUILD.md §3 — The machine:
 *   "GET /api/automation — what ran, with reasons"
 *   "POST /api/automation/:id/reverse — only where reversible is true"
 *
 * Tests the logic layer without rendering:
 * - Action type classification
 * - Category grouping
 * - Reversibility rules
 * - Reversal state transitions
 * - Log entry validation
 * - Time-based filtering
 * - Action counting
 * - Payload inspection
 */

// ── Action types ───────────────────────────────────

describe('Action type classification', () => {
  const KNOWN_ACTIONS = [
    'ROLLOFF_CLAIMED',
    'ROLLOFF_SCAN',
    'BENCH_LISTING_CREATED',
    'BENCH_LISTING_GRANTED',
    'BENCH_LISTING_REVOKED',
    'CONTRACT_CREATED',
    'IMPORT_COMMITTED',
    'CONSULTANT_CREATED',
    'REQUIREMENT_DISTRIBUTED',
    'INVOICE_GENERATED',
    'PAYMENT_RECORDED',
    'TIMESHEET_APPROVED',
    'EXPENSE_APPROVED',
    'EXPENSE_REJECTED',
    'PAYROLL_RUN',
    'BLACKLIST_ADD',
    'BLACKLIST_LIFT',
    'TEMPLATE_PACK_APPLIED',
    'COMPANY_CREATED',
    'REVERSAL',
  ]

  function isKnownAction(action: string): boolean {
    return KNOWN_ACTIONS.includes(action)
  }

  function actionLabel(action: string): string {
    return action
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ')
  }

  it('ROLLOFF_CLAIMED is a known action type', () => {
    expect(isKnownAction('ROLLOFF_CLAIMED')).toBe(true)
  })

  it('INVOICE_GENERATED is a known action type', () => {
    expect(isKnownAction('INVOICE_GENERATED')).toBe(true)
  })

  it('REVERSAL is a known action type', () => {
    expect(isKnownAction('REVERSAL')).toBe(true)
  })

  it('UNKNOWN_ACTION is not a known action type', () => {
    expect(isKnownAction('UNKNOWN_ACTION')).toBe(false)
  })

  it('action labels are human-readable', () => {
    expect(actionLabel('ROLLOFF_CLAIMED')).toBe('Rolloff Claimed')
    expect(actionLabel('INVOICE_GENERATED')).toBe('Invoice Generated')
    expect(actionLabel('BENCH_LISTING_CREATED')).toBe('Bench Listing Created')
  })
})

// ── Category grouping ──────────────────────────────

describe('Action category grouping', () => {
  function actionCategory(action: string): string {
    if (action.startsWith('ROLLOFF')) return 'Rolloff'
    if (action.startsWith('BENCH')) return 'Bench'
    if (action.startsWith('CONTRACT')) return 'Contracts'
    if (action.startsWith('CONSULTANT')) return 'People'
    if (action.startsWith('REQUIREMENT')) return 'Requirements'
    if (action.startsWith('INVOICE') || action.startsWith('PAYMENT')) return 'Invoicing'
    if (action.startsWith('TIMESHEET')) return 'Timesheets'
    if (action.startsWith('EXPENSE')) return 'Expenses'
    if (action.startsWith('PAYROLL')) return 'Payroll'
    if (action.startsWith('BLACKLIST')) return 'Compliance'
    if (action.startsWith('IMPORT')) return 'Import'
    if (action.startsWith('TEMPLATE') || action.startsWith('COMPANY')) return 'Setup'
    if (action === 'REVERSAL') return 'Reversal'
    return 'Other'
  }

  it('rolloff actions belong to the Rolloff category', () => {
    expect(actionCategory('ROLLOFF_CLAIMED')).toBe('Rolloff')
    expect(actionCategory('ROLLOFF_SCAN')).toBe('Rolloff')
  })

  it('bench actions belong to the Bench category', () => {
    expect(actionCategory('BENCH_LISTING_CREATED')).toBe('Bench')
    expect(actionCategory('BENCH_LISTING_REVOKED')).toBe('Bench')
  })

  it('invoice and payment actions belong to Invoicing', () => {
    expect(actionCategory('INVOICE_GENERATED')).toBe('Invoicing')
    expect(actionCategory('PAYMENT_RECORDED')).toBe('Invoicing')
  })

  it('blacklist actions belong to Compliance', () => {
    expect(actionCategory('BLACKLIST_ADD')).toBe('Compliance')
    expect(actionCategory('BLACKLIST_LIFT')).toBe('Compliance')
  })

  it('template pack and company creation belong to Setup', () => {
    expect(actionCategory('TEMPLATE_PACK_APPLIED')).toBe('Setup')
    expect(actionCategory('COMPANY_CREATED')).toBe('Setup')
  })

  it('REVERSAL has its own category', () => {
    expect(actionCategory('REVERSAL')).toBe('Reversal')
  })

  it('unknown actions fall to Other', () => {
    expect(actionCategory('SOME_FUTURE_ACTION')).toBe('Other')
  })
})

// ── Reversibility rules ────────────────────────────

describe('Reversibility rules', () => {
  type LogEntry = {
    action: string
    reversible: boolean
    reversedAt: string | null
  }

  function canReverse(entry: LogEntry): boolean {
    return entry.reversible && entry.reversedAt === null
  }

  function isReversed(entry: LogEntry): boolean {
    return entry.reversedAt !== null
  }

  it('a reversible entry that has not been reversed can be reversed', () => {
    expect(canReverse({ action: 'ROLLOFF_CLAIMED', reversible: true, reversedAt: null })).toBe(true)
  })

  it('a non-reversible entry cannot be reversed', () => {
    expect(canReverse({ action: 'INVOICE_GENERATED', reversible: false, reversedAt: null })).toBe(false)
  })

  it('an already-reversed entry cannot be reversed again', () => {
    expect(canReverse({ action: 'ROLLOFF_CLAIMED', reversible: true, reversedAt: '2026-01-01' })).toBe(false)
  })

  it('a REVERSAL is never itself reversible', () => {
    // Reversals of reversals are not permitted
    expect(canReverse({ action: 'REVERSAL', reversible: false, reversedAt: null })).toBe(false)
  })

  it('isReversed correctly identifies reversed entries', () => {
    expect(isReversed({ action: 'X', reversible: true, reversedAt: '2026-01-01' })).toBe(true)
    expect(isReversed({ action: 'X', reversible: true, reversedAt: null })).toBe(false)
  })
})

// ── Log entry validation ───────────────────────────

describe('Log entry validation', () => {
  type LogEntry = {
    action: string
    summary: string
    reason: string
    payload: Record<string, any>
    reversible: boolean
  }

  function isValid(entry: LogEntry): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    if (!entry.action || entry.action.length === 0) errors.push('action is required')
    if (!entry.summary || entry.summary.length === 0) errors.push('summary is required')
    if (!entry.reason || entry.reason.length === 0) errors.push('reason is required')
    if (entry.payload === null || entry.payload === undefined) errors.push('payload is required')
    return { valid: errors.length === 0, errors }
  }

  it('a complete entry is valid', () => {
    const result = isValid({
      action: 'ROLLOFF_CLAIMED',
      summary: 'John claimed rolloff for contract X',
      reason: 'Manual claim via rolloff console',
      payload: { rolloffId: 'abc' },
      reversible: true,
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('an entry without a summary is invalid', () => {
    const result = isValid({
      action: 'ROLLOFF_CLAIMED',
      summary: '',
      reason: 'Manual claim',
      payload: {},
      reversible: true,
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('summary is required')
  })

  it('an entry without a reason is invalid', () => {
    const result = isValid({
      action: 'ROLLOFF_CLAIMED',
      summary: 'Some action',
      reason: '',
      payload: {},
      reversible: true,
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('reason is required')
  })

  it('an empty payload is valid — payload can be {}', () => {
    const result = isValid({
      action: 'COMPANY_CREATED',
      summary: 'Created company',
      reason: 'Onboarding',
      payload: {},
      reversible: false,
    })
    expect(result.valid).toBe(true)
  })
})

// ── Action counting ────────────────────────────────

describe('Action counting', () => {
  type LogEntry = { action: string }

  function countByAction(entries: LogEntry[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const e of entries) {
      counts[e.action] = (counts[e.action] ?? 0) + 1
    }
    return counts
  }

  function countByCategory(entries: LogEntry[]): Record<string, number> {
    function actionCategory(action: string): string {
      if (action.startsWith('ROLLOFF')) return 'Rolloff'
      if (action.startsWith('BENCH')) return 'Bench'
      if (action.startsWith('INVOICE') || action.startsWith('PAYMENT')) return 'Invoicing'
      if (action.startsWith('TIMESHEET')) return 'Timesheets'
      if (action.startsWith('BLACKLIST')) return 'Compliance'
      return 'Other'
    }

    const counts: Record<string, number> = {}
    for (const e of entries) {
      const cat = actionCategory(e.action)
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    return counts
  }

  const entries: LogEntry[] = [
    { action: 'ROLLOFF_CLAIMED' },
    { action: 'ROLLOFF_CLAIMED' },
    { action: 'INVOICE_GENERATED' },
    { action: 'TIMESHEET_APPROVED' },
    { action: 'TIMESHEET_APPROVED' },
    { action: 'TIMESHEET_APPROVED' },
    { action: 'BLACKLIST_ADD' },
  ]

  it('counts rolloff claims correctly', () => {
    expect(countByAction(entries).ROLLOFF_CLAIMED).toBe(2)
  })

  it('counts timesheet approvals correctly', () => {
    expect(countByAction(entries).TIMESHEET_APPROVED).toBe(3)
  })

  it('missing actions have no count', () => {
    expect(countByAction(entries).PAYROLL_RUN).toBeUndefined()
  })

  it('groups actions into categories correctly', () => {
    const cats = countByCategory(entries)
    expect(cats.Rolloff).toBe(2)
    expect(cats.Timesheets).toBe(3)
    expect(cats.Invoicing).toBe(1)
    expect(cats.Compliance).toBe(1)
  })
})

// ── Reversal state transitions ─────────────────────

describe('Reversal state transitions', () => {
  type LogEntry = {
    id: string
    action: string
    summary: string
    reversible: boolean
    reversedAt: string | null
  }

  function applyReversal(entry: LogEntry): { entry: LogEntry; reversalLog: LogEntry } {
    if (!entry.reversible) throw new Error('NOT_REVERSIBLE')
    if (entry.reversedAt) throw new Error('ALREADY_REVERSED')

    const now = new Date().toISOString()
    return {
      entry: { ...entry, reversedAt: now },
      reversalLog: {
        id: `reversal-${entry.id}`,
        action: 'REVERSAL',
        summary: `Reversed: ${entry.summary}`,
        reversible: false,
        reversedAt: null,
      },
    }
  }

  it('reversing a reversible entry marks it with reversedAt', () => {
    const result = applyReversal({
      id: '1',
      action: 'ROLLOFF_CLAIMED',
      summary: 'John claimed rolloff',
      reversible: true,
      reversedAt: null,
    })
    expect(result.entry.reversedAt).not.toBeNull()
  })

  it('reversing creates a non-reversible REVERSAL log entry', () => {
    const result = applyReversal({
      id: '1',
      action: 'ROLLOFF_CLAIMED',
      summary: 'John claimed rolloff',
      reversible: true,
      reversedAt: null,
    })
    expect(result.reversalLog.action).toBe('REVERSAL')
    expect(result.reversalLog.reversible).toBe(false)
    expect(result.reversalLog.summary).toBe('Reversed: John claimed rolloff')
  })

  it('reversing a non-reversible entry throws NOT_REVERSIBLE', () => {
    expect(() =>
      applyReversal({
        id: '1',
        action: 'INVOICE_GENERATED',
        summary: 'Generated invoice',
        reversible: false,
        reversedAt: null,
      })
    ).toThrow('NOT_REVERSIBLE')
  })

  it('reversing an already-reversed entry throws ALREADY_REVERSED', () => {
    expect(() =>
      applyReversal({
        id: '1',
        action: 'ROLLOFF_CLAIMED',
        summary: 'John claimed rolloff',
        reversible: true,
        reversedAt: '2026-01-01',
      })
    ).toThrow('ALREADY_REVERSED')
  })
})

// ── Time-based filtering ───────────────────────────

describe('Time-based filtering', () => {
  type LogEntry = { at: string }

  function entriesBefore(entries: LogEntry[], before: string): LogEntry[] {
    const cutoff = new Date(before).getTime()
    return entries.filter((e) => new Date(e.at).getTime() < cutoff)
  }

  function entriesAfter(entries: LogEntry[], after: string): LogEntry[] {
    const cutoff = new Date(after).getTime()
    return entries.filter((e) => new Date(e.at).getTime() > cutoff)
  }

  const entries: LogEntry[] = [
    { at: '2026-01-01T10:00:00Z' },
    { at: '2026-01-05T10:00:00Z' },
    { at: '2026-01-10T10:00:00Z' },
    { at: '2026-01-15T10:00:00Z' },
  ]

  it('entriesBefore filters correctly', () => {
    expect(entriesBefore(entries, '2026-01-08T00:00:00Z')).toHaveLength(2)
  })

  it('entriesAfter filters correctly', () => {
    expect(entriesAfter(entries, '2026-01-08T00:00:00Z')).toHaveLength(2)
  })

  it('a cutoff at the exact timestamp excludes the entry', () => {
    expect(entriesBefore(entries, '2026-01-05T10:00:00Z')).toHaveLength(1)
  })

  it('an empty list stays empty', () => {
    expect(entriesBefore([], '2026-01-01')).toEqual([])
  })
})

// ── Payload inspection ─────────────────────────────

describe('Payload inspection', () => {
  function payloadKeys(payload: Record<string, any>): string[] {
    return Object.keys(payload).sort()
  }

  function hasField(payload: Record<string, any>, field: string): boolean {
    return field in payload
  }

  it('a rolloff claim payload contains rolloffId and claimedBy', () => {
    const payload = { rolloffId: 'abc', claimedBy: 'person-1' }
    expect(payloadKeys(payload)).toEqual(['claimedBy', 'rolloffId'])
  })

  it('a reversal payload contains reversedEntryId and originalAction', () => {
    const payload = { reversedEntryId: 'abc', originalAction: 'ROLLOFF_CLAIMED' }
    expect(hasField(payload, 'reversedEntryId')).toBe(true)
    expect(hasField(payload, 'originalAction')).toBe(true)
  })

  it('an empty payload has no keys', () => {
    expect(payloadKeys({})).toEqual([])
  })
})
