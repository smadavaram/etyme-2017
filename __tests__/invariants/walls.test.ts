import { describe, it, expect } from 'vitest'
import {
  andAll,
  defaultPostureFor,
  maySeeOutside,
  mayNameTheClient,
  unitsVisibleTo,
  accountScope,
  scopeNote,
} from '@/lib/walls'

/**
 * A staffing vendor lives in the market — everybody there talks to
 * everybody outside, and that is the job. A delivery firm with thirty
 * thousand employees and a contractor desk of nine is the opposite: almost
 * nobody there has any business seeing the outside market.
 *
 * The same software serves both, so the wall is a setting rather than a
 * product decision — and it has to hold outward, against competitors and
 * their own staff, and sideways, between one client's account and another.
 */

describe('where a company starts', () => {
  it('leaves a staffing vendor open, because looking outward is their job', () => {
    expect(defaultPostureFor('VENDOR')).toBe('ALLOWED')
  })

  it('leaves an MSP open, because they run somebody else’s supplier programme', () => {
    expect(defaultPostureFor('MSP')).toBe('ALLOWED')
  })

  it('closes a delivery firm to all but named people', () => {
    // Infosys. Thirty thousand engineers, a contractor desk of nine.
    expect(defaultPostureFor('GSI')).toBe('NAMED_ONLY')
  })

  it('closes an enterprise the same way', () => {
    expect(defaultPostureFor('CLIENT')).toBe('NAMED_ONLY')
  })

  it('closes anything it does not recognise', () => {
    // The cost of being wrong is not symmetrical. A vendor who cannot see
    // the market notices within the hour; a delivery firm whose engineers
    // can browse the supplier list never notices at all.
    expect(defaultPostureFor('SOMETHING_NEW')).toBe('NAMED_ONLY')
  })
})

describe('who may look outside their own company', () => {
  it('lets anybody at a vendor look, without a second permission', () => {
    expect(maySeeOutside({ posture: 'ALLOWED', permissions: ['consultants.read'] }).ok).toBe(true)
  })

  it('refuses a delivery employee whose role does not name it', () => {
    // A project engineer at Infosys with consultants.read still cannot see
    // the market. The surface permission is not the market permission.
    const v = maySeeOutside({ posture: 'NAMED_ONLY', permissions: ['consultants.read'] })
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/kept to named people/i)
  })

  it('lets the contractor desk look', () => {
    const v = maySeeOutside({
      posture: 'NAMED_ONLY',
      permissions: ['consultants.read', 'network.read'],
    })
    expect(v.ok).toBe(true)
  })

  it('shuts the door on everybody when a company closes it, whatever their role', () => {
    // The point of the setting: an owner can shut it without auditing
    // every role in the company, and no role can quietly reopen it.
    const v = maySeeOutside({
      posture: 'CLOSED',
      permissions: ['network.read', 'consultants.read', 'settings.manage'],
    })
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/whatever their role/i)
  })

  it('says why in words somebody just refused can read', () => {
    const v = maySeeOutside({ posture: 'NAMED_ONLY', permissions: [] })
    expect(v.reason).not.toMatch(/permission|forbidden|403/i)
  })
})

describe('naming somebody’s client to the market', () => {
  it('never names it to another company by default', () => {
    // A consultant agreeing to be listed as coming free agreed about
    // themselves. They cannot agree on behalf of the firm they work for,
    // and that firm's competitors read the same list.
    expect(mayNameTheClient({ ownVendor: false, disclosed: false })).toBe(false)
  })

  it('names it to the company that placed them', () => {
    expect(mayNameTheClient({ ownVendor: true, disclosed: false })).toBe(true)
  })

  it('names it when the firm holding the relationship said so', () => {
    expect(mayNameTheClient({ ownVendor: false, disclosed: true })).toBe(true)
  })
})

describe('one account seeing another', () => {
  // A practice with two accounts under it.
  const childrenOf = new Map([
    ['practice', ['nike-account', 'terumo-account']],
    ['nike-account', ['nike-platform']],
  ])

  it('shows the whole firm to somebody who sits on no account', () => {
    // A CFO, a head of delivery. The absence of a unit is the deliberate
    // act, not an oversight.
    expect(unitsVisibleTo({ walls: true, unitId: null, childrenOf })).toBeNull()
  })

  it('shows an account lead their own account', () => {
    const units = unitsVisibleTo({ walls: true, unitId: 'terumo-account', childrenOf })
    expect(units).toEqual(['terumo-account'])
  })

  it('never shows them the account next door', () => {
    // Another client's staffing, rates and rolloffs. Their contract with
    // that client says so, whatever our software thinks.
    const units = unitsVisibleTo({ walls: true, unitId: 'terumo-account', childrenOf })
    expect(units).not.toContain('nike-account')
  })

  it('shows a practice head everything under the practice', () => {
    const units = unitsVisibleTo({ walls: true, unitId: 'practice', childrenOf })!
    expect(units.sort()).toEqual(['nike-account', 'nike-platform', 'practice', 'terumo-account'])
  })

  it('walks the whole tree, not only the first level', () => {
    const units = unitsVisibleTo({ walls: true, unitId: 'nike-account', childrenOf })!
    expect(units).toContain('nike-platform')
  })

  it('survives a cycle in the tree rather than hanging', () => {
    // Somebody will eventually make a unit its own grandparent.
    const looped = new Map([['a', ['b']], ['b', ['a']]])
    expect(unitsVisibleTo({ walls: true, unitId: 'a', childrenOf: looped })!.sort()).toEqual(['a', 'b'])
  })

  it('shows the whole firm where the company has not separated its accounts', () => {
    expect(unitsVisibleTo({ walls: false, unitId: 'terumo-account', childrenOf })).toBeNull()
  })
})

describe('the filter that does the work', () => {
  it('adds nothing when somebody sees the whole firm', () => {
    expect(accountScope(null)).toEqual({})
  })

  it('keeps rows coded to no account visible', () => {
    // Unallocated work is not another account's secret, and hiding it
    // would quietly shrink every total a manager reconciles against.
    const scope = accountScope(['terumo-account']) as { OR: Record<string, unknown>[] }
    expect(scope.OR).toHaveLength(2)
    expect(scope.OR[1]).toEqual({ orgUnitId: null })
  })

  it('can filter a column by another name', () => {
    expect(JSON.stringify(accountScope(['a'], 'unitId'))).toContain('unitId')
  })
})

describe('telling somebody they are seeing less than everything', () => {
  it('says nothing to somebody seeing the whole firm', () => {
    expect(scopeNote(null, null)).toBeNull()
  })

  it('names the account, so a smaller number is understood rather than doubted', () => {
    expect(scopeNote(['x'], 'Terumo account')).toMatch(/Terumo account/)
  })

  it('still says something when the account has no name to hand', () => {
    expect(scopeNote(['x'], null)).toMatch(/your own account/i)
  })
})

describe('putting two filters together', () => {
  it('keeps both, rather than letting one replace the other', () => {
    // Both the company scope and the account scope express themselves as
    // OR. Spreading one over the other keeps only the second, which turns
    // a wall into a wide-open query that still looks filtered — a walled
    // delivery manager was briefly shown every contract on the platform
    // exactly this way.
    const scope = { OR: [{ companyId: 'ravensbourne' }] }
    const wall = { OR: [{ deliveryUnitId: { in: ['retail'] } }] }

    const spread = { ...scope, ...wall }
    expect(spread.OR).toHaveLength(1)
    expect(JSON.stringify(spread)).not.toContain('ravensbourne')

    const combined = andAll(scope, wall) as { AND: unknown[] }
    expect(combined.AND).toHaveLength(2)
    expect(JSON.stringify(combined)).toContain('ravensbourne')
    expect(JSON.stringify(combined)).toContain('retail')
  })

  it('stays a plain object when there is nothing to combine', () => {
    expect(andAll({ companyId: 'x' }, {})).toEqual({ companyId: 'x' })
    expect(andAll(undefined, null, {})).toEqual({})
  })
})
