/**
 * The CFO view on the home page: Corvane Packaging, a sample company, as
 * its CFO reads it, in four figures and three short lines rather than a
 * table (founder's brief, 2026-11-13: "Compact stats only, no giant
 * table"; his reference page of the same day draws the figures as tiles).
 *
 * Every figure is the seed's, through the same arithmetic the map of
 * 2026-10-27 used (`./corvane-map`): contractors on site, suppliers,
 * sites and countries from `lib/seed-corvane`; the month's spend at 160
 * hours a month in dollars at the shipped sample rates; the held invoice
 * receipt's difference at its line's rate; the start on hold for an I-9;
 * the nearest time limit in whole days. `story-panel-map.test.ts`
 * re-derives each one.
 *
 * `homeGlance` hands the hero's "At a glance" panel the same held amount,
 * so the $42 in the hero and the $42 in the CFO view are one figure.
 *
 * Server only: the seed reaches the database client, so the page reads
 * this and hands the plain data to the button that shows it.
 */

import { CORVANE_PLANTS, CORVANE_RECEIPTS, CORVANE_COUNTRIES, corvaneContractors } from '@/lib/seed-corvane'
import { format, fromMinor } from '@/lib/money'
import { daysToLimit, heldOverMinor, spendInDollars } from './corvane-map'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const spelled = (n: number) => (['no', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n))

/** A figure drawn as a tile: the number, then what it counts. */
export interface CfoTile { b: string; s: string }
/** A line under the tiles: the place in bold where there is one, then what stopped. */
export interface CfoLine { lead?: string; t: string; att?: boolean }
export interface HomeCfo { tiles: CfoTile[]; lines: CfoLine[] }

const plantOf = (key: string) => CORVANE_PLANTS.find((p) => p.key === key)!
const held = () => CORVANE_RECEIPTS.filter((r) => r.held)
const heldAmount = (r: (typeof CORVANE_RECEIPTS)[number]) =>
  format(fromMinor(heldOverMinor(r), CORVANE_COUNTRIES[plantOf(r.plant).cc].currency), { compact: true })

export function homeCfo(): HomeCfo {
  const { onSite, onHold } = corvaneContractors()
  const suppliers = new Set(onSite.map((c) => c.supplier)).size
  const countries = new Set(CORVANE_PLANTS.map((p) => p.cc)).size
  const spend = spendInDollars(onSite)
  const receipts = held()
  const nearest = [...onSite].sort((a, b) => daysToLimit(a) - daysToLimit(b))[0]
  const heldLines: CfoLine[] = receipts.length === 1
    ? [{ lead: `${plantOf(receipts[0].plant).city}:`, t: `one invoice receipt held, ${heldAmount(receipts[0])} over the signed hours.`, att: true }]
    : [{ t: `${spelled(receipts.length)} invoice receipts held over the signed hours.`, att: receipts.length > 0 }]
  return {
    tiles: [
      { b: String(onSite.length), s: 'contractors' },
      { b: String(suppliers), s: 'suppliers' },
      { b: String(CORVANE_PLANTS.length), s: `sites · ${plural(countries, 'country', 'countries')}` },
      spend === null
        ? { b: '—', s: 'spend this month: no sample rate' }
        : { b: format(fromMinor(spend, 'USD'), { compact: true }), s: 'spend this month, at sample rates' },
    ],
    lines: [
      ...heldLines,
      { lead: `${onHold.plant.city}:`, t: 'one start waiting on an I-9.', att: true },
      { lead: `${nearest.plant.city}:`, t: `${nearest.name} reaches the time limit in ${plural(daysToLimit(nearest), 'day')}.` },
    ],
  }
}

/**
 * The held amount for the hero's glance, "$42": null where the seed holds
 * no receipt or more than one, because "held on one invoice" would then be
 * untrue, and the glance draws no figure rather than a wrong one.
 */
export function homeGlanceHeld(): string | null {
  const receipts = held()
  return receipts.length === 1 ? heldAmount(receipts[0]) : null
}

/** Every word the CFO view shows, for the guards that read the page. */
export function homeCfoCopy(c: HomeCfo = homeCfo()): string[] {
  return [...c.tiles.map((t) => `${t.b} ${t.s}`), ...c.lines.map((l) => (l.lead ? `${l.lead} ${l.t}` : l.t))]
}
