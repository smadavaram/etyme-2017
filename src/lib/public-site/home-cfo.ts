/**
 * The CFO view on the home page: Corvane Packaging, a sample company, as
 * its CFO reads it, in four figures and short lines rather than a table
 * (founder's brief, 2026-11-13: "Compact stats only, no giant table"; his
 * reference page of the same day draws the figures as tiles).
 *
 * Every figure is the seed's, through the product's own arithmetic:
 * contractors on site, suppliers, sites and countries from
 * `lib/seed-corvane`; the month's spend at 160 hours a month in dollars at
 * the shipped sample rates (`spendInDollars` in `./corvane-map`), and the
 * year as twelve of those months; the held supplier invoices' total over
 * the signed hours in dollars through the same sample rates
 * (`corvaneHeldInReporting`), and the largest of them in its own money;
 * the start on hold for an I-9; the nearest time limit in whole days.
 * `story-panel-map.test.ts` re-derives each one.
 *
 * `homeGlanceHeld` hands the hero's "At a glance" panel and the first
 * proof card the same held total, so the figure in the hero, the proof
 * card and the CFO view is one figure.
 *
 * Server only: the seed reaches the database client, so the page reads
 * this and hands the plain data to the button that shows it.
 */

import { CORVANE_PLANTS, CORVANE_RECEIPTS, CORVANE_COUNTRIES, corvaneContractors, corvaneHeldInReporting, receiptOverMinor } from '@/lib/seed-corvane'
import { format, fromMinor } from '@/lib/money'
import { daysToLimit, spendInDollars } from './corvane-map'
import type { HomeHeld } from './home-words'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const spelled = (n: number) => (['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][n] ?? String(n))
const usd = (minor: number) => format(fromMinor(minor, 'USD'), { compact: true })

/** A figure drawn as a tile: the number, then what it counts. */
export interface CfoTile { b: string; s: string }
/** A line under the tiles: the place in bold where there is one, then what stopped. */
export interface CfoLine { lead?: string; t: string; att?: boolean }
export interface HomeCfo { tiles: CfoTile[]; lines: CfoLine[] }

const plantOf = (key: string) => CORVANE_PLANTS.find((p) => p.key === key)!

/**
 * A year at this month's rate, in dollars, said to the tenth of a
 * million: "$43.4 million". Twelve times the month, never typed.
 */
export function yearInMillions(monthMinor: number): string {
  return `$${(Math.round((monthMinor * 12) / 10_000_000) / 10).toFixed(1)} million`
}

/**
 * The held supplier invoices, in dollars at the sample rates: the total
 * over the signed hours, how many, and the largest by its dollar amount,
 * said in its own money. Null where any currency has no sample rate,
 * because a total missing one currency would be a wrong number.
 */
export function heldInDollars(): { total: number; count: number; largest: { city: string; amount: string } } | null {
  const { spend, receipts } = corvaneHeldInReporting()
  if (!spend.total || receipts.length === 0 || receipts.some((r) => r.overMinor === null)) return null
  const held = CORVANE_RECEIPTS.filter((r) => r.held)
  const top = receipts.reduce((a, b) => ((b.overMinor ?? 0) > (a.overMinor ?? 0) ? b : a))
  const receipt = held.find((r) => r.plant === top.plant)!
  const plant = plantOf(receipt.plant)
  return {
    total: spend.total.minor,
    count: receipts.length,
    largest: { city: plant.city, amount: format(fromMinor(receiptOverMinor(receipt), CORVANE_COUNTRIES[plant.cc].currency), { compact: true }) },
  }
}

export function homeCfo(): HomeCfo {
  const { onSite, onHold } = corvaneContractors()
  const suppliers = new Set(onSite.map((c) => c.supplier)).size
  const countries = new Set(CORVANE_PLANTS.map((p) => p.cc)).size
  const spend = spendInDollars(onSite)
  const held = heldInDollars()
  const nearest = [...onSite].sort((a, b) => daysToLimit(a) - daysToLimit(b))[0]
  const heldLines: CfoLine[] = held
    ? [{
        t: `${spelled(held.count)} supplier ${held.count === 1 ? 'invoice' : 'invoices'} held, ${usd(held.total)} over the signed hours. ` +
          `The largest: ${held.largest.city}, ${held.largest.amount} over on one supplier invoice.`,
        att: true,
      }]
    : []
  return {
    tiles: [
      { b: String(onSite.length), s: 'contractors' },
      { b: String(suppliers), s: 'suppliers' },
      { b: String(CORVANE_PLANTS.length), s: `sites · ${plural(countries, 'country', 'countries')}` },
      spend === null
        ? { b: '—', s: 'spend this month: no sample rate' }
        : { b: usd(spend), s: 'spend this month, at sample rates' },
    ],
    lines: [
      ...(spend === null ? [] : [{ t: `About ${yearInMillions(spend)} a year at sample rates.` }]),
      ...heldLines,
      { lead: `${onHold.plant.city}:`, t: 'one start waiting on an I-9.', att: true },
      { lead: `${nearest.plant.city}:`, t: `${nearest.name} reaches the time limit in ${plural(daysToLimit(nearest), 'day')}.` },
    ],
  }
}

/**
 * What the hero's glance and the first proof card carry: the month's
 * total billed over the signed hours on the held invoices (never called
 * the money held: each invoice is held whole), in dollars at the sample rates,
 * and on how many supplier invoices. Null where the seed holds none or a
 * currency has no sample rate; the glance then draws no figure rather
 * than a wrong one.
 */
export function homeGlanceHeld(): HomeHeld | null {
  const held = heldInDollars()
  return held ? { amount: usd(held.total), invoices: held.count } : null
}

/** Every word the CFO view shows, for the guards that read the page. */
export function homeCfoCopy(c: HomeCfo = homeCfo()): string[] {
  return [...c.tiles.map((t) => `${t.b} ${t.s}`), ...c.lines.map((l) => (l.lead ? `${l.lead} ${l.t}` : l.t))]
}
