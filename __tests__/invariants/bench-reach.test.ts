import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { whoSees, mayChangeTier, NETWORK_VISIBLE } from '@/lib/shared-consultant'

/**
 * How far a bench listing reaches, and who may move it.
 *
 * Founder's lifecycle walk, 2026-09-28: a consultant a bench vendor added
 * landed as Retained and could never surface to a prime. Nothing wrote a
 * listing's tier after the row was created, the network bench showed
 * partners marketing listings only, and so the person's own "yes, market
 * me" reached nobody.
 *
 * Two facts decide the reach, and they belong to two people: the consent
 * is the consultant's, the tier is the firm's.
 */

const live = { revokedAt: null }
const granted = (tier: 'RETAINED' | 'MARKETING') => ({ ...live, tier, state: 'GRANTED' })

const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

describe('who sees a listing', () => {
  it('a listing nobody has answered is seen by the firm that asked and by nobody else', () => {
    const v = whoSees({ ...live, tier: 'MARKETING', state: 'INVITED' })
    expect(v.reach).toBe('FIRM_ONLY')
    expect(v.says).toContain('until they say yes')
  })

  it('a listing the consultant declined is shown to no partner, whatever its tier', () => {
    expect(whoSees({ ...live, tier: 'MARKETING', state: 'DECLINED' }).reach).toBe('FIRM_ONLY')
  })

  it('a listing the consultant took back is seen by nobody', () => {
    expect(whoSees({ tier: 'MARKETING', state: 'GRANTED', revokedAt: new Date() }).reach).toBe('NOBODY')
  })

  it('a retained listing the consultant granted stays with the firm that holds it', () => {
    const v = whoSees(granted('RETAINED'))
    expect(v.reach).toBe('FIRM_ONLY')
    expect(v.says).toContain('Market them')
  })

  it('a marketing listing the consultant granted is seen by the firms on that firm’s register', () => {
    expect(whoSees(granted('MARKETING')).reach).toBe('NETWORK')
  })

  it('the network bench asks for granted, live, marketing listings and nothing wider', () => {
    expect(NETWORK_VISIBLE).toEqual({ revokedAt: null, state: 'GRANTED', tier: 'MARKETING' })
    // And the route actually uses it, rather than a copy of it that can drift.
    const api = read('app/api/bench/route.ts')
    const network = api.slice(api.indexOf("scope === 'network'"))
    expect(network).toContain('...NETWORK_VISIBLE')
  })
})

describe('a firm moving its own listing between tiers', () => {
  it('a firm may move a granted listing from retained to marketing, and is told who will now see them', () => {
    const v = mayChangeTier({ listing: granted('RETAINED'), to: 'MARKETING', retainedElsewhere: false })
    expect(v.ok).toBe(true)
    expect(v.unchanged).toBeFalsy()
    expect(v.says).toContain('the firms you work with see them')
  })

  it('a firm may take a marketing listing back to retained', () => {
    const v = mayChangeTier({ listing: granted('MARKETING'), to: 'RETAINED', retainedElsewhere: false })
    expect(v.ok).toBe(true)
    expect(v.says).toContain('no longer see them')
  })

  it('a firm may choose the tier before the consultant has answered, and nothing reaches further until they do', () => {
    const v = mayChangeTier({ listing: { ...live, tier: 'RETAINED', state: 'INVITED' }, to: 'MARKETING', retainedElsewhere: false })
    expect(v.ok).toBe(true)
    expect(v.says).toContain('until they say yes')
  })

  it('a firm cannot retain somebody another firm already retains, and the refusal names nobody', () => {
    const v = mayChangeTier({ listing: granted('MARKETING'), to: 'RETAINED', retainedElsewhere: true })
    expect(v.ok).toBe(false)
    expect(v.code).toBe('RETAINED_ELSEWHERE')
    expect(v.says).toContain('one retained bench')
    expect(v.says).toContain('still market them')
  })

  it('a firm cannot change the tier of a listing the consultant declined', () => {
    const v = mayChangeTier({ listing: { ...live, tier: 'RETAINED', state: 'DECLINED' }, to: 'MARKETING', retainedElsewhere: false })
    expect(v.ok).toBe(false)
    expect(v.code).toBe('DECLINED')
  })

  it('a firm cannot change the tier of a listing the consultant took back', () => {
    const v = mayChangeTier({ listing: { tier: 'RETAINED', state: 'GRANTED', revokedAt: new Date() }, to: 'MARKETING', retainedElsewhere: false })
    expect(v.ok).toBe(false)
    expect(v.code).toBe('TAKEN_BACK')
  })

  it('moving a listing to the tier it already has changes nothing', () => {
    const v = mayChangeTier({ listing: granted('MARKETING'), to: 'MARKETING', retainedElsewhere: true })
    expect(v.ok).toBe(true)
    expect(v.unchanged).toBe(true)
  })

  it('a tier that is neither retained nor marketing is refused in a sentence', () => {
    const v = mayChangeTier({ listing: granted('MARKETING'), to: 'EXCLUSIVE', retainedElsewhere: false })
    expect(v.ok).toBe(false)
    expect(v.says).toBe('A listing is either retained or marketing.')
  })
})

describe('the doors that write a listing', () => {
  it('a consultant a firm adds is marketed unless the firm chooses to retain them', () => {
    // Retaining is an exclusive claim to carry somebody, one per person.
    // It was the silent default on this door and the opposite default on
    // the listing door, so the same firm got two answers.
    expect(read('app/api/consultants/route.ts')).toContain("tier = 'MARKETING'")
    expect(read('app/api/bench/listings/route.ts')).toContain("tier = 'MARKETING'")
    expect(read('app/dashboard/bench/page.tsx')).toContain("useState<'RETAINED' | 'MARKETING'>('MARKETING')")
  })

  it('a listing shared to a partner firm is an invitation the consultant answers, never born granted', () => {
    const share = read('app/api/bench/share/route.ts')
    expect(share).toContain('...invitation(now)')
    // The old re-activation stamped a grant nobody gave.
    expect(share).not.toContain('grantedAt: new Date(), // will be updated when consultant grants')
  })

  it('granting through the listing door records the consent the submission gate reads', () => {
    const grant = read('app/api/bench/listings/[id]/grant/route.ts')
    // The door stamped grantedAt and left the state at INVITED, so a
    // consultant who granted there was still refused at submission.
    expect(grant).toContain("answer(")
    expect(grant).toContain('outcome.data')
  })

  it('the bench says who sees each person, from the listing, not from a profile field one vendor set', () => {
    const page = read('app/dashboard/bench/page.tsx')
    expect(page).toContain("label: 'Who sees them'")
    expect(page).not.toContain('visibilityChip(')
  })
})
