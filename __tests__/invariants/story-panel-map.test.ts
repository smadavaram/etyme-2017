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
  type MapView, type SeatKey,
} from '@/lib/public-site/corvane-map'
import { CorvaneMapView } from '@/lib/public-site/corvane-map-view'
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
    const html = renderToStaticMarkup(createElement(CorvaneMapView, { map: MAP, seat: 'region', hrefs }))
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

  it('on a phone the figures stack, the tabs wrap, and the table scrolls inside its own box so the page never does', () => {
    const drawn = read('src/lib/public-site/corvane-map-view.tsx')
    expect(gridsWithoutBreakpoint(drawn)).toEqual([])
    expect(drawn).toContain('grid grid-cols-1 border-t border-etyme-rule sm:grid-cols-3 lg:grid-cols-5')
    expect(drawn).toMatch(/aria-label="Read it as" className="flex flex-wrap/)
    expect(drawn).toMatch(/<div className="overflow-x-auto[^"]*">\s*<table className="w-full min-w-\[/)
    expect(read('src/app/page.tsx')).toContain('min-h-screen overflow-x-hidden')
  })
})
