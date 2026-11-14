/**
 * The home page's Ask Etyme demo, read against the Corvane seed.
 *
 * Since 2026-11-13 the whole home page reads one sample company, Corvane
 * Packaging (founder: "we are talking about companies spending 40-50
 * million a year; make the numbers realistic"). This file does for the
 * home page's demo what `story-panel.test.ts` does for the Northbend
 * panel: it works every figure out again from the seed's own exports, by
 * a route of its own, and holds the demo to it; and it reads every
 * person, firm and site the demo names against the seed.
 */

import { describe, it, expect } from 'vitest'
import {
  CORVANE_NAME, CORVANE_PLANTS, CORVANE_COUNTRIES, CORVANE_SUPPLIERS, CORVANE_TIME_LIMIT_MONTHS,
  LIMIT_DAYS, corvaneContractors, plantOpenJobs, jobBand, plantSuppliers,
} from '@/lib/seed-corvane/plan'
import { programMonthlySpend, HOURS_PER_MONTH } from '@/lib/program-spend'
import { spendInReporting, SAMPLE_RATE_TABLE } from '@/lib/money/reporting-currency'
import { format, fromMinor, fromDecimal } from '@/lib/money'
import { monthsOf } from '@/lib/tenure-days'
import { namedCompanies } from '@/lib/positioning'
import { homeDemo, homeDemoCopy } from '@/lib/public-site/home-demo'
import { homeCfo } from '@/lib/public-site/home-cfo'
import { DEMO_QUESTION, DEMO_LABEL, DEMO_READY } from '@/lib/public-site/home-words'

const D = homeDemo()
const { onSite } = corvaneContractors()
const money = (minor: number, currency: string) => format(fromMinor(minor, currency), { compact: true })
const rateOf = (cc: keyof typeof CORVANE_COUNTRIES) => fromDecimal(CORVANE_COUNTRIES[cc].rate, CORVANE_COUNTRIES[cc].currency).minor
const toLimit = (c: { startedDaysAgo: number }) => LIMIT_DAYS - 1 - c.startedDaysAgo
const aoife = [...onSite].sort((a, b) => toLimit(a) - toLimit(b))[0]

describe('The home page’s demo is Corvane Packaging, every figure the seed’s', () => {

  it('asks what Corvane pays across every supplier this month, and answers with every contractor on site at their own rate for 160 hours, in dollars at the sample exchange rates, the same figure as the CFO view’s tile', () => {
    expect(D.question).toBe(DEMO_QUESTION)
    expect(HOURS_PER_MONTH).toBe(160)
    // A second route: one line per contractor, at their own country's rate, then one conversion.
    const amounts = onSite.map((c) => ({
      currency: CORVANE_COUNTRIES[c.plant.cc].currency,
      minor: programMonthlySpend([{ rateMinorPerHour: rateOf(c.plant.cc) }]).totalMinor,
    }))
    const month = spendInReporting(amounts, 'USD', SAMPLE_RATE_TABLE).total!.minor
    expect(D.answerLead).toBe(`${money(month, 'USD')} a month:`)
    expect(homeCfo().tiles[3].b).toBe(money(month, 'USD'))
    // At the founder's scale: between $40 and $50 million a year.
    expect(month * 12).toBeGreaterThan(4_000_000_000)
    expect(month * 12).toBeLessThan(5_000_000_000)
    // The dollars are said to rest on sample exchange rates, in the answer itself.
    expect(D.answerRest).toContain('Dollars use sample exchange rates.')
  })

  it('counts the contractors on site, the suppliers and the countries from the seed: 359 through 25 in 8', () => {
    const suppliers = Object.values(CORVANE_SUPPLIERS).reduce((n, l) => n + l.length, 0)
    const countries = new Set(CORVANE_PLANTS.map((p) => p.cc)).size
    expect([onSite.length, suppliers, countries]).toEqual([359, 25, 8])
    // Every supplier the seed holds has somebody on site, so "through 25 suppliers" is true of the people too.
    expect(new Set(onSite.map((c) => c.supplier)).size).toBe(suppliers)
    expect(D.answerRest.startsWith(`${onSite.length} contractors through ${suppliers} suppliers in ${countries} countries, at current rates.`)).toBe(true)
  })

  it('says Aoife Kelly in Belfast has 17 whole months here across two suppliers, that the limit is 18, and that she reaches it in 14 days, the nearest anybody at Corvane is to the limit', () => {
    expect([aoife.name, aoife.plant.city]).toEqual(['Aoife Kelly', 'Belfast'])
    // Two suppliers, with no day between them: the client's count runs across both.
    expect(aoife.earlier).not.toBeNull()
    expect(aoife.earlier!.supplier).not.toBe(aoife.supplier)
    const months = monthsOf(aoife.startedDaysAgo + 1)
    expect(months).toBe(17)
    expect(CORVANE_TIME_LIMIT_MONTHS).toBe(18)
    expect(toLimit(aoife)).toBe(14)
    expect(D.answerRest).toContain(
      `${aoife.name} in ${aoife.plant.city} has ${months} months here across two suppliers. ` +
      `The limit is ${CORVANE_TIME_LIMIT_MONTHS}; Aoife reaches it in ${toLimit(aoife)} days.`,
    )
    expect(D.watch).toEqual({ months, limit: CORVANE_TIME_LIMIT_MONTHS })
  })

  it('shows three of the 359, at Dayton, Antwerp and Belfast: each one’s supplier, rate an hour in its own currency through the one formatter, and whole months here, never rounded up, with Watch limit beside Aoife Kelly', () => {
    const at = (key: string, i: number) => onSite.find((c) => c.plant.key === key && c.index === i)!
    const three = [at('dayton', 0), at('antwerp', 0), aoife]
    expect(D.sites).toEqual(three.map((c) => c.plant.plant))
    expect(D.rows).toEqual(three.map((c) => {
      const m = monthsOf(c.startedDaysAgo + 1)
      const unit = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`
      return [
        c.name, c.supplier, money(rateOf(c.plant.cc), CORVANE_COUNTRIES[c.plant.cc].currency),
        c === aoife ? `${m} of ${unit(CORVANE_TIME_LIMIT_MONTHS)} · 2 suppliers` : unit(m),
      ]
    }))
    // Dollars, euros and pounds, each in its own money.
    expect(D.rows.map((r) => r[2][0])).toEqual(['$', '€', '£'])
    expect(D.watchRows).toEqual([2])
  })

  it('the send card is the open Dayton job from the seed, its months, the site and its band, ready to send to suppliers', () => {
    const dayton = CORVANE_PLANTS.find((p) => p.key === 'dayton')!
    const job = plantOpenJobs(dayton)[0]
    const band = jobBand(dayton.cc)!
    expect(D.card.job).toBe(job.title)
    expect(D.card.detail).toBe(
      `${job.months} months · ${dayton.plant} · ${money(band.billMin, 'USD')}–${String(band.billMax / 100)}/hr · ${DEMO_READY}`,
    )
    // The site's own suppliers are the ones it would go to.
    expect(plantSuppliers(dayton).length).toBeGreaterThan(0)
  })

  it('names only people, firms and sites the Corvane seed holds, labels Corvane a demo and not a customer, and names no real company', () => {
    expect(D.company).toBe(CORVANE_NAME)
    const firms = new Set(Object.values(CORVANE_SUPPLIERS).flat().map((s) => s.name))
    for (const r of D.rows) {
      expect(onSite.some((c) => c.name === r[0]), r[0]).toBe(true)
      expect(firms.has(r[1]), r[1]).toBe(true)
    }
    for (const s of D.sites) expect(CORVANE_PLANTS.some((p) => p.plant === s), s).toBe(true)
    expect(homeDemoCopy(D)).toContain(DEMO_LABEL)
    expect(namedCompanies(homeDemoCopy(D).join(' '))).toEqual([])
  })
})
