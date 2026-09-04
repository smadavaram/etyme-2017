import { describe, it, expect } from 'vitest'
import {
  sameSeat, normaliseTitle, normaliseLocation, bestRoute, holdKeyFor,
  type Lead,
} from '@/lib/openings'

/**
 * The demand a sub-vendor works does not arrive as a requisition. It
 * arrives as an advert on Dice, posted by a prime hiding the client so
 * their NDA holds — and the same seat is posted by three other primes the
 * same morning with the title reworded and the rate shaved.
 *
 * Collapsing those back into one seat is the whole demand side. Without it
 * you submit one consultant to the same client three times and the client
 * rejects all three.
 */

const MONDAY = new Date('2026-08-17T09:00:00Z')
const later = (days: number) => new Date(MONDAY.getTime() + days * 86_400_000)

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    source: 'DICE',
    postedBy: 'Vertex Global',
    title: 'SAP FICO Consultant',
    skills: ['SAP FICO', 'S/4HANA'],
    location: 'Denver, CO',
    rateCents: 6500,
    seenAt: MONDAY,
    ...over,
  }
}

describe('reading a title past the shouting', () => {
  it('strips what a prime added to stand out', () => {
    expect(normaliseTitle('URGENT!! Sr. SAP FICO Consultant - Immediate Need')).toBe('sap fico')
  })

  it('reads two adverts for one job as the same job', () => {
    expect(normaliseTitle('Senior SAP FICO Analyst')).toBe(normaliseTitle('SAP FICO Consultant'))
  })

  it('keeps what actually distinguishes a role', () => {
    expect(normaliseTitle('SAP MM Consultant')).not.toBe(normaliseTitle('SAP FICO Consultant'))
  })

  it('survives punctuation and slashes', () => {
    expect(normaliseTitle('SAP SD/MM Functional Lead')).toContain('sap sd/mm')
  })
})

describe('reading a place', () => {
  it('reads a city past the working arrangement', () => {
    expect(normaliseLocation('Denver, CO (Hybrid)')).toBe('denver')
    expect(normaliseLocation('Denver CO')).toBe('denver')
  })

  it('treats remote as its own place', () => {
    expect(normaliseLocation('Remote — must sit EST')).toBe('remote')
  })

  it('says nothing when the advert says nothing', () => {
    expect(normaliseLocation(null)).toBeNull()
  })
})

describe('two adverts, one seat', () => {
  it('collapses the same seat posted by two primes', () => {
    // The thing that burns candidates: three primes, one client seat.
    const v = sameSeat(
      lead(),
      lead({ id: 'l2', postedBy: 'Halcyon Partners', title: 'Sr. SAP FICO Analyst (Hybrid)', rateCents: 6200 })
    )
    expect(v.strength).toBe('SAME')
    expect(v.because.join(' ')).toMatch(/sap fico/)
  })

  it('collapses the same prime re-advertising', () => {
    const v = sameSeat(lead(), lead({ id: 'l2', seenAt: later(5) }))
    expect(v.strength).toBe('SAME')
    expect(v.because.join(' ')).toMatch(/Vertex Global posted both/)
  })

  it('keeps two different roles apart', () => {
    const v = sameSeat(lead(), lead({ id: 'l2', title: 'Workday Integrations Analyst', skills: ['Workday'] }))
    expect(v.strength).toBe('UNRELATED')
  })

  it('keeps the same role in two cities apart', () => {
    // Two seats, and merging them would make the second invisible.
    const v = sameSeat(lead(), lead({ id: 'l2', postedBy: 'Halcyon Partners', location: 'Austin, TX' }))
    expect(v.strength).not.toBe('SAME')
  })

  it('will not merge adverts a month apart', () => {
    const v = sameSeat(lead(), lead({ id: 'l2', seenAt: later(40) }))
    expect(v.strength).toBe('UNRELATED')
    expect(v.because[0]).toMatch(/beyond the 21-day window/)
  })

  it('offers a likely match for a human rather than merging it', () => {
    // CLAUDE.md's rule for people, applied to seats: deterministic merges,
    // probabilistic suggestions, nothing silent.
    const v = sameSeat(
      lead(),
      lead({ id: 'l2', postedBy: 'Halcyon Partners', title: 'FICO / COPA Specialist', skills: ['SAP FICO'] })
    )
    expect(v.strength).toBe('LIKELY')
  })

  it('shows its working, so a recruiter can disagree with it', () => {
    const v = sameSeat(lead(), lead({ id: 'l2', postedBy: 'Halcyon Partners' }))
    expect(v.because.length).toBeGreaterThan(1)
  })

  it('says what it could not see', () => {
    const v = sameSeat(lead({ rateCents: null }), lead({ id: 'l2', postedBy: 'Halcyon Partners' }))
    expect(v.unknowns.join(' ')).toMatch(/posts no rate/)
  })

  it('is not fooled by a prime shaving the posted rate', () => {
    const v = sameSeat(lead({ rateCents: 6500 }), lead({ id: 'l2', postedBy: 'Halcyon', rateCents: 5800 }))
    expect(v.strength).toBe('SAME')
  })
})

describe('which route to take to a seat', () => {
  const known = [
    { postedBy: 'Vertex Global', msaOnFile: true, paysInDays: 30 },
    { postedBy: 'Halcyon Partners', msaOnFile: false, paysInDays: 90 },
  ]

  it('prefers the prime you already have paper with', () => {
    // The alternative is starting a placement with no agreement, which is
    // how a vendor works six weeks for nothing.
    const r = bestRoute(
      [lead({ postedBy: 'Halcyon Partners', rateCents: 7500 }), lead({ id: 'l2', postedBy: 'Vertex Global', rateCents: 6500 })],
      known
    )
    expect(r!.lead.postedBy).toBe('Vertex Global')
    expect(r!.because).toMatch(/already have an agreement/)
  })

  it('prefers a direct approach over a board, where neither has paper', () => {
    const r = bestRoute(
      [lead({ postedBy: 'Halcyon Partners' }), lead({ id: 'l2', source: 'DIRECT', postedBy: 'A manager you know', rateCents: 6500 })],
      known
    )
    expect(r!.lead.source).toBe('DIRECT')
  })

  it('still prefers paper over a direct approach with none', () => {
    // Tested because it is the counter-intuitive one. A direct relationship
    // is worth more commercially and less operationally: starting without an
    // agreement is how a vendor works six weeks for nothing.
    const r = bestRoute(
      [lead({ postedBy: 'Vertex Global' }), lead({ id: 'l2', source: 'DIRECT', postedBy: 'A manager you know', rateCents: 6500 })],
      known
    )
    expect(r!.lead.postedBy).toBe('Vertex Global')
  })

  it('says why it chose, rather than just choosing', () => {
    const r = bestRoute([lead()], known)
    expect(r!.because.length).toBeGreaterThan(0)
  })

  it('admits when there is nothing to choose between them', () => {
    const r = bestRoute([lead({ postedBy: 'Nobody', rateCents: null })], [])
    expect(r!.because).toMatch(/nothing to choose/)
  })

  it('returns nothing when there is nothing', () => {
    expect(bestRoute([], known)).toBeNull()
  })
})

describe('holding somebody on a blind role', () => {
  it('keys the hold to the seat when nobody knows the client', () => {
    // Without this a blind role cannot be held at all — and blind is most
    // of them, which means the hold protects nobody on the roles where it
    // matters most.
    expect(holdKeyFor({ clientCompanyId: null, id: 'op1' })).toBe('opening:op1')
  })

  it('keys it to the client once the name is known', () => {
    // So a seat that turns out to be Terumo joins every other Terumo hold
    // rather than living in its own world.
    expect(holdKeyFor({ clientCompanyId: 'terumo', id: 'op1' })).toBe('terumo')
  })
})
