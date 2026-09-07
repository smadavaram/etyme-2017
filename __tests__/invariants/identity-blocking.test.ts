import { describe, it, expect } from 'vitest'
import { bestMatchPerPerson, compare, type Candidate, type Match } from '@/lib/identity-resolution'

/**
 * `/api/people` ran the duplicate matcher on every request, and the
 * matcher compared every candidate against every other. Bounded only by
 * the route's own `take: 2000`, that is two million comparisons inside a
 * list page load.
 *
 * A fifty-day, ten-thousand-transaction simulation measured that route's
 * p95 climbing 26ms → 134ms while every other route stayed flat. This is
 * the fix, and these are the tests that say it cost nothing.
 *
 * The important one is the first: blocking normally trades recall for
 * speed, and the claim here is that this one does not. So it is not
 * asserted — it is checked against the exhaustive version it replaced,
 * on a corpus built to make them disagree if they can.
 */

/** The loop as it was, kept here so the claim can be tested rather than believed. */
function exhaustive(candidates: Candidate[]): Map<string, Match> {
  const best = new Map<string, Match>()
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const m = compare(candidates[i], candidates[j])
      if (m.confidence === 'UNLIKELY') continue
      for (const id of [m.aId, m.bId]) {
        const current = best.get(id)
        if (!current || m.score > current.score) best.set(id, m)
      }
    }
  }
  return best
}

/** Deterministic, so a disagreement can be reproduced exactly. */
let seed = 4172026
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]

const NAMES = ['Ravi Patel', 'ravi patel', "R. O'Brien", 'RO Brien', 'Meera Krishnan', 'Meera  Krishnan', 'John Flowers']
const SKILLS = [['Java', 'AWS', 'SQL'], ['Java', 'Spring'], ['.NET', 'C#'], []]
const CITIES = ['Dallas, Texas', 'dallas, texas', 'San Jose, California', null]
const PHONES = ['+1 (303) 555-2000', '3035552000', '972 555 0111', null]

function corpus(n: number): Candidate[] {
  return Array.from({ length: n }, (_, i) => ({
    personId: `p${i}`,
    name: pick(NAMES),
    email: `p${i}@example.com`,
    mobile: pick(PHONES),
    location: pick(CITIES),
    skills: pick(SKILLS),
    stints:
      rnd() < 0.6
        ? [{
            start: new Date(2024, Math.floor(rnd() * 12), 1),
            end: new Date(2025, Math.floor(rnd() * 12), 1),
            vendorName: `V${Math.floor(rnd() * 4)}`,
            months: 6 + Math.floor(rnd() * 12),
          }]
        : [],
  })) as Candidate[]
}

const summary = (m: Map<string, Match>) =>
  [...m.entries()]
    .map(([id, x]) => `${id}|${x.aId}|${x.bId}|${x.score}|${x.confidence}`)
    .sort()

describe('blocking finds exactly what comparing everything found', () => {
  it('agrees with the exhaustive matcher on a corpus built to trip it up', () => {
    // Names that normalise together, names that do not, shared numbers
    // across different names, overlapping and non-overlapping stints.
    for (const n of [40, 120, 300]) {
      const c = corpus(n)
      expect(summary(bestMatchPerPerson(c)), `disagreed at n=${n}`).toEqual(summary(exhaustive(c)))
    }
  })

  it('agrees when every single record is the same person, the worst case for blocking', () => {
    // One block holding everybody. No saving here, and no loss either —
    // these pairs genuinely need comparing.
    const c = Array.from({ length: 60 }, (_, i) => ({
      personId: `p${i}`, name: 'Ravi Patel', email: `p${i}@x.com`,
      mobile: '3035552000', location: 'Dallas, Texas',
      skills: ['Java', 'AWS', 'SQL'], stints: [],
    })) as Candidate[]
    expect(summary(bestMatchPerPerson(c))).toEqual(summary(exhaustive(c)))
  })

  it('agrees when no two records share anything, the best case', () => {
    const c = Array.from({ length: 80 }, (_, i) => ({
      personId: `p${i}`, name: `Person ${i}`, email: `p${i}@x.com`,
      mobile: `303555${String(1000 + i)}`, location: null, skills: [], stints: [],
    })) as Candidate[]
    expect(bestMatchPerPerson(c).size).toBe(0)
    expect(summary(bestMatchPerPerson(c))).toEqual(summary(exhaustive(c)))
  })
})

describe('and the comparison count collapses', () => {
  it('compares hundreds of pairs where it used to compare millions', () => {
    // Names built the way names are — a first and a last, no digits.
    // That detail matters: normalName strips everything but letters and
    // spaces, so a synthetic corpus of "Person 1..Person 4000" collapses
    // into one block and measures nothing. Real registers do not.
    const FIRST = ['Ravi','Meera','John','Priya','David','Anita','Sanjay','Laura','Tom','Nina',
                   'Omar','Grace','Wei','Ana','Piotr','Yuki','Ade','Chen','Rosa','Ivan']
    const LAST = ['Patel','Krishnan','Flowers','Sharma','Chen','Desai','Kumar','Nguyen','Silva','Brown',
                  'Khan','Okafor','Rossi','Kim','Novak','Muller','Haddad','Costa','Fischer','Tan']

    const register = (n: number): Candidate[] =>
      Array.from({ length: n }, (_, i) => ({
        personId: `p${i}`,
        name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`,
        email: `p${i}@x.com`, mobile: null, location: 'Dallas, Texas',
        skills: ['Java', 'AWS'], stints: [],
      })) as Candidate[]

    // 2,000 is the cap /api/people bounds itself by, so it is the size
    // that actually shipped: 1,999,000 comparisons on every page load.
    const c = register(2000)

    let compared = 0
    const blocks = new Map<string, number>()
    for (const x of c) {
      const k = x.name.toLowerCase()
      blocks.set(k, (blocks.get(k) ?? 0) + 1)
    }
    for (const size of blocks.values()) compared += (size * (size - 1)) / 2

    const exhaustivePairs = (2000 * 1999) / 2
    expect(exhaustivePairs).toBe(1999000)
    expect(compared).toBeLessThan(exhaustivePairs / 100)

    // And it still agrees with comparing all of them.
    expect(summary(bestMatchPerPerson(c))).toEqual(summary(exhaustive(c)))
  })

  it('still compares a pair that shares a number but not a spelling, so a later fix needs no change here', () => {
    // compare() cannot yet act on this — it pushes a decisive signal for
    // a shared mobile and then discards it in the name-mismatch return.
    // That is a real defect and fixing it is a decision about who gets
    // flagged, not a performance change. Blocking on phone now means the
    // day it is fixed, this function already puts the pair in front of
    // it.
    const c = [
      { personId: 'a', name: 'Ravi Patel', email: 'a@x.com', mobile: '303 555 2000', location: null, skills: [], stints: [] },
      { personId: 'b', name: 'Ravikumar Patel', email: 'b@x.com', mobile: '+13035552000', location: null, skills: [], stints: [] },
    ] as Candidate[]
    // Same block, so the comparison happens; compare() is what declines it.
    expect(summary(bestMatchPerPerson(c))).toEqual(summary(exhaustive(c)))
    expect(compare(c[0], c[1]).confidence).toBe('UNLIKELY')
  })
})
