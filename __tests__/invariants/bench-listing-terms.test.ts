import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listingTermsFrom, termsShown, agreeingTerms } from '@/lib/bench-filter'

/**
 * Terms stated when a firm lists somebody (2026-10-06).
 *
 * A listing is consent to be marketed, never to be employed. A firm that
 * already knows how it would engage a person, and at what pay, may say so
 * at listing; the person reads it beside the yes and agrees it with the
 * yes. Checked by demand's `checkStatedTerms`, so the listing door and the
 * terms page refuse the same things in the same sentences.
 */

const NOW = new Date('2026-10-06T12:00:00Z')
const who = { personName: 'Marisol Quintero', firmName: 'Brightmoor Staffing', ownCompany: null, statedById: 'p-recruiter', now: NOW }
const listing = (over: Partial<{ termsEngagementType: string | null; termsPayRateCents: number | null; termsAgreedAt: Date | null }> = {}) => ({
  termsEngagementType: null, termsPayRateCents: null, termsAgreedAt: null, ...over,
})

describe('a firm states terms when it lists somebody', () => {
  it('a listing with no terms stated writes no terms at all, and nobody is recorded as stating them', () => {
    for (const typed of [{ engagementType: undefined, payRateCents: undefined }, { engagementType: '', payRateCents: '' }, { engagementType: null, payRateCents: null }]) {
      const r = listingTermsFrom(typed, who)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.fields).toEqual({ termsEngagementType: null, termsPayRateCents: null, termsStatedAt: null, termsStatedById: null, termsAgreedAt: null })
      expect(r.says).toBeNull()
    }
  })

  it('a firm may state W2 at $90, recorded with who stated it and when, and not agreed until the person says yes', () => {
    const r = listingTermsFrom({ engagementType: 'W2', payRateCents: 9000 }, who)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fields).toEqual({
      termsEngagementType: 'W2', termsPayRateCents: 9000, termsStatedAt: NOW, termsStatedById: 'p-recruiter', termsAgreedAt: null,
    })
    expect(r.says).toBe(
      'Brightmoor Staffing employs Marisol Quintero at $90/hr. Marisol Quintero sees these terms when they are asked, and agrees them only by saying yes.'
    )
  })

  it('a $0 rate is refused in the terms page’s own words, never written as a free placement', () => {
    for (const payRateCents of [0, '0', -500, 'ninety']) {
      const r = listingTermsFrom({ engagementType: 'W2', payRateCents }, who)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.code).toBe('NO_RATE')
      expect(r.field).toBe('termsPayRateCents')
      expect(r.says).toBe('Say what Brightmoor Staffing pays Marisol Quintero. An empty rate is a missing rate, not a free placement.')
    }
  })

  it('a rate without an engagement type is refused, never guessed', () => {
    const r = listingTermsFrom({ engagementType: '', payRateCents: 9000 }, who)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('NO_TYPE')
    expect(r.field).toBe('termsEngagementType')
  })

  it('a firm cannot list somebody as employed by another firm; the refusal is the terms page’s own sentence', () => {
    const r = listingTermsFrom({ engagementType: 'OTHER_EMPLOYER', payRateCents: 9000 }, who)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('THROUGH_THE_EMPLOYER')
    expect(r.says).toContain('Ask the employer to put Marisol Quintero forward to Brightmoor Staffing')
  })

  it('through their own company is refused for somebody with no company on record, and written to that company when there is one', () => {
    const none = listingTermsFrom({ engagementType: 'OWN_COMPANY', payRateCents: 9000 }, who)
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.code).toBe('NO_OWN_COMPANY')
    const own = listingTermsFrom({ engagementType: 'own_company', payRateCents: 9000 }, { ...who, ownCompany: { id: 'c1', name: 'Quintero Validation LLC' } })
    expect(own.ok).toBe(true)
    if (own.ok) expect(own.fields.termsEngagementType).toBe('OWN_COMPANY')
  })
})

describe('the person reads the terms, and their yes agrees them', () => {
  it('the person reads the stated terms in plain words, never the code', () => {
    expect(termsShown(listing({ termsEngagementType: 'W2', termsPayRateCents: 9000 }), 'Brightmoor Staffing')).toMatchObject({
      rate: '$90/hr',
      agreed: false,
      says: 'Brightmoor Staffing says it would pay you $90/hr, as its employee (W2), when it places you.',
    })
    expect(termsShown(listing({ termsEngagementType: 'IND_1099', termsPayRateCents: 8550 }), 'Brightmoor Staffing')!.says).toBe(
      'Brightmoor Staffing says it would pay you $85.50/hr, as an independent contractor (1099), when it places you.'
    )
  })

  it('a listing with no terms, or a $0 rate on the row, shows no terms rather than a guess', () => {
    expect(termsShown(listing(), 'Brightmoor Staffing')).toBeNull()
    expect(termsShown(listing({ termsEngagementType: 'W2', termsPayRateCents: 0 }), 'Brightmoor Staffing')).toBeNull()
    expect(termsShown(listing({ termsEngagementType: 'OTHER_EMPLOYER', termsPayRateCents: 9000 }), 'Brightmoor Staffing')).toBeNull()
  })

  it('a yes with the terms the person was shown agrees them, on the day of the yes', () => {
    const r = agreeingTerms(listing({ termsEngagementType: 'W2', termsPayRateCents: 9000 }), { engagementType: 'W2', payRateCents: 9000 }, 'Brightmoor Staffing', NOW)
    expect(r).toEqual({
      ok: true, agreed: true, data: { termsAgreedAt: NOW },
      says: 'You agreed: Brightmoor Staffing pays you $90/hr, as its employee (W2), when it places you.',
    })
  })

  it('a yes to a listing without terms agrees only the marketing, and says so', () => {
    const r = agreeingTerms(listing(), undefined, 'Brightmoor Staffing', NOW)
    expect(r).toEqual({
      ok: true, agreed: false, data: {},
      says: 'Brightmoor Staffing has not said what it would pay you, so this yes lets it market you and agrees no pay.',
    })
  })

  it('a yes after the firm changed the terms the person was shown agrees nothing and asks them to read them again', () => {
    const l = listing({ termsEngagementType: 'W2', termsPayRateCents: 8000 })
    for (const seen of [{ engagementType: 'W2', payRateCents: 9000 }, { engagementType: 'IND_1099', payRateCents: 8000 }, undefined, null]) {
      const r = agreeingTerms(l, seen, 'Brightmoor Staffing', NOW)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.says).toBe('Brightmoor Staffing says it would pay you $80/hr, as its employee (W2), when it places you. Read these terms, then say yes again — your yes agrees them.')
    }
  })

  it('terms already agreed stay agreed on the day they were agreed, never re-stamped', () => {
    const then = new Date('2026-10-01T00:00:00Z')
    const r = agreeingTerms(listing({ termsEngagementType: 'W2', termsPayRateCents: 9000, termsAgreedAt: then }), null, 'Brightmoor Staffing', NOW)
    expect(r).toMatchObject({ ok: true, agreed: true, data: {} })
  })
})

describe('the doors', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('both listing doors check terms through the one rule, and write them on the listing', () => {
    for (const p of ['src/app/api/consultants/route.ts', 'src/app/api/bench/listings/route.ts']) {
      const src = read(p)
      expect(src, p).toContain('listingTermsFrom(')
      expect(src, p).toContain('...terms.fields')
    }
  })

  it('every door where a person says yes to a listing agrees terms only through the one rule', () => {
    for (const p of ['src/app/api/me/benches/[id]/respond/route.ts', 'src/app/api/bench/listings/[id]/grant/route.ts', 'src/app/api/me/benches/route.ts']) {
      const src = read(p)
      expect(src, p).toContain('agreeingTerms(')
      // termsAgreedAt is written from the rule's answer, never stamped by hand.
      expect(src, p).not.toMatch(/termsAgreedAt:\s*(new Date|now)/)
    }
  })
})
