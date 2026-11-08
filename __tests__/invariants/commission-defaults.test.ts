import { describe, it, expect } from 'vitest'
import {
  checkDefaults, stampDefaults, storedFrom, mayEditDefaults, defaultFitsLine, defaultSays,
  defaultsBody, typedFrom, DEFAULT_FIELDS, type TypedDefault,
} from '@/lib/money/commission-defaults'
import { defaultsFrom, defaultCommissionRows, BASES, KINDS } from '@/lib/money/commission-rows'

/**
 * The firm's default commission rates (founder, 2026-11-08: "Commission is
 * object on sell and buy contracts"). The award writes rows from these; the
 * shipped default is none. The Owner or a Contract Manager says them on
 * Payroll → Commissions, with who and when kept beside each.
 */

const WHO = { personId: 'jenna', name: 'Jenna Okafor' }
const AT = new Date('2026-11-08T15:00:00Z')

const typed = (patch: Partial<TypedDefault> = {}): TypedDefault => ({
  on: true, basis: 'SHARE_OF_MARGIN', percent: '10', fixed: '', cap: '', accrueOn: 'ACCEPTED', ...patch,
})

describe('who says the firm’s default commission rates', () => {
  it('the Owner and a Contract Manager may set the firm’s default commission rates', () => {
    expect(mayEditDefaults('Owner', 'Brightmoor Staffing')).toBeNull()
    expect(mayEditDefaults('Contract Manager', 'Brightmoor Staffing')).toBeNull()
  })

  it('a recruiter, an account manager and payroll are refused in a sentence that names who sets them', () => {
    for (const role of ['Recruiter', 'Account Manager', 'AP & Payroll', 'Finance', null]) {
      expect(mayEditDefaults(role, 'Brightmoor Staffing')).toBe(
        'The default commission rates are set by the Owner or a Contract Manager at Brightmoor Staffing.',
      )
    }
  })
})

describe('a default is refused in a sentence naming the kind and the field', () => {
  it('a share of more than the whole is refused on the share', () => {
    const v = checkDefaults({ SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 12_000 } }, 'USD')
    expect(v).toEqual({ ok: false, field: 'SALES.rateBps', says: 'Sales commission: The share is more than nothing and at most the whole: between 0.01% and 100%.' })
  })

  it('a fixed amount per hour with no amount is refused on the amount', () => {
    const v = checkDefaults({ RECRUITING: { basis: 'PER_HOUR' } }, 'USD')
    expect(v.ok).toBe(false)
    expect(!v.ok && v.field).toBe('RECRUITING.amountCents')
    expect(!v.ok && v.says).toMatch(/^Recruiting commission: Say the amount/)
  })

  it('a cap of nothing is refused on the cap', () => {
    const v = checkDefaults({ SALES: { basis: 'SHARE_OF_BILLED', rateBps: 300, capCents: 0 } }, 'USD')
    expect(!v.ok && v.field).toBe('SALES.capCents')
  })

  it('a basis nobody offers is refused on the basis', () => {
    const v = checkDefaults({ SALES: { basis: 'GUESS', rateBps: 300 } }, 'USD')
    expect(!v.ok && v.field).toBe('SALES.basis')
  })

  it('a save that names neither kind is refused, so nothing is wiped by an empty press', () => {
    expect(checkDefaults({}, 'USD').ok).toBe(false)
  })
})

describe('what is kept, and who and when', () => {
  it('a default is kept with who set it and when, and a share carries no currency', () => {
    const v = checkDefaults({ SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 1000 } }, 'USD')
    if (!v.ok) throw new Error(v.says)
    const stored = stampDefaults(null, v.defaults, WHO, AT)
    expect(stored.SALES).toEqual({
      basis: 'SHARE_OF_MARGIN', rateBps: 1000, amountCents: null, capCents: null, accrueOn: 'ACCEPTED',
      currency: null, setById: 'jenna', setByName: 'Jenna Okafor', setAt: AT.toISOString(),
    })
    expect(stored.RECRUITING).toBeUndefined()
  })

  it('a fixed amount or a cap is kept in the firm’s own currency', () => {
    const v = checkDefaults({ RECRUITING: { basis: 'PER_HOUR', amountCents: 250, capCents: 500_000 } }, 'inr')
    if (!v.ok) throw new Error(v.says)
    expect(v.defaults.RECRUITING?.currency).toBe('INR')
  })

  it('changing one kind keeps the other kind and who set it', () => {
    const first = checkDefaults({ SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 1000 }, RECRUITING: { basis: 'SHARE_OF_BILLED', rateBps: 200 } }, 'USD')
    if (!first.ok) throw new Error(first.says)
    const stored = stampDefaults(null, first.defaults, WHO, AT)
    const second = checkDefaults({ SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 800 } }, 'USD')
    if (!second.ok) throw new Error(second.says)
    const later = new Date('2026-11-09T10:00:00Z')
    const next = stampDefaults(stored, second.defaults, { personId: 'cm', name: 'Paul Reyes' }, later)
    expect(next.SALES?.rateBps).toBe(800)
    expect(next.SALES?.setByName).toBe('Paul Reyes')
    expect(next.RECRUITING).toEqual(stored.RECRUITING)
  })

  it('a kind sent as none is removed, and the award then writes none of that kind', () => {
    const first = checkDefaults({ SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 1000 } }, 'USD')
    if (!first.ok) throw new Error(first.says)
    const cleared = checkDefaults({ SALES: null }, 'USD')
    if (!cleared.ok) throw new Error(cleared.says)
    const next = stampDefaults(stampDefaults(null, first.defaults, WHO, AT), cleared.defaults, WHO, AT)
    expect(next.SALES).toBeUndefined()
    expect(defaultsFrom(next)).toEqual({})
  })

  it('what is saved is what the award reads, so the award writes the firm’s rate', () => {
    const v = checkDefaults({ SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 1000 } }, 'USD')
    if (!v.ok) throw new Error(v.says)
    const rows = defaultCommissionRows(defaultsFrom(stampDefaults(null, v.defaults, WHO, AT)), {
      sellContractId: 'sell', buyContractId: 'buy', soldById: 'marisa', recruitedById: null, startDate: AT, setById: 'jenna',
    })
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toMatchObject({ kind: 'SALES', earnedById: 'marisa', rateBps: 1000, sellContractId: 'sell' })
    // The who-and-when keys never reach the row the award writes.
    expect(Object.keys(rows.rows[0])).not.toContain('setByName')
  })

  it('the shipped default is none: a firm that never set one has no default of either kind', () => {
    expect(storedFrom(null)).toEqual({})
    expect(defaultSays('SALES', undefined)).toBe('Sales commission: no default. The award writes none; set one on the line if it is owed.')
  })

  it('the page says each default in words with who set it and when', () => {
    const v = checkDefaults({ SALES: { basis: 'SHARE_OF_MARGIN', rateBps: 1000 } }, 'USD')
    if (!v.ok) throw new Error(v.says)
    const said = defaultSays('SALES', stampDefaults(null, v.defaults, WHO, AT).SALES)
    expect(said).toMatch(/^Sales commission: 10% of the margin, on the weeks the firm above accepted\. Set by Jenna Okafor on /)
  })
})

describe('rupees and dollars are never added', () => {
  it('a share fits a line in any currency', () => {
    expect(defaultFitsLine('SALES', { amountCents: null, capCents: null, currency: null }, 'INR')).toBeNull()
  })

  it('a fixed amount in dollars is never written on a line paid in rupees, and says why', () => {
    const says = defaultFitsLine('RECRUITING', { amountCents: 250, capCents: null, currency: 'USD' }, 'INR')
    expect(says).toBe('No recruiting commission was written: the firm’s default is in USD and this line is in INR, and a fixed amount in one is never paid as the other.')
  })

  it('a share with a cap in dollars is never written on a line billed in rupees', () => {
    expect(defaultFitsLine('SALES', { amountCents: null, capCents: 500_000, currency: 'USD' }, 'INR')).not.toBeNull()
    expect(defaultFitsLine('SALES', { amountCents: null, capCents: 500_000, currency: 'USD' }, 'USD')).toBeNull()
  })
})

describe('every question the defaults route asks, its screen has a field for', () => {
  it('every field the route can refuse on is one the screen draws, for both kinds', () => {
    const drawn = new Set(KINDS.flatMap((k) => DEFAULT_FIELDS.map((f) => `${k}.${f}`)))
    const tries = [
      { SALES: typed({ percent: '' }) },
      { SALES: typed({ percent: '150' }) },
      { SALES: typed({ percent: 'ten' }) },
      { RECRUITING: typed({ basis: 'PER_HOUR', fixed: '' }) },
      { RECRUITING: typed({ basis: 'PER_PERIOD', fixed: 'abc' }) },
      { SALES: typed({ cap: '0' }) },
      { SALES: typed({ basis: '' }) },
    ]
    for (const t of tries) {
      const v = checkDefaults(defaultsBody(t, 'USD'), 'USD')
      expect(v.ok, JSON.stringify(t)).toBe(false)
      if (!v.ok) expect(drawn.has(v.field), v.field).toBe(true)
    }
  })

  it('every basis filled in on the screen saves', () => {
    for (const basis of BASES) {
      const share = basis.startsWith('SHARE')
      const body = defaultsBody({ SALES: typed({ basis, percent: share ? '7.5' : '', fixed: share ? '' : '2.50', cap: '5,000' }) }, 'USD')
      const v = checkDefaults(body, 'USD')
      expect(v.ok, `${basis}: ${JSON.stringify(v)}`).toBe(true)
    }
  })

  it('a percentage typed as 7.5 is kept as 750 basis points, and $2.50 as 250 cents', () => {
    expect(defaultsBody({ SALES: typed({ percent: '7.5' }) }, 'USD').SALES?.rateBps).toBe(750)
    expect(defaultsBody({ SALES: typed({ basis: 'PER_HOUR', fixed: '$2.50' }) }, 'USD').SALES?.amountCents).toBe(250)
  })

  it('a fixed amount typed in yen is kept in yen, with no cents invented', () => {
    expect(defaultsBody({ SALES: typed({ basis: 'PER_HOUR', fixed: '300' }) }, 'JPY').SALES?.amountCents).toBe(300)
  })

  it('a kind switched off on the screen is sent as none', () => {
    expect(defaultsBody({ RECRUITING: typed({ on: false }) }, 'USD')).toEqual({ RECRUITING: null })
  })

  it('what was saved reads back into the same form', () => {
    const v = checkDefaults(defaultsBody({ SALES: typed({ basis: 'PER_HOUR', percent: '', fixed: '2.50', cap: '100' }) }, 'USD'), 'USD')
    if (!v.ok) throw new Error(v.says)
    const back = typedFrom(stampDefaults(null, v.defaults, WHO, AT).SALES, 'USD')
    expect(back).toMatchObject({ on: true, basis: 'PER_HOUR', fixed: '2.50', cap: '100.00' })
  })
})
