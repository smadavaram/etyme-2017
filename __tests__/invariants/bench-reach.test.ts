import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { whoSees, mayChangeTier, NETWORK_VISIBLE } from '@/lib/shared-consultant'
import { mayShareBenchTo } from '@/lib/bench-filter'

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
  it('a consultant a firm adds is marketed unless the firm chooses to retain them', async () => {
    // Retaining is an exclusive claim to carry somebody, one per person.
    // It was the silent default on this door and the opposite default on
    // the listing door, so the same firm got two answers.
    expect(read('app/api/consultants/route.ts')).toContain("tier = 'MARKETING'")
    // The listing door reads its body through readAddToBench since
    // 2026-11-02 (lib/consultant-portfolio/forms), and the default is there.
    expect(read('app/api/bench/listings/route.ts')).toContain('readAddToBench(body)')
    const forms = read('lib/consultant-portfolio/forms.ts')
    expect(forms.slice(forms.indexOf('export function readAddToBench('))).toContain("tier = 'MARKETING'")
    const { readAddToBench } = await import('@/lib/consultant-portfolio/forms')
    expect(readAddToBench({ consultantId: 'profile-asha' })).toMatchObject({ ok: true, tier: 'MARKETING' })
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

describe('A bench is shared only with a firm the sharer already trades with (2026-10-20)', () => {
  const ties = {
    self: 'techpeple',
    panel: new Set(['sub-below']),
    trading: new Set(['computer-systems']),
    blocked: new Set(['blocked-firm']),
  }

  it('a sub-vendor may share its bench with the prime it sells through', () => {
    expect(mayShareBenchTo(ties, { id: 'computer-systems', name: 'Computer Systems Inc' }).ok).toBe(true)
  })

  it('a firm may share its bench with a supplier it buys from', () => {
    expect(mayShareBenchTo(ties, { id: 'sub-below', name: 'Below Staffing' }).ok).toBe(true)
  })

  it('a share to a firm it has no deal with is refused in a sentence naming that firm', () => {
    const v = mayShareBenchTo(ties, { id: 'vertex', name: 'Vertex Global' })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('NOT_TRADING')
      expect(v.says).toContain('Vertex Global')
      expect(v.says).toContain('only with firms you already work with')
    }
  })

  it('a share to a firm the sharer blocked is refused, even where they once traded', () => {
    const v = mayShareBenchTo({ ...ties, trading: new Set(['computer-systems', 'blocked-firm']) }, { id: 'blocked-firm', name: 'Blocked Co' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('BLOCKED')
  })

  it('a bench is never shared with a company not classified yet, even one extended to Customer or Supplier', () => {
    // Extending writes a register row and never the Kind, so the tie is there.
    const v = mayShareBenchTo(
      { ...ties, trading: new Set(['computer-systems', 'recorded']) },
      { id: 'recorded', name: 'Harrow Plastics', kind: 'UNCLASSIFIED' }
    )
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('NOT_CLASSIFIED')
      expect(v.says).toBe(
        'Harrow Plastics is on your Companies list and is not classified yet, so your bench is not shared with them. ' +
          'Say what kind of company Harrow Plastics is on Companies first.'
      )
    }
  })

  it('a bench is never shared with a recorded company given a Kind that still holds no position, and the refusal says to extend it', () => {
    // A stray agreement makes it read as trading; the register says it holds no position.
    const v = mayShareBenchTo(
      { ...ties, trading: new Set(['computer-systems', 'recorded']) },
      { id: 'recorded', name: 'Harrow Plastics', kind: 'VENDOR' },
      { positions: [], notClassified: true, recorded: true }
    )
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.code).toBe('NOT_CLASSIFIED')
      expect(v.says).toBe(
        'Harrow Plastics is on your Companies list and is not classified yet, so your bench is not shared with them. ' +
          'Extend Harrow Plastics to Supplier or Customer on Companies first.'
      )
    }
    // Once it holds a position, the ordinary rule decides.
    const held = mayShareBenchTo(
      { ...ties, trading: new Set(['computer-systems', 'recorded']) },
      { id: 'recorded', name: 'Harrow Plastics', kind: 'VENDOR' },
      { positions: ['SUPPLIER'], notClassified: false, recorded: true }
    )
    expect(held.ok).toBe(true)
  })

  it('a refused share is logged before the refusal is sent, and the share door reads the Kind of the firm it shares to', () => {
    const route = read('app/api/bench/share/route.ts')
    // The Kind, and the two facts the register read needs to know whose record it is.
    expect(route).toMatch(/select: \{ id: true, name: true, homeCurrency: true, kind: true, claimedAt: true, listedById: true \}/)
    const refused = route.indexOf('if (!reach.ok)')
    const logged = route.indexOf('await recordRefusal(', refused)
    expect(logged).toBeGreaterThan(refused)
    expect(logged).toBeLessThan(route.indexOf('code: reach.code', refused))
  })

  it('the share door asks this rule before it reads anybody', () => {
    const route = read('app/api/bench/share/route.ts')
    const rule = route.indexOf('mayShareBenchTo(await tiesOf(companyId), targetCompany, await standingWith(companyId, targetCompany))')
    expect(rule).toBeGreaterThan(-1)
    expect(rule).toBeLessThan(route.indexOf('prisma.benchListing.findMany'))
  })
})
