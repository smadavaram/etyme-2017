/**
 * The map on the home page, read against the seed.
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
 * ── Where the drawing and the seed disagreed, the seed won ────────────
 *
 *   drawing                              seed, and so the map
 *   "6 paid of 7" invoice receipts       submitted, not paid: "6 of 7 clear the
 *                                        three-way check", one held
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
import { corvaneIsSeeded, SEEDED_WAIT_MS } from '@/lib/public-site/corvane-seeded'
import { demoRequest } from '@/lib/public-site/demo-link'

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
const heldReceipt = CORVANE_RECEIPTS.find((r) => r.held)!
const heldPlant = CORVANE_PLANTS.find((p) => p.key === heldReceipt.plant)!

describe('Every figure on the map is the Corvane seed’s', () => {

  it('the bar counts 359 contractors, 25 suppliers and 31 sites in 8 countries, each read from the seed', () => {
    expect(onSite).toHaveLength(359)
    expect(new Set(onSite.map((c) => c.supplier)).size).toBe(25)
    expect(CORVANE_PLANTS).toHaveLength(31)
    expect(new Set(CORVANE_PLANTS.map((p) => p.cc)).size).toBe(8)
    expect(MAP.bar).toBe(`${CORVANE_NAME} · a sample company · 359 contractors · 25 suppliers · 31 sites in 8 countries`)
  })

  it('the CFO’s spend is $704,227.20: every bill rate at 160 hours a month, converted at the sample rates the line under the map names', () => {
    expect(HOURS_PER_MONTH).toBe(160)
    expect(dollarsFor(onSite)).toBe(70_422_720)
    expect(stat(view('cfo'), 'Spend this month').value).toBe(usd(70_422_720))
    expect(stat(view('cfo'), 'Spend this month').sub).toContain('at sample rates')
    expect(stat(view('operations'), 'Spend this month').value).toBe(usd(70_422_720))
    expect(MAP.under).toContain('sample exchange rates')
    expect(MAP.under).toContain(`${HOURS_PER_MONTH} hours a month`)
    // Each region's dollars are its own people's, and they add to the whole.
    for (const r of CORVANE_REGIONS) {
      const row = view('cfo').rows.find((x) => x[0].t === r.label)!
      expect(row[row.length - 1].t, r.label).toBe(usd(dollarsFor(onSite.filter((c) => c.plant.region === r.key))))
    }
  })

  it('the CFO’s headline names the held Dayton receipt at $42 over the 40 signed hours, Maria Lee’s start waiting on an I-9, and Aoife Kelly 14 days from the time limit', () => {
    expect(heldPlant.city).toBe('Dayton')
    expect([heldReceipt.billed, heldReceipt.accepted, CORVANE_COUNTRIES[heldPlant.cc].rate]).toEqual([41.5, 40, 28])
    expect((heldReceipt.billed - heldReceipt.accepted) * CORVANE_COUNTRIES[heldPlant.cc].rate).toBe(42)
    expect(onHold.name).toBe('Maria Lee')
    expect(onHold.plant.city).toBe('Dayton')
    const nearest = [...onSite].sort((a, b) => toLimit(a) - toLimit(b))[0]
    expect([nearest.name, nearest.plant.city, toLimit(nearest)]).toEqual(['Aoife Kelly', 'Belfast', 14])
    expect(view('cfo').headline).toBe(
      'One invoice receipt in Dayton is held, $42 over the signed hours. One start in Dayton is waiting on an I-9. ' +
      'Aoife Kelly in Belfast reaches the time limit in 14 days.'
    )
    expect(stat(view('cfo'), 'Held over the hours').value).toBe('$42')
    expect(stat(view('cfo'), 'Invoice receipts').value).toBe(`${CORVANE_RECEIPTS.length - 1} of ${CORVANE_RECEIPTS.length}`)
  })

  it('no invoice receipt is said to be paid, because the seed submits them and pays none', () => {
    // The drawing said "6 paid of 7". The seed writes every receipt as
    // SUBMITTED with nothing paid (lib/seed-corvane), so the map says what
    // the check says: six clear it and one is held.
    for (const w of copyOfCorvaneMap(MAP)) expect(w, w).not.toMatch(/\bpaid\b/i)
    expect(read('src/lib/seed-corvane.ts')).toMatch(/paid: 0,[\s\S]*status: 'SUBMITTED'/)
  })

  it('every invoice receipt is on its region’s Money cell, held and clean, so the rows add to 6 of 7: the US reads "1 held · $42" over "1 clears the check"', () => {
    const cfo = view('cfo')
    const cells = column(cfo, 'Money')
    const heldN = (c: MapCell) => Number(c.t.match(/^(\d+) held\b/)?.[1] ?? 0)
    const cleanN = (c: MapCell) => Number(`${c.t} ${c.sub ?? ''}`.match(/(\d+) clears? the check/)?.[1] ?? 0)
    expect(cells.reduce((n, c) => n + heldN(c), 0)).toBe(CORVANE_RECEIPTS.filter((r) => r.held).length)
    expect(cells.reduce((n, c) => n + cleanN(c), 0)).toBe(CORVANE_RECEIPTS.filter((r) => !r.held).length)
    expect(cells.reduce((n, c) => n + heldN(c) + cleanN(c), 0)).toBe(CORVANE_RECEIPTS.length)
    expect(stat(cfo, 'Invoice receipts').value).toBe('6 of 7')
    const us = cells[cfo.rows.findIndex((r) => r[0].t === CORVANE_REGIONS.find((g) => g.key === heldPlant.region)!.label)]
    expect(us.t).toBe('1 held · $42')
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
    expect(column(v, 'Plant').map((c) => c.t)).toEqual(plants.map((p) => p.city))
    expect(column(v, 'Hiring manager').map((c) => c.t)).toEqual(plants.map((p) => p.manager))
    expect(column(v, 'Contractors').map((c) => Number(c.t))).toEqual(plants.map((p) => onSite.filter((c) => c.plant.key === p.key).length))
    expect(column(v, 'Weeks to sign').map((c) => Number(c.t))).toEqual(plants.map((p) => p.weeksToSign))
    expect(column(v, 'Spend this month')[0].t).toBe('MX$273,600') // Monterrey: 18 × MX$95 × 160
    expect(18 * CORVANE_COUNTRIES.MX.rate * HOURS_PER_MONTH).toBe(273_600)
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
    expect(stat(v, 'Spend this month').value).toBe('$62,720')
    expect(14 * 28 * HOURS_PER_MONTH).toBe(62_720)
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
      named(v, 'Supplier', firms); named(v, 'Plant', places); named(v, 'Region', regions)
      expect(people.has(v.demo.target.seat), v.demo.target.seat).toBe(true)
      expect(v.signed).toContain(v.demo.target.seat)
    }
    for (const c of column(view('cfo'), 'Nearest time limit')) {
      const [name, city] = c.sub!.split(', ')
      expect(onSite.some((x) => x.name === name && x.plant.city === city), c.sub).toBe(true)
    }
  })

  it('no figure is typed into the page or the map’s code: each is worked out from the seed', () => {
    const page = read('src/app/page.tsx').replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const code = read('src/lib/public-site/corvane-map.ts').replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const drawn = read('src/lib/public-site/corvane-map-view.tsx')
    for (const figure of ['359', '704', '227', '48 weeks', '62,720', '62720', '264', 'Margaret', 'Valeria', 'Marcus', 'Dayton', 'Keisha', 'Maria Lee', 'Aoife']) {
      for (const [where, src] of [['page.tsx', page], ['corvane-map.ts', code], ['corvane-map-view.tsx', drawn]]) {
        expect(src.includes(figure), `${figure} is typed into ${where}`).toBe(false)
      }
    }
    expect(page).toContain('corvaneMap()')
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
    // The page reads the seat on the server, the way the doors read their tab.
    expect(read('src/app/page.tsx')).toMatch(/seatOf\(searchParams\?\.seat\)/)
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

  it('the page asks the database once whether world-corvane exists, waits at most 800 milliseconds, and anything but a found company in time reads as not set up', async () => {
    const asked: unknown[] = []
    const db = (answer: () => Promise<{ id: string } | null>) => ({ company: { findUnique: (a: unknown) => { asked.push(a); return answer() } } })
    expect(await corvaneIsSeeded(db(async () => ({ id: 'c1' })))).toBe(true)
    expect(await corvaneIsSeeded(db(async () => null))).toBe(false)
    expect(await corvaneIsSeeded(db(async () => { throw new Error('P1001') }))).toBe(false)
    expect(asked[0]).toEqual({ where: { slug: 'world-corvane' }, select: { id: true } })
    // A database slower than the bound reads as not set up, so the page is never held for it.
    expect(SEEDED_WAIT_MS).toBeLessThanOrEqual(800)
    expect(await corvaneIsSeeded(db(() => new Promise((r) => setTimeout(() => r({ id: 'c1' }), 50))), 5)).toBe(false)
    const page = read('src/app/page.tsx')
    expect(page).toMatch(/const doorsOpen = await corvaneIsSeeded\(\)/)
    expect(page).toContain('doorsOpen={doorsOpen}')
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

describe('The map says what the home page may say', () => {

  it('reads as the category, names no real company, does not lead with AI and claims nobody is placed', () => {
    const words = copyOfCorvaneMap(MAP)
    // Read below the home page's own hero, which is where it sits.
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

// ── Under the panel: two drawings and four lines (founder, "Build it", 2026-10-27) ──

import { PROGRAMMES } from '@/lib/seed-programmes'
import { NORTHBEND_TWIN_RECEIPTS } from '@/lib/twin/seed-demo'
import { priceClaims, unverifiableClaims } from '@/lib/positioning'
import { whyDrawings, FOUR_LINES, copyOfWhy, piecesOf } from '@/lib/public-site/why-words'
import { BAND, BAND_FOR_SELF } from '@/lib/public-site/skeleton-words'
import { SECURITY as SECURITY_PAGE } from '@/lib/public-site/company'
import { referenceAt, docSlugs } from '@/lib/public-site/docs/index'
import { WhyBelow } from '@/lib/public-site/why-below'
import { TALK } from '@/lib/public-site/talk'

const WHY = whyDrawings()
const drawing = (k: 'papers' | 'check') => WHY.find((d) => d.key === k)!
const northbend = PROGRAMMES.find((p) => p.client === 'nike')!

describe('Under the panel, two drawings and four lines, every name and figure the seed’s', () => {

  it('the papers drawing is the start Northbend’s seed holds without an I-9: Ingrid Sørensen, the cybersecurity analyst starting next week, named by first name and job, refused until the I-9 is on file', () => {
    // The drawing said Priya Raman; the seed holds no start of hers. The
    // one awarded start at Northbend with no I-9 is Ingrid Sørensen's.
    const held = northbend.placements.filter((p) => p.papers === 'NO_I9' && p.state === 'DRAFT')
    expect(held.map((p) => p.person)).toEqual(['Ingrid Sørensen'])
    expect(held[0].startedDaysAgo).toBe(-7)
    const d = drawing('papers')
    expect(held[0].role).toBe('Cybersecurity analyst')
    // By first name and job only, so the page does not show two full Ingrids.
    expect(d.who).toEqual(['Ingrid, cybersecurity analyst', 'starts next week; compliance checks the set'])
    expect(d.cards).toEqual(['I-9', 'insurance', 'agreement'])
    expect(d.stop).toEqual(['No I-9 → start refused', 'Get it on file, then start.'])
    expect(d.ok).toBeNull()
  })

  it('the check drawing is Renata Kowal paying PR-2026-0441, 40 hours at Pinnacle’s $98 for $3,920, and holding PR-2026-0442 at 41.5 hours against 40', () => {
    const [clean, held] = NORTHBEND_TWIN_RECEIPTS.filter((r) => r.number)
    expect(clean).toMatchObject({ number: 'PR-2026-0441', hoursBilled: 40, hoursAccepted: 40, supplier: 'pinnacle' })
    expect(held).toMatchObject({ number: 'PR-2026-0442', hoursBilled: 41.5, hoursAccepted: 40, supplier: 'pinnacle' })
    const rate = northbend.placements.find((p) => p.person === clean.person && p.via[1] === 'pinnacle' && p.state === 'IN_PROGRESS')!.rates[0]
    expect(rate).toBe(9800)
    expect(northbend.people.ap).toBe('Renata Kowal')
    const d = drawing('check')
    expect(d.who).toEqual(['Renata Kowal, AP clerk', 'pays what the three agree on'])
    expect(d.cards).toEqual(['order $98', 'week 40 h', 'invoice 40 h'])
    expect(d.ok).toBe(`Pay $${((clean.hoursAccepted * rate) / 100).toLocaleString('en-US')}`)
    expect(d.ok).toBe('Pay $3,920')
    expect(d.stop).toEqual(['41.5 h billed → held', 'the 1.5 h wait for a signature'])
  })

  it('the two claims and the sentence under each are the drawing’s, word for word', () => {
    expect(WHY.map((d) => d.claim)).toEqual(['Nobody starts without papers.', 'Nothing is paid on hours nobody signed.'])
    expect(WHY.map((d) => d.sub)).toEqual([
      'The set is asked for, sent, and checked before day one. A lapsed insurance certificate blocks the supplier the same way.',
      'The order, the signed week and the invoice must agree. When they do not, the invoice is held and the supplier is told why.',
    ])
    // "The supplier is told why" is what the hold route does, with the reason.
    expect(read('src/app/api/invoices/[id]/hold/route.ts')).toContain('The supplier is told, with the reason')
  })

  it('the four lines are the drawing’s, word for word, and the security line opens the security page', () => {
    expect(FOUR_LINES.map((l) => `${l.lead} ${l.text}`)).toEqual([
      'In it: Jobs · Candidates · Timesheets · Invoices · Papers · Suppliers. Your suppliers and contractors join at no cost, and nobody at a supplier needs training. Signs in with your work account. Exports to your accounting system.',
      'Price: free while we test. Founding firms keep their terms.',
      'Security: what is done and what is not, on one page. No SOC 2 yet; it is next.',
      'Talk to a person: support@etyme.com. One sentence is enough.',
    ])
    expect(FOUR_LINES[2].links).toEqual([{ words: 'on one page', href: '/security' }])
    expect(FOUR_LINES[3].links).toEqual([{ words: 'support@etyme.com', href: 'mailto:support@etyme.com' }])
    // Each claim in "In it" stands on something built: the work-account
    // sign-in and the accounting export.
    expect(read('src/lib/auth.ts')).toContain('AzureADProvider')
    expect(read('src/lib/erp-profiles.ts')).toContain("'QUICKBOOKS'")
  })

  it('the sign-up band promises no speed, and each claim in "In it" opens the page where a reader checks it: the work-account sign-in on the security page, the export in the documentation', () => {
    // "Two minutes." was a promised speed nobody measured (release walk, 2026-10-27).
    for (const line of [BAND.line, BAND_FOR_SELF.line]) {
      expect(line, line).not.toMatch(/minute/i)
      expect(unverifiableClaims(line), line).toEqual([])
    }
    expect(unverifiableClaims('Two minutes. Free while we are testing.')).not.toEqual([])
    const inIt = FOUR_LINES[0]
    expect(inIt.links).toEqual([
      { words: 'Signs in with your work account', href: '/security' },
      { words: 'Exports to your accounting system', href: '/docs/integrations' },
    ])
    for (const l of inIt.links!) expect(inIt.text).toContain(l.words)
    // What each link lands on says the same thing, under the heading it names.
    const done = SECURITY_PAGE.blocks.find((b) => b.id === 'done')!
    expect(done.lines!.map((l) => l.t)).toContain('Sign in with your company’s work account, or a password.')
    expect(referenceAt('integrations')!.lines).toContain('Journal entries go to your books once. An entry already sent never goes again.')
    expect(docSlugs()).toContain('integrations')
    // And the page draws each as a link, in reading order.
    expect(piecesOf(inIt).filter((p) => p.href).map((p) => p.t)).toEqual(['Signs in with your work account', 'Exports to your accounting system'])
    expect(piecesOf(inIt).map((p) => p.t).join('')).toBe(inIt.text)
    const html = renderToStaticMarkup(createElement(WhyBelow))
    expect(html).toContain('href="/security"')
    expect(html).toContain('href="/docs/integrations"')
  })

  it('one Ingrid on the page: the head of operations is named from the Corvane seed, in her signed-in line and her demo link, and is not an Ingrid; the papers drawing names its start by first name and job', () => {
    const head = CORVANE_PEOPLE.find((p) => p.desk === 'operations')!.name
    expect(head).not.toMatch(/^Ingrid\b/)
    expect(view('operations').signed).toContain(head)
    expect(view('operations').demo.label).toBe(`Open the demo as ${head}`)
    expect(copyOfCorvaneMap(MAP).join(' ')).not.toMatch(/\bIngrid\b/)
    // The demo door still seats her by desk: one person holds it.
    expect(view('operations').demo.target).toMatchObject({ as: 'world-corvane', desk: 'operations' })
    expect(copyOfWhy().join(' ')).not.toContain('Ingrid Sørensen')
    expect(drawing('papers').who[0]).toBe('Ingrid, cybersecurity analyst')
  })

  it('"Talk to a person" is a mail to support@etyme.com beside the demo button in the hero and beside Sign up in the home page’s band, and no door carries it yet', () => {
    expect(TALK).toEqual({ t: 'Talk to a person', href: 'mailto:support@etyme.com', address: 'support@etyme.com' })
    const page = read('src/app/page.tsx')
    expect(page).toMatch(/<OpenTheDemo \/>\s*<TalkToAPerson \/>/)
    expect(page).toContain('<SignUpBand talk />')
    expect(read('src/lib/public-site/skeleton.tsx')).toContain('{talk && <TalkToAPerson />}')
    expect(read('src/lib/public-site/sub-page.tsx')).not.toContain('talk')
  })

  it('names no customer, no number of days, no certification held and no price', () => {
    const words = copyOfWhy()
    const all = words.join(' ')
    expect(namedCompanies(all)).toEqual([])
    expect(all).not.toMatch(/\b\d+\s*(?:business\s+)?days?\b/i)
    expect(priceClaims(all)).toEqual([])
    expect(unverifiableClaims(all)).toEqual([])
    // SOC 2 is named once, as what is not done yet.
    expect(all.match(/SOC 2/g)).toHaveLength(1)
    expect(all).toContain('No SOC 2 yet; it is next.')
    const rules = check({ hero: ['Enterprise contingent workforce management'], body: words }).map((f) => f.rule)
    expect(rules).not.toContain('neutrality')
    expect(rules).not.toContain('never-lead-with-ai')
    for (const w of words) expect(w, w).not.toMatch(/\b(program(?:me)?\s+offices?|desks?)\b/i)
  })

  it('the drawings are inline lines in the brand’s colors, no image and no library, side by side from md and stacked on a phone', () => {
    const src = read('src/lib/public-site/why-below.tsx')
    expect(src).not.toMatch(/<img|<Image|from '(?!\.\/|@\/)/)
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}\b/)
    expect(gridsWithoutBreakpoint(src)).toEqual([])
    expect(src).toContain('grid grid-cols-1 gap-x-6 gap-y-7 md:grid-cols-2')
    const html = renderToStaticMarkup(createElement(WhyBelow))
    expect((html.match(/<svg /g) ?? []).length).toBe(2)
    for (const d of WHY) {
      expect(html).toContain(`aria-label="${d.claim}"`)
      for (const t of [...d.who, ...d.cards, ...d.stop]) expect(html, t).toContain(t.replace(/&/g, '&amp;'))
    }
    expect(html).toContain('href="/security"')
    expect(html).toContain('href="mailto:support@etyme.com"')
  })
})
