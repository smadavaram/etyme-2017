/**
 * The sample program under the home page's hero is the seed's, not an
 * invention. Every row is held to the placement the world seed builds for
 * Northbend Athletic (`PROGRAMMES[0]` in lib/seed-programmes), read from
 * the client's side — the supplier it pays and the rate it pays — and
 * every figure is the product's own arithmetic.
 */
import { describe, it, expect } from 'vitest'
import { PROGRAMMES } from '@/lib/seed-programmes'
import { spreadHours } from '@/lib/seed-days'
import { daysFor } from '@/lib/tenure-days'
import {
  SAMPLE_CONTRACTORS, SAMPLE_LIMIT_MONTHS, SAMPLE_RECEIPT, SAMPLE_WEEK,
  sampleRows, sampleStats, sampleWeek, sampleCheck, sampleFirms,
} from '@/lib/public-site/sample-desk'
import { namedCompanies } from '@/lib/positioning'

const NORTHBEND = PROGRAMMES.find((p) => p.client === 'nike')!
const WORLD_NAMES: Record<string, string> = {
  'computer-systems': 'Computer Systems Inc', brightmoor: 'Brightmoor Staffing', pinnacle: 'Pinnacle Resourcing',
}

describe('The sample program on the home page is the seed’s own', () => {

  it('every sample row is a placement the seed builds, at the supplier and the rate the client pays', () => {
    for (const c of SAMPLE_CONTRACTORS) {
      const lines = NORTHBEND.placements.filter((pl) => pl.person === c.person)
      expect(lines.length, c.person).toBe(c.stretches.length)
      for (const s of c.stretches) {
        const line = lines.find((pl) => pl.via[1] === s.supplierSlug && pl.startedDaysAgo === s.startedDaysAgo)
        expect(line, `${c.person} via ${s.supplierSlug}`).toBeTruthy()
        expect(line!.endsInDays).toBe(s.endsInDays)
        expect(WORLD_NAMES[s.supplierSlug]).toBe(s.supplier)
      }
      const current = lines.find((pl) => pl.state !== 'ENDED')!
      expect(current.rates[0], `${c.person} rate`).toBe(c.rateCents)
      expect(current.role).toBe(c.job)
    }
    expect(NORTHBEND.governance.tenureCapMonths).toBe(SAMPLE_LIMIT_MONTHS)
  })

  it('counts months on site across every supplier, whole months and never rounded up', () => {
    const rows = sampleRows()
    const lucia = rows.find((r) => r.person === 'Lucía Fernández')!
    // 396 days through Brightmoor (both ends counted) and 30 through Pinnacle.
    expect(lucia.days).toBe(426)
    expect(lucia.months).toBe(14)
    expect(lucia.suppliers).toBe(2)
    expect(lucia.onSite).toBe('14 of 18 months')
    expect(lucia.days).toBeLessThan(daysFor(SAMPLE_LIMIT_MONTHS))
    expect(rows.find((r) => r.person === 'Helena Marsh')!.months).toBe(6)
  })

  it('shows the person who cannot start yet in the product’s own sentence, never as on site', () => {
    const ingrid = sampleRows().find((r) => r.person === 'Ingrid Sørensen')!
    expect(NORTHBEND.placements.find((p) => p.person === 'Ingrid Sørensen')!.papers).toBe('NO_I9')
    expect(ingrid.status).toBe('Cannot start without an I-9.')
    expect(ingrid.onSite).toBe('Starts in 7 days')
    expect(ingrid.tone).toBe('attention')
  })

  it('draws numbers over the list that are counts of the rows under them and nothing else', () => {
    expect(sampleStats()).toEqual([
      { label: 'On site', value: 3 },
      { label: 'Suppliers on site', value: 3 },
      { label: 'Starting soon', value: 1 },
    ])
  })

  it('shows the 44-hour week the seed writes, spread the way the seed spreads it, and flags it over the job’s 40', () => {
    const lucia = NORTHBEND.placements.find((p) => p.person === 'Lucía Fernández' && p.state !== 'ENDED')!
    const week = sampleWeek()
    expect(week.hours).toBe(lucia.exceptionHours)
    expect(SAMPLE_WEEK.days.filter((d) => d.h > 0).map((d) => d.h)).toEqual(spreadHours(44, 5))
    expect(week.flag).toBe('44 hours, 4 over the 40 the job allows. Approve anyway asks for a reason.')
  })

  it('checks one invoice receipt three ways — signed hours, contract rate, amount — and it comes to the seed’s $17,400', () => {
    const helena = NORTHBEND.placements.find((p) => p.person === 'Helena Marsh')!
    expect(helena.weeks?.approved).toBe(SAMPLE_RECEIPT.signedWeeks)
    expect(helena.rates[0]).toBe(SAMPLE_RECEIPT.rateCents)
    const check = sampleCheck()
    expect(check.lines.map((l) => l.value)).toEqual(['120.0', '$145.00 / hr', '$17,400.00'])
    expect(check.agrees).toBe(true)
    expect(check.says).toBe('All three agree. Ready to pay.')
  })

  it('names only firms the seed builds, and no real company', () => {
    expect(sampleFirms()).toEqual(['Northbend Athletic', 'Computer Systems Inc', 'Brightmoor Staffing', 'Pinnacle Resourcing'])
    expect(namedCompanies(sampleRows().map((r) => `${r.person} ${r.job} ${r.supplier}`).join(' '))).toEqual([])
  })
})
