/**
 * The Corvane map, and the home page's CFO view, read against the seed.
 *
 * Since the founder's brief of 2026-11-13 the map with its four role tabs
 * is no longer on the home page. Its arithmetic stays (`lib/public-site/
 * corvane-map`), because the doors' maps share its shape and the home
 * page's CFO view (`lib/public-site/home-cfo`) reads its figures through
 * it, so every figure below is still worked out a second way here. The
 * two drawings and four lines under the panel left the page with it, and
 * their sentences with them.
 *
 * The founder said "Build it" on 2026-10-27 to the corrected drawing of
 * the home page (https://claude.ai/artifact/VBYzE7NFTtJxTyebWSzirp,
 * version 2): Corvane Packaging, a demo company, every contractor,
 * supplier and site in eight countries on one record, read from four
 * roles — CFO, Head of operations, Regional manager, Hiring manager.
 * CLAUDE.md, the same day: "Every figure is read from lib/seed-corvane
 * (programMonthlySpend at 160 hours a month, spendInReporting at the
 * sample rates, labelled as sample)."
 *
 * So this file does what `story-panel.test.ts` does for the Northbend
 * panel: it works every figure out again from the seed's own exports,
 * by a route of its own, and holds the map to it; it reads every person,
 * firm and site the map names against the seed; and it holds that no
 * figure is typed into the page or the map's code.
 *
 * Since 2026-11-13 ("make the numbers realistic") Corvane's contractors
 * are specialists at specialist rates and seven of its invoice receipts
 * are held, so every figure here is read from the seed rather than
 * pinned: a figure the seed moves moves here with it.
 *
 * ── Where the drawing and the seed disagreed, the seed won ────────────
 *
 *   drawing                              seed, and so the map
 *   "6 paid of 7" invoice receipts       submitted, not paid: the card says how
 *                                        many clear the three-way check
 *   Dayton rows "This week: signed"      three weeks are filed at Dayton, all
 *                                        waiting; the rest read "nothing to sign"
 *   "₫9,240,000,000" for Vietnam         ₫924,000,000 (77 × ₫75,000 × 160); the
 *                                        drawing's $36,960 already agreed
 *   "Maria Lee … starts Monday"          "starts in 5 days"
 *   "Checked just now."                  left off: sample data, not a live read
 *   "Mexico, Brazil and Colombia each    left off: no paper or rule outside the
 *   ask for their own papers"            US is seeded or confirmed
 */
import { describe, it, expect, vi } from 'vitest'

// The map's demo links route after a seat is taken; a static render has no router.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }))
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CORVANE_NAME, CORVANE_PLANTS, CORVANE_REGIONS, CORVANE_COUNTRIES, CORVANE_SUPPLIERS, CORVANE_RECEIPTS, CORVANE_PEOPLE,
  LIMIT_DAYS, corvaneContractors, billRateMinor, plantSuppliers,
} from '@/lib/seed-corvane'
import { programMonthlySpend, HOURS_PER_MONTH } from '@/lib/program-spend'
import { spendInReporting, SAMPLE_RATE_TABLE } from '@/lib/money/reporting-currency'
import { monthsOf } from '@/lib/tenure-days'
import { DESKS, DESK_ROLES } from '@/lib/demo-desks'
import { check, verdict, namedCompanies, gridsWithoutBreakpoint } from '@/lib/positioning'
import {
  corvaneMap, copyOfCorvaneMap, seatOf, seatHref, MAP_SEATS, DEFAULT_SEAT, PLANT_ROWS,
  type MapView, type MapCell, type SeatKey,
} from '@/lib/public-site/corvane-map'
import { CorvaneMapView, DEMO_BEING_SET_UP } from '@/lib/public-site/corvane-map-view'
import { demoRequest } from '@/lib/public-site/demo-link'
import { homeCfo, homeCfoCopy, homeGlanceHeld, yearInMillions } from '@/lib/public-site/home-cfo'
import { CFO_LABEL, glanceHeld, proofCards } from '@/lib/public-site/home-words'
import { format, fromMinor } from '@/lib/money'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const MAP = corvaneMap()
const view = (k: SeatKey): MapView => MAP.views.find((v) => v.key === k)!
const column = (v: MapView, title: string) => {
  const j = v.columns.findIndex((c) => c.t === title)
  expect(j, `${v.tab} has a ${title} column`).toBeGreaterThanOrEqual(0)
  return v.rows.map((r) => r[j])
}
const stat = (v: MapView, label: string) => v.stats.find((s) => s.label === label)!
const seatHrefsFor = () => Object.fromEntries(MAP_SEATS.map((m) => [m.key, seatHref(m.key)])) as Record<SeatKey, string>

// ── The seed, worked out a second way ─────────────────────────────────

const { onSite, onHold } = corvaneContractors()
const toLimit = (c: { startedDaysAgo: number }) => LIMIT_DAYS - 1 - c.startedDaysAgo
const usd = (minor: number) => `$${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`
/** Every seat's monthly cost at 160 hours, per currency, then one figure at the sample rates. */
function dollarsFor(people: typeof onSite): number {
  const amounts = people.map((c) => ({
    currency: CORVANE_COUNTRIES[c.plant.cc].currency,
    minor: programMonthlySpend([{ rateMinorPerHour: billRateMinor(c.plant.cc) }]).totalMinor,
  }))
  return spendInReporting(amounts, 'USD', SAMPLE_RATE_TABLE).total!.minor
}
const plantOf = (key: string) => CORVANE_PLANTS.find((p) => p.key === key)!
const currencyAt = (key: string) => CORVANE_COUNTRIES[plantOf(key).cc].currency
const held = CORVANE_RECEIPTS.filter((r) => r.held)
const clean = CORVANE_RECEIPTS.filter((r) => !r.held)
/** What a receipt bills past the signed hours, line by line, at its site's rate, in whole units of the site's money. */
const overUnits = (r: (typeof CORVANE_RECEIPTS)[number]) =>
  r.lines.reduce((n, l) => n + (l.billed - l.accepted), 0) * CORVANE_COUNTRIES[plantOf(r.plant).cc].rate
/** The held receipts' total over the signed hours, in dollar cents at the sample rates. */
const heldUsd = spendInReporting(held.map((r) => ({ currency: currencyAt(r.plant), minor: fromDecimalMinor(overUnits(r), currencyAt(r.plant)) })), 'USD', SAMPLE_RATE_TABLE).total!.minor
function fromDecimalMinor(units: number, currency: string): number {
  // The dong has no minor unit; every other currency here has two decimals.
  return currency === 'VND' ? Math.round(units) : Math.round(units * 100)
}
const own = (minor: number, currency: string) => format(fromMinor(minor, currency), { compact: true })
const nearestAll = () => [...onSite].sort((a, b) => toLimit(a) - toLimit(b))[0]

describe('Every figure on the map is the Corvane seed’s', () => {

  it('the bar counts 359 contractors, 25 suppliers and 31 sites in 8 countries, each read from the seed', () => {
    expect(onSite).toHaveLength(359)
    expect(new Set(onSite.map((c) => c.supplier)).size).toBe(25)
    expect(CORVANE_PLANTS).toHaveLength(31)
    expect(new Set(CORVANE_PLANTS.map((p) => p.cc)).size).toBe(8)
    expect(MAP.bar).toBe(`${CORVANE_NAME} · a sample company · 359 contractors · 25 suppliers · 31 sites in 8 countries`)
  })

  it('the CFO’s spend is every bill rate at 160 hours a month, converted at the sample rates the line under the map names: about $3.6 million a month for the specialists the seed holds', () => {
    expect(HOURS_PER_MONTH).toBe(160)
    // By hand: each country's contractors × its specialist rate × 160 hours, in its own money, then dollars.
    const byHand = spendInReporting(
      (Object.keys(CORVANE_COUNTRIES) as (keyof typeof CORVANE_COUNTRIES)[]).map((cc) => ({
        currency: CORVANE_COUNTRIES[cc].currency,
        minor: fromDecimalMinor(onSite.filter((c) => c.plant.cc === cc).length * CORVANE_COUNTRIES[cc].rate * HOURS_PER_MONTH, CORVANE_COUNTRIES[cc].currency),
      })), 'USD', SAMPLE_RATE_TABLE).total!.minor
    expect(dollarsFor(onSite)).toBe(byHand)
    // A buyer spending $40–50 million a year reads a month at their own scale.
    expect(byHand * 12).toBeGreaterThan(4_000_000_000)
    expect(byHand * 12).toBeLessThan(5_000_000_000)
    expect(stat(view('cfo'), 'Spend this month').value).toBe(usd(byHand))
    expect(stat(view('cfo'), 'Spend this month').sub).toContain('at sample rates')
    expect(stat(view('operations'), 'Spend this month').value).toBe(usd(byHand))
    expect(MAP.under).toContain('sample exchange rates')
    expect(MAP.under).toContain(`${HOURS_PER_MONTH} hours a month`)
    // Each region's dollars are its own people's, and they add to the whole.
    for (const r of CORVANE_REGIONS) {
      const row = view('cfo').rows.find((x) => x[0].t === r.label)!
      expect(row[row.length - 1].t, r.label).toBe(usd(dollarsFor(onSite.filter((c) => c.plant.region === r.key))))
    }
  })

  it('the CFO’s headline says how many invoice receipts are held over the signed hours, Maria Lee’s start waiting on an I-9, and Aoife Kelly 14 days from the time limit, each read from the seed', () => {
    expect(held.length).toBeGreaterThan(1)
    for (const r of held) expect(r.billed, r.plant).toBeGreaterThan(r.accepted)
    expect(onHold.name).toBe('Maria Lee')
    expect(onHold.plant.city).toBe('Dayton')
    const nearest = nearestAll()
    expect([nearest.name, nearest.plant.city, toLimit(nearest)]).toEqual(['Aoife Kelly', 'Belfast', 14])
    const spelled = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][held.length]
    expect(view('cfo').headline).toBe(
      `${spelled} invoice receipts are held over the signed hours. One start in ${onHold.plant.city} is waiting on an I-9. ` +
      `${nearest.name} in ${nearest.plant.city} reaches the time limit in ${toLimit(nearest)} days.`
    )
    // The held cell says the money over the hours in each currency's own money, the seed's order.
    const byCurrency = new Map<string, number>()
    for (const r of held) byCurrency.set(currencyAt(r.plant), (byCurrency.get(currencyAt(r.plant)) ?? 0) + fromDecimalMinor(overUnits(r), currencyAt(r.plant)))
    expect(stat(view('cfo'), 'Held over the hours').value).toBe([...byCurrency].map(([c, m]) => own(m, c)).join(' · '))
    expect(stat(view('cfo'), 'Invoice receipts').value).toBe(`${clean.length} of ${CORVANE_RECEIPTS.length}`)
  })

  it('no invoice receipt is said to be paid, because the seed submits them and pays none', () => {
    // The drawing said "6 paid of 7". The seed writes every receipt as
    // SUBMITTED with nothing paid (lib/seed-corvane), so the map says what
    // the check says: six clear it and one is held.
    for (const w of copyOfCorvaneMap(MAP)) expect(w, w).not.toMatch(/\bpaid\b/i)
    expect(read('src/lib/seed-corvane.ts')).toMatch(/paid: 0,[\s\S]*status: 'SUBMITTED'/)
  })

  it('every invoice receipt is on its region’s Money cell, held and clean, so the rows add to the receipts card; the United States reads its held count and dollars over the signed hours, over the one that clears the check', () => {
    const cfo = view('cfo')
    const cells = column(cfo, 'Money')
    const heldN = (c: MapCell) => Number(c.t.match(/^(\d+) held\b/)?.[1] ?? 0)
    const cleanN = (c: MapCell) => Number(`${c.t} ${c.sub ?? ''}`.match(/(\d+) clears? the check/)?.[1] ?? 0)
    expect(cells.reduce((n, c) => n + heldN(c), 0)).toBe(held.length)
    expect(cells.reduce((n, c) => n + cleanN(c), 0)).toBe(clean.length)
    expect(cells.reduce((n, c) => n + heldN(c) + cleanN(c), 0)).toBe(CORVANE_RECEIPTS.length)
    expect(stat(cfo, 'Invoice receipts').value).toBe(`${clean.length} of ${CORVANE_RECEIPTS.length}`)
    const usPlants = CORVANE_PLANTS.filter((p) => p.region === 'us').map((p) => p.key)
    const usHeld = held.filter((r) => usPlants.includes(r.plant))
    const us = cells[cfo.rows.findIndex((r) => r[0].t === CORVANE_REGIONS.find((g) => g.key === 'us')!.label)]
    expect(us.t).toBe(`${usHeld.length} held · ${own(usHeld.reduce((n, r) => n + fromDecimalMinor(overUnits(r), 'USD'), 0), 'USD')}`)
    expect(us.sub).toBe('1 clears the check')
  })

  it('every region’s row adds up to the whole: 359 contractors, 48 open jobs and 48 weeks to sign', () => {
    const cfo = view('cfo')
    const sum = (title: string) => column(cfo, title).reduce((n, c) => n + Number(c.t), 0)
    expect(sum('Contractors')).toBe(359)
    expect(sum('Open jobs')).toBe(CORVANE_PLANTS.reduce((n, p) => n + p.openJobs, 0))
    expect(sum('Open jobs')).toBe(48)
    expect(sum('Weeks to sign')).toBe(48)
    expect(cfo.rows.map((r) => r[0].t)).toEqual(CORVANE_REGIONS.map((r) => r.label))
    expect(cfo.rows.map((r) => r[0].sub)).toEqual(CORVANE_REGIONS.map((r) =>
      `${r.lead} · ${CORVANE_PLANTS.filter((p) => p.region === r.key).length} sites`))
  })

  it('the head of operations reads 48 weeks waiting across 22 plants and 6 people within 30 days of the time limit', () => {
    expect(CORVANE_PLANTS.filter((p) => p.weeksToSign > 0)).toHaveLength(22)
    expect(onSite.filter((c) => toLimit(c) <= 30)).toHaveLength(6)
    expect(view('operations').headline).toBe('48 weeks are waiting to be signed across 22 plants, and 6 contractors reach the time limit within 30 days.')
    expect(stat(view('operations'), 'Hiring managers').value).toBe(String(new Set(CORVANE_PLANTS.map((p) => p.manager)).size))
    expect(view('operations').signed).toContain(CORVANE_PEOPLE.find((p) => p.desk === 'operations')!.name)
    expect(column(view('operations'), 'Regional manager').map((c) => c.t)).toEqual(CORVANE_REGIONS.map((r) => r.lead))
  })

  it('the regional manager reads Latin America’s six plants only, each with its own hiring manager, count and spend in its own money', () => {
    const v = view('region')
    const plants = CORVANE_PLANTS.filter((p) => p.region === 'latam')
    expect(v.signed).toContain('Valeria Montes')
    expect(column(v, 'Site').map((c) => c.t)).toEqual(plants.map((p) => p.city))
    expect(column(v, 'Hiring manager').map((c) => c.t)).toEqual(plants.map((p) => p.manager))
    expect(column(v, 'Contractors').map((c) => Number(c.t))).toEqual(plants.map((p) => onSite.filter((c) => c.plant.key === p.key).length))
    expect(column(v, 'Weeks to sign').map((c) => Number(c.t))).toEqual(plants.map((p) => p.weeksToSign))
    // Monterrey: its contractors × the Mexico rate × 160 hours, in pesos.
    const monterrey = onSite.filter((c) => c.plant.key === 'monterrey').length
    expect(column(v, 'Spend this month')[0].t).toBe(own(fromDecimalMinor(monterrey * CORVANE_COUNTRIES.MX.rate * HOURS_PER_MONTH, 'MXN'), 'MXN'))
    expect(stat(v, 'Contractors on site').value).toBe('68')
    expect(v.headline).toBe('Fernanda Albuquerque has 2 weeks to sign in Campinas, and Juliana Lima there reaches the time limit in 22 days.')
    // Nothing outside the region is on the seat.
    const outside = CORVANE_PLANTS.filter((p) => p.region !== 'latam').flatMap((p) => [p.city, p.manager])
    const said = [v.signed, v.headline, ...v.rows.flat().map((c) => c.t)].join(' ')
    for (const o of outside) expect(said, o).not.toContain(o)
  })

  it('the hiring manager’s rows are Dayton’s first five contractors from the seed, with job, supplier, whole months here and days left, and the start on hold last', () => {
    const v = view('hiring')
    const dayton = onSite.filter((c) => c.plant.key === 'dayton')
    const first = dayton.slice(0, PLANT_ROWS)
    expect(v.rows).toHaveLength(PLANT_ROWS + 1)
    expect(column(v, 'Contractor').slice(0, PLANT_ROWS).map((c) => c.t)).toEqual(first.map((c) => c.name))
    expect(column(v, 'Job').slice(0, PLANT_ROWS).map((c) => c.t)).toEqual(first.map((c) => c.job))
    expect(column(v, 'Supplier').slice(0, PLANT_ROWS).map((c) => c.t)).toEqual(first.map((c) => c.supplier))
    expect(column(v, 'Months here').slice(0, PLANT_ROWS).map((c) => Number(c.t))).toEqual(first.map((c) => monthsOf(c.startedDaysAgo + 1)))
    expect(column(v, 'Line').slice(0, PLANT_ROWS).map((c) => c.t)).toEqual(first.map((c) =>
      c.nearest ? `${toLimit(c)} days to the time limit` : `ends in ${c.endsInDays} days`))
    const last = v.rows[PLANT_ROWS]
    expect([last[0].t, last[1].t, last[2].t]).toEqual([onHold.name, onHold.job, onHold.supplier])
    expect(last[4].t).toBe('on hold: no I-9 on file')
    // The seed files last week for the first three at Dayton, and they are the three waiting.
    expect(column(v, 'This week').slice(0, PLANT_ROWS).map((c) => c.t)).toEqual(
      first.map((_, i) => (i < CORVANE_PLANTS[0].weeksToSign ? 'waiting for you' : 'nothing to sign')))
    expect(read('src/lib/seed-corvane.ts')).toContain('.slice(0, p.weeksToSign)')
    expect(v.headline).toBe('Keisha Monroe’s week is waiting for you, and 2 more. Maria Lee cannot start without an I-9.')
    // Dayton's contractors × the US rate × 160 hours.
    expect(stat(v, 'Spend this month').value).toBe(usd(dayton.length * CORVANE_COUNTRIES.US.rate * HOURS_PER_MONTH * 100))
    expect(stat(v, 'Your contractors').sub).toBe(`${plantSuppliers(CORVANE_PLANTS[0]).length} suppliers`)
    expect(v.caption).toContain(`${dayton.length - PLANT_ROWS} more contractors below`)
  })

  it('the hiring manager’s line says jobs at Dayton go to Dayton’s three suppliers, the ones the seed names at that site, and never Lakemont', () => {
    // Sites, the founder's "Build it, sites sounds good", 2026-10-28: a job
    // at a site goes to that site's approved suppliers by default.
    const dayton = CORVANE_PLANTS[0]
    expect(dayton.city).toBe('Dayton')
    const named = plantSuppliers(dayton)
    expect(named).toHaveLength(3)
    expect(named.some((n) => /Lakemont/.test(n))).toBe(false)
    const mine = onSite.filter((c) => c.plant.key === dayton.key)
    expect(new Set(mine.map((c) => c.supplier)).size).toBeLessThanOrEqual(named.length)
    for (const c of mine) expect(named, c.name).toContain(c.supplier)
    expect(view('hiring').signed).toBe(
      `Signed in as ${dayton.manager}, hiring manager, ${dayton.plant}. ` +
      `Reads the ${mine.length} contractors at Dayton. Jobs here go to Dayton’s 3 suppliers.`)
  })

  it('months here are whole months and never rounded up', () => {
    // Keisha Monroe has served 507 days: 16 whole months, where rounding
    // to the nearest month would say 17.
    const keisha = onSite.find((c) => c.name === 'Keisha Monroe' && c.plant.key === 'dayton')!
    const days = keisha.startedDaysAgo + 1
    expect(monthsOf(days)).toBe(16)
    expect(Math.round(days / 30.44)).toBe(17)
    const row = view('hiring').rows.find((r) => r[0].t === 'Keisha Monroe')!
    expect(row[3].t).toBe('16')
  })

  it('every person, firm and site the map names is in the Corvane seed', () => {
    const people = new Set([
      ...onSite.map((c) => c.name), onHold.name,
      ...CORVANE_PLANTS.map((p) => p.manager), ...CORVANE_REGIONS.map((r) => r.lead), ...CORVANE_PEOPLE.map((p) => p.name),
    ])
    const firms = new Set(Object.values(CORVANE_SUPPLIERS).flat().map((s) => s.name))
    const places = new Set(CORVANE_PLANTS.flatMap((p) => [p.city, p.plant]))
    const regions = new Set(CORVANE_REGIONS.map((r) => r.label))
    const named = (v: MapView, title: string, set: Set<string>) =>
      v.columns.some((c) => c.t === title) && column(v, title).forEach((c) => expect(set.has(c.t), `${v.tab}: ${c.t}`).toBe(true))
    for (const v of MAP.views) {
      named(v, 'Contractor', people); named(v, 'Hiring manager', people); named(v, 'Regional manager', people)
      named(v, 'Supplier', firms); named(v, 'Site', places); named(v, 'Region', regions)
      expect(people.has(v.demo.target.seat), v.demo.target.seat).toBe(true)
      expect(v.signed).toContain(v.demo.target.seat)
    }
    for (const c of column(view('cfo'), 'Nearest time limit')) {
      const [name, city] = c.sub!.split(', ')
      expect(onSite.some((x) => x.name === name && x.plant.city === city), c.sub).toBe(true)
    }
  })

  it('no figure is typed into the page, the map’s code or the CFO view’s: each is worked out from the seed', () => {
    const page = read('src/app/page.tsx').replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const code = read('src/lib/public-site/corvane-map.ts').replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const drawn = read('src/lib/public-site/corvane-map-view.tsx')
    const cfo = read('src/lib/public-site/home-cfo.ts').replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    for (const figure of ['359', '3,615', '3615', '17,344', '43.4', '3,660', '268,800', '48 weeks', 'Margaret', 'Valeria', 'Marcus', 'Dayton', 'Keisha', 'Maria Lee', 'Aoife', 'Belfast', '14 days']) {
      for (const [where, src] of [['page.tsx', page], ['corvane-map.ts', code], ['corvane-map-view.tsx', drawn], ['home-cfo.ts', cfo]]) {
        expect(src.includes(figure), `${figure} is typed into ${where}`).toBe(false)
      }
    }
    expect(page).toContain('homeCfo()')
    expect(page).toContain('homeGlanceHeld()')
  })
})

describe('The map’s four roles are tabs at their own addresses', () => {

  it('each role tab is a link at its own address, and an address with no seat or an unknown seat opens the CFO', () => {
    expect(MAP_SEATS.map((s) => s.tab)).toEqual(['CFO', 'Head of operations', 'Regional manager', 'Hiring manager'])
    expect(MAP.views.map((v) => v.tab)).toEqual(MAP_SEATS.map((s) => s.tab))
    expect(DEFAULT_SEAT).toBe('cfo')
    expect(seatOf(undefined)).toBe('cfo')
    expect(seatOf('nonsense')).toBe('cfo')
    expect(seatOf(['region'])).toBe('region')
    expect(seatHref('operations')).toBe('/?seat=operations#map')
    expect(seatHref('cfo')).toBe('/#map')
  })

  it('the server sends all four seats in the HTML, shows the one the address asks for, and every tab works with no script', () => {
    const hrefs = Object.fromEntries(MAP_SEATS.map((m) => [m.key, seatHref(m.key)])) as Record<SeatKey, string>
    const html = renderToStaticMarkup(createElement(CorvaneMapView, { map: MAP, seat: 'region', hrefs, doorsOpen: true }))
    for (const s of MAP_SEATS) {
      expect(html).toContain(`href="${seatHref(s.key).replace(/&/g, '&amp;')}"`)
      expect(html).toContain(`data-map-seat="${s.key}"`)
    }
    expect(html).toMatch(/data-map-seat="region" class=/)
    expect((html.match(/data-map-seat="[^"]+" hidden=""/g) ?? []).length).toBe(3)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain(view('region').headline)
  })

  it('an old role tab’s address, like /?seat=operations, still answers with the home page, never a not-found page', () => {
    // The map left the home page on 2026-11-13. The page reads no query and
    // refuses none, so every address a tab once had draws the page.
    const page = read('src/app/page.tsx')
    expect(page).toMatch(/export default function LandingPage\(\)/)
    expect(page).not.toMatch(/notFound|redirect\(|searchParams/)
  })

  it('with no Corvane company on this deployment the map draws no link to a demo door that would refuse, and says the demo is being set up', () => {
    const closed = renderToStaticMarkup(createElement(CorvaneMapView, { map: MAP, seat: 'cfo', hrefs: seatHrefsFor(), doorsOpen: false }))
    expect(closed).not.toContain('data-map-door="open"')
    expect(closed).not.toContain('Open the demo as')
    expect(closed).not.toContain('href="/demo"')
    expect((closed.match(/data-map-door="closed"/g) ?? []).length).toBe(MAP.views.length)
    expect(closed).toContain(DEMO_BEING_SET_UP)
    // With Corvane seeded, every seat has its link.
    const open = renderToStaticMarkup(createElement(CorvaneMapView, { map: MAP, seat: 'cfo', hrefs: seatHrefsFor(), doorsOpen: true }))
    expect((open.match(/data-map-door="open"/g) ?? []).length).toBe(MAP.views.length)
    expect(open).toContain('Open the demo as Margaret Osei')
    expect(open).not.toContain(DEMO_BEING_SET_UP)
  })

  it('each role’s demo link seats the reader at Corvane in that role, naming the person where several hold it', () => {
    expect(view('cfo').demo.label).toBe('Open the demo as Margaret Osei')
    expect(demoRequest(view('cfo').demo.target)).toEqual({ url: '/api/demo', body: { as: 'world-corvane', desk: 'cfo' }, then: null })
    expect(demoRequest(view('operations').demo.target)).toEqual({ url: '/api/demo', body: { as: 'world-corvane', desk: 'operations' }, then: null })
    expect(demoRequest(view('region').demo.target)).toEqual({ url: '/api/demo', body: { as: 'world-corvane', desk: 'region', who: 'Valeria Montes' }, then: null })
    expect(demoRequest(view('hiring').demo.target)).toEqual({ url: '/api/demo', body: { as: 'world-corvane', desk: 'hiring', who: 'Marcus Hollins' }, then: null })
    for (const v of MAP.views) {
      const desk = v.demo.target.desk as (typeof DESKS)[number]
      expect(DESKS, desk).toContain(desk)
      expect(DESK_ROLES[desk].length).toBeGreaterThan(0)
    }
    // CFO and head of operations are each one seat, so the door needs no name.
    expect(CORVANE_PEOPLE.map((p) => p.desk)).toEqual(expect.arrayContaining(['cfo', 'operations']))
  })
})

describe('The home page’s CFO view is the Corvane seed’s, in short lines', () => {

  it('reads 359 contractors, 25 suppliers, 31 sites in 8 countries and the month’s spend at sample rates as four tiles; then about $43.4 million a year; the held supplier invoices, their total over the signed hours and the largest, Dayton’s, on one supplier invoice; Dayton, one start waiting on an I-9; Belfast, Aoife Kelly 14 days from the time limit', () => {
    const nearest = nearestAll()
    const month = dollarsFor(onSite)
    const cfo = homeCfo()
    expect(cfo.tiles).toEqual([
      { b: String(onSite.length), s: 'contractors' },
      { b: String(new Set(onSite.map((c) => c.supplier)).size), s: 'suppliers' },
      { b: String(CORVANE_PLANTS.length), s: `sites · ${new Set(CORVANE_PLANTS.map((p) => p.cc)).size} countries` },
      { b: usd(month), s: 'spend this month, at sample rates' },
    ])
    // The largest held receipt, by its dollars at the sample rates, worked out here a second way.
    const inUsd = (r: (typeof held)[number]) =>
      spendInReporting([{ currency: currencyAt(r.plant), minor: fromDecimalMinor(overUnits(r), currencyAt(r.plant)) }], 'USD', SAMPLE_RATE_TABLE).total!.minor
    const largest = [...held].sort((a, b) => inUsd(b) - inUsd(a))[0]
    expect(plantOf(largest.plant).city).toBe('Dayton')
    // The year is twelve of these months, said to a tenth of a million.
    expect(yearInMillions(month)).toBe(`$${(Math.round((month * 12) / 1e7) / 10).toFixed(1)} million`)
    expect(yearInMillions(month)).toBe('$43.4 million')
    const spelled = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][held.length]
    expect(cfo.lines.map((l) => (l.lead ? `${l.lead} ${l.t}` : l.t))).toEqual([
      `About ${yearInMillions(month)} a year at sample rates.`,
      `${spelled} supplier invoices held, ${usd(heldUsd)} over the signed hours. ` +
        `The largest: ${plantOf(largest.plant).city}, ${own(fromDecimalMinor(overUnits(largest), currencyAt(largest.plant)), currencyAt(largest.plant))} on one supplier invoice.`,
      `${onHold.plant.city}: one start waiting on an I-9.`,
      `${nearest.plant.city}: ${nearest.name} reaches the time limit in ${toLimit(nearest)} days.`,
    ])
    // The held total is between four and six tenths of a percent of the month: money a buyer at this scale cares about, not a rounding error.
    expect(heldUsd / month).toBeGreaterThan(0.004)
    expect(heldUsd / month).toBeLessThan(0.006)
  })

  it('the hero’s “At a glance” held figure and the first proof card are the CFO view’s held total, on as many supplier invoices as the seed holds, worked out from the seed', () => {
    const g = homeGlanceHeld()!
    expect(g).toEqual({ amount: usd(heldUsd), invoices: held.length })
    expect(glanceHeld(g.invoices)).toBe(`held this month on ${held.length} supplier invoices over signed hours`)
    expect(proofCards(g)[0]).toBe(`${usd(heldUsd)} held this month — ${held.length} supplier invoices over the signed hours, held until the hours agree.`)
    expect(homeCfoCopy().some((l) => l.includes(`${usd(heldUsd)} over the signed hours`))).toBe(true)
    // Where the seed holds none, the page draws no figure rather than a wrong one.
    expect(read('src/app/page.tsx')).toContain('{HELD && (')
    expect(read('src/app/page.tsx')).toContain('{proofCards(HELD).map(')
  })

  it('says Corvane Packaging is a sample company, not a customer, and that its figures use sample rates, under the lines', () => {
    expect(CFO_LABEL).toBe('Corvane Packaging is a sample company, not a customer. Figures use sample rates.')
    expect(CFO_LABEL).toContain(CORVANE_NAME)
  })

  it('names no real company, does not lead with AI, and says neither desk nor program office', () => {
    const lines = [...homeCfoCopy(), CFO_LABEL]
    expect(namedCompanies(lines.join(' '))).toEqual([])
    for (const w of lines) {
      expect(w, w).not.toMatch(/\b(program(?:me)?\s+offices?|desks?)\b/i)
      expect(w, w).not.toMatch(/\bAI\b/)
    }
  })
})

describe('The map says what a public page may say', () => {

  it('reads as the category, names no real company, does not lead with AI and claims nobody is placed', () => {
    const words = copyOfCorvaneMap(MAP)
    // Read below the home page's own hero, where it sat until 2026-11-13.
    const hero = ['Enterprise contingent workforce management', 'Know what every contractor costs, across every supplier.']
    const v = verdict({ hero, body: words })
    expect(v.findings.filter((f) => f.severity === 'WRONG'), JSON.stringify(v.findings)).toEqual([])
    const rules = check({ hero, body: words }).map((f) => f.rule)
    expect(rules).not.toContain('neutrality')
    expect(rules).not.toContain('never-lead-with-ai')
    expect(namedCompanies(words.join(' '))).toEqual([])
  })

  it('says Corvane is a demo company and not a customer, in the same sentence, under the map', () => {
    const sentence = MAP.under.split(/(?<=\.)\s+/).find((s) => s.includes(CORVANE_NAME))!
    expect(sentence).toMatch(/\bdemo company\b/)
    expect(sentence).toMatch(/\bnot a customer\b/)
    expect(MAP.bar).toContain('a sample company')
  })

  it('never says desk or program office, and never names AI', () => {
    for (const w of copyOfCorvaneMap(MAP)) {
      expect(w, w).not.toMatch(/\b(program(?:me)?\s+offices?|desks?)\b/i)
      expect(w, w).not.toMatch(/\bAI\b/)
    }
  })

  it('on a phone the five figures sit two to a row and the table scrolls inside its own box; the page never scrolls sideways', () => {
    const drawn = read('src/lib/public-site/corvane-map-view.tsx')
    expect(gridsWithoutBreakpoint(drawn)).toEqual([])
    // The drawing's .stats grid: two to a row on a phone, five across on a desktop.
    expect(drawn).toContain('grid grid-cols-1 gap-px border-t border-etyme-rule bg-etyme-rule min-[340px]:grid-cols-2 lg:grid-cols-5')
    expect(drawn).toMatch(/aria-label="Read it as" className="flex flex-wrap/)
    // One table at every width, in a box of its own that scrolls sideways; no stacked blocks.
    expect(drawn).toMatch(/data-map-scroll="" className="overflow-x-auto border-t border-etyme-rule">\s*<table className="w-full min-w-\[/)
    expect(drawn).not.toContain('data-map-stacked')
    expect(drawn).not.toMatch(/\bmd:hidden\b|\bhidden md:block\b/)
    // The page itself never scrolls sideways.
    expect(read('src/app/page.tsx')).toContain('min-h-screen overflow-x-hidden')
    // The row's name stays pinned on the left while the table scrolls.
    expect(drawn).toContain("const STICKY = 'sticky left-0 z-10 bg-etyme-surface'")
  })

  it('the CFO’s table reads in the drawing’s order, every column once, and every cell is in it', () => {
    const v = view('cfo')
    expect(v.columns.map((c) => c.t)).toEqual([
      'Region', 'Contractors', 'Open jobs', 'Weeks to sign', 'Papers', 'Money', 'Nearest time limit', 'Spend this month',
    ])
    const html = renderToStaticMarkup(createElement(CorvaneMapView, { map: MAP, seat: 'cfo', hrefs: seatHrefsFor(), doorsOpen: true }))
    const seatHtml = html.slice(html.indexOf('data-map-seat="cfo"'))
    const table = seatHtml.slice(seatHtml.indexOf('<table'), seatHtml.indexOf('</table>'))
    for (const r of v.rows) for (const c of r) expect(table, c.t).toContain(c.t.replace(/&/g, '&amp;'))
    for (const c of v.columns) expect(table, c.t).toContain(`>${c.t}<`)
  })
})
