import { describe, it, expect } from 'vitest'
import {
  pageIsLive,
  availabilityOf,
  writeBio,
  buildPortfolio,
  checkSlug,
  checkBioEdit,
  parseBio,
  writeBioBest,
  type PortfolioInput,
  type Engagement,
} from '@/lib/consultant-portfolio'
import { suggestAddress } from '@/lib/portfolio-data'

/**
 * Every agency a consultant works through has a page. The person doing the
 * work had nothing, which is backwards in a market where the person is the
 * product.
 *
 * Theirs, not the agency's — it survives leaving. Shows what they did, not
 * who for, because a client never agreed to appear on somebody's portfolio.
 * And off until they turn it on.
 */

const NOW = new Date('2026-08-19T00:00:00Z')
const ago = (months: number) => new Date(NOW.getTime() - months * 30 * 86_400_000)
const ahead = (days: number) => new Date(NOW.getTime() + days * 86_400_000)

function eng(over: Partial<Engagement> = {}): Engagement {
  return {
    role: 'SAP FICO Consultant',
    skills: ['SAP FICO', 'S/4HANA'],
    startedAt: ago(24),
    endedAt: ago(6),
    sector: 'Medical devices',
    location: 'Lakewood, CO',
    ...over,
  }
}

function input(over: Partial<PortfolioInput> = {}): PortfolioInput {
  return {
    name: 'Anita Desai',
    headline: null,
    skills: ['SAP FICO', 'S/4HANA', 'Kubernetes'],
    location: 'Denver, CO',
    visibility: 'CLIENT_VISIBLE',
    availableFrom: null,
    engagements: [eng()],
    completedTraining: [{ title: 'SAP S/4HANA conversion', completedAt: ago(3) }],
    verified: ['Right to work'],
    ...over,
  }
}

describe('whether the page is shown at all', () => {
  it('stays off until they turn it on, so nobody is published by accident', () => {
    expect(pageIsLive({ slug: 'anita-desai', pageLiveAt: null })).toBe(false)
  })

  it('is on once they have an address and have turned it on', () => {
    expect(pageIsLive({ slug: 'anita-desai', pageLiveAt: NOW })).toBe(true)
  })

  it('is off with no address, because there is nowhere for it to be', () => {
    expect(pageIsLive({ slug: null, pageLiveAt: NOW })).toBe(false)
  })

  it('is not turned on by an agency making them visible to clients', () => {
    // visibility says whether an agency may show somebody to clients
    // inside the platform. It is usually set by the agency, on a bench
    // listing, and it is not consent to be named on the open internet.
    // Every seeded consultant is VERIFIED and none of them has a page.
    expect(pageIsLive({ slug: 'anita-desai', pageLiveAt: null })).toBe(false)
  })
})

describe('when they are free', () => {
  it('says the date and the countdown, which is what somebody asks', () => {
    const p = availabilityOf(null, [eng({ endedAt: ahead(21) })], NOW)
    expect(p).toMatch(/free in 21 days/i)
    expect(p).toContain('2026-09-09')
  })

  it('says available now when nothing is running', () => {
    expect(availabilityOf(null, [eng({ endedAt: ago(2) })], NOW)).toBe('Available now.')
  })

  it('never claims available now while an open-ended engagement runs', () => {
    // A reader would act on that, and it would be false.
    const p = availabilityOf(null, [eng({ endedAt: null })], NOW)
    expect(p).toMatch(/no set end date/i)
    expect(p).not.toMatch(/available now/i)
  })

  it('honours a date they set themselves', () => {
    expect(availabilityOf(ahead(40), [], NOW)).toMatch(/available from/i)
  })
})

describe('the words', () => {
  it('counts years from engagements rather than repeating a claim', () => {
    // The difference between a portfolio and a CV.
    const b = writeBio(input(), NOW)
    expect(b.intro).toMatch(/1 engagement/i)
    expect(b.intro).toMatch(/years on SAP FICO/i)
  })

  it('builds a headline from what they have actually been placed on', () => {
    const b = writeBio(input({ headline: null }), NOW)
    expect(b.headline).toContain('SAP FICO')
  })

  it('keeps their own headline when they wrote one', () => {
    expect(writeBio(input({ headline: 'Revenue systems specialist' }), NOW).headline)
      .toBe('Revenue systems specialist')
  })

  it('counts one year as one year, not "1 years"', () => {
    // It appeared on a real page. Somebody reading "1 years" stops
    // trusting every other number on it.
    const b = writeBio(input({ engagements: [eng({ startedAt: ago(12), endedAt: null })] }), NOW)
    expect(b.intro).not.toMatch(/\b1 years\b/)
    expect(b.intro).toMatch(/1 year across 1 engagement/)
  })

  it('does not dress up somebody with nothing yet', () => {
    const b = writeBio(input({ engagements: [], completedTraining: [] }), NOW)
    expect(b.intro).toMatch(/fills in from real engagements/i)
  })

  it('uses no unverifiable adjectives', () => {
    const banned = /\b(expert|seasoned|passionate|dynamic|results-driven|proven|highly)\b/i
    for (const i of [input(), input({ engagements: [] }), input({ skills: [] })]) {
      const b = writeBio(i, NOW)
      expect(b.headline, b.headline).not.toMatch(banned)
      expect(b.intro, b.intro).not.toMatch(banned)
    }
  })
})

describe('what the page shows', () => {
  it('never names a client, only the sector', () => {
    // A client did not agree to appear on somebody's portfolio.
    const p = buildPortfolio(input(), NOW)
    expect(p.engagements[0].sector).toBe('Medical devices')
    expect(JSON.stringify(p)).not.toMatch(/terumo|nike|acme/i)
  })

  it('says how long each engagement lasted rather than two dates', () => {
    const p = buildPortfolio(input(), NOW)
    expect(p.engagements[0].lasted).toMatch(/1 year 6 months/)
  })

  it('marks a live engagement as current', () => {
    const p = buildPortfolio(input({ engagements: [eng({ endedAt: ahead(30) })] }), NOW)
    expect(p.engagements[0].current).toBe(true)
  })

  it('puts the most recent engagement first', () => {
    const p = buildPortfolio(
      input({
        engagements: [
          eng({ role: 'Older', startedAt: ago(60), endedAt: ago(40) }),
          eng({ role: 'Newer', startedAt: ago(20), endedAt: ago(2) }),
        ],
      }),
      NOW
    )
    expect(p.engagements.map((e) => e.role)).toEqual(['Newer', 'Older'])
  })

  it('shows a claimed skill with no engagement behind it, and no number', () => {
    // The gap is worth a reader seeing rather than hiding.
    const p = buildPortfolio(input(), NOW)
    const k = p.skills.find((s) => s.skill === 'Kubernetes')!
    expect(k.years).toBeNull()
    const sap = p.skills.find((s) => s.skill === 'SAP FICO')!
    expect(sap.years).toBeGreaterThan(0)
  })

  it('puts the skills they have actually done first', () => {
    const p = buildPortfolio(input(), NOW)
    expect(p.skills[0].years).not.toBeNull()
  })

  it('shows training as evidence of keeping current', () => {
    const p = buildPortfolio(input(), NOW)
    expect(p.training[0].title).toBe('SAP S/4HANA conversion')
  })

  it('lists what is verified without the documents themselves', () => {
    const p = buildPortfolio(input(), NOW)
    expect(p.verified).toEqual(['Right to work'])
  })
})

describe('their address', () => {
  it('accepts an ordinary name', () => {
    expect(checkSlug('anita-desai', new Set()).value).toBe('anita-desai')
  })

  it('turns spaces into hyphens rather than refusing', () => {
    expect(checkSlug('Anita Desai', new Set()).value).toBe('anita-desai')
  })

  it('refuses one already taken, because it is never reissued', () => {
    // An old link landing on a stranger's portfolio is worse than a dead
    // one.
    expect(checkSlug('anita-desai', new Set(['anita-desai'])).ok).toBe(false)
  })

  it('keeps back the ones that are ours', () => {
    for (const s of ['api', 'admin', 'settings', 'me']) {
      expect(checkSlug(s, new Set()).ok, s).toBe(false)
    }
  })

  it('explains which rule was broken', () => {
    expect(checkSlug('ab', new Set()).reason).toMatch(/three characters/i)
    expect(checkSlug('has_underscore', new Set()).reason).toMatch(/letters, numbers and hyphens/i)
  })
})

describe('their address changing', () => {
  it('suggests one from their name, so nobody stares at an empty box', () => {
    expect(suggestAddress('Anita Desai')).toBe('anita-desai')
  })

  it('handles a name with accents rather than dropping the letters', () => {
    expect(suggestAddress('José Muñoz')).toBe('jose-munoz')
  })

  it('never suggests something starting or ending with a hyphen', () => {
    for (const n of ['  Anita  ', "O'Brien", 'Anita — Desai']) {
      const s = suggestAddress(n)
      expect(s.startsWith('-'), s).toBe(false)
      expect(s.endsWith('-'), s).toBe(false)
    }
  })

  it('refuses an address somebody used before, not only one in use', () => {
    // The old address is kept forever so a link on a CV still finds them.
    // Handing it to a stranger would point that link at the wrong person.
    expect(checkSlug('anita-desai', new Set(['anita-desai'])).ok).toBe(false)
  })
})

describe('what they may write about themselves', () => {
  it('accepts anything reasonable, because it is their page', () => {
    expect(checkBioEdit('headline', 'SAP FICO consultant, Denver.').ok).toBe(true)
  })

  it('refuses a blank', () => {
    expect(checkBioEdit('intro', '   ').ok).toBe(false)
  })

  it('refuses a headline too long to lay out', () => {
    expect(checkBioEdit('headline', 'x'.repeat(200)).ok).toBe(false)
  })

  it('refuses borrowing a claim Etyme has not made', () => {
    // Somebody writing "Etyme verified" is borrowing our word for
    // something we never said, and it devalues every other page.
    expect(checkBioEdit('intro', 'Etyme verified consultant since 2019.').ok).toBe(false)
  })

  it('still lets them mention Etyme in an ordinary way', () => {
    expect(checkBioEdit('intro', 'Available through Etyme.').ok).toBe(true)
  })
})

describe('reading what a model wrote', () => {
  it('takes plain JSON', () => {
    expect(parseBio('{"headline":"A","intro":"B"}')).toEqual({ headline: 'A', intro: 'B' })
  })

  it('takes JSON inside a fence', () => {
    expect(parseBio('```json\n{"headline":"A","intro":"B"}\n```')?.headline).toBe('A')
  })

  it('refuses a headline that is really a paragraph', () => {
    expect(parseBio(`{"headline":"${'x'.repeat(200)}","intro":"B"}`)).toBeNull()
  })

  it('refuses an answer missing what the page needs', () => {
    expect(parseBio('{"intro":"B"}')).toBeNull()
    expect(parseBio('I could not write that.')).toBeNull()
  })
})

describe('writing the words when there is no model', () => {
  it('still writes something true rather than leaving them blank', async () => {
    const w = await writeBioBest(input(), NOW)
    expect(w.writtenBy).toBe('RULES')
    expect(w.headline.length).toBeGreaterThan(3)
    expect(w.intro).toMatch(/years on SAP FICO/i)
  })

  it('says it was written by rule, so it is never taken for their own words', async () => {
    // The difference decides whether writing it again asks first.
    expect((await writeBioBest(input(), NOW)).writtenBy).toBe('RULES')
  })

  it('writes a fresh headline rather than echoing the one already there', async () => {
    const w = await writeBioBest(input({ headline: 'Revenue systems specialist' }), NOW)
    expect(w.headline).not.toBe('Revenue systems specialist')
  })
})
