import { describe, it, expect } from 'vitest'
import { ledgerFor, commitmentOf, contractValueOf, type ContractFact } from '@/lib/budget-ledger'

/**
 * A client's budget, on SAP's terms.
 *
 * Asked for directly — "do what SAP project systems or internal order
 * does" — which settles the one question that decides every figure
 * here: a commitment is relieved as it is consumed, so the four numbers
 * add up and no work is counted twice.
 *
 *     Available = Budget − Commitment − Actual
 *
 * The tests below are that sentence taken apart. The ones that matter
 * most are the ones about double counting: a client reading a budget
 * page acts on it, and a figure that is plausible and wrong is worse
 * than no page at all.
 */

const ON = new Date('2026-09-14T00:00:00Z')
const WEEK = 7 * 24 * 60 * 60 * 1000

const contract = (over: Partial<ContractFact> = {}): ContractFact => ({
  id: 'c1', personName: 'Lucía Fernández', supplierName: 'Pinnacle Resourcing',
  billRateCents: 9800, hoursPerWeek: 40,
  startDate: new Date('2026-08-01'), endDate: new Date('2026-10-14'),
  live: true, shareBps: 10_000, ...over,
})

describe('what a contract commits, and what relieves it', () => {
  it('the whole contract is a claim on the budget the day it is signed — rate, hours a week, weeks it runs', () => {
    const c = contract({ startDate: new Date('2026-09-14'), endDate: new Date('2026-10-12') })
    expect(contractValueOf(c)).toBe(9800 * 40 * 4)
    expect(commitmentOf(c, 0)).toBe(9800 * 40 * 4)
  })

  it('is relieved by work accepted, never by the calendar — three months with no timesheet still commits three months', () => {
    // The bug this replaced counted weeks from today, so a contract
    // running since January with nothing filed lost eight months of
    // claim and the cost center read healthier than it was.
    const running = contract({ startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') })
    expect(commitmentOf(running, 0)).toBe(contractValueOf(running))
  })

  it('shrinks by exactly what has been accepted, so committed plus spent is always the contract', () => {
    const c = contract({ startDate: new Date('2026-09-14'), endDate: new Date('2026-10-12') })
    const total = contractValueOf(c)!
    const accepted = 9800 * 40
    expect(commitmentOf(c, accepted)).toBe(total - accepted)
    expect(commitmentOf(c, accepted) + accepted).toBe(total)
  })

  it('never goes negative when more was accepted than the contract said', () => {
    const c = contract({ startDate: new Date('2026-09-14'), endDate: new Date('2026-10-12') })
    expect(commitmentOf(c, contractValueOf(c)! * 2)).toBe(0)
  })

  it('is nothing for a contract that has ended — what it cost is spent, and nothing is reserved ahead', () => {
    expect(commitmentOf(contract({ live: false }), 0)).toBe(0)
  })

  it('reserves nothing for an open-ended contract, rather than inventing a year for it', () => {
    expect(contractValueOf(contract({ endDate: null }))).toBeNull()
    expect(commitmentOf(contract({ endDate: null }), 0)).toBe(0)
  })

  it('takes only this cost center’s share when a contract is split across two', () => {
    const whole = contract({ startDate: new Date('2026-09-14'), endDate: new Date('2026-09-28') })
    const half = contract({ startDate: new Date('2026-09-14'), endDate: new Date('2026-09-28'), shareBps: 5_000 })
    expect(contractValueOf(half)).toBe(contractValueOf(whole)! / 2)
  })
})

describe('the four figures against a budget', () => {
  const base = {
    budgetCents: 100_000_00,
    contracts: [contract({ endDate: new Date(ON.getTime() + 2 * WEEK) })],
    on: ON,
  }

  it('available is the budget less what is committed and what has been accepted', () => {
    const l = ledgerFor({
      ...base,
      work: [{ contractId: 'c1', hours: 100, invoiced: true, paid: true }],
      expenses: [],
    })
    const total = contractValueOf(base.contracts[0])!
    expect(l.actualCents).toBe(9800 * 100)
    // Committed is what the contract has left to give, and the two
    // together are the whole contract — never more, never less.
    expect(l.committedCents).toBe(total - l.actualCents)
    expect(l.committedCents + l.actualCents).toBe(total)
    expect(l.availableCents).toBe(100_000_00 - total)
  })

  it('never counts a week twice: what is paid sits inside the actual, not beside it', () => {
    const l = ledgerFor({
      ...base,
      work: [
        { contractId: 'c1', hours: 40, invoiced: true, paid: true },
        { contractId: 'c1', hours: 40, invoiced: true, paid: false },
        { contractId: 'c1', hours: 40, invoiced: false, paid: false },
      ],
      expenses: [],
    })
    expect(l.actualCents).toBe(9800 * 120)
    expect(l.paidCents + l.toPayCents).toBeLessThanOrEqual(l.actualCents)
    // The week nobody has billed yet is a cost already incurred and is
    // in neither cash figure — which is the whole point of accruing it.
    expect(l.actualCents - l.paidCents - l.toPayCents).toBe(9800 * 40)
  })

  it('the cost is incurred when the work is accepted, not when the invoice is paid', () => {
    const unbilled = ledgerFor({
      ...base, work: [{ contractId: 'c1', hours: 40, invoiced: false, paid: false }], expenses: [],
    })
    expect(unbilled.actualCents).toBe(9800 * 40)
    expect(unbilled.paidCents).toBe(0)
    expect(unbilled.availableCents).toBe(100_000_00 - unbilled.committedCents - 9800 * 40)
  })

  it('an accepted expense is a cost against the budget too, at the cost center’s share', () => {
    const l = ledgerFor({
      ...base,
      contracts: [contract({ endDate: new Date(ON.getTime() + 2 * WEEK), shareBps: 5_000 })],
      work: [],
      expenses: [{ contractId: 'c1', amountCents: 2_000_00, invoiced: true, paid: false }],
    })
    expect(l.actualCents).toBe(1_000_00)
    expect(l.toPayCents).toBe(1_000_00)
  })

  it('says how much is left, and what the two parts of the spend are', () => {
    const l = ledgerFor({ ...base, work: [{ contractId: 'c1', hours: 40, invoiced: true, paid: true }], expenses: [] })
    expect(l.says).toMatch(/left of \$100k/)
    expect(l.says).toMatch(/accepted/)
    expect(l.says).toMatch(/committed and not yet worked/)
  })
})

describe('a budget that is running out, or was never set', () => {
  const twoWeeks = contract({ endDate: new Date(ON.getTime() + 2 * WEEK) })

  it('says plainly how far over, rather than showing a negative number and leaving it there', () => {
    const l = ledgerFor({ budgetCents: 5_000_00, contracts: [twoWeeks], work: [], expenses: [], on: ON })
    expect(l.availableCents).toBeLessThan(0)
    expect(l.says).toMatch(/over budget/)
  })

  it('warns when under a tenth is left, because that is when the next hire is the decision', () => {
    const committed = commitmentOf(twoWeeks, 0)
    const l = ledgerFor({
      budgetCents: Math.round(committed / 0.95), contracts: [twoWeeks], work: [], expenses: [], on: ON,
    })
    expect(l.says).toMatch(/under a tenth of the budget/)
  })

  it('with no budget set, still shows the spend and says what is missing — never a zero that reads as overspend', () => {
    const l = ledgerFor({ budgetCents: null, contracts: [twoWeeks], work: [], expenses: [], on: ON })
    expect(l.availableCents).toBeNull()
    expect(l.usedShare).toBeNull()
    expect(l.committedCents).toBeGreaterThan(0)
    expect(l.says).toMatch(/Set a budget for this period/)
    expect(l.unknowns.join(' ')).toMatch(/No budget has been set/)
  })
})

describe('every contract under the cost center, which is the other half of the question', () => {
  it('gives a line per contract, heaviest first, each saying what it is doing to the budget', () => {
    const l = ledgerFor({
      budgetCents: 500_000_00,
      contracts: [
        contract({ id: 'small', personName: 'Ada', billRateCents: 5000, endDate: new Date(ON.getTime() + 1 * WEEK) }),
        contract({ id: 'big', personName: 'Rhea', billRateCents: 12000, endDate: new Date(ON.getTime() + 8 * WEEK) }),
      ],
      work: [{ contractId: 'small', hours: 40, invoiced: true, paid: true }],
      expenses: [],
      on: ON,
    })
    expect(l.lines.map((x) => x.contractId)).toEqual(['big', 'small'])
    expect(l.lines[0].says).toMatch(/Rhea through Pinnacle Resourcing/)
    expect(l.lines[0].says).toMatch(/still to run/)
    expect(l.lines[1].paidCents).toBe(5000 * 40)
  })

  it('a finished contract still shows what it cost, and what is still owed on it', () => {
    const l = ledgerFor({
      budgetCents: 100_000_00,
      contracts: [contract({ live: false })],
      work: [{ contractId: 'c1', hours: 40, invoiced: true, paid: false }],
      expenses: [], on: ON,
    })
    expect(l.lines[0].committedCents).toBe(0)
    expect(l.lines[0].says).toMatch(/finished/)
    expect(l.lines[0].says).toMatch(/still to pay/)
  })

  it('says out loud where it had to assume the hours, rather than presenting a guess as a fact', () => {
    const l = ledgerFor({
      budgetCents: 100_000_00,
      contracts: [contract({ hoursPerWeek: null, endDate: new Date(ON.getTime() + 2 * WEEK) })],
      work: [], expenses: [], on: ON,
    })
    // Forty a week, assumed — and said out loud rather than presented
    // as a fact somebody typed in.
    expect(l.committedCents).toBe(contractValueOf(contract({ hoursPerWeek: null, endDate: new Date(ON.getTime() + 2 * WEEK) }))!)
    expect(l.unknowns.join(' ')).toMatch(/do(es)? not state hours a week/)
  })

  it('says out loud that an open-ended contract has nothing reserved against it', () => {
    const l = ledgerFor({
      budgetCents: 100_000_00, contracts: [contract({ endDate: null })], work: [], expenses: [], on: ON,
    })
    expect(l.unknowns.join(' ')).toMatch(/no end date/)
  })
})

describe('overtime against the budget', () => {
  it('an overtime hour draws more from the budget than an ordinary one', () => {
    const c = contract({ startDate: new Date('2026-09-07'), endDate: new Date('2026-09-21') })
    const plain = ledgerFor({
      budgetCents: 100_000_00, contracts: [c],
      work: [{ contractId: 'c1', hours: 45, invoiced: false, paid: false }],
      expenses: [], on: ON,
    })
    const withOt = ledgerFor({
      budgetCents: 100_000_00, contracts: [c],
      work: [{ contractId: 'c1', hours: 45, overtimeHours: 5, overtimeMultiplierBps: 15_000, invoiced: false, paid: false }],
      expenses: [], on: ON,
    })
    expect(withOt.actualCents - plain.actualCents).toBe(Math.round(5 * 9800 * 0.5))
    // And it eats the commitment by exactly what it cost, so the two
    // still add to the contract.
    expect(withOt.committedCents + withOt.actualCents).toBe(contractValueOf(c))
  })

  it('a week with no overtime is worth exactly what it always was', () => {
    const c = contract({ startDate: new Date('2026-09-07'), endDate: new Date('2026-09-21') })
    const l = ledgerFor({
      budgetCents: 100_000_00, contracts: [c],
      work: [{ contractId: 'c1', hours: 40, overtimeHours: 0, invoiced: false, paid: false }],
      expenses: [], on: ON,
    })
    expect(l.actualCents).toBe(40 * 9800)
  })

  it('what is paid carries the overtime too, so cash and cost stay the same shape', () => {
    const c = contract({ startDate: new Date('2026-09-07'), endDate: new Date('2026-09-21') })
    const l = ledgerFor({
      budgetCents: 100_000_00, contracts: [c],
      work: [{ contractId: 'c1', hours: 45, overtimeHours: 5, overtimeMultiplierBps: 20_000, invoiced: true, paid: true }],
      expenses: [], on: ON,
    })
    expect(l.paidCents).toBe(l.actualCents)
    expect(l.actualCents).toBe(40 * 9800 + 5 * 9800 * 2)
  })
})
