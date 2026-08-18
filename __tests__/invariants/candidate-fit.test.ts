/**
 * How well a submitted candidate fits the requisition they were put
 * forward for.
 *
 * CLAUDE.md: "Match scores always carry factors, basis, confidence and
 * unknowns. A bare number is a bug."
 *
 * The failure this guards against is not a wrong score. It is a confident
 * one. A tidy 88 built on two known facts and three guesses reads exactly
 * like an 88 built on five, and a client choosing between five people
 * cannot tell the difference — so confidence is derived from what is known,
 * never from what was scored.
 */

import { describe, it, expect } from 'vitest'
import { assessFit, type FitInput } from '@/lib/candidate-fit'

const NEEDED = new Date('2026-10-01T00:00:00Z')

function input(over: Partial<FitInput> = {}): FitInput {
  return {
    required: {
      skills: ['SAP MM', 'S/4HANA'],
      location: 'Lakewood, CO',
      ceilingCents: 13_000,
      neededBy: NEEDED,
    },
    candidate: {
      skills: ['SAP MM', 'S/4HANA'],
      headline: 'SAP MM Consultant',
      location: 'Lakewood, CO',
      availableFrom: new Date('2026-09-15T00:00:00Z'),
    },
    submittedRateCents: 11_000,
    ...over,
  }
}

const factor = (a: ReturnType<typeof assessFit>, label: string) =>
  a.factors.find(f => f.label === label)!

// ── The shape CLAUDE.md demands ────────────────────────────

describe('Every score carries its reasoning', () => {

  it('a score always comes with factors, basis and a confidence', () => {
    const a = assessFit(input())
    expect(a.factors.length).toBeGreaterThan(0)
    expect(a.basis.length).toBeGreaterThan(0)
    expect(['HIGH', 'MODERATE', 'LOW']).toContain(a.confidence)
  })

  it('every factor explains itself in words, not just a number', () => {
    const a = assessFit(input())
    expect(a.factors.every(f => f.detail.length > 0)).toBe(true)
  })

  it('all four dimensions are always reported, so none is silently skipped', () => {
    const a = assessFit(input())
    expect(a.factors.map(f => f.label).sort())
      .toEqual(['Availability', 'Location', 'Rate', 'Skills'])
  })
})

// ── Skills ─────────────────────────────────────────────────

describe('Skills are matched, and gaps are named', () => {

  it('a candidate with every skill asked for scores full marks on skills', () => {
    expect(factor(assessFit(input()), 'Skills').value).toBe(100)
  })

  it('half the skills scores half, and says which are missing', () => {
    const a = assessFit(input({
      candidate: { ...input().candidate, skills: ['SAP MM'] },
    }))
    expect(factor(a, 'Skills').value).toBe(50)
    expect(factor(a, 'Skills').detail).toContain('missing S/4HANA')
  })

  it('none of the required skills says so plainly', () => {
    const a = assessFit(input({
      candidate: { ...input().candidate, skills: ['Workday', 'Payroll'] },
    }))
    expect(factor(a, 'Skills').value).toBe(0)
    expect(factor(a, 'Skills').detail).toContain('None of SAP MM, S/4HANA')
  })
})

// ── The honest part ────────────────────────────────────────

describe('What it cannot judge, it says rather than guesses', () => {

  it('a candidate with no skills listed is flagged as probably unfair to them', () => {
    // Scoring them zero is defensible; pretending that is a confident zero
    // is not.
    const a = assessFit(input({
      candidate: { ...input().candidate, skills: [] },
    }))
    expect(a.unknowns).toContain('unfair to them')
    expect(a.confidence).not.toBe('HIGH')
  })

  it('related-but-different experience is raised as a question, not scored', () => {
    // "React Native" against "React" shares a distinguishing token.
    const a = assessFit(input({
      required: { ...input().required, skills: ['React'] },
      candidate: { ...input().candidate, skills: ['React Native'] },
    }))
    expect(a.unknowns).toContain('whether related experience transfers')
    expect(factor(a, 'Skills').value).toBe(0)
  })

  it('a shared filler word is not treated as adjacency', () => {
    // "SAP MM" and "SAP BRIM" share only "sap", which distinguishes
    // nothing — claiming adjacency there would be noise.
    const a = assessFit(input({
      required: { ...input().required, skills: ['SAP MM'] },
      candidate: { ...input().candidate, skills: ['SAP BRIM'] },
    }))
    expect(a.unknowns ?? '').not.toContain('whether related experience transfers')
  })

  it('an unknown location is admitted rather than assumed', () => {
    const a = assessFit(input({
      candidate: { ...input().candidate, location: null },
    }))
    expect(a.unknowns).toContain('where this candidate is based')
  })

  it('an unknown start date is admitted', () => {
    const a = assessFit(input({
      candidate: { ...input().candidate, availableFrom: null },
    }))
    expect(a.unknowns).toContain('when this candidate can start')
  })

  it('a complete profile has nothing to admit', () => {
    expect(assessFit(input()).unknowns).toBeNull()
  })
})

// ── Confidence follows knowledge, not the score ────────────

describe('Confidence reflects what is known, never how good the score looks', () => {

  it('a complete profile scores with high confidence', () => {
    expect(assessFit(input()).confidence).toBe('HIGH')
  })

  it('one gap drops confidence to moderate', () => {
    const a = assessFit(input({ candidate: { ...input().candidate, location: null } }))
    expect(a.confidence).toBe('MODERATE')
  })

  it('three gaps drop it to low, however high the score', () => {
    const a = assessFit(input({
      required: { skills: [], location: 'Lakewood, CO', ceilingCents: 13_000, neededBy: NEEDED },
      candidate: { skills: [], headline: null, location: null, availableFrom: null },
    }))
    expect(a.confidence).toBe('LOW')
  })

  it('a high score built on guesses is never reported as high confidence', () => {
    const a = assessFit(input({
      required: { skills: [], location: null, ceilingCents: null, neededBy: null },
      candidate: { skills: [], headline: null, location: null, availableFrom: null },
    }))
    expect(a.score).toBeGreaterThan(60)
    expect(a.confidence).not.toBe('HIGH')
  })
})

// ── Rate ───────────────────────────────────────────────────

describe('Rate is scored against the ceiling, without rewarding the cheapest', () => {

  it('a rate under the ceiling scores well', () => {
    expect(factor(assessFit(input({ submittedRateCents: 11_000 })), 'Rate').value)
      .toBeGreaterThanOrEqual(80)
  })

  it('a rate over the ceiling is penalised, and says so', () => {
    const a = assessFit(input({ submittedRateCents: 15_000 }))
    expect(factor(a, 'Rate').value).toBeLessThan(50)
    expect(factor(a, 'Rate').detail).toContain('over the $130/hr ceiling')
  })

  it('half the ceiling does not score twice as well as just under it', () => {
    // Cheapest is not best. A candidate at a suspiciously low rate should
    // not out-rank a well-priced one on this dimension alone.
    const cheap = factor(assessFit(input({ submittedRateCents: 6_500 })), 'Rate').value
    const fair = factor(assessFit(input({ submittedRateCents: 12_500 })), 'Rate').value
    expect(cheap - fair).toBeLessThan(25)
  })
})

// ── Location and availability ──────────────────────────────

describe('Location and availability are graded, not pass-or-fail', () => {

  it('the same city is a full match', () => {
    expect(factor(assessFit(input()), 'Location').value).toBe(100)
  })

  it('remote on either side matches anywhere', () => {
    const a = assessFit(input({ required: { ...input().required, location: 'Remote' } }))
    expect(factor(a, 'Location').value).toBe(100)
  })

  it('a different city in the same state is a commute, not a rejection', () => {
    const a = assessFit(input({
      candidate: { ...input().candidate, location: 'Denver, CO' },
    }))
    expect(factor(a, 'Location').value).toBe(70)
  })

  it('a different state scores low but is not disqualifying', () => {
    const a = assessFit(input({
      candidate: { ...input().candidate, location: 'Austin, TX' },
    }))
    expect(factor(a, 'Location').value).toBe(25)
    expect(a.score).toBeGreaterThan(0)
  })

  it('starting after the date you need them is scored by how late', () => {
    const soon = assessFit(input({
      candidate: { ...input().candidate, availableFrom: new Date('2026-10-08T00:00:00Z') },
    }))
    const late = assessFit(input({
      candidate: { ...input().candidate, availableFrom: new Date('2026-11-15T00:00:00Z') },
    }))
    expect(factor(soon, 'Availability').value).toBeGreaterThan(factor(late, 'Availability').value)
    expect(factor(late, 'Availability').detail).toContain('days after you need them')
  })
})

// ── Caught by looking at real output ───────────────────────

describe('Crossing the stated ceiling is a step, not a slope', () => {

  it('a rate just over the ceiling scores well below one just under', () => {
    // The bug this pins: $136 against a $130 ceiling once scored 82, while
    // $112 under the same ceiling scored 86 — a client scanning the column
    // could not see that one of them broke a number they had stated.
    const under = assessFit(input({ submittedRateCents: 12_900 }))
    const over = assessFit(input({ submittedRateCents: 13_100 }))
    expect(factor(under, 'Rate').value - factor(over, 'Rate').value).toBeGreaterThan(20)
  })

  it('a small overage is still clearly penalised', () => {
    const a = assessFit(input({ submittedRateCents: 13_600 }))
    expect(factor(a, 'Rate').value).toBeLessThan(60)
  })

  it('a large overage falls further than a small one', () => {
    const small = factor(assessFit(input({ submittedRateCents: 13_600 })), 'Rate').value
    const large = factor(assessFit(input({ submittedRateCents: 18_000 })), 'Rate').value
    expect(large).toBeLessThan(small)
  })

  it('exactly at the ceiling is still inside it', () => {
    const a = assessFit(input({ submittedRateCents: 13_000 }))
    expect(factor(a, 'Rate').value).toBeGreaterThanOrEqual(80)
    expect(factor(a, 'Rate').detail).not.toContain('over the')
  })
})
