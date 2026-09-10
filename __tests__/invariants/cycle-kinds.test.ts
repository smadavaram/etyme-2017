import { describe, it, expect } from 'vitest'
import {
  MONEY_KINDS,
  RESERVED_KINDS,
  isMoneyKind,
  sideOf,
  categoryOf,
  labelOf,
  cyclesFor,
} from '@/lib/cycle-kinds'

/**
 * Which cycles a contract gets, and on which side.
 *
 * Every rule here was wrong before it was written down: every cycle
 * landed on the sell contract, every contract got every kind, and a
 * compliance reminder sat in the same list as a pay day.
 */

const def = (kind: string) => ({ kind, frequency: 'MONTHLY' as const, label: kind })

const ALL = [
  ...MONEY_KINDS.map(def),
  ...RESERVED_KINDS.map(def),
  def('GST_RETURN'),
  def('IR35_ASSESSMENT'),
]

const w2 = { contractType: 'W2', vendorCompanyId: null }
const c2c = { contractType: 'C2C', vendorCompanyId: 'vendor-below' }

describe('which side a cycle sits on', () => {
  it('hours and invoices are the sell side — the client pays for them', () => {
    for (const k of ['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE', 'INVOICE_GENERATE', 'INVOICE_DUE']) {
      expect(sideOf(k), k).toBe('SELL')
    }
  })

  it('salary and vendor bills are the buy side — money going out', () => {
    for (const k of ['SALARY_CALCULATE', 'SALARY_PAY', 'VENDOR_BILL_GENERATE', 'VENDOR_BILL_DUE']) {
      expect(sideOf(k), k).toBe('BUY')
    }
  })

  it('a kind that is not money has no side to be on', () => {
    expect(sideOf('GST_RETURN')).toBeNull()
    expect(sideOf('IR35_ASSESSMENT')).toBeNull()
    expect(sideOf('COMMISSION_PAY')).toBeNull()
  })
})

describe('which cycles a contract actually needs', () => {
  it('a W-2 contract gets salary cycles and no vendor bill — there is no vendor to bill', () => {
    const { buy } = cyclesFor(w2, ALL)
    const kinds = buy.map((d) => d.kind)
    expect(kinds).toEqual(expect.arrayContaining(['SALARY_CALCULATE', 'SALARY_PAY']))
    expect(kinds.filter((k) => k.startsWith('VENDOR_BILL_'))).toEqual([])
  })

  it('a C2C contract gets vendor-bill cycles and no salary — we do not run their payroll', () => {
    const { buy } = cyclesFor(c2c, ALL)
    const kinds = buy.map((d) => d.kind)
    expect(kinds).toEqual(expect.arrayContaining(['VENDOR_BILL_GENERATE', 'VENDOR_BILL_DUE']))
    expect(kinds.filter((k) => k.startsWith('SALARY_'))).toEqual([])
  })

  it('the fact decides, not the label — a vendor below means vendor bills whatever the type says', () => {
    const mislabelled = { contractType: 'W2', vendorCompanyId: 'somebody' }
    const { buy } = cyclesFor(mislabelled, ALL)
    expect(buy.map((d) => d.kind)).toEqual(expect.arrayContaining(['VENDOR_BILL_DUE']))
    expect(buy.map((d) => d.kind)).not.toContain('SALARY_PAY')
  })

  it('every contract gets its hours and invoices on the sell side', () => {
    for (const shape of [w2, c2c, null]) {
      const { sell } = cyclesFor(shape, ALL)
      expect(sell.map((d) => d.kind)).toEqual(
        expect.arrayContaining(['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE', 'INVOICE_GENERATE', 'INVOICE_DUE'])
      )
    }
  })

  it('a sell contract with no buy side gets no buy cycles at all', () => {
    expect(cyclesFor(null, ALL).buy).toEqual([])
  })

  it('a buy-side kind never appears in the sell list, and the reverse', () => {
    const { sell, buy } = cyclesFor(w2, ALL)
    for (const d of sell) expect(sideOf(d.kind), d.kind).toBe('SELL')
    for (const d of buy) expect(sideOf(d.kind), d.kind).toBe('BUY')
  })

  it('no contract gets a commission cycle until there is a plan to calculate against', () => {
    for (const shape of [w2, c2c]) {
      const { sell, buy } = cyclesFor(shape, ALL)
      const kinds = [...sell, ...buy].map((d) => d.kind)
      expect(kinds.filter((k) => k.startsWith('COMMISSION_'))).toEqual([])
    }
  })

  it('a compliance kind in a pack is refused and named, never generated', () => {
    const { sell, buy, refused } = cyclesFor(w2, ALL)
    const generated = [...sell, ...buy].map((d) => d.kind)
    expect(generated).not.toContain('GST_RETURN')
    expect(generated).not.toContain('IR35_ASSESSMENT')
    expect(refused).toEqual(expect.arrayContaining(['GST_RETURN', 'IR35_ASSESSMENT']))
  })

  it('what is refused is said, so a stale pack does not fail silently', () => {
    const { refused } = cyclesFor(w2, [def('INVOICE_DUE'), def('VISA_TRACK')])
    expect(refused).toEqual(['VISA_TRACK'])
  })
})

describe('how a person reads the list', () => {
  it('there are three words, not nineteen states: hours, pay, bill', () => {
    expect(categoryOf('TIMESHEET_SUBMIT')).toBe('HOURS')
    expect(categoryOf('SALARY_PAY')).toBe('PAY')
    expect(categoryOf('VENDOR_BILL_DUE')).toBe('PAY')
    expect(categoryOf('INVOICE_DUE')).toBe('BILL')
  })

  it('every money kind has a category — nothing falls into OTHER by accident', () => {
    for (const k of MONEY_KINDS) expect(categoryOf(k), k).not.toBe('OTHER')
  })

  it('a row written by an older engine still renders rather than crashing', () => {
    expect(categoryOf('PERFORMANCE_REVIEW')).toBe('OTHER')
    expect(labelOf('PERFORMANCE_REVIEW')).toBe('performance review')
  })

  it('a label is words a person would say, not the enum', () => {
    expect(labelOf('SALARY_PAY')).toBe('Pay day')
    expect(labelOf('TIMESHEET_SUBMIT')).toBe('Hours due')
    for (const k of MONEY_KINDS) expect(labelOf(k), k).not.toMatch(/_/)
  })

  it('the money kinds and the reserved kinds do not overlap', () => {
    for (const k of RESERVED_KINDS) expect(isMoneyKind(k), k).toBe(false)
  })
})
