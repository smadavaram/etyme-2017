import { describe, it, expect } from 'vitest'
import {
  reachOf, onePerPerson, ranked, shownTo, actionFor, rateWithoutNumber, withoutName,
  type Ties, type PoolEntry,
} from '../../src/lib/match-pool'

/**
 * Matching brings bench to a job request — decided 2026-09-30.
 *
 * The rules, without a database. The same rules are walked on the seeded
 * world in `__integration__/bench-matching.test.ts`.
 */

const ties = (over: Partial<Ties> = {}): Ties => ({
  self: 'client',
  panel: new Set(['supplier']),
  trading: new Set(['partner']),
  blocked: new Set(['blocked']),
  belowPrimes: new Set(['sub']),
  ...over,
})

const listing = (companyId: string, over: Record<string, unknown> = {}) => ({
  companyId, tier: 'MARKETING', state: 'GRANTED', revokedAt: null as Date | null, showInMatches: false, ...over,
})

const entry = (over: Partial<PoolEntry> = {}): PoolEntry => ({
  personId: 'p1', consultantId: 'c1', name: 'Grace Lindqvist', reach: 'PANEL', employee: false,
  firmId: 'supplier', firmName: 'Brightmoor Staffing', rateMin: 9_000, rateMax: 11_000, since: new Date('2026-01-01'),
  standing: null,
  consultant: {
    headline: 'Grace Lindqvist — HCM integration lead', skills: ['HCM integration'], location: 'Portland, OR',
    workAuth: 'GC', rateFloor: 8_500, availableFrom: null, confirmedAt: null,
  },
  ...over,
})

describe('who a job request is matched against', () => {
  it('a supplier the client already buys from brings its marketed bench, ranked as a supplier', () => {
    expect(reachOf(listing('supplier'), ties(), true)).toBe('PANEL')
  })

  it('another firm the client trades with brings its marketed bench, below its suppliers', () => {
    expect(reachOf(listing('partner'), ties(), true)).toBe('TRADING')
  })

  it('a person from a firm the client does not use appears only if they agreed to be shown in matches', () => {
    expect(reachOf(listing('stranger'), ties(), true)).toBeNull()
    expect(reachOf(listing('stranger', { showInMatches: true }), ties(), true)).toBe('SUGGESTION')
  })

  it('only a client on its own job request is shown suggestions', () => {
    expect(reachOf(listing('stranger', { showInMatches: true }), ties(), false)).toBeNull()
  })

  it('a sub-vendor under the client’s prime is never suggested to the client, whatever the person agreed', () => {
    expect(reachOf(listing('sub', { showInMatches: true }), ties(), true)).toBeNull()
  })

  it('nobody reaches anybody on a listing that was taken back, declined, unanswered or retained', () => {
    expect(reachOf(listing('supplier', { revokedAt: new Date() }), ties(), true)).toBeNull()
    expect(reachOf(listing('supplier', { state: 'DECLINED' }), ties(), true)).toBeNull()
    expect(reachOf(listing('supplier', { state: 'INVITED' }), ties(), true)).toBeNull()
    expect(reachOf(listing('supplier', { tier: 'RETAINED' }), ties(), true)).toBeNull()
  })

  it('a blocked firm brings nobody', () => {
    expect(reachOf(listing('blocked', { showInMatches: true }), ties(), true)).toBeNull()
  })

  it('a firm’s own listing reaches it whatever the tier', () => {
    expect(reachOf(listing('client', { tier: 'RETAINED' }), ties(), false)).toBe('OWN')
  })

  it('a person whose chosen bench stay ran out is out of every match, even before the nightly job', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    const ended = { staysUntil: new Date('2026-10-08T00:00:00Z') }
    expect(reachOf(listing('supplier', ended), ties(), true, now)).toBeNull()
    expect(reachOf(listing('partner', ended), ties(), true, now)).toBeNull()
    expect(reachOf(listing('stranger', { ...ended, showInMatches: true }), ties(), true, now)).toBeNull()
    expect(reachOf(listing('client', ended), ties(), false, now)).toBeNull()
  })
})

describe('how matches rank', () => {
  it('a client’s job request is matched with bench from the suppliers it already uses, ranked first', () => {
    const rows = ranked([
      { reach: 'SUGGESTION' as const, score: 99 },
      { reach: 'TRADING' as const, score: 95 },
      { reach: 'PANEL' as const, score: 60 },
      { reach: 'PANEL' as const, score: 80 },
    ])
    expect(rows.map((r) => `${r.reach}:${r.score}`)).toEqual(['PANEL:80', 'PANEL:60', 'TRADING:95', 'SUGGESTION:99'])
  })

  it('a person offered by two firms is one row, through the nearest and then the longest-held consent', () => {
    const out = onePerPerson([
      entry({ reach: 'TRADING', firmId: 'partner' }),
      entry({ reach: 'PANEL', firmId: 'late', since: new Date('2026-06-01') }),
      entry({ reach: 'PANEL', firmId: 'early', since: new Date('2026-02-01') }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].firmId).toBe('early')
  })
})

describe('what a match shows', () => {
  const match = { factors: [{ label: 'Rate Fit', value: 100, weight: 0.15, detail: 'Floor $85/hr within budget' }], basis: 'Grace Lindqvist fits the integration work', unknowns: 'Grace has no work authorization on file' }

  it('a person from a firm the client does not use appears without their name, contact or rate', () => {
    const shown = shownTo(entry({ reach: 'SUGGESTION', firmName: 'Nimbus Talent' }), match, { buyer: true })
    expect(shown.name).toBeNull()
    expect(shown.headline).toBeNull()
    expect(shown.location).toBeNull()
    expect(shown.rate).toBeNull()
    expect(JSON.stringify(shown)).not.toContain('Grace')
    expect(JSON.stringify(shown)).not.toContain('Lindqvist')
    expect(JSON.stringify(shown)).not.toContain('$85')
    expect(shown.firm.name).toBe('Nimbus Talent')
    expect(shown.skills).toEqual(['HCM integration'])
  })

  it('a client never reads a rate off a match, even from its own supplier', () => {
    const shown = shownTo(entry(), match, { buyer: true })
    expect(shown.rate).toBeNull()
    expect(shown.factors[0].detail).toBe('Within the job’s rate range')
    expect(shown.name).toBe('Grace Lindqvist')
  })

  it('a firm that sells reads its own supplier’s rate, because that is its own deal', () => {
    const shown = shownTo(entry(), match, { buyer: false })
    expect(shown.rate).toEqual({ min: 9_000, max: 11_000 })
  })

  it('every match keeps its factors, basis and unknowns, suggestions included', () => {
    const shown = shownTo(entry({ reach: 'SUGGESTION' }), match, { buyer: true })
    expect(shown.factors.length).toBeGreaterThan(0)
    expect(shown.basis.length).toBeGreaterThan(0)
    expect(shown.unknowns).toBe('this consultant has no work authorization on file')
  })

  it('a rate factor says whether it fits, and never the number', () => {
    expect(rateWithoutNumber({ label: 'Rate Fit', value: 40, weight: 0.15, detail: '$120/hr' }).detail).toBe('Above the job’s rate range')
    expect(withoutName('Grace Lindqvist, and Grace again', 'Grace Lindqvist')).toBe('this consultant, and this consultant again')
  })
})

describe('the one action on a row', () => {
  it('a suggestion cannot be submitted or messaged; its one action is asking to add the firm', () => {
    const a = actionFor({ entry: entry({ reach: 'SUGGESTION' }), viewer: { companyId: 'client', buyer: true } })
    expect(a.kind).toBe('ASK_TO_ADD')
  })

  it('a client asks its supplier to put the person forward, and the rate comes from the supplier', () => {
    const a = actionFor({ entry: entry(), viewer: { companyId: 'client', buyer: true } })
    expect(a).toMatchObject({ kind: 'ASK', toCompanyId: 'supplier' })
  })

  it('a firm approved under a prime is asked for through the prime, never round it', () => {
    const a = actionFor({ entry: entry(), viewer: { companyId: 'client', buyer: true }, under: { companyId: 'prime', name: 'Computer Systems Inc' } })
    expect(a).toMatchObject({ kind: 'ASK', toCompanyId: 'prime', toName: 'Computer Systems Inc' })
  })

  it('adding a match to the application sends the supplier’s real rate, never a placeholder', () => {
    const own = actionFor({ entry: entry({ reach: 'OWN', firmId: 'vendor' }), viewer: { companyId: 'vendor', buyer: false } })
    expect(own).toMatchObject({ kind: 'SUBMIT', fromCompanyId: 'vendor', rate: 11_000, offeredBy: null })
    const noRate = actionFor({ entry: entry({ reach: 'OWN', firmId: 'vendor', rateMin: null, rateMax: null }), viewer: { companyId: 'vendor', buyer: false } })
    expect(noRate).toMatchObject({ kind: 'SUBMIT', rate: null })
  })

  it('a supplier’s person goes forward in the firm’s own name, bought from the supplier at the supplier’s own rate', () => {
    const a = actionFor({ entry: entry({ reach: 'PANEL', firmId: 'techpeple' }), viewer: { companyId: 'prime', buyer: false } })
    expect(a).toMatchObject({ kind: 'SUBMIT', fromCompanyId: 'prime', offeredBy: 'techpeple', payRate: 11_000, rate: null })
  })

  it('an integrator’s own employee goes forward as its own employee, at the rate it last billed them', () => {
    const a = actionFor({
      entry: entry({ reach: 'OWN', employee: true, firmId: 'teleworld', rateMin: null, rateMax: null }),
      viewer: { companyId: 'teleworld', buyer: false },
      lastBillRate: 13_800,
    })
    expect(a).toMatchObject({ kind: 'SUBMIT', as: 'INTERNAL', rate: 13_800, fromCompanyId: 'teleworld' })
  })
})
