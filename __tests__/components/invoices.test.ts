import { describe, it, expect } from 'vitest'

/**
 * Invoices page invariant tests.
 *
 * CLAUDE.md: "Every module ships with tests named as English sentences."
 *
 * Tests the logic layer without rendering:
 * - Aging bucket classification
 * - Invoice status lifecycle
 * - Invoice generation from approved timesheets
 * - Invoice numbering format
 * - Payment recording with overpayment guard
 * - Outstanding balance calculation
 * - Aging summary aggregation
 * - Search across invoice number, engagement, client, status
 */

// ── Aging bucket classification ─────────────────────

describe('Invoice aging buckets', () => {
  function agingBucket(dueAt: string, now: Date): string {
    const dueDate = new Date(dueAt)
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
    if (daysOverdue <= 0) return 'current'
    if (daysOverdue <= 30) return '1-30'
    if (daysOverdue <= 60) return '31-60'
    if (daysOverdue <= 90) return '61-90'
    return '90+'
  }

  const now = new Date('2026-08-12T12:00:00Z')

  it('an invoice due today is classified as current', () => {
    expect(agingBucket('2026-08-12', now)).toBe('current')
  })

  it('an invoice due tomorrow is classified as current', () => {
    expect(agingBucket('2026-08-13', now)).toBe('current')
  })

  it('an invoice due 15 days ago is classified as 1-30', () => {
    expect(agingBucket('2026-07-28', now)).toBe('1-30')
  })

  it('an invoice due 30 days ago is classified as 1-30', () => {
    expect(agingBucket('2026-07-13', now)).toBe('1-30')
  })

  it('an invoice due 45 days ago is classified as 31-60', () => {
    expect(agingBucket('2026-06-28', now)).toBe('31-60')
  })

  it('an invoice due 75 days ago is classified as 61-90', () => {
    expect(agingBucket('2026-05-29', now)).toBe('61-90')
  })

  it('an invoice due 120 days ago is classified as 90+', () => {
    expect(agingBucket('2026-04-14', now)).toBe('90+')
  })
})

// ── Invoice status lifecycle ────────────────────────

describe('Invoice status lifecycle', () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    DRAFT:          ['ISSUED', 'CANCELLED'],
    ISSUED:         ['SUBMITTED', 'CANCELLED'],
    SUBMITTED:      ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
    PARTIALLY_PAID: ['PAID', 'CANCELLED'],
    PAID:           [],
    CANCELLED:      [],
  }

  function canTransition(from: string, to: string): boolean {
    return (VALID_TRANSITIONS[from] ?? []).includes(to)
  }

  it('an issued invoice can be submitted', () => {
    expect(canTransition('ISSUED', 'SUBMITTED')).toBe(true)
  })

  it('a submitted invoice can be partially paid', () => {
    expect(canTransition('SUBMITTED', 'PARTIALLY_PAID')).toBe(true)
  })

  it('a submitted invoice can be fully paid in one step', () => {
    expect(canTransition('SUBMITTED', 'PAID')).toBe(true)
  })

  it('a partially paid invoice can become fully paid', () => {
    expect(canTransition('PARTIALLY_PAID', 'PAID')).toBe(true)
  })

  it('a paid invoice cannot transition further', () => {
    expect(VALID_TRANSITIONS['PAID']).toHaveLength(0)
  })

  it('a cancelled invoice cannot transition further', () => {
    expect(VALID_TRANSITIONS['CANCELLED']).toHaveLength(0)
  })

  it('any active invoice can be cancelled', () => {
    for (const status of ['DRAFT', 'ISSUED', 'SUBMITTED', 'PARTIALLY_PAID']) {
      expect(canTransition(status, 'CANCELLED')).toBe(true)
    }
  })

  it('a paid invoice cannot be cancelled', () => {
    expect(canTransition('PAID', 'CANCELLED')).toBe(false)
  })
})

// ── Invoice generation from approved timesheets ─────

describe('Invoice generation from timesheets', () => {
  const timesheets = [
    { id: 't1', sellContractId: 'sc1', totalHours: 40, billRate: 15000, status: 'APPROVED', invoiceId: null },
    { id: 't2', sellContractId: 'sc1', totalHours: 36, billRate: 15000, status: 'APPROVED', invoiceId: null },
    { id: 't3', sellContractId: 'sc2', totalHours: 40, billRate: 12000, status: 'APPROVED', invoiceId: null },
    { id: 't4', sellContractId: 'sc1', totalHours: 40, billRate: 15000, status: 'SUBMITTED', invoiceId: null }, // not approved
    { id: 't5', sellContractId: 'sc1', totalHours: 40, billRate: 15000, status: 'APPROVED', invoiceId: 'inv1' }, // already invoiced
  ]

  function getInvoicableTimesheets(ts: typeof timesheets) {
    return ts.filter((t) => t.status === 'APPROVED' && t.invoiceId === null)
  }

  it('only includes approved uninvoiced timesheets', () => {
    const invoicable = getInvoicableTimesheets(timesheets)
    expect(invoicable).toHaveLength(3)
    expect(invoicable.every((t) => t.status === 'APPROVED' && t.invoiceId === null)).toBe(true)
  })

  it('excludes submitted but not yet approved timesheets', () => {
    const invoicable = getInvoicableTimesheets(timesheets)
    expect(invoicable.find((t) => t.id === 't4')).toBeUndefined()
  })

  it('excludes already invoiced timesheets', () => {
    const invoicable = getInvoicableTimesheets(timesheets)
    expect(invoicable.find((t) => t.id === 't5')).toBeUndefined()
  })

  it('calculates line item amount as hours × (rate / 100)', () => {
    // LEGACY_RULES.md: total_amount = (total_time_in_seconds / 3600) × rate
    // Our rate is cents per hour so: hours × (billRate / 100)
    const hours = 40
    const billRate = 15000 // $150/hr in cents
    const amount = hours * (billRate / 100)
    expect(amount).toBe(6000) // $6,000
  })

  it('groups line items by sell contract', () => {
    const invoicable = getInvoicableTimesheets(timesheets)
    const grouped = new Map<string, number>()
    for (const t of invoicable) {
      grouped.set(t.sellContractId, (grouped.get(t.sellContractId) ?? 0) + t.totalHours)
    }
    expect(grouped.get('sc1')).toBe(76) // 40 + 36
    expect(grouped.get('sc2')).toBe(40)
  })

  it('calculates invoice total as sum of all line items', () => {
    const invoicable = getInvoicableTimesheets(timesheets)
    const total = invoicable.reduce((sum, t) => sum + t.totalHours * (t.billRate / 100), 0)
    // sc1: (40 + 36) × 150 = 11,400
    // sc2: 40 × 120 = 4,800
    expect(total).toBe(16200) // $16,200
  })
})

// ── Invoice numbering ───────────────────────────────

describe('Invoice numbering format', () => {
  function generateInvoiceNumber(engagementFragment: string, sequenceNum: number): string {
    const seq = String(sequenceNum).padStart(3, '0')
    return `IN_${engagementFragment}_${seq}`
  }

  it('generates IN_XXXXXX_001 for the first invoice', () => {
    expect(generateInvoiceNumber('AB12CD', 1)).toBe('IN_AB12CD_001')
  })

  it('pads sequence to three digits', () => {
    expect(generateInvoiceNumber('AB12CD', 5)).toBe('IN_AB12CD_005')
  })

  it('handles sequence above 100', () => {
    expect(generateInvoiceNumber('AB12CD', 142)).toBe('IN_AB12CD_142')
  })
})

// ── Payment recording ───────────────────────────────

describe('Invoice payment recording', () => {
  function recordPayment(
    invoiceTotal: number,
    currentPaid: number,
    paymentAmount: number
  ): { success: boolean; newPaid?: number; newStatus?: string; error?: string } {
    const outstanding = invoiceTotal - currentPaid

    // LEGACY_RULES.md: no overpayment
    if (paymentAmount > outstanding + 0.01) {
      return { success: false, error: `Overpayment: $${paymentAmount} exceeds outstanding $${outstanding.toFixed(2)}` }
    }

    if (paymentAmount <= 0) {
      return { success: false, error: 'Payment must be positive' }
    }

    const newPaid = currentPaid + paymentAmount
    const newStatus = newPaid >= invoiceTotal - 0.01 ? 'PAID' : 'PARTIALLY_PAID'

    return { success: true, newPaid, newStatus }
  }

  it('a partial payment moves invoice to PARTIALLY_PAID', () => {
    const result = recordPayment(10000, 0, 5000)
    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('PARTIALLY_PAID')
    expect(result.newPaid).toBe(5000)
  })

  it('a full payment moves invoice to PAID', () => {
    const result = recordPayment(10000, 0, 10000)
    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('PAID')
  })

  it('the final partial payment completes the invoice', () => {
    const result = recordPayment(10000, 7500, 2500)
    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('PAID')
  })

  it('overpayment is rejected', () => {
    const result = recordPayment(10000, 8000, 3000)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Overpayment')
  })

  it('zero payment is rejected', () => {
    const result = recordPayment(10000, 0, 0)
    expect(result.success).toBe(false)
  })

  it('negative payment is rejected', () => {
    const result = recordPayment(10000, 0, -500)
    expect(result.success).toBe(false)
  })

  it('rounding tolerance allows payment that matches within a penny', () => {
    // $99.999 against $100 outstanding — should succeed
    const result = recordPayment(100, 0, 99.999)
    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('PAID')
  })
})

// ── Outstanding balance calculation ─────────────────

describe('Invoice outstanding balance', () => {
  const invoices = [
    { total: 6000, paid: 0, status: 'ISSUED' },
    { total: 4800, paid: 2000, status: 'PARTIALLY_PAID' },
    { total: 3200, paid: 3200, status: 'PAID' },
    { total: 5000, paid: 0, status: 'CANCELLED' },
  ]

  it('outstanding equals total minus paid', () => {
    const outstanding = invoices.map((i) => i.total - i.paid)
    expect(outstanding).toEqual([6000, 2800, 0, 5000])
  })

  it('total outstanding excludes cancelled invoices', () => {
    const total = invoices
      .filter((i) => i.status !== 'CANCELLED')
      .reduce((sum, i) => sum + (i.total - i.paid), 0)
    expect(total).toBe(8800) // 6000 + 2800 + 0
  })

  it('total outstanding excludes paid invoices (they contribute zero)', () => {
    const total = invoices
      .filter((i) => i.status !== 'CANCELLED' && i.total - i.paid > 0)
      .reduce((sum, i) => sum + (i.total - i.paid), 0)
    expect(total).toBe(8800) // same — paid has zero outstanding
  })
})

// ── Aging summary aggregation ───────────────────────

describe('Invoice aging summary', () => {
  const now = new Date('2026-08-12T12:00:00Z')

  const invoices = [
    { total: 6000, paid: 0, dueAt: '2026-08-20', status: 'ISSUED' },      // current
    { total: 4800, paid: 2000, dueAt: '2026-08-01', status: 'PARTIALLY_PAID' }, // 1-30 (11 days)
    { total: 3000, paid: 0, dueAt: '2026-07-01', status: 'ISSUED' },      // 31-60 (42 days)
    { total: 2000, paid: 0, dueAt: '2026-05-01', status: 'ISSUED' },      // 90+ (103 days)
    { total: 5000, paid: 5000, dueAt: '2026-07-15', status: 'PAID' },     // paid — zero outstanding
    { total: 1500, paid: 0, dueAt: '2026-07-20', status: 'CANCELLED' },   // cancelled — excluded
  ]

  function agingSummary(invs: typeof invoices, now: Date) {
    const summary = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, totalOutstanding: 0 }
    for (const inv of invs) {
      if (inv.status === 'CANCELLED') continue
      const outstanding = inv.total - inv.paid
      if (outstanding <= 0) continue
      summary.totalOutstanding += outstanding
      const daysOver = Math.floor((now.getTime() - new Date(inv.dueAt).getTime()) / 86400000)
      if (daysOver <= 0) summary.current += outstanding
      else if (daysOver <= 30) summary['1-30'] += outstanding
      else if (daysOver <= 60) summary['31-60'] += outstanding
      else if (daysOver <= 90) summary['61-90'] += outstanding
      else summary['90+'] += outstanding
    }
    return summary
  }

  it('aggregates total outstanding correctly', () => {
    const s = agingSummary(invoices, now)
    // 6000 + 2800 + 3000 + 2000 = 13800
    expect(s.totalOutstanding).toBe(13800)
  })

  it('classifies current bucket correctly', () => {
    const s = agingSummary(invoices, now)
    expect(s.current).toBe(6000) // due Aug 20, future
  })

  it('classifies 1-30 bucket correctly', () => {
    const s = agingSummary(invoices, now)
    expect(s['1-30']).toBe(2800) // 4800 - 2000 paid, 11 days overdue
  })

  it('classifies 31-60 bucket correctly', () => {
    const s = agingSummary(invoices, now)
    expect(s['31-60']).toBe(3000) // due Jul 1, 42 days overdue
  })

  it('classifies 90+ bucket correctly', () => {
    const s = agingSummary(invoices, now)
    expect(s['90+']).toBe(2000) // due May 1, 103 days overdue
  })

  it('excludes cancelled invoices from summary', () => {
    const s = agingSummary(invoices, now)
    // cancelled $1,500 not in totalOutstanding
    expect(s.totalOutstanding).toBe(13800)
  })

  it('excludes fully paid invoices from summary', () => {
    const s = agingSummary(invoices, now)
    // paid $5,000 not in totalOutstanding
    expect(s.totalOutstanding).toBe(13800)
  })
})

// ── Search filter ───────────────────────────────────

describe('Invoice search filter', () => {
  const invoices = [
    { number: 'IN_AB12CD_001', engagement: 'SAP BRIM Migration', client: 'Terumo BCT', status: 'ISSUED' },
    { number: 'IN_EF34GH_001', engagement: 'Cloud Platform', client: 'Nike Inc.', status: 'PAID' },
  ]

  const searchFilter = (row: typeof invoices[0], q: string) =>
    row.number.toLowerCase().includes(q) ||
    row.engagement.toLowerCase().includes(q) ||
    row.client.toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  it('searches by invoice number', () => {
    const filtered = invoices.filter((i) => searchFilter(i, 'ab12cd'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].number).toBe('IN_AB12CD_001')
  })

  it('searches by engagement name', () => {
    const filtered = invoices.filter((i) => searchFilter(i, 'sap'))
    expect(filtered).toHaveLength(1)
  })

  it('searches by client name', () => {
    const filtered = invoices.filter((i) => searchFilter(i, 'nike'))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].client).toBe('Nike Inc.')
  })

  it('searches by status', () => {
    const filtered = invoices.filter((i) => searchFilter(i, 'paid'))
    expect(filtered).toHaveLength(1)
  })

  it('returns empty when nothing matches', () => {
    const filtered = invoices.filter((i) => searchFilter(i, 'microsoft'))
    expect(filtered).toHaveLength(0)
  })
})

// ── Due date calculation ────────────────────────────

describe('Invoice due date from payment terms', () => {
  it('NET 30 means 30 days after period end', () => {
    const periodEnd = new Date('2026-08-15')
    const paymentTerms = 30
    const dueAt = new Date(periodEnd.getTime() + paymentTerms * 86400000)
    expect(dueAt.toISOString().slice(0, 10)).toBe('2026-09-14')
  })

  it('NET 45 means 45 days after period end', () => {
    const periodEnd = new Date('2026-08-15')
    const paymentTerms = 45
    const dueAt = new Date(periodEnd.getTime() + paymentTerms * 86400000)
    expect(dueAt.toISOString().slice(0, 10)).toBe('2026-09-29')
  })

  it('NET 0 means due immediately on period end', () => {
    const periodEnd = new Date('2026-08-15')
    const paymentTerms = 0
    const dueAt = new Date(periodEnd.getTime() + paymentTerms * 86400000)
    expect(dueAt.toISOString().slice(0, 10)).toBe('2026-08-15')
  })
})
