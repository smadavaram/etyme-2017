/**
 * The map: Corvane Packaging's every contractor, supplier and site on one
 * record, read from four seats. The home page's picture since the
 * founder's "Build it", 2026-10-27, on the corrected drawing
 * (https://claude.ai/artifact/VBYzE7NFTtJxTyebWSzirp, version 2).
 *
 * ── Why it is the home page ──────────────────────────────────────────
 *
 * The founder: "This is the vision of Etyme." It is the only picture of
 * the whole product at once from the seat of the person who signs the
 * order. The tabs are four roles, not people's names, because the
 * highlighting tells the story ("Clicking on CFO, hiring managers like in
 * the link was better"): CFO, Head of operations, Regional manager,
 * Hiring manager. Under them, who is signed in and what that seat reads.
 *
 * ── Every name and figure is read from the seed ──────────────────────
 *
 * Nothing here is typed in: the plants, regions, people, suppliers,
 * counts, rates and receipts come from `lib/seed-corvane`, and the
 * money from the product's own arithmetic — `programMonthlySpend` at
 * 160 hours a month (the estimate every program screen uses, said under
 * the map) and `spendInReporting` at the shipped sample rates, which the
 * line under the map names as sample. Months here are whole months,
 * never rounded up (`monthsOf`). `__tests__/invariants/story-panel-map.test.ts`
 * re-derives each figure and reads every name against the seed.
 *
 * ── Where the drawing and the seed disagreed, the seed won ────────────
 *
 *   drawing                              seed, and so the map
 *   "6 paid of 7" invoice receipts       the seed's receipts are submitted, not
 *                                        paid; six pass the three-way check and
 *                                        one is held, so "6 of 7 clear the check"
 *   "This week: signed" on Dayton rows   only three weeks are filed at Dayton,
 *                                        all waiting; the others read "nothing
 *                                        to sign"
 *   "Maria Lee … starts Monday"          she starts in five days from the
 *                                        world's day, said as days
 *   "Checked just now."                  left off: this is sample data drawn
 *                                        when the page was built, not a live read
 *   "Mexico, Brazil and Colombia each    left off: no paper or rule outside the
 *   ask for their own papers"            US is seeded or confirmed yet
 *   the nearest time limit, one name     where a region has two people within
 *                                        30 days, "and 1 more" says so
 *
 * Server only: the seed reaches the database client, so the page reads
 * this and hands the plain views to `./corvane-map-view`, which switches
 * the tabs in the browser.
 */

import {
  CORVANE_NAME, CORVANE_SLUG, CORVANE_PLANTS, CORVANE_REGIONS, CORVANE_COUNTRIES, CORVANE_RECEIPTS, CORVANE_PEOPLE,
  LIMIT_DAYS, corvaneContractors, billRateMinor, plantSuppliers,
  type CorvanePlant, type PlannedContractor, type RegionKey,
} from '@/lib/seed-corvane'
import { programMonthlySpend, HOURS_PER_MONTH } from '@/lib/program-spend'
import { spendInReporting, SAMPLE_RATE_TABLE } from '@/lib/money/reporting-currency'
import { format, fromMinor } from '@/lib/money'
import { monthsOf } from '@/lib/tenure-days'
import { possessive } from '@/lib/requisition-approval'
import type { SeatTarget } from './flow'

// ── The shape the view draws ─────────────────────────────────────────

export type SeatKey = 'cfo' | 'operations' | 'region' | 'hiring'

/** The four tabs, in order, each a link at its own address (`/?seat=…`). */
export const MAP_SEATS: readonly { key: SeatKey; tab: string }[] = [
  { key: 'cfo', tab: 'CFO' },
  { key: 'operations', tab: 'Head of operations' },
  { key: 'region', tab: 'Regional manager' },
  { key: 'hiring', tab: 'Hiring manager' },
]

/** The seat a reader meets with no `seat` in the address. */
export const DEFAULT_SEAT: SeatKey = 'cfo'

/** The seat an address asks for, or the default for anything else. */
export function seatOf(asked: string | string[] | undefined): SeatKey {
  const s = Array.isArray(asked) ? asked[0] : asked
  return MAP_SEATS.some((m) => m.key === s) ? (s as SeatKey) : DEFAULT_SEAT
}

/** A tab's own address: the home page with the seat, landing on the map. */
export function seatHref(key: SeatKey): string {
  return key === DEFAULT_SEAT ? '/#map' : `/?seat=${key}#map`
}

/** Every tab's address, by seat. */
export function seatHrefs(): Record<SeatKey, string> {
  return Object.fromEntries(MAP_SEATS.map((m) => [m.key, seatHref(m.key)])) as Record<SeatKey, string>
}

export type Tone = 'att' | 'ok'

/** One cell: its words, a muted line under them, a pill, attention color, bold. */
export interface MapCell { t: string; sub?: string; chip?: Tone; att?: boolean; strong?: boolean }

export interface MapStat { label: string; value: string; sub?: string; att?: boolean }

export interface MapView {
  key: SeatKey
  tab: string
  /** "Signed in as …": who, and what this seat reads. */
  signed: string
  /** The one sentence naming what stopped. */
  headline: string
  stats: MapStat[]
  columns: { t: string; right?: boolean }[]
  rows: MapCell[][]
  caption: string
  demo: { target: SeatTarget; label: string }
}

export interface CorvaneMap {
  /** The bar over the tabs. */
  bar: string
  views: MapView[]
  /** The line under the map: what the reader is looking at, and what the figures rest on. */
  under: string
}

// ── Which seats the drawing plays ────────────────────────────────────

/** The regional manager shown: Latin America's, as on the drawing. */
export const REGION_SHOWN: RegionKey = 'latam'
/** The hiring manager shown: the first plant's, Dayton, as on the drawing. */
export const PLANT_SHOWN: CorvanePlant = CORVANE_PLANTS[0]
/** How many of the plant's contractors the hiring manager's table lists before the start on hold. */
export const PLANT_ROWS = 5
/** "Near the time limit" on the head of operations' list. */
export const NEAR_LIMIT_DAYS = 30
/** A hiring manager's row reads in the attention color from the time limit's 60-day warning (the twin's 90/60/30). */
export const WARN_DAYS = 60

export const CORVANE_DEMO_AS = `world-${CORVANE_SLUG}`

// ── Arithmetic, from the seed ────────────────────────────────────────

/** Days until a contractor reaches the time limit (the seed's own count). */
export function daysToLimit(c: PlannedContractor): number {
  return LIMIT_DAYS - 1 - c.startedDaysAgo
}

/** Whole months on site, never rounded up: today counts as a day on site. */
export function monthsHere(c: PlannedContractor): number {
  return monthsOf(c.startedDaysAgo + 1)
}

const currencyOf = (p: CorvanePlant) => CORVANE_COUNTRIES[p.cc].currency
const money = (minor: number, currency: string) => format(fromMinor(minor, currency), { compact: true })

/** What a set of contractors costs a month, per currency, at 160 hours a month. */
export function spendByCurrency(people: readonly PlannedContractor[]): { currency: string; minor: number }[] {
  const by = new Map<string, number[]>()
  for (const c of people) by.set(currencyOf(c.plant), [...(by.get(currencyOf(c.plant)) ?? []), billRateMinor(c.plant.cc)])
  return [...by].map(([currency, rates]) => ({
    currency, minor: programMonthlySpend(rates.map((r) => ({ rateMinorPerHour: r }))).totalMinor,
  }))
}

/** The same, as one figure in dollars at the shipped sample rates; null where a currency has none. */
export function spendInDollars(people: readonly PlannedContractor[]): number | null {
  const s = spendInReporting(spendByCurrency(people), 'USD', SAMPLE_RATE_TABLE)
  return s.total ? s.total.minor : null
}

const dollars = (minor: number | null) => (minor === null ? 'no sample rate' : money(minor, 'USD'))
const ownMoney = (people: readonly PlannedContractor[]) => spendByCurrency(people).map((s) => money(s.minor, s.currency)).join(' · ')

/** A held receipt's difference: the hours billed past the hours signed, at the line's rate. */
export function heldOverMinor(r: (typeof CORVANE_RECEIPTS)[number]): number {
  const plant = CORVANE_PLANTS.find((p) => p.key === r.plant)!
  return Math.round((r.billed - r.accepted) * billRateMinor(plant.cc))
}

/**
 * The weeks waiting to be signed at a plant: the first `weeksToSign` of
 * its contractors on site, which is who the seed files last week for.
 */
export function waitingAt(plant: CorvanePlant, onSite: readonly PlannedContractor[]): PlannedContractor[] {
  return onSite.filter((c) => c.plant.key === plant.key).slice(0, plant.weeksToSign)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const spelled = (n: number) => (['No', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? String(n))
const nearestOf = (people: readonly PlannedContractor[]) =>
  [...people].sort((a, b) => daysToLimit(a) - daysToLimit(b))[0]

// ── The four views ───────────────────────────────────────────────────

export function corvaneMap(): CorvaneMap {
  const { onSite, onHold } = corvaneContractors()
  const person = (desk: string) => CORVANE_PEOPLE.find((p) => p.desk === desk)!
  const suppliers = new Set(onSite.map((c) => c.supplier)).size
  const countries = new Set(CORVANE_PLANTS.map((p) => p.cc)).size
  const currencies = new Set(CORVANE_PLANTS.map(currencyOf)).size
  const total = spendInDollars(onSite)
  const held = CORVANE_RECEIPTS.filter((r) => r.held)
  const clean = CORVANE_RECEIPTS.filter((r) => !r.held)
  const plantOf = (key: string) => CORVANE_PLANTS.find((p) => p.key === key)!
  const holdPlant = onHold.plant
  /** The seed holds one start for papers; a list, so the figure is counted rather than typed. */
  const holds = [onHold]
  /** Held differences, summed per currency and said in each one's own money. */
  const heldMoney = (rs: typeof held) => {
    const by = new Map<string, number>()
    for (const r of rs) by.set(currencyOf(plantOf(r.plant)), (by.get(currencyOf(plantOf(r.plant))) ?? 0) + heldOverMinor(r))
    return [...by].map(([c, m]) => money(m, c)).join(' · ')
  }
  const nearest = nearestOf(onSite)

  const regions = CORVANE_REGIONS.map((r) => {
    const plants = CORVANE_PLANTS.filter((p) => p.region === r.key)
    const people = onSite.filter((c) => c.plant.region === r.key)
    const inRegion = (x: { plant: string }) => plants.some((p) => p.key === x.plant)
    const near = people.filter((c) => daysToLimit(c) <= NEAR_LIMIT_DAYS)
    return {
      r, plants, people, near,
      nearest: nearestOf(people),
      jobs: plants.reduce((n, p) => n + p.openJobs, 0),
      weeks: plants.reduce((n, p) => n + p.weeksToSign, 0),
      clean: clean.filter(inRegion).length,
      held: held.filter(inRegion),
      onHold: onHold.plant.region === r.key ? 1 : 0,
      usd: spendInDollars(people),
    }
  })

  // ── CFO ──
  const cfo = person('cfo')
  const heldWords = held.length === 1
    ? `One invoice receipt in ${plantOf(held[0].plant).city} is held, ${money(heldOverMinor(held[0]), currencyOf(plantOf(held[0].plant)))} over the signed hours.`
    : `${spelled(held.length)} invoice receipts are held over the signed hours.`
  const cfoView: MapView = {
    key: 'cfo', tab: 'CFO',
    signed: `Signed in as ${cfo.name}, CFO. Reads every region. Signs nothing a plant’s own people sign.`,
    headline:
      `${heldWords} One start in ${holdPlant.city} is waiting on an I-9. ` +
      `${nearest.name} in ${nearest.plant.city} reaches the time limit in ${plural(daysToLimit(nearest), 'day')}.`,
    stats: [
      { label: 'Contractors on site', value: String(onSite.length), sub: `${suppliers} suppliers · ${CORVANE_PLANTS.length} sites` },
      { label: 'Spend this month', value: dollars(total), sub: `in ${currencies} currencies, at sample rates` },
      { label: 'Invoice receipts', value: `${clean.length} of ${CORVANE_RECEIPTS.length}`, sub: 'clear the three-way check' },
      {
        label: 'Held over the hours', att: held.length > 0,
        value: heldMoney(held) || 'none',
        sub: `${plural(held.length, 'receipt')}, ${[...new Set(held.map((h) => plantOf(h.plant).city))].join(', ')}`,
      },
      { label: 'Starts waiting on papers', value: String(holds.length), sub: `${holdPlant.city}, an I-9`, att: holds.length > 0 },
    ],
    columns: [
      { t: 'Region' }, { t: 'Contractors', right: true }, { t: 'Open jobs', right: true }, { t: 'Weeks to sign', right: true },
      { t: 'Papers' }, { t: 'Money' }, { t: 'Nearest time limit' }, { t: 'Spend this month', right: true },
    ],
    rows: regions.map((g) => [
      { t: g.r.label, sub: `${g.r.lead} · ${plural(g.plants.length, 'site')}`, strong: true },
      { t: String(g.people.length) },
      { t: String(g.jobs) },
      { t: String(g.weeks) },
      g.onHold ? { t: `${g.onHold} start on hold`, chip: 'att' } : { t: 'none blocking', chip: 'ok' },
      g.held.length
        ? { t: `${plural(g.held.length, 'receipt')} held · ${heldMoney(g.held)}`, chip: 'att' }
        : { t: `${g.clean} ${g.clean === 1 ? 'clears' : 'clear'} the check`, chip: 'ok' },
      { t: plural(daysToLimit(g.nearest), 'day'), sub: `${g.nearest.name}, ${g.nearest.plant.city}`, att: daysToLimit(g.nearest) <= NEAR_LIMIT_DAYS },
      // In dollars, with the region's own money under it where that is not dollars.
      { t: dollars(g.usd), sub: spendByCurrency(g.people).some((x) => x.currency !== 'USD') ? ownMoney(g.people) : undefined },
    ]),
    caption: 'Four flows per region: who is on site, who waits on papers, what clears the check, what is held.',
    demo: { target: { as: CORVANE_DEMO_AS, desk: 'cfo', seat: cfo.name }, label: `Open the demo as ${cfo.name}` },
  }

  // ── Head of operations ──
  const ops = person('operations')
  const weeks = regions.reduce((n, g) => n + g.weeks, 0)
  const plantsWaiting = CORVANE_PLANTS.filter((p) => p.weeksToSign > 0).length
  const nearAll = onSite.filter((c) => daysToLimit(c) <= NEAR_LIMIT_DAYS).length
  const opsView: MapView = {
    key: 'operations', tab: 'Head of operations',
    signed: `Signed in as ${ops.name}, head of operations. Reads every plant, every supplier, one list.`,
    headline:
      `${plural(weeks, 'week')} ${weeks === 1 ? 'is' : 'are'} waiting to be signed across ${plural(plantsWaiting, 'plant')}, ` +
      `and ${plural(nearAll, 'contractor')} reach the time limit within ${NEAR_LIMIT_DAYS} days.`,
    stats: [
      { label: 'Contractors on site', value: String(onSite.length), sub: `${CORVANE_PLANTS.length} plants · ${countries} countries` },
      { label: 'Hiring managers', value: String(new Set(CORVANE_PLANTS.map((p) => p.manager)).size) },
      { label: 'Open jobs', value: String(regions.reduce((n, g) => n + g.jobs, 0)) },
      { label: 'Weeks to sign', value: String(weeks), att: weeks > 0 },
      { label: 'Spend this month', value: dollars(total), sub: 'at sample rates' },
    ],
    columns: [
      { t: 'Region' }, { t: 'Regional manager' }, { t: 'Plants', right: true }, { t: 'Contractors', right: true },
      { t: 'Open jobs', right: true }, { t: 'Weeks to sign', right: true }, { t: 'Near the time limit' }, { t: 'Spend this month', right: true },
    ],
    rows: regions.map((g) => [
      { t: g.r.label, strong: true },
      { t: g.r.lead },
      { t: String(g.plants.length) },
      { t: String(g.people.length) },
      { t: String(g.jobs) },
      { t: String(g.weeks), chip: g.weeks > 0 ? 'att' : 'ok' },
      g.near.length
        ? { t: `${g.nearest.name}, ${g.nearest.plant.city} · ${plural(daysToLimit(g.nearest), 'day')}${g.near.length > 1 ? `, and ${g.near.length - 1} more` : ''}`, chip: 'att' }
        : { t: `none within ${NEAR_LIMIT_DAYS} days`, chip: 'ok' },
      { t: dollars(g.usd) },
    ]),
    caption: 'Every plant, every supplier, one list. Pick a region to see its hiring managers.',
    demo: { target: { as: CORVANE_DEMO_AS, desk: 'operations', seat: ops.name }, label: `Open the demo as ${ops.name}` },
  }

  // ── Regional manager ──
  const reg = regions.find((g) => g.r.key === REGION_SHOWN)!
  const regPlant = [...reg.plants].sort((a, b) => a.nearestLimitDays - b.nearestLimitDays)[0]
  const regNearest = nearestOf(onSite.filter((c) => c.plant.key === regPlant.key))
  const regSuppliers = new Set(reg.people.map((c) => c.supplier)).size
  const regCountries = new Set(reg.plants.map((p) => p.cc)).size
  const regManagers = reg.plants.filter((p) => p.weeksToSign > 0).length
  const regionView: MapView = {
    key: 'region', tab: 'Regional manager',
    signed: `Signed in as ${reg.r.lead}, regional manager, ${reg.r.label}. Reads the ${reg.plants.length} plants in ${reg.r.label} and nothing outside them.`,
    headline:
      `${regPlant.manager} has ${plural(regPlant.weeksToSign, 'week')} to sign in ${regPlant.city}, ` +
      `and ${regNearest.name} there reaches the time limit in ${plural(daysToLimit(regNearest), 'day')}.`,
    stats: [
      { label: 'Contractors on site', value: String(reg.people.length), sub: `${regSuppliers} suppliers · ${reg.plants.length} plants · ${regCountries} countries` },
      { label: 'Open jobs', value: String(reg.jobs) },
      { label: 'Weeks to sign', value: String(reg.weeks), sub: `across ${plural(regManagers, 'hiring manager')}`, att: reg.weeks > 0 },
      { label: 'Invoice receipts', value: `${reg.clean} of ${reg.clean + reg.held.length}`, sub: reg.held.length ? `${reg.held.length} held` : 'none held' },
      { label: 'Nearest time limit', value: plural(daysToLimit(reg.nearest), 'day'), sub: reg.nearest.plant.city, att: daysToLimit(reg.nearest) <= NEAR_LIMIT_DAYS },
    ],
    columns: [
      { t: 'Plant' }, { t: 'Hiring manager' }, { t: 'Contractors', right: true }, { t: 'Open jobs', right: true },
      { t: 'Weeks to sign', right: true }, { t: 'Nearest time limit' }, { t: 'Spend this month', right: true },
    ],
    rows: reg.plants.map((p) => {
      const here = onSite.filter((c) => c.plant.key === p.key)
      return [
        { t: p.city, strong: true },
        { t: p.manager },
        { t: String(here.length) },
        { t: String(p.openJobs) },
        { t: String(p.weeksToSign) },
        { t: plural(p.nearestLimitDays, 'day'), att: p.nearestLimitDays <= NEAR_LIMIT_DAYS },
        { t: ownMoney(here) },
      ]
    }),
    caption: 'Spend in each plant’s own money.',
    demo: { target: { as: CORVANE_DEMO_AS, desk: 'region', who: reg.r.lead, seat: reg.r.lead }, label: `Open the demo as ${reg.r.lead}` },
  }

  // ── Hiring manager ──
  const plant = PLANT_SHOWN
  const mine = onSite.filter((c) => c.plant.key === plant.key)
  const waiting = waitingAt(plant, onSite).sort((a, b) => daysToLimit(a) - daysToLimit(b))
  const isWaiting = (c: PlannedContractor) => waiting.some((w) => w.key === c.key)
  const rate = billRateMinor(plant.cc)
  const first = (name: string) => name.split(' ')[0]
  const hiringView: MapView = {
    key: 'hiring', tab: 'Hiring manager',
    signed:
      `Signed in as ${plant.manager}, hiring manager, ${plant.plant}. ` +
      `Reads the ${mine.length} contractors at ${plant.city} and their ${plural(plantSuppliers(plant).length, 'supplier')}.`,
    headline:
      `${possessive(waiting[0].name, '’')} week is waiting for you, and ${waiting.length - 1} more. ` +
      `${onHold.name} cannot start without an I-9.`,
    stats: [
      { label: 'Your contractors', value: String(mine.length), sub: plural(plantSuppliers(plant).length, 'supplier') },
      { label: 'Open jobs', value: String(plant.openJobs) },
      { label: 'Weeks to sign', value: String(waiting.length), sub: waiting.map((w) => first(w.name)).join(', '), att: waiting.length > 0 },
      { label: 'Start on hold', value: String(holds.filter((h) => h.plant.key === plant.key).length), sub: `${onHold.name}, an I-9`, att: true },
      { label: 'Spend this month', value: ownMoney(mine), sub: `${money(rate, currencyOf(plant))} an hour, every line` },
    ],
    columns: [
      { t: 'Contractor' }, { t: 'Job' }, { t: 'Supplier' }, { t: 'Months here', right: true }, { t: 'Line' }, { t: 'This week' },
    ],
    rows: [
      ...mine.slice(0, PLANT_ROWS).map((c): MapCell[] => [
        { t: c.name, strong: true },
        { t: c.job },
        { t: c.supplier },
        { t: String(monthsHere(c)) },
        c.nearest
          ? { t: `${plural(daysToLimit(c), 'day')} to the time limit`, att: daysToLimit(c) <= WARN_DAYS }
          : { t: `ends in ${plural(c.endsInDays, 'day')}` },
        isWaiting(c) ? { t: 'waiting for you', chip: 'att' } : { t: 'nothing to sign', chip: 'ok' },
      ]),
      [
        { t: onHold.name, sub: `starts in ${plural(-onHold.startedDaysAgo, 'day')}`, strong: true },
        { t: onHold.job },
        { t: onHold.supplier },
        { t: '—' },
        { t: 'on hold: no I-9 on file', att: true },
        { t: 'cannot start', chip: 'att' },
      ],
    ],
    caption: `${plural(mine.length - PLANT_ROWS, 'more contractor')} below. The same rows the CFO’s total is added from.`,
    demo: { target: { as: CORVANE_DEMO_AS, desk: 'hiring', who: plant.manager, seat: plant.manager }, label: `Open the demo as ${plant.manager}` },
  }

  return {
    bar: `${CORVANE_NAME} · a sample company · ${onSite.length} contractors · ${suppliers} suppliers · ${CORVANE_PLANTS.length} sites in ${countries} countries`,
    views: [cfoView, opsView, regionView, hiringView],
    under:
      `One record, read at four levels. ${CORVANE_NAME} is a demo company, not a customer. ` +
      `Spend is each bill rate at ${HOURS_PER_MONTH} hours a month; the dollar figures use sample exchange rates.`,
  }
}

/** Every word the map can show, for the guards that read a page's copy. */
export function copyOfCorvaneMap(map: CorvaneMap = corvaneMap()): string[] {
  return [
    map.bar, map.under,
    ...map.views.flatMap((v) => [
      v.tab, v.signed, v.headline, v.caption, v.demo.label,
      ...v.stats.flatMap((s) => [s.label, s.value, s.sub ?? '']),
      ...v.columns.map((c) => c.t),
      ...v.rows.flatMap((r) => r.flatMap((c) => [c.t, c.sub ?? ''])),
    ]),
  ].filter(Boolean)
}

/** The words a reader reads with no tab pressed: the bar, the tabs, the default seat and the line under. */
export function defaultCopyOfCorvaneMap(map: CorvaneMap = corvaneMap()): string[] {
  const v = map.views.find((x) => x.key === DEFAULT_SEAT)!
  return [
    map.bar, ...map.views.map((x) => x.tab), map.under,
    v.signed, v.headline, v.caption, v.demo.label,
    ...v.stats.flatMap((s) => [s.label, s.value, s.sub ?? '']),
    ...v.columns.map((c) => c.t),
    ...v.rows.flatMap((r) => r.flatMap((c) => [c.t, c.sub ?? ''])),
  ].filter(Boolean)
}
