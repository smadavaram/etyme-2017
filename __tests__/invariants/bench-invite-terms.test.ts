import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inviteTerms } from '@/app/api/bench-invite/[token]/terms'
import { agreeingTerms } from '@/lib/bench-filter'

/**
 * The pay terms on the page an emailed bench invitation opens
 * (2026-10-06).
 *
 * A firm may state how it would engage somebody and what it would pay
 * when it lists them. The person's own page printed those terms beside
 * the yes; the emailed link did not, so a yes through the link let the
 * firm market them on terms they never read. The link now says the same
 * sentence their own page does, and its yes agrees the terms only by
 * sending back the ones it showed.
 */

const NOW = new Date('2026-10-06T12:00:00Z')
const listing = (over: Partial<{ termsEngagementType: string | null; termsPayRateCents: number | null; termsAgreedAt: Date | null }> = {}) => ({
  termsEngagementType: null, termsPayRateCents: null, termsAgreedAt: null, ...over,
})

describe('the terms on the invitation link', () => {
  it('a listing stating W2 at $90 reads, on the link, that the firm would pay $90/hr as its employee and that a yes agrees it', () => {
    const t = inviteTerms(listing({ termsEngagementType: 'W2', termsPayRateCents: 9_000 }), 'Techpeple')
    expect(t.says).toBe('Techpeple says it would pay you $90/hr, as its employee (W2), when it places you. Saying yes agrees these terms.')
    expect(t.seen).toEqual({ engagementType: 'W2', payRateCents: 9_000 })
  })

  it('a listing with no terms says so, and that a yes agrees only that they may put the person forward', () => {
    const t = inviteTerms(listing(), 'Techpeple')
    expect(t.shown).toBeNull()
    expect(t.seen).toBeNull()
    expect(t.says).toBe('Techpeple has not stated any pay terms yet. Saying yes agrees only that they may put you forward. It agrees no pay.')
  })

  it('terms the person already agreed read as agreed, not as a question', () => {
    const t = inviteTerms(listing({ termsEngagementType: 'IND_1099', termsPayRateCents: 11_000, termsAgreedAt: NOW }), 'Larkspur')
    expect(t.says).toBe('You agreed: Larkspur pays you $110/hr, as an independent contractor (1099), when it places you.')
  })

  it('terms the listing door would never write are shown as none rather than guessed at', () => {
    for (const odd of [
      listing({ termsEngagementType: 'OTHER_EMPLOYER', termsPayRateCents: 9_000 }),
      listing({ termsEngagementType: 'W2', termsPayRateCents: 0 }),
      listing({ termsEngagementType: 'SOMETHING', termsPayRateCents: 9_000 }),
    ]) {
      expect(inviteTerms(odd, 'Techpeple').seen).toBeNull()
    }
  })

  it('what the link sends back with the yes is exactly what agrees the terms, and nothing else does', () => {
    const l = listing({ termsEngagementType: 'W2', termsPayRateCents: 9_000 })
    const seen = inviteTerms(l, 'Techpeple').seen
    const yes = agreeingTerms(l, seen, 'Techpeple', NOW)
    expect(yes).toMatchObject({ ok: true, agreed: true, data: { termsAgreedAt: NOW } })
    expect(agreeingTerms(l, null, 'Techpeple', NOW).ok).toBe(false)
    expect(agreeingTerms(l, { engagementType: 'W2', payRateCents: 8_000 }, 'Techpeple', NOW).ok).toBe(false)
  })
})

const PAGE = readFileSync(join(process.cwd(), 'src/app/bench-invite/[token]/page.tsx'), 'utf8')
const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/bench-invite/[token]/route.ts'), 'utf8')

describe('the invitation page and its route', () => {
  it('prints the terms above the yes that agrees them', () => {
    const yes = PAGE.indexOf("onClick={() => say('ACCEPT')}")
    const terms = PAGE.indexOf('{ask.terms.says}', PAGE.indexOf('return ('))
    expect(terms).toBeGreaterThan(0)
    expect(terms).toBeLessThan(yes)
  })

  it('sends back the terms it printed with the yes', () => {
    expect(PAGE).toContain('termsSeen: ask?.terms?.seen')
  })

  it('agrees terms through the same check as the person’s own page, and refuses a yes that did not see them', () => {
    expect(ROUTE).toContain('agreeingTerms(listing, body.termsSeen')
    expect(ROUTE).toContain("'TERMS_NOT_SEEN'")
  })
})
