import { describe, it, expect } from 'vitest'
import {
  writeFromRules,
  parseVoice,
  checkEdit,
  DEFAULT_HEADINGS,
  type SiteFacts,
} from '@/lib/site-voice'

/**
 * Base44 and its kind generate a website: you describe what you want and
 * get code you own. Good, and with one failure this product cannot afford —
 * the moment it is generated it starts going out of date. A staffing firm's
 * site says "12 consultants" forever, because nothing is connected.
 *
 * So the voice is generated and the facts never are. A generated sentence
 * about a company is a claim, and a claim that outlives its truth is worse
 * than a plain page.
 */

function facts(over: Partial<SiteFacts> = {}): SiteFacts {
  return {
    name: 'Cloudepa Inc.',
    kind: 'VENDOR',
    posture: 'PRIME',
    skills: ['SAP FICO', 'S/4HANA', 'ABAP'],
    locations: ['Edison, NJ'],
    placements: 7,
    activeNow: 4,
    clients: 2,
    openPositions: 0,
    comingFree: 2,
    trainingCourses: 4,
    ...over,
  }
}

describe('writing without a model', () => {
  it('names what they actually place rather than reaching for an adjective', () => {
    // "SAP FICO and S/4HANA people" beats "expert SAP solutions" and is
    // the only version that can be checked.
    const v = writeFromRules(facts())
    expect(v.tagline).toContain('SAP FICO')
    expect(v.tagline).toContain('Edison, NJ')
  })

  it('leads a buyer’s page with what a supplier can pick up', () => {
    const v = writeFromRules(facts({ kind: 'CLIENT', openPositions: 3, skills: [] }))
    expect(v.tagline).toMatch(/3 contract positions open to suppliers/i)
  })

  it('says plainly when a buyer has nothing open', () => {
    const v = writeFromRules(facts({ kind: 'CLIENT', openPositions: 0, skills: [] }))
    expect(v.intro).toMatch(/suppliers they invite directly/i)
  })

  it('does not dress up a company with nothing yet', () => {
    // A company with two placements should read as a company with two
    // placements.
    const v = writeFromRules(
      facts({ placements: 0, activeNow: 0, clients: 0, comingFree: 0, trainingCourses: 0, skills: [] })
    )
    expect(v.intro).toMatch(/new on etyme/i)
    expect(v.intro).toMatch(/counted from real work/i)
  })

  it('uses no unverifiable adjectives anywhere', () => {
    // The words that make a generated page read as a generated page.
    const banned = /\b(leading|trusted|premier|world-class|best-in-class|innovative|cutting-edge|empowering|seamless|robust|expert)\b/i
    for (const f of [
      facts(),
      facts({ kind: 'CLIENT', openPositions: 4 }),
      facts({ posture: 'BENCH' }),
      facts({ placements: 0, clients: 0, comingFree: 0, trainingCourses: 0, skills: [] }),
    ]) {
      const v = writeFromRules(f)
      expect(v.tagline, v.tagline).not.toMatch(banned)
      expect(v.intro, v.intro).not.toMatch(banned)
    }
  })

  it('never invents a number it was not given', () => {
    const v = writeFromRules(facts({ placements: 7, clients: 2 }))
    const numbers = (v.intro.match(/\d+/g) ?? []).map(Number)
    for (const n of numbers) expect([7, 2, 4, 2, 3]).toContain(n)
  })

  it('keeps the section names when it has nothing better', () => {
    expect(writeFromRules(facts()).headings).toEqual(DEFAULT_HEADINGS)
  })

  it('says which way it was written, so a page is never mistaken for hand-written', () => {
    expect(writeFromRules(facts()).writtenBy).toBe('RULES')
  })

  it('tells a bench firm apart from one selling direct', () => {
    const bench = writeFromRules(facts({ posture: 'BENCH', skills: [] }))
    expect(bench.tagline).toMatch(/through other staffing firms/i)
  })

  it('never produces an empty tagline or intro', () => {
    // An empty page is the one outcome worse than a plain one.
    for (const f of [
      facts({ skills: [], locations: [] }),
      facts({ kind: 'MSP', skills: [], locations: [], openPositions: 0 }),
      facts({ kind: 'GSI', placements: 0, clients: 0 }),
    ]) {
      const v = writeFromRules(f)
      expect(v.tagline.length).toBeGreaterThan(5)
      expect(v.intro.length).toBeGreaterThan(5)
    }
  })
})

describe('reading what the model wrote', () => {
  it('takes plain JSON', () => {
    expect(parseVoice('{"tagline":"A","intro":"B"}')).toEqual({ tagline: 'A', intro: 'B' })
  })

  it('takes JSON inside a fence', () => {
    expect(parseVoice('```json\n{"tagline":"A","intro":"B"}\n```')?.tagline).toBe('A')
  })

  it('refuses a tagline that is really a paragraph', () => {
    // It would break the layout on every page that renders it.
    expect(parseVoice(`{"tagline":"${'x'.repeat(200)}","intro":"B"}`)).toBeNull()
  })

  it('refuses an answer missing what the page needs', () => {
    expect(parseVoice('{"intro":"B"}')).toBeNull()
    expect(parseVoice('I could not write that.')).toBeNull()
  })
})

describe('what a company may write about itself', () => {
  it('accepts anything reasonable, because it is their page', () => {
    expect(checkEdit('tagline', 'SAP people, out of New Jersey.').ok).toBe(true)
  })

  it('refuses a blank', () => {
    expect(checkEdit('tagline', '   ').ok).toBe(false)
  })

  it('refuses something too long to lay out', () => {
    expect(checkEdit('tagline', 'x'.repeat(200)).ok).toBe(false)
  })

  it('refuses borrowing a claim Etyme has not made', () => {
    // A company writing "Etyme verified" is borrowing our word for
    // something we never said, and it devalues every other page.
    expect(checkEdit('intro', 'Etyme verified supplier since 2019.').ok).toBe(false)
    expect(checkEdit('intro', 'An approved Etyme partner.').ok).toBe(false)
  })

  it('still lets them mention Etyme in an ordinary way', () => {
    expect(checkEdit('intro', 'We take our bookings through Etyme.').ok).toBe(true)
  })
})
