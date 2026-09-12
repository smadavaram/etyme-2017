import { describe, it, expect } from 'vitest'
import { releasing, summarise, mayShow, type RollingOff } from '@/lib/releasing-soon'

/**
 * The gap this fills is a fortnight wide and expensive. A consultant rolls
 * off on the 28th; nobody outside their own vendor knows until the 29th,
 * when they appear on the bench. Bench time is the cost that decides
 * whether a staffing firm makes money.
 */

const NOW = new Date('2026-08-19T00:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

function person(over: Partial<RollingOff> = {}): RollingOff {
  return {
    contractId: 'k1',
    personId: 'p1',
    personName: 'Anita Desai',
    vendorCompanyId: 'v1',
    vendorName: 'Cloudepa Inc.',
    endClientName: 'Terumo BCT',
    endDate: inDays(20),
    consented: true,
    headline: 'SAP FICO Consultant',
    skills: ['SAP FICO', 'S/4HANA'],
    location: 'Lakewood, CO',
    rateFloorCents: 11_000,
    extensionLikely: false,
    ...over,
  }
}

describe('who appears', () => {
  it('shows somebody coming free inside the horizon', () => {
    expect(releasing([person()], NOW)).toHaveLength(1)
  })

  it('never shows somebody who has not agreed to be listed', () => {
    // A contract end date is not consent to be sold. CLAUDE.md puts this
    // one step later — a submission needs a live listing the consultant
    // granted — and putting them in a shop window is the same violation
    // one step earlier.
    expect(releasing([person({ consented: false })], NOW)).toHaveLength(0)
  })

  it('leaves somebody already free to the bench', () => {
    // Showing them in both lists makes both untrustworthy.
    expect(releasing([person({ endDate: inDays(-2) })], NOW)).toHaveLength(0)
  })

  it('does not show somebody finishing next year', () => {
    expect(releasing([person({ endDate: inDays(200) })], NOW)).toHaveLength(0)
  })
})

describe('what a buyer is told', () => {
  it('leads with when they are free rather than burying it', () => {
    // A listing that says "available" for somebody working until the 28th
    // wastes everybody's time.
    const [r] = releasing([person({ endDate: inDays(9) })], NOW)
    expect(r.daysUntilFree).toBe(9)
    expect(r.freeOn).toBe('2026-08-28')
  })

  it('says what they are finishing, because doing beats claiming', () => {
    const [r] = releasing([person()], NOW)
    expect(r.proven).toBe('Finishing at Terumo BCT')
  })

  it('says plainly when they may extend instead', () => {
    // Hiding this costs a buyer a phone call and costs us their trust.
    const [r] = releasing([person({ extensionLikely: true })], NOW)
    expect(r.caveat).toMatch(/may not come free/i)
  })

  it('carries no caveat when there is nothing to warn about', () => {
    expect(releasing([person()], NOW)[0].caveat).toBeNull()
  })

  it('carries the consultant’s own floor, so nothing is offered below it', () => {
    expect(releasing([person()], NOW)[0].rateFloorCents).toBe(11_000)
  })
})

describe('the order', () => {
  it('puts the soonest first, because that is the question being asked', () => {
    // A perfect match available in ninety days is not an answer to a gap
    // starting Monday.
    const rows = releasing(
      [
        person({ contractId: 'far', endDate: inDays(60) }),
        person({ contractId: 'soon', endDate: inDays(3) }),
        person({ contractId: 'mid', endDate: inDays(25) }),
      ],
      NOW
    )
    expect(rows.map((r) => r.contractId)).toEqual(['soon', 'mid', 'far'])
  })

  it('bands them the way somebody plans', () => {
    const rows = releasing(
      [
        person({ contractId: 'a', endDate: inDays(4) }),
        person({ contractId: 'b', endDate: inDays(20) }),
        person({ contractId: 'c', endDate: inDays(70) }),
      ],
      NOW
    )
    expect(rows.map((r) => r.window)).toEqual(['THIS_WEEK', 'THIS_MONTH', 'NEXT_QUARTER'])
  })
})

describe('the headline number', () => {
  it('says nobody rather than showing a zero', () => {
    expect(summarise([]).summary).toMatch(/nobody is coming free/i)
  })

  it('leads with this week when somebody is free this week', () => {
    const s = summarise(releasing([person({ endDate: inDays(3) }), person({ contractId: 'k2', endDate: inDays(40) })], NOW))
    expect(s.summary).toMatch(/1 free within the week/i)
  })

  it('counts the uncertain ones into the sentence rather than hiding them', () => {
    // "Twelve releasing" where four are probably extending is a number
    // that gets somebody's hopes up and then costs them a call.
    const s = summarise(
      releasing(
        [
          person({ contractId: 'a', endDate: inDays(10) }),
          person({ contractId: 'b', endDate: inDays(12), extensionLikely: true }),
        ],
        NOW
      )
    )
    expect(s.uncertain).toBe(1)
    expect(s.summary).toMatch(/1 may extend instead/i)
  })
})

describe('whether somebody may be shown at all', () => {
  it('allows it once they have agreed', () => {
    expect(mayShow({ hasLiveListing: true, listingRevoked: false, consultantOptedOut: false }).mayShow).toBe(true)
  })

  it('refuses without a listing, and names it as a conversation rather than a setting', () => {
    const c = mayShow({ hasLiveListing: false, listingRevoked: false, consultantOptedOut: false })
    expect(c.mayShow).toBe(false)
    expect(c.reason).toMatch(/ask them before their contract ends/i)
  })

  it('refuses once they withdraw', () => {
    expect(mayShow({ hasLiveListing: true, listingRevoked: true, consultantOptedOut: false }).mayShow).toBe(false)
  })

  it('lets somebody opt out of early listing while staying on the bench', () => {
    // Being sold two weeks before you finish is a different thing from
    // being on a bench list, and a person may want one and not the other.
    const c = mayShow({ hasLiveListing: true, listingRevoked: false, consultantOptedOut: true })
    expect(c.mayShow).toBe(false)
    expect(c.reason).toMatch(/before their contract ends/i)
  })
})
