import { describe, it, expect } from 'vitest'
import { billableBy, periodsOf, position, mayBill, type Order, type Milestone } from '@/lib/billing-plan'

/**
 * Two ways money falls due and most real projects use both. A monthly
 * retainer with three delivery payments is ordinary, and flattening them
 * into one list loses which is which the moment somebody asks why this
 * month's invoice is larger.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

function order(over: Partial<Order> = {}): Order {
  return {
    basis: 'TIME',
    frequency: 'MONTHLY',
    anchor: 'CALENDAR',
    straddle: 'SPLIT',
    customDates: [],
    startDate: d('2026-01-01'),
    endDate: null,
    ceilingCents: null,
    ...over,
  }
}

function milestone(over: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm1',
    name: 'Design sign-off',
    amountCents: 1_500_000,
    dueOn: d('2026-02-15'),
    acceptedAt: null,
    status: 'PENDING',
    ...over,
  }
}

describe('what falls due because a date passed', () => {
  it('bills a period that has closed', () => {
    const due = billableBy(order(), [], d('2026-03-15'))
    expect(due.every((x) => x.kind === 'TIME')).toBe(true)
    expect(due.length).toBeGreaterThanOrEqual(2)
  })

  it('will not bill a period that is still running', () => {
    // Invoicing a period mid-flight is billing for hours nobody has
    // worked yet.
    const due = billableBy(order(), [], d('2026-01-15'))
    expect(due).toHaveLength(0)
  })

  it('takes explicit dates on a custom schedule', () => {
    // Some clients bill on the 7th and the 22nd for reasons nobody
    // remembers, and no frequency expresses that.
    const o = order({
      frequency: 'CUSTOM',
      customDates: [d('2026-01-07'), d('2026-01-22'), d('2026-02-07')],
    })
    const p = periodsOf(o, d('2026-03-01'))
    expect(p).toHaveLength(3)
    expect(p[0].start).toEqual(d('2026-01-01'))
    expect(p[0].end).toEqual(d('2026-01-07'))
    expect(p[1].start).toEqual(d('2026-01-08'))
  })

  it('stops at the order’s end date rather than running forever', () => {
    const o = order({ endDate: d('2026-02-28') })
    const p = periodsOf(o, d('2026-12-31'))
    expect(p[p.length - 1].end.getTime()).toBeLessThanOrEqual(d('2026-02-28').getTime())
  })
})

describe('what falls due because somebody accepted it', () => {
  it('bills an accepted milestone', () => {
    const due = billableBy(
      order({ basis: 'MILESTONE' }),
      [milestone({ acceptedAt: d('2026-02-20') })],
      d('2026-03-01')
    )
    expect(due).toHaveLength(1)
    expect(due[0].kind).toBe('MILESTONE')
    expect(due[0].amountCents).toBe(1_500_000)
  })

  it('never bills one because its date passed', () => {
    // A milestone due last month that nobody signed off is late, not
    // billable, and the difference is the whole reason to track them.
    const due = billableBy(order({ basis: 'MILESTONE' }), [milestone()], d('2026-06-01'))
    expect(due).toHaveLength(0)
  })

  it('says late rather than pending when the date has gone', () => {
    const v = mayBill(milestone(), d('2026-06-01'))
    expect(v.ok).toBe(false)
    expect(v.says).toBe(
      'Design sign-off was due 2026-02-15 and nobody has accepted it. Late, not billable.'
    )
  })

  it('does not bill the same milestone twice', () => {
    const done = milestone({ acceptedAt: d('2026-02-20'), status: 'INVOICED' })
    expect(mayBill(done, d('2026-03-01')).says).toBe('Design sign-off has already been invoiced.')
    expect(billableBy(order({ basis: 'MILESTONE' }), [done], d('2026-03-01'))).toHaveLength(0)
  })
})

describe('an order that does both', () => {
  it('returns the periods and the milestones, in date order', () => {
    const due = billableBy(
      order({ basis: 'BOTH' }),
      [milestone({ acceptedAt: d('2026-02-10') })],
      d('2026-03-15')
    )
    const kinds = due.map((x) => x.kind)
    expect(kinds).toContain('TIME')
    expect(kinds).toContain('MILESTONE')
    const times = due.map((x) => x.on.getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('splits the two in the sentence, because finance reconciles them apart', () => {
    const p = position(
      order({ basis: 'BOTH', ceilingCents: 10_000_000 }),
      [milestone({ acceptedAt: d('2026-02-10') })],
      4_000_000
    )
    expect(p.says).toBe('$55,000 billable. $40,000 on time, $15,000 on delivery. $45,000 left.')
  })
})

describe('the ceiling', () => {
  it('says how much is left', () => {
    const p = position(order({ ceilingCents: 25_000_000 }), [], 4_000_000)
    expect(p.headroomCents).toBe(21_000_000)
    expect(p.says).toBe('$40,000 billable. $210,000 left.')
  })

  it('says plainly when it has been passed, and what has to happen', () => {
    const p = position(order({ ceilingCents: 3_000_000 }), [], 4_000_000)
    expect(p.overCeiling).toBe(true)
    expect(p.says).toBe(
      '$40,000 against a ceiling of $30,000. $10,000 over — somebody has to raise it or stop the work.'
    )
  })

  it('does not invent one where there is none', () => {
    const p = position(order(), [], 4_000_000)
    expect(p.headroomCents).toBeNull()
    expect(p.says).toBe('$40,000 billable. No ceiling on this one.')
  })

  it('counts milestones nobody has accepted separately from what is billable', () => {
    // Committed but not earned. Counting it as billable is how a ceiling
    // check blocks an invoice that was always going to be fine.
    const p = position(
      order({ basis: 'BOTH', ceilingCents: 10_000_000 }),
      [milestone(), milestone({ id: 'm2', acceptedAt: d('2026-02-10') })],
      0
    )
    expect(p.billableCents).toBe(1_500_000)
    expect(p.outstandingCents).toBe(1_500_000)
    expect(p.says).toMatch(/\$15,000 of milestones nobody has accepted yet\./)
  })
})
