/**
 * Exempt or nonexempt — what Etyme may hold, and what payroll may do
 * with it.
 *
 * The ruling these sentences hold to: Etyme is neither the employer nor
 * their counsel, so it records what an employer asserts and never
 * decides it. What it may do on its own is arithmetic — rule an
 * exemption out on a pay rate that cannot reach the floor — and it may
 * never rule one in, because the duties test is not in this data.
 *
 * And the client's overtime treatment is a billing fact on the sell leg.
 * It never reaches a wage.
 */

import { describe, it, expect } from 'vitest'
import {
  screenExemption,
  checkAssertion,
  weekWage,
  saysCannotClassify,
  wageRuleLabel,
  compTimeLawful,
  EXEMPTION_LABEL,
  MIN_REASON_CHARS,
  type PayShape,
  type ExemptAssertion,
  type WagePosition,
  type WeekOfHours,
} from '@/lib/worker-classification'

const HOURLY: PayShape = { payModel: 'FIXED_HOURLY', payRateCents: 10_000, paidOnSalaryBasis: false }
const LOW_HOURLY: PayShape = { payModel: 'FIXED_HOURLY', payRateCents: 2_200, paidOnSalaryBasis: false }
const SALARIED: PayShape = {
  payModel: 'FIXED_HOURLY', payRateCents: 10_000, paidOnSalaryBasis: true, weeklySalaryCents: 400_000,
}

const MARCH = new Date('2026-03-09T00:00:00.000Z')

function asserted(over: Partial<ExemptAssertion> = {}): ExemptAssertion {
  return {
    status: 'NONEXEMPT',
    basis: null,
    assertedByCompanyId: 'brightmoor',
    assertedByCompanyName: 'Brightmoor Staffing',
    assertedByName: 'Dana Ruiz',
    assertedAt: MARCH,
    note: null,
    reviewBy: null,
    ...over,
  }
}

const WEEK: WeekOfHours = { weekOf: '2026-03-09', regularHours: 40, leaveHours: 0, overHours: 5 }

function position(over: Partial<WagePosition> = {}): WagePosition {
  return {
    personName: 'Priya Raman',
    contractType: 'W2',
    weAreTheEmployer: true,
    pay: HOURLY,
    rule: 'US_FLSA',
    assertion: asserted(),
    client: { treatment: null, appliedBps: null },
    employerName: 'Brightmoor Staffing',
    clientName: 'Nike',
    ...over,
  }
}

describe('Etyme records exempt status and never decides it', () => {

  it('Etyme records what an employer asserts about exempt status and never decides it', () => {
    // The ruling is in the type: there is no verdict that means "exempt".
    const outcomes = [
      screenExemption(HOURLY).outcome,
      screenExemption(LOW_HOURLY).outcome,
      screenExemption(SALARIED).outcome,
      screenExemption(SALARIED, 'UK').outcome,
    ]
    expect(outcomes).not.toContain('EXEMPT')
    expect(new Set(outcomes)).toEqual(new Set(['CANNOT_BE_EXEMPT', 'ETYME_CANNOT_SAY']))

    // And the one thing a salary CAN do is fail to rule anything out.
    const salaried = screenExemption(SALARIED)
    expect(salaried.outcome).toBe('ETYME_CANNOT_SAY')
    expect(salaried.says).toContain("employer's to say")
  })

  it('an hourly pay rate below the computer-employee floor cannot support any salaried exemption, and Etyme says so', () => {
    const screen = screenExemption(LOW_HOURLY)
    expect(screen.outcome).toBe('CANNOT_BE_EXEMPT')
    // $27.63 is the one hourly floor in the regulation, and $22 is under it.
    expect(screen.says).toContain('$27.63')
    expect(screen.rulesOut).toContain('COMPUTER')
    expect(screen.rulesOut).toContain('EXECUTIVE')
    // Outside sales has no pay test, so arithmetic cannot touch it.
    expect(screen.leavesOpen).toEqual(['OUTSIDE_SALES'])
  })

  it('a share of the bill is not a salary, so the salaried exemptions fail on arithmetic alone', () => {
    const share = screenExemption({
      payModel: 'SHARE_OF_BILL', payRateCents: 12_000, paidOnSalaryBasis: true, weeklySalaryCents: 400_000,
    })
    expect(share.outcome).toBe('CANNOT_BE_EXEMPT')
    expect(share.rulesOut).toContain('ADMINISTRATIVE')
    // Paid well above the computer floor, so that one survives the arithmetic.
    expect(share.leavesOpen).toContain('COMPUTER')
  })

  it('an exempt assertion against an hourly pay model is a contradiction the employer has to explain in writing', () => {
    const screen = screenExemption(LOW_HOURLY)
    const bare = checkAssertion({
      status: 'EXEMPT', basis: 'ADMINISTRATIVE', screen,
      assertedByCompanyId: 'brightmoor', employerCompanyId: 'brightmoor', assertedAt: MARCH,
    })
    expect(bare.ok).toBe(false)
    expect(bare.code).toBe('NEEDS_A_REASON')
    expect(bare.says).toContain('a defense you have to prove')

    const note = 'Counsel reviewed the duties on 3 March and considers the primary duty ' +
      'administrative; the hourly rate is a billing convention and a weekly guarantee is paid.'
    expect(note.length).toBeGreaterThan(MIN_REASON_CHARS)
    const withReason = checkAssertion({
      status: 'EXEMPT', basis: 'ADMINISTRATIVE', screen, note,
      assertedByCompanyId: 'brightmoor', employerCompanyId: 'brightmoor', assertedAt: MARCH,
    })
    expect(withReason.ok).toBe(true)
    expect(withReason.code).toBe('DEPARTS_WITH_REASON')
    // The departure is first, because it is what anybody reading this later needs first.
    expect(withReason.reasons[0]).toBe(note)
  })

  it('an exempt assertion with no exemption named is a preference and is refused', () => {
    const check = checkAssertion({
      status: 'EXEMPT', basis: null, screen: screenExemption(SALARIED),
      assertedByCompanyId: 'brightmoor', employerCompanyId: 'brightmoor', assertedAt: MARCH,
    })
    expect(check.ok).toBe(false)
    expect(check.code).toBe('NO_BASIS_NAMED')
    // The sentence lists the exemptions in §541's own order, so the clerk
    // can pick one rather than go and read the regulation.
    expect(Object.keys(EXEMPTION_LABEL)).toHaveLength(6)
    for (const word of ['executive', 'administrative', 'professional', 'computer employee', 'outside sales', 'highly compensated']) {
      expect(check.says.toLowerCase()).toContain(word)
    }
  })

  it('only the employer may assert it, because only the employer carries the bill for getting it wrong', () => {
    const check = checkAssertion({
      status: 'EXEMPT', basis: 'PROFESSIONAL', screen: screenExemption(SALARIED),
      assertedByCompanyId: 'nike', employerCompanyId: 'brightmoor', assertedAt: MARCH,
    })
    expect(check.ok).toBe(false)
    expect(check.code).toBe('NOT_THE_EMPLOYER')
    expect(check.says).toContain('Only the employer')
  })

  it('nobody has to justify calling somebody nonexempt, and every assertion gets a date to remake it', () => {
    const check = checkAssertion({
      status: 'NONEXEMPT', basis: null, screen: screenExemption(SALARIED),
      assertedByCompanyId: 'brightmoor', employerCompanyId: 'brightmoor', assertedAt: MARCH,
    })
    expect(check.ok).toBe(true)
    expect(check.code).toBe('AGREES')
    // Twelve months on, so a promotion that changes the duties gets looked at.
    expect(check.reviewBy.toISOString().slice(0, 10)).toBe('2027-03-09')
  })
})

describe('what a client decided about a bill never reaches a wage', () => {

  it("a client's choice to bank overtime cannot reduce what a nonexempt employee is paid", () => {
    const pay = weekWage(WEEK, position({ client: { treatment: 'TIME_OFF', appliedBps: 0 } }))
    expect(pay.ok).toBe(true)
    expect(pay.code).toBe('OWED_IN_MONEY')
    // 5 hours at $100, at time and a half.
    expect(pay.overtimeCents).toBe(75_000)
    expect(pay.appliedBps).toBe(15_000)
    // Nike priced nothing, so Brightmoor carries the whole premium this period.
    expect(pay.uncoveredPremiumCents).toBe(75_000)
    expect(pay.says).toContain('public agencies only')
    expect(pay.says).toContain('$750.00')
    expect(compTimeLawful('US_FLSA')).toBe(false)
  })

  it("a client's choice to pay the usual rate cannot reduce what a nonexempt employee is paid either", () => {
    const pay = weekWage(WEEK, position({ client: { treatment: 'SAME_RATE', appliedBps: 10_000 } }))
    expect(pay.code).toBe('OWED_IN_MONEY')
    expect(pay.overtimeCents).toBe(75_000)
    // Nike paid the plain rate on those hours; the half-rate premium is Brightmoor's.
    expect(pay.uncoveredPremiumCents).toBe(25_000)
    expect(pay.says).toContain('does not set')
  })

  it('a client paying the statutory premium leaves the supplier carrying nothing', () => {
    const pay = weekWage(WEEK, position({ client: { treatment: 'PREMIUM', appliedBps: 15_000 } }))
    expect(pay.overtimeCents).toBe(75_000)
    expect(pay.uncoveredPremiumCents).toBe(0)
    expect(pay.says).not.toContain('carries it')
  })

  it('what the supplier absorbs is stated as a wage figure and never passed off as a margin figure', () => {
    const pay = weekWage(WEEK, position({ client: { treatment: 'TIME_OFF', appliedBps: 0 } }))
    // The bill rate is deliberately not an input here, so the figure says what it is.
    expect(pay.says).toContain('Brightmoor Staffing carries it')
    expect(pay.caveats.join(' ')).toContain('floor rather than the answer')
    // And banking is a timing difference until the assignment ends first.
    expect(pay.caveats.join(' ')).toContain('out of pocket for good')
  })

  it('the federal floor is quoted as a floor, because a state may require more and a bonus may raise the regular rate', () => {
    const pay = weekWage(WEEK, position())
    const caveats = pay.caveats.join(' ')
    expect(caveats).toContain('§207(e)')
    expect(caveats).toContain('California')
    expect(wageRuleLabel('US_FLSA')).toBe('Fair Labor Standards Act')
  })
})

describe('payroll refuses what it cannot classify, and pays what it can', () => {

  it('payroll refuses a week it cannot classify, and says what is missing', () => {
    const pay = weekWage(WEEK, position({ assertion: null }))
    expect(pay.ok).toBe(false)
    expect(pay.code).toBe('CANNOT_SAY')
    expect(pay.overtimeCents).toBeNull()
    expect(pay.regularCents).toBeNull()
    expect(pay.action).toContain('exempt from overtime')
  })

  it('the refusal names the person, the week, the hours and who has to act', () => {
    const says = saysCannotClassify('Priya Raman', '2026-03-09', 5, 'Brightmoor Staffing')
    expect(says).toContain('Priya Raman')
    expect(says).toContain('March 9')
    expect(says).toContain('5 hours')
    expect(says).toContain('over 40')
    expect(says).toContain('Brightmoor Staffing')
    // Never a code. A clerk who reads FLSA_UNKNOWN has to find somebody who knows.
    expect(says).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
  })

  it('a week under the line asks nobody anything, so an unfilled exempt status does not stop the payroll run', () => {
    const under: WeekOfHours = { weekOf: '2026-03-09', regularHours: 38, leaveHours: 0, overHours: 0 }
    const pay = weekWage(under, position({ assertion: null }))
    expect(pay.ok).toBe(true)
    expect(pay.code).toBe('NO_OVERTIME_THIS_WEEK')
    expect(pay.regularCents).toBe(380_000)
  })

  it("an exempt employee's overtime is governed by the contract, not by the Fair Labor Standards Act", () => {
    const pay = weekWage(WEEK, position({
      pay: SALARIED,
      assertion: asserted({ status: 'EXEMPT', basis: 'PROFESSIONAL' }),
      client: { treatment: 'PREMIUM', appliedBps: 15_000 },
    }))
    expect(pay.ok).toBe(true)
    expect(pay.code).toBe('CONTRACT_GOVERNS')
    expect(pay.appliedBps).toBe(10_000)
    expect(pay.uncoveredPremiumCents).toBeNull()
    // The trap that destroys an exemption after the fact is said out loud.
    expect(pay.caveats.join(' ')).toContain('§541.602')
  })

  it('an exempt person paid by the hour is told so, on every payroll run, without being refused', () => {
    const pay = weekWage(WEEK, position({
      assertion: asserted({ status: 'EXEMPT', basis: 'COMPUTER' }),
    }))
    expect(pay.ok).toBe(true)
    expect(pay.caveats.join(' ')).toContain('paid by the hour rather than on a salary')
  })

  it('outside the United States the Fair Labor Standards Act floor is not quoted at all', () => {
    const pay = weekWage(WEEK, position({ rule: 'UK' }))
    expect(pay.ok).toBe(true)
    expect(pay.code).toBe('CONTRACT_GOVERNS')
    expect(pay.says).toContain('no statutory premium')
    expect(pay.says).not.toContain('time and a half')
    expect(pay.overtimeCents).toBe(50_000)
  })

  it('a country with no wage rules on file refuses rather than defaulting to no overtime', () => {
    const pay = weekWage(WEEK, position({ rule: 'DEFAULT' }))
    expect(pay.ok).toBe(false)
    expect(pay.code).toBe('CANNOT_SAY')
    expect(pay.says).toContain('no wage rules')
  })
})

describe('the boundaries, where the wage is not ours to pay', () => {

  it('a corp-to-corp consultant is paid by their own company, so no wage rule of ours applies to them', () => {
    const pay = weekWage(WEEK, position({ contractType: 'C2C', assertion: null }))
    expect(pay.ok).toBe(false)
    expect(pay.code).toBe('NOT_A_WAGE')
    expect(pay.says).toContain('their own company')
    expect(pay.action).toContain('accounts payable')
  })

  it("a sub-vendor's employee is the sub-vendor's to classify, and we hold only what they told us", () => {
    const pay = weekWage(WEEK, position({ weAreTheEmployer: false, assertion: null }))
    expect(pay.ok).toBe(false)
    expect(pay.code).toBe('NOT_A_WAGE')
    expect(pay.says).toContain('employed by somebody else')
  })

  it("a sole trader raises no overtime duty, unless this firm's own classification call says they are an employee", () => {
    const clean = weekWage(WEEK, position({ contractType: 'IND_1099', assertion: null }))
    expect(clean.ok).toBe(true)
    expect(clean.code).toBe('CONTRACT_GOVERNS')
    expect(clean.overtimeCents).toBe(50_000)

    const contradicted = weekWage(WEEK, position({
      contractType: 'IND_1099',
      assertion: null,
      call: { position: 'EMPLOYEE', decidedAt: MARCH, decidedByName: 'Dana Ruiz', reviewBy: null },
    }))
    // Warns and pays. Refusing would leave somebody unpaid over a paperwork dispute.
    expect(contradicted.ok).toBe(true)
    expect(contradicted.code).toBe('CONTRADICTED_BY_OWN_CALL')
    expect(contradicted.says).toContain('willful')
    expect(contradicted.action).toContain('Remake the classification call')
  })
})
