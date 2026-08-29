import { describe, it, expect } from 'vitest'
import {
  profitOf, total, forCandidate, forCustomer, health, belowFloor,
  DEFAULT_BURDEN, THIN_BELOW_PCT, type Line,
} from '@/lib/profitability'

/**
 * Margin is not (bill rate − pay rate) × hours. The client approves
 * forty; the employer accepts thirty-eight because two were travel
 * nobody agreed to bill. You bill forty and pay thirty-eight, and the
 * margin is not what either rate card says.
 *
 * And three things turn a good margin into a bad one: employer burden,
 * commission, and the bench.
 */

function line(over: Partial<Line> = {}): Line {
  return {
    billedHours: 160,
    billRateCents: 9000,
    paidHours: 160,
    payRateCents: 6500,
    contractType: 'C2C',
    ...over,
  }
}

describe('the two hours figures are not one figure', () => {
  it('bills what the client agreed and pays what the employer agreed', () => {
    const p = profitOf(line({ billedHours: 40, paidHours: 38, billRateCents: 9000, payRateCents: 6500 }))
    expect(p.revenueCents).toBe(40 * 9000)
    expect(p.payCents).toBe(38 * 6500)
  })

  it('says so, because the difference is the quiet error this exists to stop', () => {
    const p = profitOf(line({ billedHours: 40, paidHours: 38 }))
    expect(p.assumptions).toContain(
      'Billing 40 hours and paying 38. Both are what was actually agreed.'
    )
  })
})

describe('employer burden', () => {
  it('adds it on a W2 placement', () => {
    // Ignoring it makes every W2 look like a C2C and pushes a firm
    // towards the wrong kind of work.
    const p = profitOf(line({ contractType: 'W2' }))
    expect(p.burdenCents).toBe(Math.round(160 * 6500 * 0.22))
    expect(DEFAULT_BURDEN.W2).toBe(0.22)
  })

  it('adds none on C2C, because the sub carries it', () => {
    expect(profitOf(line({ contractType: 'C2C' })).burdenCents).toBe(0)
  })

  it('adds none on 1099, which is the point of the classification', () => {
    expect(profitOf(line({ contractType: 'IND_1099' })).burdenCents).toBe(0)
  })

  it('says out loud that the rate is our assumption and not their cost', () => {
    expect(profitOf(line({ contractType: 'W2' })).assumptions[0]).toBe(
      'Burden at 22% of pay is our default for W2, not your measured cost.'
    )
  })

  it('says nothing where the client gave us their own number', () => {
    expect(profitOf(line({ contractType: 'W2', burdenRate: 0.19 })).assumptions).toEqual([])
  })

  it('turns a healthy-looking W2 margin thin', () => {
    const asC2C = profitOf(line({ contractType: 'C2C' }))
    const asW2 = profitOf(line({ contractType: 'W2' }))
    expect(asC2C.marginPct).toBe(27.8)
    expect(asW2.marginPct).toBe(11.9)
  })
})

describe('expenses, which are rarely the same both ways', () => {
  it('counts the spread as margin', () => {
    const p = profitOf(line({ expenseBilledCents: 30_000, expenseReimbursedCents: 24_000 }))
    expect(p.expenseMarginCents).toBe(6_000)
  })

  it('names what the firm absorbed rather than burying it', () => {
    const p = profitOf(line({ expenseBilledCents: 0, expenseReimbursedCents: 24_000 }))
    expect(p.expenseMarginCents).toBe(-24_000)
    expect(p.assumptions).toContain('$240 of expenses were reimbursed and not billed on.')
  })
})

describe('the numbers it refuses to invent', () => {
  it('returns null rather than zero for a percentage of nothing', () => {
    const p = profitOf(line({ billedHours: 0, paidHours: 160 }))
    expect(p.marginPct).toBeNull()
    expect(p.says).toBe('Nothing billed and $10,400 spent.')
  })

  it('says plainly when a placement is losing money', () => {
    const p = profitOf(line({ billRateCents: 6000, payRateCents: 6500 }))
    expect(p.says).toBe('Losing $800 on $9,600 billed.')
  })
})

describe('a candidate across everything they did', () => {
  it('counts the gaps, which appear on no invoice', () => {
    // The single most common way a staffing firm convinces itself a
    // bench is an asset.
    const c = forCandidate(
      [profitOf(line({ contractType: 'C2C' }))],
      { idleDays: 120, costPerIdleDayCents: 40_000 }
    )
    expect(c.benchCents).toBe(120 * 40_000)
    expect(c.marginCents).toBe(400_000)
    expect(c.netMarginCents).toBe(400_000 - 4_800_000)
  })

  it('names the case where every assignment made money and the year did not', () => {
    const c = forCandidate(
      [profitOf(line({ contractType: 'C2C' }))],
      { idleDays: 120, costPerIdleDayCents: 40_000 }
    )
    expect(c.profitableOnPaperOnly).toBe(true)
    expect(c.netSays).toBe(
      'Every assignment made money and the year did not. $4,000 earned, $48,000 spent on 120 idle days — $44,000 down.'
    )
  })

  it('costs nothing for a C2C consultant nobody pays on the bench', () => {
    const c = forCandidate([profitOf(line())], { idleDays: 120, costPerIdleDayCents: 0 })
    expect(c.benchCents).toBe(0)
    expect(c.netMarginCents).toBe(c.marginCents)
  })
})

describe('a customer across every placement', () => {
  it('carries what has not been collected, because margin cannot tell that story', () => {
    // A client at a good margin who settles at ninety days is a
    // different client from one at the same margin at thirty.
    const c = forCustomer([profitOf(line())], { contracts: 3, people: 3, unpaidCents: 900_000 })
    expect(c.marginOnPaperOnly).toBe(true)
    expect(c.cashSays).toBe(
      '$4,000 of margin and $9,000 still unpaid — more is outstanding than has been earned.'
    )
  })

  it('says so when everything is settled', () => {
    const c = forCustomer([profitOf(line())], { contracts: 1, people: 1, unpaidCents: 0 })
    expect(c.cashSays).toBe('All settled.')
  })
})

describe('adding several up', () => {
  it('totals without losing the assumptions', () => {
    const t = total([
      profitOf(line({ contractType: 'W2' })),
      profitOf(line({ contractType: 'C2C', billedHours: 40, paidHours: 38 })),
    ])
    expect(t.revenueCents).toBe(160 * 9000 + 40 * 9000)
    expect(t.assumptions).toHaveLength(2)
  })

  it('does not repeat the same assumption twice', () => {
    const t = total([profitOf(line({ contractType: 'W2' })), profitOf(line({ contractType: 'W2' }))])
    expect(t.assumptions).toHaveLength(1)
  })
})

describe('the floor nobody was checking', () => {
  it('reads MasterAgreement.minMarginPct at last', () => {
    // It has been in the schema from the start and nothing ever checked
    // it.
    const p = profitOf(line({ contractType: 'W2' }))
    expect(belowFloor(p, 20)).toBe(
      '11.9% against a floor of 20%. Somebody has to approve this or reprice it.'
    )
  })

  it('says nothing where the placement clears it', () => {
    expect(belowFloor(profitOf(line()), 20)).toBeNull()
  })

  it('says nothing where nobody set one', () => {
    expect(belowFloor(profitOf(line({ contractType: 'W2' })), null)).toBeNull()
  })

  it('grades a placement against the floor, or a default when there is none', () => {
    expect(THIN_BELOW_PCT).toBe(15)
    expect(health(profitOf(line()), null)).toBe('FINE')
    expect(health(profitOf(line({ contractType: 'W2' })), null)).toBe('THIN')
    expect(health(profitOf(line({ billRateCents: 6000 })), null)).toBe('LOSS')
  })
})
