import { describe, it, expect } from 'vitest'
import {
  compare, ifConfirmed, worthAsking, summarise, normalName, normalPhone,
  SURFACE_AT, IGNORE_BELOW, type Candidate,
} from '@/lib/identity-resolution'

/**
 * A client and a bench vendor are both on Etyme; the prime between them
 * is not. So the tenure ledger — the one number this product sells on —
 * counts fourteen months and twelve months as two different people and
 * reports a confidently wrong answer. A wrong number is worse than none.
 *
 * And merging two different contractors is not a tidy-up gone wrong: one
 * gets blocked on a cap they never earned, the other gets paid at
 * somebody else's rate, and both find out late.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

function person(over: Partial<Candidate> = {}): Candidate {
  return {
    personId: 'p1',
    name: 'Rohan Menon',
    mobile: null,
    email: null,
    location: 'Dallas, TX',
    skills: ['Java', 'Spring Boot', 'AWS'],
    stints: [{ start: d('2024-01-01'), end: d('2025-03-01'), vendorName: 'Cloudepa', months: 14 }],
    ...over,
  }
}

describe('the only thing strong enough to link on its own', () => {
  it('links on a mobile number each of them gave us', () => {
    const m = compare(
      person({ mobile: '+1 (303) 555-2000' }),
      person({ personId: 'p2', mobile: '3035552000' })
    )
    expect(m.confidence).toBe('CERTAIN')
    expect(m.signals[0].says).toBe('Same mobile number, which each of them gave us themselves.')
  })

  it('matches a number with a country code against one without', () => {
    expect(normalPhone('+1 303 555 2000')).toBe('3035552000')
    expect(normalPhone('(303) 555-2000')).toBe('3035552000')
  })

  it('will not link on a number too short to be one', () => {
    expect(normalPhone('555-2000')).toBeNull()
  })
})

describe('what it refuses to consider at all', () => {
  it('never matches two differently named people, however much else lines up', () => {
    // Every other signal is circumstantial, and circumstantial evidence
    // about two differently named people is not evidence.
    const m = compare(
      person({ name: 'Rohan Menon' }),
      person({ personId: 'p2', name: 'Rohit Menon' })
    )
    expect(m.confidence).toBe('UNLIKELY')
    expect(m.says).toBe('Different names. Not the same person.')
  })

  it('reads O’Brien and OBrien as one name', () => {
    expect(normalName("O'Brien, Seán")).toBe('obrien sean')
    expect(normalName('OBrien Sean')).toBe('obrien sean')
  })
})

describe('the signal that argues the other way', () => {
  it('treats concurrent assignments as evidence they are two people', () => {
    // One human rarely holds two contracts at one client at the same
    // time through different suppliers, and treating that as a match is
    // how somebody gets blocked on a cap they never earned.
    const m = compare(
      person({ stints: [{ start: d('2024-01-01'), end: d('2025-01-01'), vendorName: 'Cloudepa', months: 12 }] }),
      person({
        personId: 'p2',
        stints: [{ start: d('2024-06-01'), end: d('2025-06-01'), vendorName: 'Vertex', months: 12 }],
      })
    )
    expect(m.signals.some((s) => s.weight < 0)).toBe(true)
    expect(m.signals.find((s) => s.weight < 0)!.says).toBe(
      'Their assignments here ran at the same time, through different suppliers.'
    )
    expect(m.confidence).not.toBe('LIKELY')
  })

  it('treats assignments that never overlapped as what one person looks like', () => {
    const m = compare(
      person(),
      person({
        personId: 'p2',
        stints: [{ start: d('2025-06-01'), end: d('2026-06-01'), vendorName: 'Vertex', months: 12 }],
      })
    )
    expect(m.confidence).toBe('LIKELY')
    expect(m.signals.some((s) => s.says.includes('never overlapped'))).toBe(true)
  })

  it('counts no shared skills against a match', () => {
    const m = compare(
      person(),
      person({ personId: 'p2', skills: ['Nursing', 'Phlebotomy'], stints: [] })
    )
    expect(m.signals.some((s) => s.says === 'No skills in common, which is odd for one person.')).toBe(true)
  })
})

describe('what a person is actually asked', () => {
  it('says what confirming would do to their tenure, which is the point', () => {
    // "These might be the same person" is a curiosity. "These might be
    // the same person and if so they are three months past your cap" is
    // a decision.
    const m = compare(
      person(),
      person({ personId: 'p2', stints: [{ start: d('2025-06-01'), end: d('2026-01-01'), vendorName: 'Vertex', months: 7 }] })
    )
    const v = ifConfirmed(m, 18)
    expect(v.months).toBe(21)
    expect(v.overCap).toBe(true)
    expect(v.says).toBe(
      'Confirming makes this 21 months here against a cap of 18 — they would be 3 months over, and could not be extended.'
    )
  })

  it('says how much room is left where there is some', () => {
    const m = compare(person(), person({ personId: 'p2', stints: [] }))
    expect(ifConfirmed(m, 18).says).toBe('Confirming makes this 14 months here, 4 short of your cap.')
  })

  it('does not invent a cap where the client has none', () => {
    const m = compare(person(), person({ personId: 'p2', stints: [] }))
    expect(ifConfirmed(m, null).says).toBe('Confirming makes this 14 months here.')
  })

  it('names the suppliers, because that is how somebody recognises the story', () => {
    const m = compare(
      person(),
      person({ personId: 'p2', stints: [{ start: d('2025-06-01'), end: d('2026-01-01'), vendorName: 'Vertex', months: 7 }] })
    )
    expect(m.says).toContain('through Cloudepa and Vertex')
  })
})

describe('which ones get a person’s time', () => {
  it('puts the ones that would breach a cap first', () => {
    const under = compare(person(), person({ personId: 'p2', stints: [] }))
    const over = compare(
      person({ personId: 'p3' }),
      person({ personId: 'p4', stints: [{ start: d('2025-06-01'), end: d('2026-06-01'), vendorName: 'Vertex', months: 12 }] })
    )
    const out = worthAsking([under, over], 18)
    expect(out[0].monthsIfSame).toBe(26)
  })

  it('keeps noise off the list entirely', () => {
    expect(IGNORE_BELOW).toBe(25)
    expect(SURFACE_AT).toBe(40)
    const weak = compare(
      person({ skills: [], stints: [] }),
      person({ personId: 'p2', location: 'Austin, TX', skills: [], stints: [] })
    )
    expect(worthAsking([weak], 18)).toHaveLength(0)
  })
})

describe('the line above the queue', () => {
  it('names the consequence, not the count', () => {
    // Nobody works a list of "possible duplicates". Somebody will work a
    // list of people who might be past a tenure cap.
    const certain = compare(
      person({ mobile: '3035552000' }),
      person({ personId: 'p2', mobile: '3035552000', stints: [{ start: d('2025-06-01'), end: d('2026-06-01'), vendorName: 'Vertex', months: 12 }] })
    )
    expect(summarise([certain], 18)).toBe(
      '1 certain. 1 of them would be past your tenure cap if confirmed.'
    )
  })

  it('says so plainly when there is nothing', () => {
    expect(summarise([], 18)).toBe('Nobody looks like a duplicate.')
  })
})
