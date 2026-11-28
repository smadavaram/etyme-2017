import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  checkCommission, maySetCommission, accrueCommission, defaultsFrom, defaultCommissionRows, termsSay, weekInRow,
  type CommissionDraft, type WeekFact,
} from '@/lib/money/commission-rows'
import { commissionReader } from '@/lib/money/commission-write'
import { paidInFullOn, sundaysIn, commissionByPlacement, postingKey, type RowAccrual } from '@/lib/money/commission-accrual'
import { profitCut, earnerKey, NOBODY_NAMED, type CutInput } from '@/lib/money/profit-cut'
import { commissionBody, fieldsDrawn, PANEL_FIELDS } from '@/app/dashboard/contracts/commission-form'

/**
 * Commission is an object on the sell line and on the buy line (founder,
 * 2026-11-08). The rules, the accrual and who reads it, as sentences.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const sales: CommissionDraft = {
  sellContractId: 'sell-1', earnedById: 'marisa', kind: 'SALES', basis: 'SHARE_OF_MARGIN',
  rateBps: 1000, fromDate: '2026-10-01', reason: 'Marisa sold the Northbend deal.',
}
const week = (sunday: string, over: Partial<WeekFact> = {}): WeekFact => ({
  weekStart: d(sunday), currency: 'USD', hours: 40, billedCents: 520_000, marginCents: 120_000, ...over,
})
const ok = (v: ReturnType<typeof checkCommission>) => { if (!v.ok) throw new Error(v.says); return v.terms }

describe('what a commission row is', () => {
  it('a sales commission on the sell line, worked out as a share of the margin, is a commission', () => {
    const t = ok(checkCommission(sales))
    expect(t).toMatchObject({ kind: 'SALES', sellContractId: 'sell-1', buyContractId: null, rateBps: 1000, amountCents: null, accrueOn: 'ACCEPTED' })
  })

  it('a commission naming both lines, or neither, is refused in a sentence', () => {
    expect(checkCommission({ ...sales, buyContractId: 'buy-1' })).toMatchObject({ ok: false, says: expect.stringContaining('one line') })
    expect(checkCommission({ ...sales, sellContractId: null })).toMatchObject({ ok: false, says: expect.stringContaining('Say which line') })
  })

  it('a commission with both a share and an amount, or with neither, is refused naming the field', () => {
    expect(checkCommission({ ...sales, amountCents: 500 })).toMatchObject({ ok: false, field: 'amountCents', says: 'Give a share or a fixed amount, not both.' })
    expect(checkCommission({ ...sales, rateBps: null })).toMatchObject({ ok: false, field: 'rateBps' })
    expect(checkCommission({ ...sales, basis: 'PER_HOUR', rateBps: null })).toMatchObject({ ok: false, field: 'amountCents' })
  })

  it('a sales commission on a buy line, or a recruiting commission on a sell line, is refused: the kind follows the side', () => {
    expect(checkCommission({ ...sales, sellContractId: null, buyContractId: 'buy-1' })).toMatchObject({ ok: false, field: 'kind', says: expect.stringContaining('goes on the sell line') })
    expect(checkCommission({ ...sales, kind: 'RECRUITING' })).toMatchObject({ ok: false, field: 'kind', says: expect.stringContaining('goes on the buy line') })
  })

  it('a share over the whole, a cap of nothing, an end before the start and a missing reason are each refused by name', () => {
    expect(checkCommission({ ...sales, rateBps: 10_001 })).toMatchObject({ ok: false, field: 'rateBps' })
    expect(checkCommission({ ...sales, capCents: 0 })).toMatchObject({ ok: false, field: 'capCents' })
    expect(checkCommission({ ...sales, toDate: '2026-09-01' })).toMatchObject({ ok: false, field: 'toDate' })
    expect(checkCommission({ ...sales, reason: ' ' })).toMatchObject({ ok: false, field: 'reason' })
  })

  it('only the Owner or a Contract Manager at the line’s own firm sets a commission', () => {
    const at = { callerCompanyId: 'brightmoor', lineCompanyId: 'brightmoor', companyName: 'Brightmoor Staffing' }
    expect(maySetCommission({ ...at, roleName: 'Owner' })).toBeNull()
    expect(maySetCommission({ ...at, roleName: 'Contract Manager' })).toBeNull()
    expect(maySetCommission({ ...at, roleName: 'Recruiter' })).toBe('Commissions on a line are set by the Owner or a Contract Manager at Brightmoor Staffing.')
    expect(maySetCommission({ ...at, callerCompanyId: 'northbend', roleName: 'Owner' })).toContain('not your firm’s')
  })
})

describe('when it is earned', () => {
  const recruiting = ok(checkCommission({ buyContractId: 'buy-1', earnedById: 'jonas', kind: 'RECRUITING', basis: 'PER_HOUR', amountCents: 250, fromDate: '2026-10-01', reason: 'Jonas found Rajesh.' }))

  it('a recruiting commission accrues on the hours the employer accepted, never on the award', () => {
    // An award with no accepted week earns nothing.
    expect(accrueCommission(recruiting, [], 0)).toMatchObject({ earnedCents: 0, amountCents: 0 })
    expect(accrueCommission(recruiting, [week('2026-11-01', { hours: 0, billedCents: 0, marginCents: 0 })], 0).amountCents).toBe(0)
    // Two accepted weeks of 40 at $2.50 an hour.
    const a = accrueCommission(recruiting, [week('2026-11-01'), week('2026-11-08')], 0)
    expect(a).toMatchObject({ earnedCents: 20_000, amountCents: 20_000, hours: 80 })
    expect(a.says).toBe('$200.00: 80 accepted hours at $2.50 an hour.')
  })

  it('a share of the margin is the margin service’s figure for the weeks, and a share of what is billed is the bill’s', () => {
    const t = ok(checkCommission(sales))
    expect(accrueCommission(t, [week('2026-11-01')], 0).amountCents).toBe(12_000)
    const billed = ok(checkCommission({ ...sales, basis: 'SHARE_OF_BILLED', rateBps: 300 }))
    expect(accrueCommission(billed, [week('2026-11-01')], 0).amountCents).toBe(15_600)
  })

  it('a week with no margin behind it blanks a share of the margin rather than reading as nought', () => {
    const t = ok(checkCommission(sales))
    const a = accrueCommission(t, [week('2026-11-01'), week('2026-11-08', { marginCents: null, marginBlankedBecause: 'No cost on record.' })], 0)
    expect(a.amountCents).toBeNull()
    expect(a.blankedBecause).toContain('A week with no cost behind it has no margin, not a perfect one.')
  })

  it('a share of a loss is nothing, never a charge back to the person', () => {
    const t = ok(checkCommission(sales))
    expect(accrueCommission(t, [week('2026-11-01', { marginCents: -30_000 })], 0)).toMatchObject({ earnedCents: 0, amountCents: 0 })
  })

  it('a commission never exceeds its cap, counting everything posted under it before', () => {
    const capped = ok(checkCommission({ ...sales, capCents: 50_000 }))
    const a = accrueCommission(capped, [week('2026-11-01', { marginCents: 1_000_000 })], 45_000)
    expect(a).toMatchObject({ earnedCents: 100_000, amountCents: 5_000, capped: true })
    expect(accrueCommission(capped, [week('2026-11-01')], 50_000).amountCents).toBe(0)
  })

  it('an amount per pay period is earned once, and only in a period the line did paid work', () => {
    const t = ok(checkCommission({ ...sales, basis: 'PER_PERIOD', rateBps: null, amountCents: 30_000 }))
    expect(accrueCommission(t, [week('2026-11-01'), week('2026-11-08')], 0).amountCents).toBe(30_000)
    expect(accrueCommission(t, [], 0).amountCents).toBe(0)
  })

  it('two currencies are never added into one commission', () => {
    const t = ok(checkCommission({ ...sales, basis: 'SHARE_OF_BILLED' }))
    expect(accrueCommission(t, [week('2026-11-01'), week('2026-11-08', { currency: 'INR' })], 0).amountCents).toBeNull()
  })

  it('a week outside the row’s own days does not count for it', () => {
    const t = ok(checkCommission({ ...sales, fromDate: '2026-11-04', toDate: '2026-11-10' }))
    expect(weekInRow(d('2026-11-01'), t)).toBe(true) // the week it starts in
    expect(weekInRow(d('2026-11-15'), t)).toBe(false)
    expect(accrueCommission(t, [week('2026-10-25'), week('2026-11-01'), week('2026-11-08'), week('2026-11-15')], 0).weeks).toBe(2)
  })

  it('on cash, a week counts in the period the bill carrying it was paid in full, on the day the last payment arrived', () => {
    expect(paidInFullOn(100_000, [{ minor: 60_000, at: d('2026-11-03') }, { minor: 40_000, at: d('2026-11-20') }])).toEqual(d('2026-11-20'))
    expect(paidInFullOn(100_000, [{ minor: 60_000, at: d('2026-11-03') }])).toBeNull()
    const cash = ok(checkCommission({ ...sales, accrueOn: 'CASH' }))
    expect(accrueCommission(cash, [], 0).says).toContain('No bill for this line’s weeks was paid in full')
  })

  it('a period is read week by week from its Sundays, and each row posts once per period under its own key', () => {
    expect(sundaysIn({ from: d('2026-11-01'), to: d('2026-11-30') }).map((x) => x.toISOString().slice(0, 10)))
      .toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'])
    expect(postingKey('row-1', { from: d('2026-11-01'), to: d('2026-11-30') })).toBe('commission-row:row-1:2026-11-01..2026-11-30')
  })

  it('the terms read as one sentence a person can check', () => {
    expect(termsSay({ basis: 'SHARE_OF_MARGIN', rateBps: 1000, amountCents: null, capCents: 500_000, accrueOn: 'ACCEPTED' }))
      .toBe('10% of the margin, on the weeks the firm above accepted, capped at $5,000.00')
  })
})

describe('who reads it', () => {
  it('a client never reads a supplier’s commissions', () => {
    expect(commissionReader({ callerCompanyId: 'northbend', lineCompanyId: 'brightmoor', roleName: 'Owner', readsPayroll: true })).toBe('NONE')
  })

  it('a recruiter reads only their own commission; the Owner, a Contract Manager and payroll read the firm’s', () => {
    const at = { callerCompanyId: 'brightmoor', lineCompanyId: 'brightmoor' }
    expect(commissionReader({ ...at, roleName: 'Recruiter', readsPayroll: false })).toBe('OWN')
    expect(commissionReader({ ...at, roleName: 'Owner', readsPayroll: false })).toBe('FIRM')
    expect(commissionReader({ ...at, roleName: 'Contract Manager', readsPayroll: false })).toBe('FIRM')
    expect(commissionReader({ ...at, roleName: 'AP & Payroll', readsPayroll: true })).toBe('FIRM')
  })

  it('the line’s commission route logs a refused read before it refuses, and the panel draws nothing on a refusal', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/contracts/[id]/commissions/route.ts'), 'utf8')
    expect(route.indexOf('await recordRefusal')).toBeGreaterThan(0)
    expect(route.indexOf('await recordRefusal')).toBeLessThan(route.indexOf("code: 'FORBIDDEN'"))
    const panel = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/commission-panel.tsx'), 'utf8')
    expect(panel).toMatch(/if \(refused \|\| !data\) return null/)
  })
})

describe('the firm’s defaults, read by the award', () => {
  it('a firm that set no defaults gets no commission rows from an award: the shipped default is none', () => {
    const award = { sellContractId: 's', buyContractId: 'b', soldById: 'marisa', recruitedById: 'jonas', startDate: d('2026-11-02'), setById: 'helena' }
    expect(defaultCommissionRows(defaultsFrom(null), award)).toEqual({ rows: [], notWritten: [] })
    expect(defaultsFrom({ SALES: { basis: 'SHARE_OF_MARGIN' } })).toEqual({}) // half a setting invents no rate
  })

  it('the award writes the sales row for who sold and the recruiting row for who put the person forward, from the line’s first day', () => {
    const defaults = defaultsFrom({ SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 1000 }, RECRUITING: { basis: 'PER_HOUR', amountCents: 200 } })
    const out = defaultCommissionRows(defaults, { sellContractId: 's', buyContractId: 'b', soldById: 'marisa', recruitedById: 'jonas', startDate: d('2026-11-02'), setById: 'helena' })
    expect(out.rows).toEqual([
      expect.objectContaining({ kind: 'SALES', sellContractId: 's', buyContractId: null, earnedById: 'marisa', rateBps: 1000, fromDate: d('2026-11-02') }),
      expect.objectContaining({ kind: 'RECRUITING', sellContractId: null, buyContractId: 'b', earnedById: 'jonas', amountCents: 200 }),
    ])
  })

  it('a default whose person or line is not known is said, never written to a guessed earner', () => {
    const defaults = defaultsFrom({ RECRUITING: { basis: 'PER_HOUR', amountCents: 200 } })
    const out = defaultCommissionRows(defaults, { sellContractId: 's', buyContractId: null, soldById: null, recruitedById: 'jonas', startDate: d('2026-11-02'), setById: 'helena' })
    expect(out.rows).toEqual([])
    expect(out.notWritten).toEqual(['No recruiting commission was written: the award wrote no buy line for it to sit on.'])
  })
})

describe('the Profitability cuts and margin after commission', () => {
  const earned = (margin: number | null): CutInput['earned'] => ({
    revenueCents: 520_000, hoursPaid: 40, marginCents: margin, marginRevenueCents: margin == null ? null : 520_000,
    marginBlankedBy: margin == null ? 'NO_COST' : null, weeksAwaitingPay: 0,
  })

  it('a placement with no recruiter on the line reads under its own heading; two earners read together, never twice', () => {
    expect(earnerKey([])).toEqual(['none', NOBODY_NAMED])
    expect(earnerKey([{ id: 'j', name: 'Jonas Whitaker' }, { id: 'a', name: 'Ada Price' }])).toEqual(['a+j', 'Ada Price and Jonas Whitaker'])
  })

  it('margin after commission is the margin less the commission earned in the period, still before admin cost', () => {
    const cut = profitCut([{ key: 'j', label: 'Jonas', currency: 'USD', earned: earned(120_000), commission: { cents: 12_000, currency: 'USD', blankedBecause: null } }])
    expect(cut.lines[0]).toMatchObject({ marginCents: 120_000, commissionCents: 12_000, afterCommissionCents: 108_000 })
  })

  it('a commission that cannot be worked out blanks the figure after commission, with its reason', () => {
    const cut = profitCut([{ key: 'j', label: 'Jonas', currency: 'USD', earned: earned(120_000), commission: { cents: null, currency: null, blankedBecause: 'No cost on record.' } }])
    expect(cut.lines[0]).toMatchObject({ afterCommissionCents: null, commissionBlankedBecause: 'No cost on record.' })
  })

  it('with no commission rows at the firm, no figure after commission is drawn at all', () => {
    const cut = profitCut([{ key: 'j', label: 'Jonas', currency: 'USD', earned: earned(120_000) }])
    expect(cut.lines[0].afterCommissionCents).toBeUndefined()
  })

  it('a commission covering more than one placement blanks each of them rather than being split by a guess', () => {
    const a = { id: 'r', sellContractIds: ['s1', 's2'], earnedBy: { id: 'j', name: 'Jonas Whitaker' }, postedCents: null, accrual: { amountCents: 500, currency: 'USD', blankedBecause: null } } as unknown as RowAccrual
    expect(commissionByPlacement([a]).get('s1')).toMatchObject({ cents: null })
  })
})

describe('the line’s commission panel', () => {
  it('every question the writer asks, the panel has a field for', () => {
    const write = readFileSync(join(process.cwd(), 'src/lib/money/commission-rows.ts'), 'utf8')
    const refusedOn = [...write.matchAll(/no\('(\w+)'/g)].map((m) => m[1])
    for (const f of new Set(refusedOn)) expect(PANEL_FIELDS as readonly string[]).toContain(f)
    expect(fieldsDrawn('SHARE_OF_MARGIN')).toContain('rateBps')
    expect(fieldsDrawn('PER_HOUR')).toContain('amountCents')
  })

  it('the panel posts a share as basis points and an amount as cents, never both', () => {
    const base = { id: null, earnedById: 'j', kind: 'RECRUITING', fromDate: '2026-11-02', toDate: '', accrueOn: 'ACCEPTED', reason: 'r', cap: '', percent: '10', amount: '2.50' }
    expect(commissionBody({ ...base, basis: 'SHARE_OF_MARGIN' })).toMatchObject({ rateBps: 1000, amountCents: null })
    expect(commissionBody({ ...base, basis: 'PER_HOUR' })).toMatchObject({ rateBps: null, amountCents: 250 })
  })
})
