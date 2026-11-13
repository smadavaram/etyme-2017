import { describe, it, expect, beforeAll } from 'vitest'
import {
  CORVANE_PLANTS, CORVANE_REGIONS, CORVANE_PEOPLE, CORVANE_SUPPLIERS, CORVANE_COUNTRIES, CORVANE_RECEIPTS, CORVANE_TIME_LIMIT_MONTHS,
  corvaneContractors, plantSuppliers, billRateMinor, corvaneSteps, contractorName, corvaneSellId, corvanePlaces,
} from '@/lib/seed-corvane'
import { sharedTails } from '@/lib/seed-scale/kit'
import { anchorSeed, day } from '@/lib/seed-days'
import { limitReachedOn } from '@/lib/tenure-days'
import { worldStepNames, WORLD_SLUGS } from '@/lib/seed-world'
import { DESK_ROLES } from '@/lib/demo-desks'
import { CORVANE_JOBS, CORVANE_JOB_SKILLS, payRateMinor, corvaneEarlierSellIds, corvaneDemoFacts, LIMIT_DAYS, BELFAST_HANDOVER_DAYS_AGO, jobBand, plantOpenJobs } from '@/lib/seed-corvane'
import { corvaneHeldFacts, corvaneHeldInReporting, receiptOverMinor } from '@/lib/seed-corvane'
import { programMonthlySpend } from '@/lib/program-spend'
import { spendInReporting, SAMPLE_RATE_TABLE } from '@/lib/money/reporting-currency'
import { format, fromMinor } from '@/lib/money'
import { standingAgainstLimit, monthsOf } from '@/lib/tenure-days'

/**
 * Corvane Packaging is the region map as data (founder, 2026-10-27).
 * Every figure the drawing shows is a row here, so these hold the plan
 * to the drawing before anything is written.
 */

beforeAll(() => anchorSeed(new Date(Date.UTC(2026, 9, 27))))

describe('Corvane Packaging is the drawing, plant for plant', () => {
  it('has 31 plants in eight countries, grouped in six regions, each with a time zone', () => {
    expect(CORVANE_PLANTS).toHaveLength(31)
    expect(new Set(CORVANE_PLANTS.map((p) => p.cc)).size).toBe(8)
    expect(CORVANE_REGIONS.map((r) => r.label)).toEqual(['United States', 'Latin America', 'Vietnam', 'India', 'Belgium', 'Northern Ireland'])
    const count = (k: string) => CORVANE_PLANTS.filter((p) => p.region === k).length
    expect([count('us'), count('latam'), count('vn'), count('in'), count('be'), count('ni')]).toEqual([6, 6, 5, 6, 4, 4])
    for (const p of CORVANE_PLANTS) expect(p.timeZone, p.plant).toMatch(/^[A-Z][a-z]+\/[A-Za-z_]+$/)
  })

  it('no two people seated at Corvane share a first name, so one page never shows two of one name', () => {
    const seats = [...CORVANE_PEOPLE.map((p) => p.name), ...CORVANE_REGIONS.map((r) => r.lead), ...CORVANE_PLANTS.map((p) => p.manager)]
    const first = seats.map((n) => n.split(' ')[0])
    expect(first.filter((f, i) => first.indexOf(f) !== i)).toEqual([])
    expect(CORVANE_PEOPLE.find((p) => p.desk === 'operations')!.name).toBe('Astrid Berge')
  })

  it('every plant has a hiring manager of its own, and each region a manager of its own', () => {
    expect(new Set(CORVANE_PLANTS.map((p) => p.manager)).size).toBe(31)
    expect(new Set(CORVANE_REGIONS.map((r) => r.lead)).size).toBe(6)
  })

  it('each plant has the drawing’s count of contractors on site, and one start is on hold at Dayton', () => {
    const { onSite, onHold } = corvaneContractors()
    for (const p of CORVANE_PLANTS) {
      expect(onSite.filter((c) => c.plant.key === p.key).length, p.plant).toBe(p.contractors)
    }
    expect(onSite).toHaveLength(CORVANE_PLANTS.reduce((n, p) => n + p.contractors, 0))
    expect(onHold.plant.key).toBe('dayton')
    expect(onHold.state).toBe('DRAFT')
    expect(onHold.startedDaysAgo).toBeLessThan(0)
  })

  it('no two contractors in one country share a name, and the first plant reads the drawing’s own names', () => {
    const { onSite, onHold } = corvaneContractors()
    for (const cc of Object.keys(CORVANE_COUNTRIES)) {
      const names = [...onSite, onHold].filter((c) => c.plant.cc === cc).map((c) => c.name)
      expect(new Set(names).size, cc).toBe(names.length)
    }
    expect(onSite.slice(0, 3).map((c) => c.name)).toEqual(['Tyler Brooks', 'Keisha Monroe', 'Brandon Lee'])
    expect(contractorName('VN', 0)).toBe('Nguyễn Văn An')
  })

  it('a plant’s suppliers are as many as the drawing says, all from its own country', () => {
    const { onSite } = corvaneContractors()
    for (const p of CORVANE_PLANTS) {
      const sups = plantSuppliers(p)
      expect(sups.length, p.plant).toBe(p.suppliers)
      expect(new Set(sups).size).toBe(sups.length)
      for (const s of sups) expect(CORVANE_SUPPLIERS[p.cc].map((x) => x.name)).toContain(s)
      for (const c of onSite.filter((c) => c.plant.key === p.key)) expect(sups).toContain(c.supplier)
    }
  })

  it(`each plant's nearest time limit is the drawing's day count against ${CORVANE_TIME_LIMIT_MONTHS} months, by the block's own arithmetic`, () => {
    const { onSite } = corvaneContractors()
    for (const p of CORVANE_PLANTS) {
      const here = onSite.filter((c) => c.plant.key === p.key)
      const reach = (c: (typeof here)[number]) =>
        limitReachedOn([{ startDate: day(-c.startedDaysAgo), endDate: null }], CORVANE_TIME_LIMIT_MONTHS)!.getTime()
      const nearest = here.filter((c) => c.nearest)
      expect(nearest, p.plant).toHaveLength(1)
      expect(reach(nearest[0]), p.plant).toBe(day(p.nearestLimitDays).getTime())
      for (const c of here.filter((c) => !c.nearest)) expect(reach(c), `${p.plant}: ${c.name}`).toBeGreaterThan(day(p.nearestLimitDays).getTime())
    }
  })

  it('no line runs past its person’s time limit', () => {
    const { onSite } = corvaneContractors()
    for (const c of onSite) {
      const reach = limitReachedOn([{ startDate: day(-c.startedDaysAgo), endDate: null }], CORVANE_TIME_LIMIT_MONTHS)!
      expect(day(c.endsInDays).getTime(), c.name).toBeLessThanOrEqual(reach.getTime())
    }
  })

  it('rates are in the site’s own currency and its own minor units, and nothing is converted', () => {
    expect(billRateMinor('US')).toBe(CORVANE_COUNTRIES.US.rate * 100)
    expect(billRateMinor('VN')).toBe(CORVANE_COUNTRIES.VN.rate) // the dong has no minor unit
    expect(billRateMinor('CO')).toBe(CORVANE_COUNTRIES.CO.rate * 100)
    expect(CORVANE_COUNTRIES.NI.currency).toBe('GBP')
    expect(CORVANE_COUNTRIES.NI.iso).toBe('GB')
  })

  it('Corvane buys specialists at specialist rates, in each site’s own currency (founder, 2026-11-13)', () => {
    expect(CORVANE_JOBS).toEqual(['Controls engineer', 'Maintenance planner', 'Quality engineer', 'Automation technician', 'ERP analyst', 'Process engineer'])
    expect(Object.fromEntries(Object.entries(CORVANE_COUNTRIES).map(([k, c]) => [k, `${c.currency} ${c.rate}`]))).toEqual({
      US: 'USD 120', BE: 'EUR 95', NI: 'GBP 72', MX: 'MXN 900', BR: 'BRL 260', CO: 'COP 180000', VN: 'VND 950000', IN: 'INR 3200',
    })
    for (const c of corvanePlaces()) expect(CORVANE_JOBS).toContain(c.job)
    for (const job of CORVANE_JOBS) {
      expect(CORVANE_JOB_SKILLS[job].length, job).toBeGreaterThan(0)
      for (const skill of CORVANE_JOB_SKILLS[job]) expect(skill.length, skill).toBeGreaterThanOrEqual(4)
    }
    // A worker is paid four fifths of what the supplier bills for them.
    for (const cc of Object.keys(CORVANE_COUNTRIES) as (keyof typeof CORVANE_COUNTRIES)[]) {
      expect(payRateMinor(cc)).toBe(Math.round(billRateMinor(cc) * 0.8))
      expect(payRateMinor(cc)).toBeLessThan(billRateMinor(cc))
    }
  })

  it('Corvane’s 359 contractors cost $3,615,443.20 a month at the sample rates and 160 hours a month, about $43.4 million a year, through the product’s own arithmetic', () => {
    const { onSite } = corvaneContractors()
    expect(onSite).toHaveLength(359)
    const byCurrency = new Map<string, number>()
    for (const c of onSite) {
      const cur = CORVANE_COUNTRIES[c.plant.cc].currency
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + programMonthlySpend([{ rateMinorPerHour: billRateMinor(c.plant.cc) }]).totalMinor)
    }
    const month = spendInReporting([...byCurrency].map(([currency, minor]) => ({ currency, minor })), 'USD', SAMPLE_RATE_TABLE, new Date(Date.UTC(2026, 10, 13)))
    expect(month.total).toEqual({ minor: 361_544_320, currency: 'USD' })
    expect(format(fromMinor(month.total!.minor, 'USD'))).toBe('$3,615,443.20')
    expect(Math.round((month.total!.minor * 12) / 1e7) / 10).toBe(43.4) // millions of dollars a year
  })

  it('Aoife Kelly’s time at Belfast ran through two suppliers with no day between them, and the time limit counts both: 14 days left, 17 whole months of 18', () => {
    const aoife = corvaneContractors().onSite.find((c) => c.plant.key === 'belfast' && c.nearest)!
    expect(aoife.name).toBe('Aoife Kelly')
    expect(aoife.earlier).not.toBeNull()
    expect(aoife.earlier!.supplier).not.toBe(aoife.supplier)
    expect(plantSuppliers(aoife.plant)).toEqual(expect.arrayContaining([aoife.supplier, aoife.earlier!.supplier]))
    expect(aoife.earlier!.endedDaysAgo).toBe(BELFAST_HANDOVER_DAYS_AGO)
    // The two lines exactly as the seed writes them: the earlier one ended, the current one starting the next day.
    const earlier = { startDate: day(-aoife.startedDaysAgo), endDate: day(-aoife.earlier!.endedDaysAgo), live: false }
    const current = { startDate: day(-(aoife.earlier!.endedDaysAgo - 1)), endDate: day(aoife.endsInDays), live: true }
    expect(current.startDate.getTime() - earlier.endDate!.getTime()).toBe(86_400_000)
    const rules = { capMonths: CORVANE_TIME_LIMIT_MONTHS, breakDays: 90 }
    const both = standingAgainstLimit([earlier, current], rules, day(0))
    // Across both suppliers the ledger counts exactly what one unbroken line from her first day would.
    const unbroken = standingAgainstLimit([{ startDate: earlier.startDate, endDate: current.endDate, live: true }], rules, day(0))
    expect([both.countedDays, both.daysOnSite, both.state]).toEqual([unbroken.countedDays, unbroken.daysOnSite, unbroken.state])
    expect(both.countsFrom).toBeNull()
    expect(limitReachedOn([earlier, current], CORVANE_TIME_LIMIT_MONTHS)!.getTime()).toBe(day(14).getTime())
    expect(monthsOf(aoife.startedDaysAgo + 1)).toBe(17)
    // Neither supplier's own line comes near the limit; only the count across both does.
    for (const one of [earlier, current]) {
      const alone = standingAgainstLimit([{ ...one, live: true }], rules, day(0))
      expect(alone.limitDays! - alone.countedDays).toBeGreaterThan(150)
    }
    // Nobody else at Corvane has an earlier line.
    expect(corvanePlaces().filter((c) => c.earlier).map((c) => c.name)).toEqual(['Aoife Kelly'])
  })

  it('the home page’s demo reads three contractors, Aoife Kelly’s two suppliers and one open Dayton job from the plan the seed writes', () => {
    const f = corvaneDemoFacts()
    const { onSite } = corvaneContractors()
    expect([f.contractors, f.suppliers, f.sites, f.countries]).toEqual([onSite.length, Object.values(CORVANE_SUPPLIERS).flat().length, CORVANE_PLANTS.length, 8])
    expect([f.contractors, f.suppliers, f.sites]).toEqual([359, 25, 31])
    expect(f.onSite.map((c) => c.city)).toEqual(['Dayton', 'Antwerp', 'Belfast'])
    for (const row of f.onSite) {
      const c = onSite.find((x) => x.name === row.name && x.plant.city === row.city)!
      expect(row.supplier).toBe(c.supplier)
      expect(row.job).toBe(c.job)
      expect(row.currency).toBe(CORVANE_COUNTRIES[c.plant.cc].currency)
      expect(row.rateMinor).toBe(billRateMinor(c.plant.cc))
      expect(row.months).toBe(monthsOf(c.startedDaysAgo + 1))
      expect(row.daysToLimit).toBe(LIMIT_DAYS - 1 - c.startedDaysAgo)
    }
    expect(f.nearest.name).toBe('Aoife Kelly')
    expect([f.nearest.months, f.limitMonths, f.nearest.daysToLimit]).toEqual([17, 18, 14])
    expect(f.nearest.periods.map((p) => p.supplier)).toEqual(['Lagan Recruitment', 'Mourne Industrial Staff'])
    expect(f.nearest.periods.reduce((n, p) => n + p.days, 0)).toBe(onSite.find((c) => c.name === 'Aoife Kelly')!.startedDaysAgo + 1)
    const dayton = CORVANE_PLANTS[0]
    const job = plantOpenJobs(dayton)[0]
    expect([f.openJob.title, f.openJob.site, f.openJob.months]).toEqual([job.title, dayton.plant, job.months])
    expect(f.openJob.band).toEqual({ minMinor: jobBand('US')!.billMin, maxMinor: jobBand('US')!.billMax, currency: 'USD' })
    expect(format(fromMinor(f.openJob.band!.minMinor, 'USD'))).toBe('$110.00')
    expect(format(fromMinor(f.openJob.band!.maxMinor, 'USD'))).toBe('$130.00')
    expect(f.openJob.sentTo).toBe(plantSuppliers(dayton).length)
    expect(f.openJob.suppliers).toEqual(plantSuppliers(dayton))
  })

  it('the demo’s facts come from a file a browser page may import: nothing in it reaches the database', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/seed-corvane/plan.ts', 'utf8')
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual(['@/lib/tenure-days', '@/lib/money'])
  })

  it('between five and eight invoice receipts are held this month, in at least three regions, each one supplier’s weekly invoice for several of its contractors at one site', () => {
    const { onSite } = corvaneContractors()
    const held = CORVANE_RECEIPTS.filter((r) => r.held)
    expect(held.length).toBeGreaterThanOrEqual(5)
    expect(held.length).toBeLessThanOrEqual(8)
    expect(new Set(held.map((r) => CORVANE_PLANTS.find((p) => p.key === r.plant)!.region)).size).toBeGreaterThanOrEqual(3)
    for (const r of held) {
      const people = r.lines.map((l) => onSite.find((c) => c.plant.key === r.plant && c.index === l.index))
      expect(people.every(Boolean), r.plant).toBe(true)
      expect(new Set(people.map((c) => c!.supplier)).size, r.plant).toBe(1)
      expect(r.lines.length, r.plant).toBeGreaterThan(1)
      expect(r.billed, r.plant).toBe(r.lines.reduce((n, l) => n + l.billed, 0))
      expect(r.accepted, r.plant).toBe(r.lines.reduce((n, l) => n + l.accepted, 0))
    }
  })

  it('no contractor’s week on a held receipt bills more than 12 hours past the 40 signed, and no contractor’s week is on two receipts', () => {
    const weeks = CORVANE_RECEIPTS.flatMap((r) => r.lines.map((l) => ({ ...l, at: `${r.plant}_${l.index}_w${r.week}` })))
    for (const l of weeks) {
      expect(l.accepted, l.at).toBe(40)
      expect(l.billed - l.accepted, l.at).toBeGreaterThanOrEqual(0)
      expect(l.billed - l.accepted, l.at).toBeLessThanOrEqual(12)
    }
    expect(new Set(weeks.map((l) => l.at)).size).toBe(weeks.length)
  })

  it('what the held receipts bill past the signed hours is between 0.4 and 0.6 percent of the month’s spend, both in dollars at the sample rates', () => {
    const { onSite } = corvaneContractors()
    const byCurrency = new Map<string, number>()
    for (const c of onSite) {
      const cur = CORVANE_COUNTRIES[c.plant.cc].currency
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + programMonthlySpend([{ rateMinorPerHour: billRateMinor(c.plant.cc) }]).totalMinor)
    }
    const month = spendInReporting([...byCurrency].map(([currency, minor]) => ({ currency, minor })), 'USD', SAMPLE_RATE_TABLE, new Date(Date.UTC(2026, 10, 13))).total!.minor
    const held = corvaneHeldInReporting()
    const total = held.spend.total!.minor
    expect(held.spend.reportingCurrency).toBe('USD')
    expect(held.spend.missing).toEqual([])
    expect(total / month).toBeGreaterThanOrEqual(0.004)
    expect(total / month).toBeLessThanOrEqual(0.006)
    // The total is the receipts', one by one: nothing added that no receipt holds.
    expect(held.receipts.reduce((n, r) => n + r.overMinor!, 0)).toBeGreaterThanOrEqual(total - held.receipts.length)
    expect(held.receipts.reduce((n, r) => n + r.overMinor!, 0)).toBeLessThanOrEqual(total + held.receipts.length)
  })

  it('the largest held receipt is Dayton’s, from one supplier, between $3,000 and $4,500 over the signed hours, and keeps the id and number the 41.5-hour receipt had', () => {
    const held = corvaneHeldInReporting().receipts
    const largest = [...held].sort((a, b) => b.overMinor! - a.overMinor!)[0]
    expect(largest.plant).toBe('dayton')
    expect(held.filter((r) => r.overMinor === largest.overMinor)).toHaveLength(1)
    expect(largest.overMinor).toBeGreaterThanOrEqual(300_000)
    expect(largest.overMinor).toBeLessThanOrEqual(450_000)
    // The first held receipt in the United States is the one whose number ends 461.
    const us = CORVANE_RECEIPTS.filter((r) => CORVANE_PLANTS.find((p) => p.key === r.plant)!.region === 'us')
    expect(us.findIndex((r) => r.held && r.plant === 'dayton')).toBe(1)
    expect(us[1].lines[0].index).toBe(0)
    expect(us[1].week).toBe(2)
  })

  it('the demo’s held facts are the seed’s own receipts: how many, how many regions, and the largest’s site, supplier, weeks, hours and money', () => {
    const facts = corvaneDemoFacts().held
    expect(facts).toEqual(corvaneHeldFacts())
    const held = CORVANE_RECEIPTS.filter((r) => r.held)
    expect(facts.count).toBe(held.length)
    expect(facts.regions).toBe(new Set(held.map((r) => CORVANE_PLANTS.find((p) => p.key === r.plant)!.region)).size)
    const largest = corvaneHeldInReporting().receipts.find((r) => r.plant === 'dayton')!
    expect(facts.largest).toMatchObject({ site: 'Dayton, Ohio', city: 'Dayton', supplier: largest.supplier, currency: 'USD', overMinor: largest.overMinor })
    const dayton = held.find((r) => r.plant === 'dayton')!
    expect(facts.largest.hoursOver).toBe(dayton.billed - dayton.accepted)
    expect(facts.largest.weeks).toBe(dayton.lines.filter((l) => l.billed > l.accepted).length)
    expect(facts.byCurrency.reduce((n, c) => n + (c.currency === 'USD' ? c.minor : 0), 0))
      .toBe(held.filter((r) => CORVANE_PLANTS.find((p) => p.key === r.plant)!.cc === 'US').reduce((n, r) => n + receiptOverMinor(r), 0))
    expect(format(fromMinor(facts.largest.overMinor, facts.largest.currency))).toMatch(/^\$\d,\d{3}\.\d{2}$/)
  })

  it('every region keeps one clean receipt that bills exactly the hours signed', () => {
    const clean = CORVANE_RECEIPTS.filter((r) => !r.held)
    const regions = clean.map((r) => CORVANE_PLANTS.find((p) => p.key === r.plant)!.region)
    expect(new Set(regions).size).toBe(6)
    for (const r of clean) expect(r.billed).toBe(r.accepted)
  })

  it('no two Corvane sell lines share the six characters an invoice number is cut from', () => {
    const ids = [...corvanePlaces().map((c, i) => corvaneSellId(c, i)), ...corvaneEarlierSellIds().values()]
    expect(new Set(ids).size).toBe(ids.length)
    expect(sharedTails(ids)).toEqual([])
  })

  it('a plant never has more weeks to sign than people to file them', () => {
    for (const p of CORVANE_PLANTS) expect(p.weeksToSign, p.plant).toBeLessThanOrEqual(p.contractors)
  })
})

describe('Corvane in the world', () => {
  it('runs as steps of its own, after the base world and before the seats and the sweep', () => {
    const names = worldStepNames()
    const at = (n: string) => names.indexOf(n)
    for (const s of corvaneSteps()) expect(at(s), s).toBeGreaterThan(-1)
    expect(at('corvane:frame')).toBeGreaterThan(at('payroll-runs:4-of-4'))
    expect(at(corvaneSteps().at(-1)!)).toBeLessThan(at('own-seats'))
  })

  it('is on the roster the rebuild deletes, with every supplier', () => {
    expect(WORLD_SLUGS).toContain('world-corvane')
    expect(WORLD_SLUGS).toContain('world-cv-ridgeline-staffing')
    expect(WORLD_SLUGS).toContain('world-cv-sao-mai-nhan-luc')
    expect(WORLD_SLUGS.filter((s) => s.startsWith('world-cv-'))).toHaveLength(25)
  })

  it('every Corvane seat opens through the demo door by its role', () => {
    expect(DESK_ROLES.region).toEqual(['Regional Manager'])
    expect(DESK_ROLES.operations).toEqual(['Head of Operations'])
    expect(DESK_ROLES.cfo).toEqual(['Chief Financial Officer'])
  })
})
