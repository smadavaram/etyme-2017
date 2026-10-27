/**
 * Papers and pay per country, as data (lib/document-stages/countries).
 *
 * The founder's "go ahead and build this" on the region drawing,
 * 2026-10-27, item 4: each rule is confirmed with its source before it is
 * shown, and an unconfirmed one is not shown. These sentences hold that,
 * and say each country's rule in plain words.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  COUNTRY_ROWS,
  countryRow,
  shownAt,
  timeLimitAt,
  unconfirmed,
  type CountryRow,
} from '@/lib/document-stages/countries'
import { PAY_PERIODS } from '@/lib/pay-dates'
import { builtInType } from '@/lib/document-type'

const ROOT = join(__dirname, '..', '..')
const row = (c: string): CountryRow => {
  const r = countryRow(c)
  if (!r) throw new Error(`no row for ${c}`)
  return r
}
const lines = (r: CountryRow) => [r.rule, r.pay, ...r.papers]

describe('papers and pay per country', () => {
  it('the table has one row for each of the eight countries on the drawing', () => {
    expect(COUNTRY_ROWS.map((r) => r.country).sort()).toEqual(['BE', 'BR', 'CO', 'GB-NIR', 'IN', 'MX', 'US', 'VN'])
  })

  it('every country row names its source and the day it was checked', () => {
    for (const r of COUNTRY_ROWS) {
      for (const l of lines(r)) {
        expect(l.source.trim().length, `${r.country}: ${l.source}`).toBeGreaterThan(10)
        expect(l.checkedOn, r.country).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(Number.isNaN(Date.parse(l.checkedOn)), r.country).toBe(false)
      }
    }
  })

  it('a confirmed line was read, so its source names no "not read"', () => {
    for (const r of COUNTRY_ROWS) for (const l of lines(r)) {
      if (l.confirmed) {
        expect(l.unconfirmedBecause, r.country).toBeNull()
        expect(l.source, r.country).not.toMatch(/\(not read\)/)
      }
    }
  })

  it('every unconfirmed line says why it could not be confirmed', () => {
    for (const r of COUNTRY_ROWS) for (const l of lines(r)) {
      if (!l.confirmed) expect((l.unconfirmedBecause ?? '').length, `${r.country}: ${l.source}`).toBeGreaterThan(20)
    }
  })

  it('an unconfirmed rule is never shown on a screen', () => {
    const shown = shownAt()
    for (const s of shown) {
      if (s.rule) expect(s.rule.confirmed).toBe(true)
      if (s.pay) expect(s.pay.confirmed).toBe(true)
      for (const p of s.papers) expect(p.confirmed).toBe(true)
    }
    // India's rule is unconfirmed, so its row reaches no screen at all.
    expect(shown.find((s) => s.country === 'IN')).toBeUndefined()
    expect(shownAt(['IN'])).toEqual([])
  })

  it('a country that is partly confirmed shows only its confirmed papers', () => {
    const [mx] = shownAt(['MX'])
    expect(mx.papers.map((p) => p.key)).toEqual(['REPSE', 'SERVICES_CONTRACT'])
    expect(mx.rule?.confirmed).toBe(true)
  })

  it('every unconfirmed line is listed in KNOWN-LIMITS.md for the founder', () => {
    const limits = readFileSync(join(ROOT, 'KNOWN-LIMITS.md'), 'utf8')
    const open = unconfirmed()
    expect(open.length).toBeGreaterThan(0)
    for (const u of open) expect(limits, u.id).toContain(`\`${u.id}\``)
  })

  it('the pay a country’s setup offers is one of the four choices the payroll settings already know', () => {
    for (const r of COUNTRY_ROWS) expect(PAY_PERIODS, r.country).toContain(r.pay.period)
  })

  it('a paper that names a shipped document type names one that exists', () => {
    for (const r of COUNTRY_ROWS) for (const p of r.papers) {
      if (p.builtInKey) expect(builtInType(p.builtInKey), `${r.country}.${p.key}`).not.toBeNull()
    }
  })

  it('a country with no limit on time at a client in law returns none, never a guessed one', () => {
    expect(timeLimitAt('US')).toBeNull()
    expect(timeLimitAt('MX')).toBeNull()
    expect(timeLimitAt('GB-NIR')).toBeNull()
    expect(timeLimitAt('FR')).toBeNull()
    expect(timeLimitAt(null)).toBeNull()
  })

  it('a limit on time at a client is offered for the time-limit rule to read, with its source beside it', () => {
    const br = timeLimitAt('BR')
    expect(br?.limitDays).toBe(180)
    expect(br?.source).toContain('Lei 6.019/1974')
  })
})

describe('the rule each country holds a client to, in plain words', () => {
  it('in the United States, nobody starts without an I-9, and the 18-month time limit is the client’s own rule, not the law’s', () => {
    const us = row('US')
    expect(us.rule.confirmed).toBe(true)
    expect(us.rule.enforcement).toBe('BLOCK')
    expect(us.rule.says).toContain('I-9')
    expect(us.rule.says).toContain('client’s own rule')
    expect(us.rule.timeAtClient).toBeNull()
    expect(us.papers.find((p) => p.key === 'I9')?.builtInKey).toBe('I9_EVERIFY')
  })

  it('in Mexico, only a supplier registered for specialist services may provide workers, and never for the client’s core business', () => {
    const mx = row('MX')
    expect(mx.rule.confirmed).toBe(true)
    expect(mx.rule.enforcement).toBe('BLOCK')
    expect(mx.rule.says).toMatch(/registered for specialist services/)
    expect(mx.rule.says).toMatch(/core business/)
    expect(mx.papers.find((p) => p.key === 'REPSE')?.expires).toBe(true)
  })

  it('in Mexico, the worker’s social security number before day one is not confirmed, because the law gives the employer days after the start', () => {
    expect(row('MX').papers.find((p) => p.key === 'IMSS_NUMBER')?.confirmed).toBe(false)
  })

  it('in Brazil, a temporary worker may stay at one client 180 days, plus 90 more if the reason still holds, and not again for 90 days', () => {
    const t = row('BR').rule.timeAtClient
    expect(row('BR').rule.confirmed).toBe(true)
    expect(row('BR').rule.enforcement).toBe('BLOCK')
    expect(t?.limitDays).toBe(180)
    expect(t?.extension?.days).toBe(90)
    expect(t?.breakDays).toBe(90)
  })

  it('in Colombia, a temporary worker covering a rise in work may stay 6 months, renewable once for 6 more', () => {
    const t = row('CO').rule.timeAtClient
    expect(row('CO').rule.confirmed).toBe(true)
    expect(t?.limitMonths).toBe(6)
    expect(t?.extension?.months).toBe(6)
    expect(t?.breakDays).toBeNull()
  })

  it('in Vietnam, a leased worker may be leased for 12 months at most', () => {
    const vn = row('VN')
    expect(vn.rule.confirmed).toBe(true)
    expect(vn.rule.timeAtClient?.limitMonths).toBe(12)
    expect(vn.rule.timeAtClient?.extension).toBeNull()
  })

  it('in India, the per-plant contract labor license on the drawing is not shown, because the 2020 code replaced it and the new rule is not yet confirmed', () => {
    const india = row('IN')
    expect(india.rule.confirmed).toBe(false)
    expect(india.rule.unconfirmedBecause).toMatch(/OSH Code 2020/)
    expect(india.rule.says).not.toMatch(/plant/)
  })

  it('in Belgium, a temporary worker needs one of six allowed reasons, and the employment is declared before work starts', () => {
    const be = row('BE')
    expect(be.rule.confirmed).toBe(true)
    expect(be.rule.enforcement).toBe('BLOCK')
    for (const reason of ['replacement', 'temporary rise in work', 'exceptional work', 'trial for a permanent hire', 'artistic work', 'back-to-work route']) {
      expect(be.rule.says).toContain(reason)
    }
    expect(be.papers.find((p) => p.key === 'DIMONA')?.confirmed).toBe(true)
  })

  it('in Northern Ireland, an agency worker gets the same basic pay and conditions as a direct hire after 12 weeks in the same job, and that is a warning, not a stop', () => {
    const ni = row('GB-NIR')
    expect(ni.rule.confirmed).toBe(true)
    expect(ni.rule.afterWeeks).toBe(12)
    expect(ni.rule.enforcement).toBe('WARN')
    expect(ni.rule.timeAtClient).toBeNull()
    expect(countryRow('NI')?.country).toBe('GB-NIR')
  })
})
