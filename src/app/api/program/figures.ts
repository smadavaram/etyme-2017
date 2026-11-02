import { chainTop } from '@/lib/chain-top'
import { programMonthlySpend, spendLine } from '@/lib/program-spend'
import { spendInReporting, type RateTable } from '@/lib/money/reporting-currency'
import { spendOf, type SpendLine } from './regions/rollup'

/**
 * The program page's headline figures, worked out in one place: who is on
 * site, through how many suppliers, and what a month costs.
 *
 * ── Why one file ─────────────────────────────────────────────────────
 *
 * Two readers ask for these figures. The program page (`programView`)
 * draws them over everything else it reads; Ask Etyme's greeting says
 * them in one line ("Seven contractors are on site today, through four
 * suppliers") and needs nothing else. The greeting read the whole page to
 * get them: 77 queries for Northbend's owner, start paperwork worked out
 * for every start the decisions list had just worked it out for, and the
 * greeting over two seconds (conversation's measurement, 2026-11-01). So
 * the figures are pure functions here, and the page and the summary
 * reader (`./summary`) both call them on the same rows: the two cannot
 * disagree, because there is one arithmetic.
 *
 * Pure: no database, no React. Rates for a program billed in several
 * currencies are read by the caller and handed in.
 */

/** A rung as the figures read it: who is placed, by whom, to whom, live or not, and at what rate. */
export interface FigureRung {
  id: string
  personId: string
  companyId: string
  clientCompanyId: string
  state: string
  billRate: number | null
  billCurrency: string
}

/** One row per person: the contract this client pays (`chainTop`), and those of them working today. */
export function topRungs<T extends FigureRung>(everyRung: T[]): { contracts: T[]; onSite: T[] } {
  const contracts = chainTop(everyRung)
  const onSite = contracts.filter((c) => c.state === 'IN_PROGRESS')
  return { contracts, onSite }
}

/** People, not rows: one person is one contractor however many lines they hold. */
export function headcount(contracts: readonly FigureRung[], onSite: readonly FigureRung[]) {
  const onSitePeople = new Set(onSite.map((c) => c.personId))
  const listedPeople = new Set(contracts.map((c) => c.personId))
  return {
    activeContractors: onSitePeople.size,
    contractors: listedPeople.size,
    notStarted: listedPeople.size - onSitePeople.size,
  }
}

/** The suppliers with somebody on site: one per firm, however many people it supplies. */
export function suppliersOnSite(onSite: readonly FigureRung[]): string[] {
  return [...new Set(onSite.map((c) => c.companyId))]
}

/** The month's spend per currency. A stored zero is not a rate. */
export function spendByCurrency(onSite: readonly FigureRung[]) {
  return spendOf(onSite.map((c) => ({ rateMinor: (c.billRate ?? 0) > 0 ? c.billRate : null, currency: c.billCurrency })))
}

/** Whether the month's spend needs the company's reporting rates: it is billed in more than one currency. */
export function needsReportingRates(onSite: readonly FigureRung[]): boolean {
  return spendByCurrency(onSite).spend.length > 1
}

export interface SpendFigures {
  monthlySpend: number | null
  monthlySpendCurrency: string | null
  monthlySpendByCurrency: SpendLine[]
  monthlySpendSays: string
}

/**
 * What the client pays a month, in minor units, at 160 hours: the top
 * rung of every chain with somebody on site. Somebody with no rate is a
 * head and not a price, and is counted apart rather than as a zero. In
 * several currencies the one figure goes through the company's rates
 * (`rates`, read by the caller where `needsReportingRates`), and a
 * currency with no rate leaves it null rather than guessed.
 */
export function spendFigures(onSite: readonly FigureRung[], rates: RateTable | null, now: Date): SpendFigures {
  const spend = programMonthlySpend(onSite.map((c) => ({ rateMinorPerHour: c.billRate ?? null })))
  const byCurrency = spendByCurrency(onSite)
  const oneCurrency = byCurrency.spend.length <= 1
  const inOne = !oneCurrency && rates ? spendInReporting(byCurrency.spend, rates.reportingCurrency, rates, now) : null
  return {
    monthlySpend: oneCurrency ? spend.totalMinor : inOne?.total?.minor ?? null,
    monthlySpendCurrency: oneCurrency
      ? (byCurrency.spend[0]?.currency ?? onSite[0]?.billCurrency ?? 'USD')
      : inOne?.total ? inOne.reportingCurrency : null,
    monthlySpendByCurrency: byCurrency.spend,
    monthlySpendSays: inOne ? `${spendLine(spend)}. ${inOne.says}` : spendLine(spend),
  }
}
