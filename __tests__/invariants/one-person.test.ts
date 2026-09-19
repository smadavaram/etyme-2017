import { describe, it, expect } from 'vitest'
import {
  merge, rateSpread, order, summarize, WORTH_MENTIONING,
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

/**
 * A stretch on site that really ran for this many months.
 *
 * Stints carry dates now, not a length: the length used to be
 * `endDate − startDate`, the whole contracted term booked as already
 * served, and the register summed one of those per rung of a chain.
 * The helper writes the dates a stint of that many months would have.
 */
const stint = (months: number, endedAt: Date | null, vendorName: string) => ({
  startedAt: new Date((endedAt ?? NOW).getTime() - Math.round(months * 30.44) * 86_400_000),
  endedAt,
  vendorName,
})

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
          stint(12, daysAgo(700), 'Vertex'),
          stint(12, daysAgo(200), 'Cloudepa'),
        ],
      }),
      NOW
    )
    expect(m.monthsHere).toBe(24)
    expect(m.headroomMonths).toBe(-6)
  })

  it('counts days actually served, never the length of the contract', () => {
    // The register read `endDate − startDate` and called it tenure, so
    // a twelve-month contract signed this morning said twelve months
    // here. Helena's is 200 days old and runs another 160.
    const m = merge(
      person({
        stints: [
          { startedAt: daysAgo(200), endedAt: new Date(NOW.getTime() + 160 * 86_400_000), vendorName: 'Computer Systems' },
        ],
      }),
      NOW
    )
    expect(m.monthsHere).toBe(7)
    expect(m.says).toBe('7 months here, 11 left before your cap.')
  })

  it('has served nothing at all before the first day', () => {
    // Ingrid was awarded a role and starts in a week. The register said
    // twelve months here and six left, about somebody who has not
    // walked in yet.
    const starts = new Date(NOW.getTime() + 7 * 86_400_000)
    const m = merge(
      person({
        stints: [
          { startedAt: starts, endedAt: new Date(NOW.getTime() + 372 * 86_400_000), vendorName: 'Pinnacle' },
        ],
      }),
      NOW
    )
    expect(m.monthsHere).toBe(0)
    expect(m.says).not.toMatch(/months here/)
  })

  it('says the day somebody starts instead of saying they are already on site', () => {
    // Ingrid was awarded the role and the register said "On site here.
    // Nothing needs you." — about somebody whose first day is next
    // week, with the tenure page one nav item away saying "has not
    // started".
    const m = merge(
      person({
        offers: [offer({ state: 'PLACED' })],
        stints: [
          {
            startedAt: new Date('2026-09-22T00:00:00Z'),
            endedAt: new Date('2027-09-22T00:00:00Z'),
            vendorName: 'Pinnacle',
          },
        ],
      }),
      new Date('2026-09-15T12:00:00Z')
    )
    expect(m.says).toBe('Starts Sep 22.')
  })

  it('does not say anybody starts when they are already here', () => {
    const m = merge(
      person({
        offers: [offer({ state: 'PLACED' })],
        stints: [{ startedAt: daysAgo(200), endedAt: null, vendorName: 'Computer Systems' }],
      }),
      NOW
    )
    expect(m.says).not.toMatch(/Starts/)
  })

  it('has served one set of days, not two, when bought through two legs of one chain', () => {
    // Northbend Athletic buys Helena from Computer Systems, who buys her from
    // CloudEPA. Two sell contracts, one person, the same days on the
    // same site. Summed, they said fourteen months and printed "past
    // your cap" about somebody seven months in — the double-count
    // lib/chain-top was written to kill on the dashboard, alive on the
    // page next door.
    const from = daysAgo(200)
    const to = new Date(NOW.getTime() + 160 * 86_400_000)
    const oneLeg = merge(person({ stints: [{ startedAt: from, endedAt: to, vendorName: 'Computer Systems' }] }), NOW)
    const twoLegs = merge(
      person({
        stints: [
          { startedAt: from, endedAt: to, vendorName: 'Computer Systems' },
          { startedAt: from, endedAt: to, vendorName: 'CloudEPA' },
        ],
      }),
      NOW
    )
    expect(twoLegs.monthsHere).toBe(oneLeg.monthsHere)
    expect(twoLegs.monthsHere).toBe(7)
  })

  it('still adds up two real stretches that happen to overlap by a week', () => {
    // A union, not a maximum. Overlapping paper is one stretch; two
    // stretches that touch are still the whole span of both.
    const m = merge(
      person({
        stints: [
          { startedAt: daysAgo(400), endedAt: daysAgo(200), vendorName: 'Vertex' },
          { startedAt: daysAgo(205), endedAt: daysAgo(40), vendorName: 'Cloudepa' },
        ],
      }),
      NOW
    )
    expect(m.monthsHere).toBe(12)
  })

  it('says plainly when somebody is already past the cap', () => {
    const m = merge(
      person({ stints: [stint(19, daysAgo(40), 'Vertex')] }),
      NOW
    )
    expect(m.says).toBe('19 months here already — past your cap.')
  })

  it('says how much room is left when there is some', () => {
    const m = merge(
      person({ stints: [stint(6, daysAgo(40), 'Vertex')] }),
      NOW
    )
    expect(m.says).toBe('6 months here, 12 left before your cap.')
  })

  it('admits it cannot measure tenure with no cap set', () => {
    const m = merge(
      person({
        capMonths: null,
        stints: [stint(6, daysAgo(40), 'Vertex')],
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
      personId: 'x', name: 'Zed', vendors: 1, vendorNames: [], sellingNames: [], spread: null,
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
      personId: 'x', name: 'x', vendors: 1, vendorNames: [], sellingNames: [], spread: null,
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
    expect(summarize(rows)).toBe(
      '3 people. 2 are being sold by more than one supplier, and 1 at prices worth asking about.'
    )
  })

  it('says so plainly when nobody is duplicated', () => {
    expect(summarize([m({}), m({})])).toBe('2 people, each from one supplier.')
  })

  it('says nothing clever about an empty register', () => {
    expect(summarize([])).toBe('Nobody has been put in front of you yet.')
  })
})

describe('somebody placed twice, years apart, through two agencies', () => {
  /**
   * Lucía Fernández on the seeded Northbend Athletic desk, and the row the founder
   * could not make sense of:
   *
   *   "2 suppliers are selling them. 25 months here already — past your
   *    cap. $89 from one supplier, $98 from another — $9 apart."
   *
   * Every clause of it was wrong, and the tenure clause outlived the
   * other two: twenty-five months was thirteen served plus the whole
   * unstarted remainder of a live contract, counted as though she had
   * already worked it.
   *
   * She was placed in May 2025 through Brightmoor at $89, finished, and
   * was placed again in July 2026 through Pinnacle at $98. Nobody is
   * competing over her and nobody is being undercut. The row read two
   * sequential placements as a live bidding war and a fourteen-month
   * rate progression as a price spread.
   */
  const lucia = (): Person => ({
    personId: 'lucia', name: 'Lucía Fernández', capMonths: 18,
    barred: null,
    stints: [
      stint(13, new Date('2026-06-28'), 'Brightmoor Staffing'),
      { startedAt: new Date('2026-07-13'), endedAt: new Date('2027-08-12'), vendorName: 'Pinnacle Resourcing' },
    ],
    offers: [
      { vendorName: 'Brightmoor Staffing', vendorId: 'b', rateCents: 8900, submittedAt: new Date('2025-05-07'), requirementId: 'r1', roleTitle: 'Demand planner', cleared: null, state: 'PLACED' as const },
      { vendorName: 'Pinnacle Resourcing', vendorId: 'p', rateCents: 9800, submittedAt: new Date('2026-07-21'), requirementId: 'r2', roleTitle: 'Supply chain planning analyst', cleared: null, state: 'PLACED' as const },
    ],
  })

  it('is not described as two suppliers selling her, because both submissions already ended in a placement', () => {
    expect(merge(lucia(), NOW).says).not.toMatch(/suppliers are selling/)
  })

  it('does not call fourteen months of rate progression a price spread', () => {
    const m = merge(lucia(), NOW)
    expect(m.spread).toBeNull()
    expect(m.says).not.toMatch(/apart/)
  })

  it('still says the thing that actually matters — her time here, added up across both agencies', () => {
    // Thirteen months through Brightmoor and six weeks so far through
    // Pinnacle. Neither supplier can see the other's, and the client
    // can only see it here.
    expect(merge(lucia(), NOW).monthsHere).toBe(14)
    expect(merge(lucia(), NOW).says).toBe('14 months here, 4 left before your cap.')
  })

  it('does not count the rest of her live contract as time she has already served', () => {
    // Her Pinnacle contract runs to August 2027. On this screen it read
    // as twelve months already here, which added to Brightmoor's
    // thirteen made twenty-five and printed "past your cap" in clay —
    // about somebody with four months of room. A program manager
    // believes the alarming screen and calls the supplier.
    const m = merge(lucia(), NOW)
    expect(m.monthsHere).toBeLessThan(18)
    expect(m.headroomMonths).toBe(4)
    expect(m.says).not.toMatch(/past your cap/)
  })

  it('keeps both agencies on the row, because a client wants to know everybody who has represented her', () => {
    expect(merge(lucia(), NOW).vendorNames).toEqual(['Brightmoor Staffing', 'Pinnacle Resourcing'])
    expect(merge(lucia(), NOW).sellingNames).toEqual([])
  })

  it('and when two agencies really are selling her at once, it says so and compares their prices', () => {
    const now = lucia()
    now.offers[0] = { ...now.offers[0], state: 'SUBMITTED' as const }
    now.offers[1] = { ...now.offers[1], state: 'INTERVIEWING' as const }
    const m = merge(now, NOW)
    expect(m.says).toMatch(/2 suppliers are selling them right now/)
    expect(m.spread?.says).toMatch(/\$9 apart/)
    expect(m.vendors).toBe(2)
  })

  it('somebody on site with nothing outstanding is told plainly that nothing needs them', () => {
    const quiet = lucia()
    quiet.capMonths = null
    quiet.stints = []
    expect(merge(quiet, NOW).says).toBe('On site here. Nothing needs you.')
  })
})
