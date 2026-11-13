/**
 * The CFO view on the home page: Corvane Packaging, a sample company, as
 * its CFO reads it, in short lines rather than a table (founder's brief,
 * 2026-11-13: "Compact stats only, no giant table").
 *
 * Every figure is the seed's, through the same arithmetic the map of
 * 2026-10-27 used (`./corvane-map`): contractors on site, suppliers,
 * sites and countries from `lib/seed-corvane`; the month's spend at 160
 * hours a month in dollars at the shipped sample rates; the held invoice
 * receipt's difference at its line's rate; the start on hold for an I-9;
 * the nearest time limit in whole days. `home-page.test.ts` re-derives
 * each one.
 *
 * Server only: the seed reaches the database client, so the page reads
 * this and hands the plain lines to the button that shows them.
 */

import { CORVANE_PLANTS, CORVANE_RECEIPTS, CORVANE_COUNTRIES, corvaneContractors } from '@/lib/seed-corvane'
import { format, fromMinor } from '@/lib/money'
import { daysToLimit, heldOverMinor, spendInDollars } from './corvane-map'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const spelled = (n: number) => (['No', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? String(n))

export interface CfoLine { t: string; att?: boolean }

export function homeCfoLines(): CfoLine[] {
  const { onSite, onHold } = corvaneContractors()
  const suppliers = new Set(onSite.map((c) => c.supplier)).size
  const countries = new Set(CORVANE_PLANTS.map((p) => p.cc)).size
  const spend = spendInDollars(onSite)
  const held = CORVANE_RECEIPTS.filter((r) => r.held)
  const plantOf = (key: string) => CORVANE_PLANTS.find((p) => p.key === key)!
  const nearest = [...onSite].sort((a, b) => daysToLimit(a) - daysToLimit(b))[0]
  const heldLines: CfoLine[] = held.map((r) => {
    const plant = plantOf(r.plant)
    const currency = CORVANE_COUNTRIES[plant.cc].currency
    return { t: `One invoice receipt held: ${format(fromMinor(heldOverMinor(r), currency), { compact: true })} over the signed hours (${plant.city})`, att: true }
  })
  return [
    { t: `${onSite.length} contractors · ${suppliers} suppliers · ${CORVANE_PLANTS.length} sites · ${countries} countries` },
    { t: spend === null ? 'Spend this month: no sample rate' : `Spend this month: ${format(fromMinor(spend, 'USD'), { compact: true })} at sample rates` },
    ...(held.length > 1 ? [{ t: `${spelled(held.length)} invoice receipts held over the signed hours`, att: true }] : heldLines),
    { t: `One start waiting on an I-9 (${onHold.plant.city})`, att: true },
    { t: `${nearest.name}, ${nearest.plant.city}, reaches the time limit in ${plural(daysToLimit(nearest), 'day')}` },
  ]
}
