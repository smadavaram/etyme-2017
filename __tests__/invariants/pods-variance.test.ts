import { describe, it, expect } from 'vitest'
import { projectVariance, type VarianceFacts } from '@/lib/pods/variance'

const day = (s: string) => new Date(`${s}T00:00:00Z`)
const asOf = day('2027-02-15')
const d = (name: string, status: string, due: string | null, amount: number | null, accepted: string | null = null) =>
  ({ name, status, baselineDueOn: due ? day(due) : null, baselineAmountCents: amount, acceptedAt: accepted ? day(accepted) : null })
const pay = (personId: string, amountCents: number, kind = 'PAY') => ({ personId, kind, amountCents, currency: 'USD' })

const facts = (over: Partial<VarianceFacts> = {}): VarianceFacts => ({
  asOf, currency: 'USD',
  deliverables: [
    d('Stage 1', 'ACCEPTED', '2027-01-15', 1_000_000, '2027-01-20'),
    d('Stage 2', 'PENDING', '2027-02-01', 1_000_000),
    d('Stage 3', 'PENDING', '2027-03-15', 1_000_000),
  ],
  cost: { members: [{ personId: 'a', name: 'Ada' }], postings: [pay('a', -1_500_000)] },
  ...over,
})

describe('planned versus actual on a sold team: the schedule', () => {
  it('planned value is the baseline price of every deliverable due by today', () => {
    expect(projectVariance(facts()).schedule.pvCents).toBe(2_000_000)
  })
  it('earned value is the baseline price of the deliverables the client accepted', () => {
    expect(projectVariance(facts()).schedule.evCents).toBe(1_000_000)
  })
  it('schedule variance is earned value less planned value, negative when behind', () => {
    expect(projectVariance(facts()).schedule.svCents).toBe(-1_000_000)
  })
  it('the schedule index is earned over planned, to two places', () => {
    expect(projectVariance(facts()).schedule.spi).toBe(0.5)
  })
  it('a deliverable repriced after the sale is earned at its baseline price, not its new one', () => {
    const r = projectVariance(facts({ deliverables: [d('Stage 1', 'INVOICED', '2027-01-15', 1_000_000, '2027-01-14')] }))
    expect(r.schedule.evCents).toBe(1_000_000)
  })
  it('before anything is due the schedule index is blank, because nothing was planned yet', () => {
    const r = projectVariance(facts({ asOf: day('2027-01-01') }))
    expect(r.schedule.pvCents).toBe(0)
    expect(r.schedule.spi).toBeNull()
  })
  it('a deliverable sold before baselines existed makes planned and earned value blank and says why', () => {
    const r = projectVariance(facts({ deliverables: [d('Old', 'PENDING', null, null), d('Stage 2', 'PENDING', '2027-02-01', 1_000_000)] }))
    expect(r.schedule).toMatchObject({ pvCents: null, evCents: null, svCents: null, spi: null })
    expect(r.schedule.unknowns[0]).toContain('no plan was saved')
  })
  it('a deliverable sold with no due date makes planned value blank and says why', () => {
    const r = projectVariance(facts({ deliverables: [d('Stage 1', 'PENDING', null, 1_000_000)] }))
    expect(r.schedule.pvCents).toBeNull()
    expect(r.schedule.unknowns.join(' ')).toContain('no due date')
  })
  it('a cancelled deliverable makes the figures blank, since the plan no longer matches the baseline', () => {
    const r = projectVariance(facts({ deliverables: [d('Stage 1', 'CANCELLED', '2027-01-15', 1_000_000)] }))
    expect(r.schedule.svCents).toBeNull()
  })
  it('a project with no deliverables has no plan to compare and every figure is blank', () => {
    const r = projectVariance(facts({ deliverables: [] }))
    expect(r.schedule).toMatchObject({ pvCents: null, evCents: null, spi: null })
  })
})

describe('planned versus actual on a sold team: dates', () => {
  it('an accepted deliverable shows planned date, accepted date and the days it ran late', () => {
    expect(projectVariance(facts()).deliverables[0]).toMatchObject({ plannedOn: '2027-01-15', actualOn: '2027-01-20', daysVariance: 5, basis: 'ACCEPTED' })
  })
  it('a deliverable accepted early shows negative days', () => {
    const r = projectVariance(facts({ deliverables: [d('Stage 1', 'ACCEPTED', '2027-01-15', 1, '2027-01-10')] }))
    expect(r.deliverables[0].daysVariance).toBe(-5)
  })
  it('a deliverable past its date and not accepted shows the days overdue as of today, with no actual date', () => {
    expect(projectVariance(facts()).deliverables[1]).toMatchObject({ plannedOn: '2027-02-01', actualOn: null, daysVariance: 14, basis: 'OVERDUE' })
  })
  it('a deliverable not yet due shows no variance', () => {
    expect(projectVariance(facts()).deliverables[2]).toMatchObject({ daysVariance: null, basis: null })
  })
  it('a deliverable with no planned date shows a blank, never a guess', () => {
    const r = projectVariance(facts({ deliverables: [d('Stage 1', 'ACCEPTED', null, 1, '2027-01-10')] }))
    expect(r.deliverables[0]).toMatchObject({ plannedOn: null, daysVariance: null })
  })
})

describe('planned versus actual on a sold team: the cost, for a margin reader only', () => {
  it('a seat that may not read margin gets no cost figure at all', () => {
    expect(projectVariance(facts({ cost: null })).cost).toBeNull()
  })
  it('actual cost is the pay, burden and premium posted on the project', () => {
    const r = projectVariance(facts({ cost: { members: [{ personId: 'a', name: 'Ada' }], postings: [pay('a', -1_000_000), pay('a', -250_000, 'BURDEN'), pay('a', 90_000, 'BILL')] } }))
    expect(r.cost?.acCents).toBe(1_250_000)
  })
  it('cost variance is earned value less actual cost, and the cost index is earned over actual', () => {
    const r = projectVariance(facts())
    expect(r.cost).toMatchObject({ acCents: 1_500_000, cvCents: -500_000, cpi: 0.67 })
  })
  it('a member with no pay record makes actual cost blank and names her', () => {
    const r = projectVariance(facts({ cost: { members: [{ personId: 'a', name: 'Ada' }, { personId: 'b', name: 'Bram' }], postings: [pay('a', -100)] } }))
    expect(r.cost).toMatchObject({ acCents: null, cvCents: null, cpi: null })
    expect(r.cost?.unknowns.join(' ')).toContain('Bram has no pay record')
  })
  it('a cost posted in a second currency is never added and makes actual cost blank', () => {
    const r = projectVariance(facts({ cost: { members: [{ personId: 'a', name: 'Ada' }], postings: [pay('a', -100), { personId: 'a', kind: 'PAY', amountCents: -100, currency: 'INR' }] } }))
    expect(r.cost?.acCents).toBeNull()
  })
  it('a cost of nothing is a missing link, so the cost index is blank rather than infinite', () => {
    const r = projectVariance(facts({ cost: { members: [], postings: [] } }))
    expect(r.cost?.acCents).toBeNull()
    expect(r.cost?.cpi).toBeNull()
  })
  it('cost variance is blank when earned value is blank, even where cost is known', () => {
    const r = projectVariance(facts({ deliverables: [d('Old', 'ACCEPTED', null, null)] }))
    expect(r.cost?.acCents).toBe(1_500_000)
    expect(r.cost?.cvCents).toBeNull()
  })
})
