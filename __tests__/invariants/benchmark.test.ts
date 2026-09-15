import { describe, it, expect } from 'vitest'
import {
  band, warnAbout, percentile, relevant, forTheConsultant,
  ENOUGH, WINDOW_DAYS, type Observation,
} from '@/lib/benchmark'

/**
 * The outcome loop is the slow one — weeks, not minutes — and it is the
 * one that makes the product get better instead of staying still.
 *
 * It was captured and it did not turn. Rejection reasons went into the
 * database and nothing read them back. This is the arrow from OUTCOME to
 * TRIAGE: rate is the commonest reason a submission dies, and it is the
 * one reason knowable in advance, because we watched fourteen other people
 * get rejected above $120 at the same client.
 */

const NOW = new Date('2026-08-21T00:00:00Z')

function obs(over: Partial<Observation> = {}): Observation {
  return {
    rateCents: 12000,
    survived: true,
    skills: ['SAP FICO'],
    location: 'Denver, CO',
    at: new Date('2026-08-01'),
    ...over,
  }
}

const FICO = { skills: ['SAP FICO'], location: 'Denver, CO' }

describe('percentiles', () => {
  it('takes a real rate somebody was actually paid, not an interpolated one', () => {
    // An interpolated percentile invents a rate nobody ever got, and this
    // is a number somebody is about to quote to a client.
    const rates = [10000, 11000, 12000, 13000, 14000]
    expect(rates).toContain(percentile(rates, 50))
    expect(percentile(rates, 50)).toBe(12000)
  })

  it('does not fall off the end', () => {
    expect(percentile([10000], 75)).toBe(10000)
    expect(percentile([], 50)).toBe(0)
  })
})

describe('which submissions count towards a question', () => {
  it('matches on any overlapping skill', () => {
    expect(relevant(obs({ skills: ['SAP FICO', 'ABAP'] }), FICO)).toBe(true)
  })

  it('matches a shorter skill name inside a longer one', () => {
    expect(relevant(obs({ skills: ['FICO'] }), FICO)).toBe(true)
  })

  it('ignores unrelated work', () => {
    expect(relevant(obs({ skills: ['Java'] }), FICO)).toBe(false)
  })

  it('treats "Denver, CO (Hybrid)" and "Denver CO" as the same market', () => {
    expect(relevant(obs({ location: 'Denver, CO (Hybrid)' }), FICO)).toBe(true)
  })

  it('keeps remote as its own market', () => {
    // A remote rate and a Denver rate are different numbers, and mixing
    // them produces a band that describes neither.
    expect(relevant(obs({ location: 'Remote — must sit EST' }), FICO)).toBe(false)
    expect(
      relevant(obs({ location: 'Remote' }), { skills: ['SAP FICO'], location: 'Remote, US' })
    ).toBe(true)
  })

  it('counts everything when the question names no skills', () => {
    expect(relevant(obs({ skills: ['anything'] }), { skills: [], location: null })).toBe(true)
  })
})

describe('what has actually cleared', () => {
  const cleared = [10000, 11000, 12000, 13000, 14000, 15000].map((r) => obs({ rateCents: r }))

  it('builds a band from real submissions that got past a client', () => {
    const b = band(cleared, FICO, NOW)!
    expect(b.sample).toBe(6)
    expect(b.p50).toBe(12000)
    expect(b.says).toBe(
      'SAP FICO in Denver, CO cleared between $110 and $140, median $120, from 6 real submissions.'
    )
  })

  it('leaves out the ones the client threw out on rate', () => {
    // A band that includes the rejections is a record of what people asked
    // for, which is the number that got them rejected.
    const b = band([...cleared, obs({ rateCents: 30000, survived: false })], FICO, NOW)!
    expect(b.sample).toBe(6)
    expect(b.p75).toBeLessThan(30000)
    expect(b.lostOnRate).toBe(1)
    expect(b.says).toMatch(/1 more were rejected on rate/)
  })

  it('refuses to quote a going rate off three submissions', () => {
    // A confident band from a tiny sample is worse than no band.
    const b = band(cleared.slice(0, 3), FICO, NOW)!
    expect(b.sample).toBe(3)
    expect(b.says).toBe(
      'Only 3 SAP FICO submissions in Denver, CO have got past a client so far — not enough to say what the going rate is.'
    )
  })

  it('forgets rates from a year ago', () => {
    const stale = cleared.map((o) =>
      obs({ ...o, at: new Date(NOW.getTime() - (WINDOW_DAYS + 30) * 86400000) })
    )
    expect(band(stale, FICO, NOW)).toBeNull()
  })

  it('says nothing rather than inventing a band with no data', () => {
    expect(band([], FICO, NOW)).toBeNull()
    expect(band([obs({ survived: false })], FICO, NOW)).toBeNull()
  })
})

describe('what a recruiter is told before they quote', () => {
  const b = band(
    [10000, 11000, 12000, 13000, 14000, 15000].map((r) => obs({ rateCents: r })),
    FICO,
    NOW
  )!

  it('warns above the top quartile, and says what has actually cleared', () => {
    const w = warnAbout(18000, b)
    expect(w.say).toBe(true)
    expect(w.where).toBe('ABOVE')
    expect(w.text).toMatch(/Nothing above \$140 has cleared here in 6 submissions/)
    expect(w.text).toMatch(/Worth a reason/)
  })

  it('says when they are leaving money on the table', () => {
    // A vendor twenty dollars an hour under is a slower failure than
    // losing the role, and nothing in the product tells them today.
    const w = warnAbout(8000, b)
    expect(w.where).toBe('BELOW')
    expect(w.text).toMatch(/there is room/)
  })

  it('says nothing at all inside the band', () => {
    // A tool that comments on every rate is one whose comments get ignored.
    expect(warnAbout(12500, b).say).toBe(false)
  })

  it('says nothing when there is not enough behind it to be worth saying', () => {
    const thin = band([obs(), obs(), obs()], FICO, NOW)
    expect(warnAbout(99000, thin).say).toBe(false)
  })

  it('never blocks, only warns — a benchmark describes, it does not rule', () => {
    // A vendor bidding above it may have a reason: a scarce skill, an
    // incumbent, a relationship. A check that stops them gets overridden
    // until nobody reads any of them.
    const w = warnAbout(99000, b)
    expect(w.say).toBe(true)
    expect(w).not.toHaveProperty('block')
  })
})

describe('the same figure, told to the consultant', () => {
  const b = band(
    [10000, 11000, 12000, 13000, 14000, 15000].map((r) => obs({ rateCents: r })),
    FICO,
    NOW
  )!

  it('gives them the one number nobody else will', () => {
    // Consultants negotiate blind. Give them the figure and they keep
    // their own record current without being asked, which is the
    // freshness loop paying for itself.
    expect(forTheConsultant(b, FICO)).toBe(
      'SAP FICO roles in Denver, CO paid between $110 and $140 an hour last quarter, based on 6 real submissions.'
    )
  })

  it('names no client, ever', () => {
    expect(forTheConsultant(b, FICO)).not.toMatch(/Terumo|Nike|client/i)
  })

  it('stays quiet until one person’s rate is not visible in it', () => {
    const thin = band([obs(), obs()], FICO, NOW)
    expect(forTheConsultant(thin, FICO)).toBeNull()
  })

  it('needs at least the agreed number of observations', () => {
    expect(ENOUGH).toBeGreaterThanOrEqual(5)
  })
})
