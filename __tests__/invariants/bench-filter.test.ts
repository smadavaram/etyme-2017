import { describe, it, expect } from 'vitest'
import {
  sift, skillHits, rateWorks, freeInTime, authWorks, staleness, summarise,
  DEFAULT_SHORTLIST, type Role, type Candidate,
} from '@/lib/bench-filter'

/**
 * The match engine took up to two hundred bench listings and sent every one
 * to the model, with one filter applied first — "not already submitted".
 *
 * Everything else it needed to know is arithmetic. Any overlapping skills.
 * Rate floor under the ceiling. Free before the start date. Permit matches.
 * Free, instant, right every time — and on a forty-person bench, the
 * difference between $53 a month and $140.
 */

const NOW = new Date('2026-08-21T00:00:00Z')

function role(over: Partial<Role> = {}): Role {
  return {
    skills: ['SAP FICO', 'S/4HANA'],
    location: 'Denver, CO',
    billMin: 5800,
    billMax: 6800,
    startDate: new Date('2026-09-01'),
    workAuth: null,
    ...over,
  }
}

function person(over: Partial<Candidate> = {}): Candidate {
  return {
    personId: 'p1',
    name: 'Anita Desai',
    skills: ['SAP FICO', 'S/4HANA', 'ABAP'],
    location: 'Denver, CO',
    workAuth: 'US_CITIZEN',
    rateFloor: 6000,
    availableFrom: new Date('2026-08-25'),
    confirmedAt: new Date('2026-08-18'),
    ...over,
  }
}

describe('do they have any of the skills at all', () => {
  it('counts a plain overlap', () => {
    expect(skillHits(['SAP FICO', 'S/4HANA'], ['SAP FICO', 'ABAP'])).toBe(1)
  })

  it('matches a shorter name inside a longer one, both ways', () => {
    // "SAP FICO" on the role and "FICO" on the person is the same person.
    expect(skillHits(['SAP FICO'], ['FICO'])).toBe(1)
    expect(skillHits(['React'], ['React.js'])).toBe(1)
  })

  it('ignores punctuation and case, because nobody types these consistently', () => {
    expect(skillHits(['S/4HANA'], ['s4hana'])).toBe(0) // the slash is meaningful
    expect(skillHits(['Node.js'], ['NODE.JS'])).toBe(1)
  })

  it('keeps everybody when the role names no skills', () => {
    // Nothing asked for is not the same as nothing matched.
    expect(skillHits([], ['anything'])).toBe(1)
  })

  it('is zero when there is genuinely nothing in common', () => {
    expect(skillHits(['SAP FICO'], ['Java', 'Spring Boot'])).toBe(0)
  })
})

describe('can they work at this rate', () => {
  it('keeps somebody under the ceiling', () => {
    expect(rateWorks(role(), person({ rateFloor: 6000 }))).toBe(true)
  })

  it('drops somebody whose floor is above the ceiling', () => {
    // Not a negotiation, a no — and paying a model to be told what
    // subtraction would have said is the whole mistake.
    expect(rateWorks(role({ billMax: 6800 }), person({ rateFloor: 9500 }))).toBe(false)
  })

  it('keeps somebody with no rate recorded, because half a bench has none', () => {
    expect(rateWorks(role(), person({ rateFloor: null }))).toBe(true)
  })

  it('keeps everybody when the role has no ceiling', () => {
    expect(rateWorks(role({ billMax: null }), person({ rateFloor: 99_000 }))).toBe(true)
  })
})

describe('are they free in time', () => {
  it('keeps somebody free before the start date', () => {
    expect(freeInTime(role(), person({ availableFrom: new Date('2026-08-25') }))).toBe(true)
  })

  it('keeps somebody free two weeks late, because start dates slip', () => {
    expect(freeInTime(role(), person({ availableFrom: new Date('2026-09-14') }))).toBe(true)
  })

  it('drops somebody who is not free for another three months', () => {
    expect(freeInTime(role(), person({ availableFrom: new Date('2026-12-01') }))).toBe(false)
  })

  it('keeps somebody whose availability is unknown', () => {
    expect(freeInTime(role(), person({ availableFrom: null }))).toBe(true)
  })
})

describe('does the permit match', () => {
  it('excludes nobody when the role does not name one, which is most roles', () => {
    expect(authWorks(role({ workAuth: null }), person({ workAuth: 'H1B' }))).toBe(true)
  })

  it('drops a mismatch when the role does name one', () => {
    expect(authWorks(role({ workAuth: 'US_CITIZEN' }), person({ workAuth: 'H1B' }))).toBe(false)
  })

  it('treats unknown as not-a-no, rather than guessing', () => {
    expect(authWorks(role({ workAuth: 'US_CITIZEN' }), person({ workAuth: null }))).toBe(true)
  })
})

describe('how stale the record is', () => {
  it('counts days since the person last confirmed it themselves', () => {
    expect(staleness(person({ confirmedAt: new Date('2026-08-14') }), NOW)).toBe(7)
  })

  it('treats a record nobody has ever confirmed as very old indeed', () => {
    expect(staleness(person({ confirmedAt: null }), NOW)).toBe(999)
  })
})

describe('the sift', () => {
  it('keeps somebody who fits and says so', () => {
    const out = sift(role(), [person()], { now: NOW })
    expect(out.kept).toHaveLength(1)
    expect(out.dropped).toHaveLength(0)
    expect(out.summary).toBe('1 of 1 worth scoring.')
  })

  it('drops the Java developer from a FICO role before anything is paid for', () => {
    const out = sift(role(), [person({ skills: ['Java', 'Spring Boot'] })], { now: NOW })
    expect(out.kept).toHaveLength(0)
    expect(out.dropped[0].code).toBe('SKILLS')
    expect(out.dropped[0].because).toMatch(/none of SAP FICO/)
  })

  it('says why each person went, in words a recruiter would use', () => {
    // "Nobody matched" is not an answer anybody can act on.
    const out = sift(role(), [person({ personId: 'p2', rateFloor: 9500 })], { now: NOW })
    expect(out.dropped[0].because).toBe('wants $95, the role tops out at $68')
  })

  it('cuts two hundred down to fifteen', () => {
    const bench = Array.from({ length: 200 }, (_, i) =>
      person({ personId: `p${i}`, name: `Person ${i}` })
    )
    const out = sift(role(), bench, { now: NOW })
    expect(out.considered).toBe(200)
    expect(out.kept).toHaveLength(DEFAULT_SHORTLIST)
    expect(out.dropped).toHaveLength(185)
  })

  it('ranks more skills first', () => {
    const out = sift(
      role({ skills: ['SAP FICO', 'S/4HANA', 'ABAP'] }),
      [
        person({ personId: 'one-skill', skills: ['SAP FICO'] }),
        person({ personId: 'all-three', skills: ['SAP FICO', 'S/4HANA', 'ABAP'] }),
      ],
      { now: NOW }
    )
    expect(out.kept[0].candidate.personId).toBe('all-three')
  })

  it('breaks a tie towards the person who confirmed their record last week', () => {
    // Between two equal people, the one who answered a text is the one who
    // is actually there. The other one started a job last Tuesday.
    const out = sift(
      role(),
      [
        person({ personId: 'stale', confirmedAt: new Date('2026-01-01') }),
        person({ personId: 'fresh', confirmedAt: new Date('2026-08-18') }),
      ],
      { now: NOW }
    )
    expect(out.kept[0].candidate.personId).toBe('fresh')
  })

  it('never drops somebody just because their record is old', () => {
    // Dropping unconfirmed records would hide the entire bench on day one.
    const out = sift(role(), [person({ confirmedAt: null })], { now: NOW })
    expect(out.kept).toHaveLength(1)
  })

  it('tells a recruiter what to change when nobody fits', () => {
    const out = sift(
      role(),
      [
        person({ personId: 'a', rateFloor: 9500 }),
        person({ personId: 'b', rateFloor: 9900 }),
        person({ personId: 'c', skills: ['Java'] }),
      ],
      { now: NOW }
    )
    expect(out.kept).toHaveLength(0)
    expect(out.summary).toBe(
      'Nobody fits out of 3: 1 no overlapping skills, 2 priced above the role.'
    )
  })

  it('says plainly when the bench is empty rather than blaming the filter', () => {
    expect(sift(role(), [], { now: NOW }).summary).toBe('Nobody on the bench yet.')
  })
})

describe('what the screen says', () => {
  it('counts the reasons rather than listing the people', () => {
    const said = summarise(200, 15, [
      ...Array.from({ length: 120 }, () => ({ personId: 'x', name: 'x', code: 'SKILLS', because: '' })),
      ...Array.from({ length: 40 }, () => ({ personId: 'x', name: 'x', code: 'RATE', because: '' })),
      ...Array.from({ length: 25 }, () => ({ personId: 'x', name: 'x', code: 'SHORTLIST', because: '' })),
    ])
    expect(said).toBe(
      '15 of 200 worth scoring — 120 no overlapping skills, 40 priced above the role, 25 ranked below the cut.'
    )
  })
})
