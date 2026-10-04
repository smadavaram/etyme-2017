import { describe, it, expect } from 'vitest'
import { readBench } from '@/lib/bench-filter'

/**
 * The bench answer, read through one door.
 *
 * `/api/bench` answers `{ data: { tiers, totals } }`. The bench page read
 * `data.tiers`; the training page read `data.listings`, which the route
 * has never sent, and so reported nought skilled people over a bench of
 * five. These fixtures are shaped exactly the way the route answers.
 */

function listing(over: Record<string, unknown> = {}) {
  return {
    id: 'bl_1',
    tier: 'RETAINED',
    consent: 'GRANTED',
    rateMin: 9000,
    rateMax: 11000,
    grantedAt: '2026-01-01T00:00:00.000Z',
    company: { id: 'co_1', name: 'Techpeple', slug: 'world-techpeple' },
    consultant: {
      id: 'cp_1',
      personId: 'p_1',
      person: { id: 'p_1', name: 'Priya Raman', email: 'priya@seed.etyme.invalid' },
      headline: 'SAP FICO consultant',
      skills: ['ERP finance', 'General ledger'],
      location: 'Tualatin, OR',
      workAuth: 'H1B',
      availableFrom: '2026-10-01T00:00:00.000Z',
      visibility: 'CLIENT_VISIBLE',
    },
    ...over,
  }
}

function answer(retained: unknown[], marketing: unknown[] = []) {
  return { data: { scope: 'company', tiers: { RETAINED: retained, MARKETING: marketing }, totals: { RETAINED: retained.length, MARKETING: marketing.length, total: retained.length + marketing.length } } }
}

describe('the bench answer has one reader', () => {
  it('reads every person the bench route actually sent, with their skills', () => {
    const r = readBench(answer([listing(), listing({ id: 'bl_2', consultant: { ...listing().consultant, id: 'cp_2', personId: 'p_2', person: { id: 'p_2', name: 'Helena Marsh', email: 'h@seed.etyme.invalid' }, skills: ['ERP finance', 'General ledger', 'Central finance'] } })]))
    expect(r.ok).toBe(true)
    expect(r.rows.map((x) => x.name)).toEqual(['Priya Raman', 'Helena Marsh'])
    expect(r.rows[1].skills).toEqual(['ERP finance', 'General ledger', 'Central finance'])
  })

  it('counts the two tiers the way the bench page shows them', () => {
    const r = readBench(answer([listing()], [listing({ id: 'bl_3', tier: 'MARKETING' })]))
    expect(r.retained).toBe(1)
    expect(r.marketing).toBe(1)
    expect(r.rows.filter((x) => x.tier === 'MARKETING')).toHaveLength(1)
  })

  it('a page handed a bench answer it cannot read says so instead of reporting zero', () => {
    // The exact bug: a reader looking for a key the route never sent.
    const r = readBench({ data: { listings: [] } })
    expect(r.ok).toBe(false)
    expect(r.rows).toHaveLength(0)
    expect(r.retained).toBeNull()
    expect(r.why).toMatch(/does not understand/i)
    expect(r.why).toMatch(/zero here would be invented/i)
  })

  it('a bench that did not answer at all is not a bench of nobody', () => {
    for (const nothing of [null, undefined, 'error', 42]) {
      const r = readBench(nothing)
      expect(r.ok).toBe(false)
      expect(r.why).toBeTruthy()
    }
  })

  it('a bench answer carrying a row with no person in it is refused whole, never silently shortened', () => {
    const broken = { ...listing({ id: 'bl_4' }), consultant: { id: 'cp_4', personId: 'p_4' } }
    const r = readBench(answer([listing(), broken]))
    expect(r.ok).toBe(false)
    expect(r.rows).toHaveLength(0)
    expect(r.why).toMatch(/could not read/i)
  })

  it('a tier nobody has decided the meaning of stops the count rather than disappearing from it', () => {
    const r = readBench({ data: { tiers: { RETAINED: [listing()], ALUMNI: [listing({ id: 'bl_5' })] } } })
    expect(r.ok).toBe(false)
    expect(r.why).toMatch(/never heard of/i)
  })

  it('an empty bench is read as an empty bench, and says nothing is wrong', () => {
    const r = readBench(answer([], []))
    expect(r.ok).toBe(true)
    expect(r.rows).toHaveLength(0)
    expect(r.why).toBeNull()
  })
})
