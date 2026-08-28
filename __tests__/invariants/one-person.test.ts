import { describe, it, expect } from 'vitest'
import {
  merge, rateSpread, order, summarise, WORTH_MENTIONING,
  type Person, type Offer, type Merged,
} from '@/lib/one-person'

/**
 * A client with twelve vendors does not have twelve consultants called
 * Rohan Menon. They have one, and twelve different stories about him:
 * four rates, two claims to represent him, and a fourteen-month
 * assignment here in 2024 that nobody in the building remembers.
 *
 * Every one of those facts sits in a different supplier's system and
 * none of them can see the others.
 */

const NOW = new Date('2026-08-24T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function offer(over: Partial<Offer> = {}): Offer {
  return {
    vendorName: 'Cloudepa',
    vendorId: 'v1',
    rateCents: 7800,
    submittedAt: daysAgo(5),
    requirementId: 'r1',
    roleTitle: 'Senior Java Developer',
    cleared: true,
    state: 'SUBMITTED',
    ...over,
  }
}

function person(over: Partial<Person> = {}): Person {
  return {
    personId: 'p1',
    name: 'Rohan Menon',
    offers: [offer()],
    stints: [],
    barred: null,
    capMonths: 18,
    ...over,
  }
}

describe('the same person from more than one supplier', () => {
  it('is one record, not two', () => {
    const m = merge(
      person({
        offers: [
          offer({ vendorId: 'v1', vendorName: 'Cloudepa', rateCents: 7800 }),
          offer({ vendorId: 'v2', vendorName: 'Vertex', rateCents: 9600 }),
        ],
      }),
      NOW
    )
    expect(m.vendors).toBe(2)
    expect(m.vendorNames).toEqual(['Cloudepa', 'Vertex'])
  })

  it('puts the two prices side by side, which no client has been able to see', () => {
    const m = merge(
      person({
        offers: [
          offer({ vendorId: 'v1', vendorName: 'Cloudepa', rateCents: 7800 }),
          offer({ vendorId: 'v2', vendorName: 'Vertex', rateCents: 9600 }),
        ],
      }),
      NOW
    )
    expect(m.spread!.says).toBe('$78 from one supplier, $96 from another — $18 apart.')
  })

  it('says nothing about a gap of a dollar, because that is margin', () => {
    // Flagging it would train people to ignore the flag.
    const s = rateSpread([7800, 7850], 2)
    expect(s!.says).toBeNull()
  })

  it('has no spread to report on a single supplier', () => {
    expect(rateSpread([7800], 1)).toBeNull()
    expect(rateSpread([7800, 9600], 1)).toBeNull()
  })

  it('mentions a gap once it is a tenth of the price', () => {
    expect(WORTH_MENTIONING).toBe(0.1)
    expect(rateSpread([10000, 11000], 2)!.says).not.toBeNull()
    expect(rateSpread([10000, 10900], 2)!.says).toBeNull()
  })
})

describe('time already served here', () => {
  it('adds it up across every supplier, which is the whole point', () => {
    // Twelve months through one and twelve through another is
    // twenty-four months of exposure, and neither supplier can see it.
    const m = merge(
      person({
        stints: [
          { months: 12, endedAt: daysAgo(700), vendorName: 'Vertex' },
          { months: 12, endedAt: daysAgo(200), vendorName: 'Cloudepa' },
        ],
      }),
      NOW
    )
    expect(m.monthsHere).toBe(24)
    expect(m.headroomMonths).toBe(-6)
  })

  it('says plainly when somebody is already past the cap', () => {
    const m = merge(
      person({ stints: [{ months: 19, endedAt: daysAgo(40), vendorName: 'Vertex' }] }),
      NOW
    )
    expect(m.says).toBe('19 months here already — past your cap.')
  })

  it('says how much room is left when there is some', () => {
    const m = merge(
      person({ stints: [{ months: 6, endedAt: daysAgo(40), vendorName: 'Vertex' }] }),
      NOW
    )
    expect(m.says).toBe('6 months here, 12 left before your cap.')
  })

  it('admits it cannot measure tenure with no cap set', () => {
    const m = merge(
      person({
        capMonths: null,
        stints: [{ months: 6, endedAt: daysAgo(40), vendorName: 'Vertex' }],
      }),
      NOW
    )
    expect(m.headroomMonths).toBeNull()
    expect(m.unknowns).toContain(
      'No tenure cap set, so there is nothing to measure the time against.'
    )
  })
})

describe('where somebody has got to', () => {
  it('takes the furthest any supplier got them, not the latest row', () => {
    const m = merge(
      person({
        offers: [
          offer({ vendorId: 'v1', state: 'REJECTED' }),
          offer({ vendorId: 'v2', state: 'INTERVIEWING' }),
        ],
      }),
      NOW
    )
    expect(m.state).toBe('INTERVIEWING')
  })

  it('lets barred override everything, because nothing after it matters', () => {
    const m = merge(
      person({
        offers: [offer({ state: 'PLACED' })],
        barred: { at: daysAgo(150), reason: 'Left mid-project without notice' },
      }),
      NOW
    )
    expect(m.state).toBe('BARRED')
    expect(m.says).toBe('On your do-not-submit list: Left mid-project without notice')
  })

  it('counts suppliers by id, because two firms can share a name', () => {
    const m = merge(
      person({
        offers: [
          offer({ vendorId: 'v1', vendorName: 'Apex Staffing' }),
          offer({ vendorId: 'v2', vendorName: 'Apex Staffing' }),
        ],
      }),
      NOW
    )
    expect(m.vendors).toBe(2)
    expect(m.vendorNames).toHaveLength(2)
  })

  it('does not count a rejected supplier as still selling them', () => {
    const m = merge(
      person({
        offers: [
          offer({ vendorId: 'v1', vendorName: 'Cloudepa', state: 'REJECTED' }),
          offer({ vendorId: 'v2', vendorName: 'Vertex', state: 'SUBMITTED' }),
        ],
      }),
      NOW
    )
    expect(m.vendors).toBe(1)
    expect(m.vendorNames).toHaveLength(2)
  })
})

describe('what the record cannot account for', () => {
  it('counts submissions that arrived with no rate', () => {
    const m = merge(person({ offers: [offer(), offer({ vendorId: 'v2', rateCents: null })] }), NOW)
    expect(m.unknowns).toContain('1 of the 2 submissions arrived without a rate.')
  })

  it('counts the ones nobody has screened', () => {
    const m = merge(person({ offers: [offer({ cleared: null })] }), NOW)
    expect(m.unknowns).toContain('1 have never been screened.')
  })
})

describe('an ordinary single submission', () => {
  it('is not dressed up as a finding', () => {
    expect(merge(person(), NOW).says).toBe('Put forward by Cloudepa.')
  })
})

describe('ordering the register', () => {
  function m(over: Partial<Merged>): Merged {
    return {
      personId: 'x', name: 'Zed', vendors: 1, vendorNames: [], spread: null,
      monthsHere: 0, headroomMonths: 12, barred: false, state: 'SUBMITTED',
      roles: [], offers: [], stints: [], says: '', unknowns: [],
      ...over,
    }
  }

  it('puts the barred first, because they should never have arrived', () => {
    const out = order([m({ name: 'ordinary' }), m({ name: 'barred', barred: true })])
    expect(out[0].name).toBe('barred')
  })

  it('then the ones past the tenure cap', () => {
    const out = order([m({ name: 'fine' }), m({ name: 'over', headroomMonths: -2 })])
    expect(out[0].name).toBe('over')
  })

  it('then the ones with a price worth asking about', () => {
    const out = order([
      m({ name: 'quiet' }),
      m({ name: 'spread', spread: { lowCents: 1, highCents: 2, gapCents: 1, says: 'x' } }),
    ])
    expect(out[0].name).toBe('spread')
  })

  it('falls back to the name, so the list does not shuffle between loads', () => {
    const out = order([m({ name: 'Bravo' }), m({ name: 'Alpha' })])
    expect(out.map((x) => x.name)).toEqual(['Alpha', 'Bravo'])
  })

  it('is not a phone book', () => {
    const out = order([m({ name: 'Alpha' }), m({ name: 'Zed', barred: true })])
    expect(out[0].name).toBe('Zed')
  })
})

describe('the line above the register', () => {
  function m(over: Partial<Merged>): Merged {
    return {
      personId: 'x', name: 'x', vendors: 1, vendorNames: [], spread: null,
      monthsHere: 0, headroomMonths: null, barred: false, state: 'SUBMITTED',
      roles: [], offers: [], stints: [], says: '', unknowns: [],
      ...over,
    }
  }

  it('leads with how many are being sold twice', () => {
    const rows = [
      m({ vendors: 2, spread: { lowCents: 1, highCents: 2, gapCents: 1, says: 'x' } }),
      m({ vendors: 2 }),
      m({}),
    ]
    expect(summarise(rows)).toBe(
      '3 people. 2 are being sold by more than one supplier, and 1 at prices worth asking about.'
    )
  })

  it('says so plainly when nobody is duplicated', () => {
    expect(summarise([m({}), m({})])).toBe('2 people, each from one supplier.')
  })

  it('says nothing clever about an empty register', () => {
    expect(summarise([])).toBe('Nobody has been put in front of you yet.')
  })
})
