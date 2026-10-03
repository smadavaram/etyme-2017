/**
 * Evidence kept for the position taken. L3.7.1.2.
 *
 * The arrangement test already existed. What did not was any record of a
 * position having been taken — so a classification was a value on a
 * contract, indistinguishable three years later from a guess. These tests
 * cover the test itself, the refusal to hold an unexplained override, the
 * review sweep, and the one contradiction that blocks.
 */

import { describe, it, expect } from 'vitest'
import {
  testArrangement,
  checkCall,
  defaultReviewBy,
  reviewSweep,
  checkContractAgainstCall,
  ARRANGEMENT_QUESTIONS,
  MIN_REASON_CHARS,
  type Arrangement,
} from '@/lib/worker-classification'

const NOW = new Date('2026-08-29T00:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)

const LOOKS_EMPLOYED: Arrangement = {
  clientDirectsHow: true,
  clientSetsHours: true,
  clientSuppliesEquipment: true,
  maySubstitute: false,
  bearsFinancialRisk: false,
  servesOtherClients: false,
  sameWorkAsEmployees: true,
  openEnded: true,
  receivesEmployeeBenefits: true,
}

const LOOKS_INDEPENDENT: Arrangement = {
  clientDirectsHow: false,
  clientSetsHours: false,
  clientSuppliesEquipment: false,
  maySubstitute: true,
  bearsFinancialRisk: true,
  servesOtherClients: true,
  sameWorkAsEmployees: false,
  openEnded: false,
  receivesEmployeeBenefits: false,
}

describe('The test looks at the arrangement, not at what it was called', () => {

  it('an arrangement where the client sets the hours, supplies the tools and directs the work reads as employment', () => {
    const t = testArrangement(LOOKS_EMPLOYED, 'US_IRS')
    expect(t.position).toBe('EMPLOYEE')
    expect(t.reasons[0]).toContain('directs how the work is done')
  })

  it('a consultant with several clients, their own equipment and a right of substitution reads as independent', () => {
    const t = testArrangement(LOOKS_INDEPENDENT, 'US_IRS')
    expect(t.position).toBe('INDEPENDENT')
    expect(t.reasons.join(' ')).toContain('other clients')
  })

  it('an arrangement nobody has answered comes back unclear rather than guessing', () => {
    const t = testArrangement({}, 'US_IRS')
    expect(t.position).toBe('UNCLEAR')
    expect(t.unknowns).toHaveLength(ARRANGEMENT_QUESTIONS.length)
    expect(t.says).toContain('unanswered')
  })

  it('an unanswered question is never read as a no', () => {
    // Silence scored as "independent" would be a test built to produce the
    // answer somebody wanted.
    const t = testArrangement({ clientDirectsHow: true }, 'US_IRS')
    expect(t.position).toBe('UNCLEAR')
  })

  it('under the ABC test, doing the same work as the client’s own employees settles it on its own', () => {
    const t = testArrangement(
      { ...LOOKS_INDEPENDENT, sameWorkAsEmployees: true },
      'US_ABC'
    )
    expect(t.position).toBe('EMPLOYEE')
    expect(t.reasons[0]).toContain('prong B')
    expect(t.confidence).toBe(1)
  })

  it('the IRS test weighs the factors together and lets no single one decide', () => {
    // The same fact that is decisive under ABC is one weak factor here.
    const t = testArrangement(
      { ...LOOKS_INDEPENDENT, sameWorkAsEmployees: true },
      'US_IRS'
    )
    expect(t.position).toBe('INDEPENDENT')
  })

  it('under IR35 a genuine right of substitution carries more than the rest', () => {
    const t = testArrangement(
      { ...LOOKS_EMPLOYED, maySubstitute: true },
      'UK_IR35'
    )
    expect(t.position).toBe('INDEPENDENT')
    expect(t.reasons[0]).toContain('substitution')
  })

  it('the same arrangement without substitution tests as employment under IR35', () => {
    const t = testArrangement(LOOKS_EMPLOYED, 'UK_IR35')
    expect(t.position).toBe('EMPLOYEE')
  })

  it('the test always says which factors carried it and which questions were never answered', () => {
    const t = testArrangement(
      { ...LOOKS_EMPLOYED, receivesEmployeeBenefits: null, maySubstitute: null },
      'US_IRS'
    )
    expect(t.reasons.length).toBeGreaterThan(0)
    expect(t.unknowns).toHaveLength(2)
    expect(t.confidence).toBeGreaterThan(0)
    expect(t.confidence).toBeLessThan(1)
  })

  it('an unclear test carries no confidence figure at all, rather than a plausible one', () => {
    const t = testArrangement({ clientDirectsHow: true, bearsFinancialRisk: false }, 'US_IRS')
    expect(t.position).toBe('UNCLEAR')
    expect(t.confidence).toBeNull()
  })

  it('an arrangement that points both ways is too close to call', () => {
    const t = testArrangement(
      {
        clientDirectsHow: true, receivesEmployeeBenefits: true, clientSetsHours: true,
        bearsFinancialRisk: true, servesOtherClients: true, maySubstitute: true,
        clientSuppliesEquipment: false, openEnded: true, sameWorkAsEmployees: false,
      },
      'US_IRS'
    )
    expect(t.position).toBe('UNCLEAR')
    expect(t.says).toContain('too close to call')
  })
})

describe('A position is worth what the file behind it is worth', () => {

  const employed = testArrangement(LOOKS_EMPLOYED, 'US_IRS')
  const unclear = testArrangement({}, 'US_IRS')

  it('a position that agrees with the test needs no argument', () => {
    const c = checkCall({ position: 'EMPLOYEE', test: employed, decidedAt: NOW })
    expect(c.ok).toBe(true)
    expect(c.code).toBe('AGREES')
    expect(c.reasons).toEqual(employed.reasons)
  })

  it('recording a position the test contradicts is allowed only with a written reason', () => {
    const bare = checkCall({ position: 'INDEPENDENT', test: employed, decidedAt: NOW })
    expect(bare.ok).toBe(false)
    expect(bare.code).toBe('NEEDS_A_REASON')
    expect(bare.says).toContain('the note is the whole of the evidence')

    const argued = checkCall({
      position: 'INDEPENDENT',
      test: employed,
      note: 'Counsel reviewed the statement of work on 12 August and considers the direction to be over deliverables rather than method.',
      decidedAt: NOW,
    })
    expect(argued.ok).toBe(true)
    expect(argued.code).toBe('DEPARTS_WITH_REASON')
    expect(argued.reasons[0]).toContain('Counsel reviewed')
  })

  it('three words is not a written reason', () => {
    const c = checkCall({ position: 'INDEPENDENT', test: employed, note: 'client says so', decidedAt: NOW })
    expect(c.ok).toBe(false)
    expect('client says so'.length).toBeLessThan(MIN_REASON_CHARS)
  })

  it('a position taken on an unclear test still needs a reason, because nothing on file supports it', () => {
    const c = checkCall({ position: 'INDEPENDENT', test: unclear, decidedAt: NOW })
    expect(c.ok).toBe(false)
    expect(c.says).toContain('nothing on the file supports it')
  })

  it('“unclear” is not a position anybody may record', () => {
    const c = checkCall({ position: 'UNCLEAR', test: unclear, decidedAt: NOW })
    expect(c.ok).toBe(false)
    expect(c.code).toBe('NOT_A_POSITION')
  })

  it('a call recorded with no review date gets one twelve months out', () => {
    const c = checkCall({ position: 'EMPLOYEE', test: employed, decidedAt: NOW })
    expect(c.reviewBy.toISOString().slice(0, 10)).toBe('2027-08-29')
    expect(defaultReviewBy(d('2026-02-29')).toISOString().slice(0, 10)).toBe('2027-03-01')
  })
})

describe('A review date nothing sweeps is a review date that lies', () => {

  it('a call past its review date is surfaced as stale, with how long ago', () => {
    const [stale] = reviewSweep(
      [{ id: 'c1', personName: 'Alan Reed', position: 'INDEPENDENT', decidedAt: d('2024-01-01'), reviewBy: d('2026-07-01') }],
      NOW
    )
    expect(stale.freshness).toBe('OVERDUE')
    expect(stale.daysOverdue).toBe(59)
    expect(stale.says).toContain('59 days ago')
  })

  it('a call with no review date at all is surfaced too — the state nothing swept in 2017', () => {
    const [stale] = reviewSweep(
      [{ id: 'c1', personName: 'Alan Reed', position: 'INDEPENDENT', decidedAt: d('2024-01-01'), reviewBy: null }],
      NOW
    )
    expect(stale.freshness).toBe('NO_REVIEW_DATE')
    expect(stale.daysOverdue).toBeNull()
  })

  it('a call due for review next month is worth knowing about before it lapses', () => {
    const [soon] = reviewSweep(
      [{ id: 'c1', personName: 'Alan Reed', position: 'EMPLOYEE', decidedAt: d('2025-09-01'), reviewBy: d('2026-09-10') }],
      NOW
    )
    expect(soon.freshness).toBe('DUE_SOON')
    expect(soon.says).toContain('12 days')
  })

  it('a call still current is not reported, because a sweep that reports everything is not read', () => {
    expect(reviewSweep(
      [{ id: 'c1', personName: 'Alan Reed', position: 'EMPLOYEE', decidedAt: NOW, reviewBy: d('2027-08-29') }],
      NOW
    )).toEqual([])
  })

  it('the overdue ones come first, longest overdue at the top', () => {
    const swept = reviewSweep([
      { id: 'a', personName: 'A', position: 'EMPLOYEE', decidedAt: NOW, reviewBy: d('2026-09-05') },
      { id: 'b', personName: 'B', position: 'EMPLOYEE', decidedAt: NOW, reviewBy: null },
      { id: 'c', personName: 'C', position: 'EMPLOYEE', decidedAt: NOW, reviewBy: d('2026-01-01') },
      { id: 'd', personName: 'D', position: 'EMPLOYEE', decidedAt: NOW, reviewBy: d('2026-08-01') },
    ], NOW)
    expect(swept.map(s => s.id)).toEqual(['c', 'd', 'b', 'a'])
  })
})

describe('A contract may not contradict a call the same company made', () => {

  const employeeCall = {
    position: 'EMPLOYEE', decidedAt: d('2026-03-12'),
    decidedByName: 'Priya Nair', reviewBy: d('2027-03-12'),
  }
  const independentCall = {
    position: 'INDEPENDENT', decidedAt: d('2026-03-12'),
    decidedByName: 'Priya Nair', reviewBy: d('2027-03-12'),
  }

  it('a sole-trader contract for somebody the latest call says is an employee is refused', () => {
    const v = checkContractAgainstCall('IND_1099', employeeCall, NOW)
    expect(v.outcome).toBe('BLOCK')
  })

  it('the refusal names who made the call and when', () => {
    const v = checkContractAgainstCall('IND_1099', employeeCall, NOW)
    expect(v.reason).toContain('Priya Nair')
    expect(v.reason).toContain('2026-03-12')
    expect(v.action).toContain('payroll')
  })

  it('a sole trader with no classification call on file warns rather than blocks', () => {
    const v = checkContractAgainstCall('IND_1099', null, NOW)
    expect(v.outcome).toBe('WARN')
    expect(v.reason).toContain('Nobody has tested this arrangement')
  })

  it('paying somebody as an employee when the call says independent is not a contradiction', () => {
    const v = checkContractAgainstCall('W2', independentCall, NOW)
    expect(v.outcome).toBe('PASS')
    expect(v.reason).toContain('conservative direction')
  })

  it('a corp-to-corp contract against an employee call warns, because the company in between is not nothing', () => {
    const v = checkContractAgainstCall('C2C', employeeCall, NOW)
    expect(v.outcome).toBe('WARN')
    expect(v.reason).toContain('absorbs some of the exposure')
  })

  it('a sole-trader contract matching a call of independent passes', () => {
    const v = checkContractAgainstCall('IND_1099', independentCall, NOW)
    expect(v.outcome).toBe('PASS')
  })

  it('a contract standing on a call that is overdue for review warns, naming the date', () => {
    const v = checkContractAgainstCall(
      'IND_1099',
      { ...independentCall, reviewBy: d('2026-05-01') },
      NOW
    )
    expect(v.outcome).toBe('WARN')
    expect(v.reason).toContain('2026-05-01')
    expect(v.action).toContain('Retest')
  })

  it('a contract with no type stated is questioned, never silently permitted', () => {
    const v = checkContractAgainstCall(null, employeeCall, NOW)
    expect(v.outcome).toBe('WARN')
  })
})
