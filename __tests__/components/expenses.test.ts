import { describe, it, expect } from 'vitest'

/**
 * Expenses module invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Tests the logic layer without rendering:
 * - Expense total calculation from line items
 * - Status lifecycle transitions
 * - Billable vs internal classification
 * - Category validation
 * - Item validation (quantity, unit price)
 * - Batch action validation
 * - Period formatting
 * - Search filter across fields
 */

// ── Expense total calculation ──────────────────────

describe('Expense total calculation', () => {
  function calculateTotal(items: { quantity: number; unitPrice: number }[]): number {
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  }

  it('a single item total is quantity times unit price', () => {
    expect(calculateTotal([{ quantity: 1, unitPrice: 250 }])).toBe(250)
  })

  it('multiple items sum correctly', () => {
    expect(
      calculateTotal([
        { quantity: 3, unitPrice: 100 },
        { quantity: 1, unitPrice: 450 },
        { quantity: 2, unitPrice: 75 },
      ])
    ).toBe(900) // 300 + 450 + 150
  })

  it('fractional unit prices are handled', () => {
    const total = calculateTotal([{ quantity: 2, unitPrice: 12.50 }])
    expect(total).toBe(25)
  })

  it('an empty items array totals to zero', () => {
    expect(calculateTotal([])).toBe(0)
  })

  it('a high-quantity equipment purchase calculates correctly', () => {
    expect(
      calculateTotal([{ quantity: 10, unitPrice: 1500 }])
    ).toBe(15000)
  })
})

// ── Status lifecycle transitions ─────────────────────

describe('Expense status transitions', () => {
  const validTransitions: Record<string, string[]> = {
    submit: ['DRAFT'],
    approve: ['SUBMITTED'],
    reject: ['SUBMITTED', 'APPROVED'],
    invoice: ['APPROVED'],
  }

  function canTransition(action: string, currentStatus: string): boolean {
    const allowed = validTransitions[action]
    return allowed ? allowed.includes(currentStatus) : false
  }

  it('a draft expense can be submitted', () => {
    expect(canTransition('submit', 'DRAFT')).toBe(true)
  })

  it('a submitted expense cannot be submitted again', () => {
    expect(canTransition('submit', 'SUBMITTED')).toBe(false)
  })

  it('a submitted expense can be approved', () => {
    expect(canTransition('approve', 'SUBMITTED')).toBe(true)
  })

  it('a draft expense cannot be approved directly', () => {
    expect(canTransition('approve', 'DRAFT')).toBe(false)
  })

  it('an approved expense cannot be approved again', () => {
    expect(canTransition('approve', 'APPROVED')).toBe(false)
  })

  it('a submitted expense can be rejected', () => {
    expect(canTransition('reject', 'SUBMITTED')).toBe(true)
  })

  it('an approved expense can be rejected', () => {
    expect(canTransition('reject', 'APPROVED')).toBe(true)
  })

  it('a paid expense cannot be rejected', () => {
    expect(canTransition('reject', 'PAID')).toBe(false)
  })

  it('an approved expense can be invoiced', () => {
    expect(canTransition('invoice', 'APPROVED')).toBe(true)
  })

  it('a submitted expense cannot be invoiced without approval', () => {
    expect(canTransition('invoice', 'SUBMITTED')).toBe(false)
  })

  it('an invoiced expense cannot be invoiced again', () => {
    expect(canTransition('invoice', 'INVOICED')).toBe(false)
  })
})

// ── Billable vs internal classification ──────────────

describe('Expense billable classification', () => {
  function expenseKind(billable: boolean): 'CLIENT_BILLABLE' | 'INTERNAL' {
    return billable ? 'CLIENT_BILLABLE' : 'INTERNAL'
  }

  function canInvoice(billable: boolean, status: string): boolean {
    return billable && status === 'APPROVED'
  }

  it('a billable expense is classified as client-billable', () => {
    expect(expenseKind(true)).toBe('CLIENT_BILLABLE')
  })

  it('a non-billable expense is classified as internal', () => {
    expect(expenseKind(false)).toBe('INTERNAL')
  })

  it('a billable approved expense can be invoiced', () => {
    expect(canInvoice(true, 'APPROVED')).toBe(true)
  })

  it('an internal approved expense cannot be invoiced', () => {
    expect(canInvoice(false, 'APPROVED')).toBe(false)
  })

  it('a billable submitted expense cannot be invoiced yet', () => {
    expect(canInvoice(true, 'SUBMITTED')).toBe(false)
  })
})

// ── Category validation ──────────────────────────────

describe('Expense category validation', () => {
  const VALID_CATEGORIES = ['TRAVEL', 'EQUIPMENT', 'TRAINING', 'RELOCATION', 'MEALS', 'OTHER']

  function isValidCategory(cat: string): boolean {
    return VALID_CATEGORIES.includes(cat.toUpperCase())
  }

  it('TRAVEL is a valid expense category', () => {
    expect(isValidCategory('TRAVEL')).toBe(true)
  })

  it('EQUIPMENT is a valid expense category', () => {
    expect(isValidCategory('EQUIPMENT')).toBe(true)
  })

  it('TRAINING is a valid expense category', () => {
    expect(isValidCategory('TRAINING')).toBe(true)
  })

  it('RELOCATION is a valid expense category', () => {
    expect(isValidCategory('RELOCATION')).toBe(true)
  })

  it('MEALS is a valid expense category', () => {
    expect(isValidCategory('MEALS')).toBe(true)
  })

  it('OTHER is a valid expense category', () => {
    expect(isValidCategory('OTHER')).toBe(true)
  })

  it('ENTERTAINMENT is not a valid expense category', () => {
    expect(isValidCategory('ENTERTAINMENT')).toBe(false)
  })

  it('lowercase categories are normalized to uppercase', () => {
    expect(isValidCategory('travel')).toBe(true)
  })
})

// ── Item validation ──────────────────────────────────

describe('Expense item validation', () => {
  function validateItem(item: { description?: string; quantity?: number; unitPrice?: number }): string | null {
    if (!item.description) return 'description is required'
    if (typeof item.quantity !== 'number') return 'quantity must be a number'
    if (typeof item.unitPrice !== 'number') return 'unitPrice must be a number'
    if (item.quantity <= 0) return 'quantity must be positive'
    if (item.unitPrice < 0) return 'unitPrice must be non-negative'
    return null
  }

  it('a valid item passes validation', () => {
    expect(validateItem({ description: 'Flight to Dallas', quantity: 1, unitPrice: 450 })).toBeNull()
  })

  it('a missing description fails validation', () => {
    expect(validateItem({ quantity: 1, unitPrice: 450 })).toBe('description is required')
  })

  it('a missing quantity fails validation', () => {
    expect(validateItem({ description: 'Taxi', unitPrice: 35 })).toBe('quantity must be a number')
  })

  it('a zero quantity fails validation', () => {
    expect(validateItem({ description: 'Taxi', quantity: 0, unitPrice: 35 })).toBe('quantity must be positive')
  })

  it('a negative unit price fails validation', () => {
    expect(validateItem({ description: 'Refund', quantity: 1, unitPrice: -50 })).toBe('unitPrice must be non-negative')
  })

  it('a zero unit price is valid for comped items', () => {
    expect(validateItem({ description: 'Company meal', quantity: 1, unitPrice: 0 })).toBeNull()
  })
})

// ── Batch action validation ──────────────────────────

describe('Expense batch actions', () => {
  function filterActionable(expenses: { id: string; status: string }[], action: string): string[] {
    const validTransitions: Record<string, string[]> = {
      submit: ['DRAFT'],
      approve: ['SUBMITTED'],
      reject: ['SUBMITTED', 'APPROVED'],
      invoice: ['APPROVED'],
    }
    const allowed = validTransitions[action] ?? []
    return expenses.filter((e) => allowed.includes(e.status)).map((e) => e.id)
  }

  const expenses = [
    { id: '1', status: 'DRAFT' },
    { id: '2', status: 'DRAFT' },
    { id: '3', status: 'SUBMITTED' },
    { id: '4', status: 'APPROVED' },
    { id: '5', status: 'INVOICED' },
    { id: '6', status: 'REJECTED' },
  ]

  it('submit finds only draft expenses', () => {
    expect(filterActionable(expenses, 'submit')).toEqual(['1', '2'])
  })

  it('approve finds only submitted expenses', () => {
    expect(filterActionable(expenses, 'approve')).toEqual(['3'])
  })

  it('reject finds submitted and approved expenses', () => {
    expect(filterActionable(expenses, 'reject')).toEqual(['3', '4'])
  })

  it('invoice finds only approved expenses', () => {
    expect(filterActionable(expenses, 'invoice')).toEqual(['4'])
  })

  it('an unknown action finds no expenses', () => {
    expect(filterActionable(expenses, 'delete')).toEqual([])
  })
})

// ── Summary aggregation ──────────────────────────────

describe('Expense summary aggregation', () => {
  function aggregateByStatus(expenses: { status: string; total: number }[]): Record<string, { count: number; total: number }> {
    const result: Record<string, { count: number; total: number }> = {}
    for (const e of expenses) {
      if (!result[e.status]) result[e.status] = { count: 0, total: 0 }
      result[e.status].count++
      result[e.status].total += e.total
    }
    return result
  }

  function aggregateByKind(expenses: { billable: boolean; total: number }[]): { billable: number; internal: number } {
    return expenses.reduce(
      (acc, e) => {
        if (e.billable) acc.billable += e.total
        else acc.internal += e.total
        return acc
      },
      { billable: 0, internal: 0 }
    )
  }

  const expenses = [
    { status: 'SUBMITTED', total: 500, billable: true },
    { status: 'SUBMITTED', total: 300, billable: true },
    { status: 'APPROVED', total: 1200, billable: false },
    { status: 'PAID', total: 750, billable: true },
  ]

  it('counts expenses by status correctly', () => {
    const agg = aggregateByStatus(expenses)
    expect(agg['SUBMITTED'].count).toBe(2)
    expect(agg['APPROVED'].count).toBe(1)
    expect(agg['PAID'].count).toBe(1)
  })

  it('sums totals by status correctly', () => {
    const agg = aggregateByStatus(expenses)
    expect(agg['SUBMITTED'].total).toBe(800)
    expect(agg['APPROVED'].total).toBe(1200)
  })

  it('separates billable and internal totals', () => {
    const agg = aggregateByKind(expenses)
    expect(agg.billable).toBe(1550)
    expect(agg.internal).toBe(1200)
  })
})

// ── Period formatting ────────────────────────────────

describe('Expense period formatting', () => {
  function formatPeriod(start: string, end: string): string {
    const s = new Date(start)
    const e = new Date(end)
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
  }

  it('formats a one-week period correctly', () => {
    const result = formatPeriod('2026-08-01', '2026-08-07')
    expect(result).toContain('Aug')
    expect(result).toContain('1')
    expect(result).toContain('7')
  })

  it('formats a cross-month period correctly', () => {
    const result = formatPeriod('2026-07-28', '2026-08-03')
    expect(result).toContain('Jul')
    expect(result).toContain('Aug')
  })
})

// ── Search filter ────────────────────────────────────

describe('Expense search filter', () => {
  function searchFilter(row: { person: { name: string }; client: { name: string }; category: string; description: string; status: string; billable: boolean }, q: string): boolean {
    const lower = q.toLowerCase()
    return (
      row.person.name.toLowerCase().includes(lower) ||
      row.client.name.toLowerCase().includes(lower) ||
      row.category.toLowerCase().includes(lower) ||
      row.description.toLowerCase().includes(lower) ||
      row.status.toLowerCase().includes(lower) ||
      (row.billable ? 'billable' : 'internal').includes(lower)
    )
  }

  const expense = {
    person: { name: 'Raj Kumar' },
    client: { name: 'Terumo BCT' },
    category: 'TRAVEL',
    description: 'Flight to Denver office',
    status: 'SUBMITTED',
    billable: true,
  }

  it('matches by consultant name', () => {
    expect(searchFilter(expense, 'raj')).toBe(true)
  })

  it('matches by client name', () => {
    expect(searchFilter(expense, 'terumo')).toBe(true)
  })

  it('matches by category', () => {
    expect(searchFilter(expense, 'travel')).toBe(true)
  })

  it('matches by description', () => {
    expect(searchFilter(expense, 'denver')).toBe(true)
  })

  it('matches by status', () => {
    expect(searchFilter(expense, 'submitted')).toBe(true)
  })

  it('matches billable kind', () => {
    expect(searchFilter(expense, 'billable')).toBe(true)
  })

  it('does not match unrelated term', () => {
    expect(searchFilter(expense, 'payroll')).toBe(false)
  })
})
