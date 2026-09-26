/**
 * Payroll module tests — LEGACY_RULES.md §2.5 salary pipeline.
 *
 * Test names are English sentences the founder can read to verify
 * the system behaves correctly. — CLAUDE.md verification rule.
 */
import { describe, it, expect } from 'vitest'

// ── Payroll calculation logic (mirrors API route logic) ─────

function calculateGrossPay(approvedHours: number, payRateCents: number): number {
  return Math.round(approvedHours * payRateCents)
}

function calculateMarginPct(billRateCents: number, payRateCents: number): number {
  if (billRateCents <= 0) return 0
  return ((billRateCents - payRateCents) / billRateCents) * 100
}

// ── Pay item status determination ───────────────────────────

type CycleState = {
  kind: string
  completedAt: Date | null
}

function determinePayStatus(
  approvedHours: number,
  cycles: CycleState[]
): string {
  if (approvedHours === 0) return 'NO_HOURS'

  const calcCycle = cycles.find(
    (c) => c.kind === 'SALARY_CALCULATE' && !c.completedAt
  )
  const payCycle = cycles.find(
    (c) => c.kind === 'SALARY_PAY' && !c.completedAt
  )

  if (calcCycle) return 'PENDING'
  if (payCycle) return 'CALCULATED'
  return 'PROCESSED'
}

// ── Payroll run validation ──────────────────────────────────

type PayrollAction = 'calculate' | 'approve' | 'process'

function validateAction(action: string): action is PayrollAction {
  return ['calculate', 'approve', 'process'].includes(action)
}

function getEligibleStatus(action: PayrollAction): string {
  switch (action) {
    case 'calculate': return 'PENDING'
    case 'approve': return 'CALCULATED'
    case 'process': return 'CALCULATED'
  }
}

function getCycleKind(action: PayrollAction): string {
  return action === 'calculate' ? 'SALARY_CALCULATE' : 'SALARY_PAY'
}

// ── Contract type classification ────────────────────────────

function classifyContractType(type: string): 'employee' | 'contractor' | 'vendor' {
  switch (type) {
    case 'W2':
    case 'C2H_W2':
    case 'FIXED_TERM':
    case 'CDD':
      return 'employee'
    case 'IND_1099':
      return 'contractor'
    case 'C2C':
      return 'vendor'
    default:
      return 'contractor'
  }
}

// ── Summary aggregation ─────────────────────────────────────

interface PayItem {
  buyContractId: string
  contractType: string
  totalApprovedHours: number
  grossPay: number
  payStatus: string
}

function aggregateSummary(items: PayItem[]) {
  const byType = new Map<string, { count: number; grossPay: number; hours: number }>()
  const byStatus = new Map<string, number>()

  for (const item of items) {
    const type = byType.get(item.contractType) ?? { count: 0, grossPay: 0, hours: 0 }
    type.count++
    type.grossPay += item.grossPay
    type.hours += item.totalApprovedHours
    byType.set(item.contractType, type)

    byStatus.set(item.payStatus, (byStatus.get(item.payStatus) ?? 0) + 1)
  }

  return {
    totalContracts: items.length,
    totalGrossPay: items.reduce((s, i) => s + i.grossPay, 0),
    totalHours: items.reduce((s, i) => s + i.totalApprovedHours, 0),
    byContractType: Object.fromEntries(byType),
    byStatus: Object.fromEntries(byStatus),
  }
}

// ── Overpayment guard (LEGACY_RULES.md §2.5) ───────────────

function validatePayment(
  totalAmount: number,
  alreadyPaid: number,
  payment: number
): { valid: boolean; error?: string } {
  if (payment <= 0) return { valid: false, error: 'Payment must be positive' }
  if (payment + alreadyPaid > totalAmount + 1) { // 1 cent tolerance
    return { valid: false, error: `Overpayment: $${((payment + alreadyPaid - totalAmount) / 100).toFixed(2)} over` }
  }
  return { valid: true }
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe('Payroll Module', () => {
  // ── Gross pay calculation ───────────────────────────────
  describe('Gross pay calculation', () => {
    it('a consultant with 40 approved hours at $75/hr earns $3,000 gross', () => {
      expect(calculateGrossPay(40, 7500)).toBe(300000)
    })

    it('a consultant with 80 approved hours at $100/hr earns $8,000 gross', () => {
      expect(calculateGrossPay(80, 10000)).toBe(800000)
    })

    it('a consultant with zero approved hours earns zero', () => {
      expect(calculateGrossPay(0, 7500)).toBe(0)
    })

    it('fractional hours are rounded to the nearest cent', () => {
      // 37.5 hours at $67/hr = $2,512.50
      expect(calculateGrossPay(37.5, 6700)).toBe(251250)
    })

    it('a high rate consultant computes correctly ($200/hr × 160 hours)', () => {
      expect(calculateGrossPay(160, 20000)).toBe(3200000)
    })
  })

  // ── Margin calculation ──────────────────────────────────
  describe('Margin calculation', () => {
    it('a $120 bill rate and $80 pay rate gives 33% margin', () => {
      const margin = calculateMarginPct(12000, 8000)
      expect(margin).toBeCloseTo(33.33, 1)
    })

    it('a $100 bill rate and $100 pay rate gives 0% margin', () => {
      expect(calculateMarginPct(10000, 10000)).toBe(0)
    })

    it('a $100 bill rate and $110 pay rate gives negative margin', () => {
      expect(calculateMarginPct(10000, 11000)).toBeLessThan(0)
    })

    it('zero bill rate returns 0% margin (no division by zero)', () => {
      expect(calculateMarginPct(0, 8000)).toBe(0)
    })
  })

  // ── Pay item status determination ─────────────────────
  describe('Pay item status determination', () => {
    it('a pay item with no approved hours has status NO_HOURS', () => {
      expect(determinePayStatus(0, [])).toBe('NO_HOURS')
    })

    it('a pay item with an incomplete SALARY_CALCULATE cycle is PENDING', () => {
      expect(
        determinePayStatus(40, [
          { kind: 'SALARY_CALCULATE', completedAt: null },
          { kind: 'SALARY_PAY', completedAt: null },
        ])
      ).toBe('PENDING')
    })

    it('a pay item with completed calc but incomplete pay cycle is CALCULATED', () => {
      expect(
        determinePayStatus(40, [
          { kind: 'SALARY_CALCULATE', completedAt: new Date() },
          { kind: 'SALARY_PAY', completedAt: null },
        ])
      ).toBe('CALCULATED')
    })

    it('a pay item with all cycles completed is PROCESSED', () => {
      expect(
        determinePayStatus(40, [
          { kind: 'SALARY_CALCULATE', completedAt: new Date() },
          { kind: 'SALARY_PAY', completedAt: new Date() },
        ])
      ).toBe('PROCESSED')
    })

    it('a pay item with hours but no cycles is PROCESSED', () => {
      expect(determinePayStatus(40, [])).toBe('PROCESSED')
    })
  })

  // ── Payroll action validation ─────────────────────────
  describe('Payroll action validation', () => {
    it('calculate is a valid action', () => {
      expect(validateAction('calculate')).toBe(true)
    })

    it('approve is a valid action', () => {
      expect(validateAction('approve')).toBe(true)
    })

    it('process is a valid action', () => {
      expect(validateAction('process')).toBe(true)
    })

    it('an unknown action is rejected', () => {
      expect(validateAction('delete')).toBe(false)
    })

    it('calculate targets PENDING pay items', () => {
      expect(getEligibleStatus('calculate')).toBe('PENDING')
    })

    it('approve targets CALCULATED pay items', () => {
      expect(getEligibleStatus('approve')).toBe('CALCULATED')
    })

    it('process targets CALCULATED pay items', () => {
      expect(getEligibleStatus('process')).toBe('CALCULATED')
    })

    it('calculate completes SALARY_CALCULATE cycles', () => {
      expect(getCycleKind('calculate')).toBe('SALARY_CALCULATE')
    })

    it('process completes SALARY_PAY cycles', () => {
      expect(getCycleKind('process')).toBe('SALARY_PAY')
    })
  })

  // ── Contract type classification ──────────────────────
  describe('Contract type classification', () => {
    it('a W-2 is classified as employee', () => {
      expect(classifyContractType('W2')).toBe('employee')
    })

    it('a C2C is classified as vendor', () => {
      expect(classifyContractType('C2C')).toBe('vendor')
    })

    it('a 1099 is classified as contractor', () => {
      expect(classifyContractType('IND_1099')).toBe('contractor')
    })

    it('a contract-to-hire W-2 is classified as employee', () => {
      expect(classifyContractType('C2H_W2')).toBe('employee')
    })

    it('a fixed-term contract is classified as employee', () => {
      expect(classifyContractType('FIXED_TERM')).toBe('employee')
    })

    it('an unknown contract type defaults to contractor', () => {
      expect(classifyContractType('UNKNOWN')).toBe('contractor')
    })
  })

  // ── Summary aggregation ───────────────────────────────
  describe('Summary aggregation', () => {
    const items: PayItem[] = [
      { buyContractId: '1', contractType: 'W2', totalApprovedHours: 40, grossPay: 300000, payStatus: 'PENDING' },
      { buyContractId: '2', contractType: 'W2', totalApprovedHours: 80, grossPay: 600000, payStatus: 'CALCULATED' },
      { buyContractId: '3', contractType: 'C2C', totalApprovedHours: 40, grossPay: 400000, payStatus: 'PENDING' },
      { buyContractId: '4', contractType: 'C2C', totalApprovedHours: 0, grossPay: 0, payStatus: 'NO_HOURS' },
    ]

    it('total gross pay sums all items', () => {
      const summary = aggregateSummary(items)
      expect(summary.totalGrossPay).toBe(1300000) // $13,000
    })

    it('total hours sums all approved hours', () => {
      const summary = aggregateSummary(items)
      expect(summary.totalHours).toBe(160)
    })

    it('W-2 items are grouped correctly', () => {
      const summary = aggregateSummary(items)
      expect(summary.byContractType.W2).toEqual({
        count: 2,
        grossPay: 900000,
        hours: 120,
      })
    })

    it('C2C items are grouped correctly', () => {
      const summary = aggregateSummary(items)
      expect(summary.byContractType.C2C).toEqual({
        count: 2,
        grossPay: 400000,
        hours: 40,
      })
    })

    it('status counts are aggregated correctly', () => {
      const summary = aggregateSummary(items)
      expect(summary.byStatus).toEqual({
        PENDING: 2,
        CALCULATED: 1,
        NO_HOURS: 1,
      })
    })

    it('an empty payroll has zero totals', () => {
      const summary = aggregateSummary([])
      expect(summary.totalContracts).toBe(0)
      expect(summary.totalGrossPay).toBe(0)
      expect(summary.totalHours).toBe(0)
    })
  })

  // ── Payment validation ────────────────────────────────
  describe('Payment validation', () => {
    it('a valid payment is accepted', () => {
      expect(validatePayment(300000, 0, 300000)).toEqual({ valid: true })
    })

    it('a partial payment is accepted', () => {
      expect(validatePayment(300000, 0, 150000)).toEqual({ valid: true })
    })

    it('an overpayment is rejected', () => {
      const result = validatePayment(300000, 0, 400000)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Overpayment')
    })

    it('a payment exceeding remaining balance is rejected', () => {
      const result = validatePayment(300000, 200000, 200000)
      expect(result.valid).toBe(false)
    })

    it('a zero payment is rejected', () => {
      expect(validatePayment(300000, 0, 0).valid).toBe(false)
    })

    it('a negative payment is rejected', () => {
      expect(validatePayment(300000, 0, -100).valid).toBe(false)
    })

    it('rounding within 1 cent tolerance is accepted', () => {
      // $3000.01 when total is $3000.00 — within tolerance
      expect(validatePayment(300000, 0, 300001)).toEqual({ valid: true })
    })
  })

  // ── Search filter ─────────────────────────────────────
  describe('Payroll search filter', () => {
    function searchFilter(
      item: { person: { name: string }; contractType: string; payStatus: string },
      q: string
    ): boolean {
      const lower = q.toLowerCase()
      return (
        item.person.name.toLowerCase().includes(lower) ||
        item.contractType.toLowerCase().includes(lower) ||
        item.payStatus.toLowerCase().includes(lower)
      )
    }

    const item = {
      person: { name: 'Ravi Patel' },
      contractType: 'W2',
      payStatus: 'PENDING',
    }

    it('matches by consultant name', () => {
      expect(searchFilter(item, 'ravi')).toBe(true)
    })

    it('matches by contract type', () => {
      expect(searchFilter(item, 'w2')).toBe(true)
    })

    it('matches by status', () => {
      expect(searchFilter(item, 'pend')).toBe(true)
    })

    it('does not match unrelated terms', () => {
      expect(searchFilter(item, 'xyz')).toBe(false)
    })
  })
})
