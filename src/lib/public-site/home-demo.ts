/**
 * The home page's Ask Etyme demo, as plain data: Corvane Packaging, the
 * sample company the whole home page reads since the founder's "make the
 * numbers realistic" (2026-11-13; "we are talking about companies spending
 * 40-50 million a year"). A buyer at that scale meets a figure at that
 * scale first: what Corvane pays across every supplier this month, the
 * contractors under it, the person nearest the time limit, and the card
 * that sends the open Dayton job to suppliers.
 *
 * Nothing here is typed in. Names, sites, suppliers, rates, months, the
 * limit and the open job are `corvaneDemoFacts()` (`lib/seed-corvane/plan`,
 * the plan the seed writes). The month's spend is the product's own
 * arithmetic: every contractor on site at their bill rate for 160 hours
 * (`programMonthlySpend`), in dollars at the shipped sample exchange rates
 * (`spendInReporting`), through `spendInDollars` in `./corvane-map`, the
 * same figure the CFO view's tile shows. `home-demo.test.ts` works every
 * figure out again from the seed by a route of its own.
 *
 * Northbend Athletic is unchanged everywhere else: the product pages, the
 * doors, the documentation and /demo still play `STORY` (`./story`).
 *
 * Server only, because the dollar figure goes through the money module's
 * sample rates, which sit beside the database client. The page reads this
 * and hands the plain data to the client component that draws it.
 */

import { corvaneDemoFacts, corvaneContractors, type DemoContractor } from '@/lib/seed-corvane/plan'
import { format, fromMinor } from '@/lib/money'
import { ASK_ETYME } from './story'
import { spendInDollars } from './corvane-map'
import {
  DEMO_NOT_NOW, DEMO_HEAD, DEMO_WATCH, DEMO_READY, DEMO_YES, DEMO_ASKED, DEMO_INTRO, DEMO_LABEL, DEMO_QUESTION,
} from './home-words'

export interface HomeDemo {
  /** The sample company's name, beside the "Demo — not a customer" tag. */
  company: string
  question: string
  /** The answer, split after its figure: "$3,615,443.20 a month:" is drawn in bold. */
  answer: string
  answerLead: string
  answerRest: string
  head: readonly string[]
  rows: string[][]
  /** Where each row's contractor works, drawn under the name. */
  sites: string[]
  /** The rows whose contractor carries the "Watch limit" tag: the one nearest the limit. */
  watchRows: number[]
  /** The nearest contractor's whole months and the limit ("17 / 18"), for the hero's glance. */
  watch: { months: number; limit: number } | null
  card: { job: string; detail: string; yes: string }
}

const money = (minor: number, currency: string) => format(fromMinor(minor, currency), { compact: true })
const spelled = (n: number) => (['no', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n))
const months = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`

/** "$110–130/hr": the band's two ends in one currency, the symbol said once. */
function bandText(b: { minMinor: number; maxMinor: number; currency: string }): string {
  const max = money(b.maxMinor, b.currency)
  return `${money(b.minMinor, b.currency)}–${max.replace(/^[^\d]+/, '')}/hr`
}

export function homeDemo(): HomeDemo {
  const f = corvaneDemoFacts()
  const near = f.nearest
  const spend = spendInDollars(corvaneContractors().onSite)
  const isNearest = (c: DemoContractor) => c.name === near.name && c.site === near.site
  const answerLead = spend === null ? '' : `${money(spend, 'USD')} a month:`
  const first = near.name.split(' ')[0]
  const answerRest = [
    `${f.contractors} contractors through ${f.suppliers} suppliers in ${f.countries} countries, at current rates.`,
    ...(spend === null ? [] : ['Dollars use sample exchange rates.']),
    `${near.name} in ${near.city} has ${months(near.months)} here across ${spelled(near.periods.length)} ${near.periods.length === 1 ? 'supplier' : 'suppliers'}.`,
    `The limit is ${f.limitMonths}; ${first} reaches it in ${near.daysToLimit} ${near.daysToLimit === 1 ? 'day' : 'days'}.`,
  ].join(' ')
  const job = f.openJob
  return {
    company: f.company,
    question: DEMO_QUESTION,
    answer: answerLead ? `${answerLead} ${answerRest}` : answerRest,
    answerLead,
    answerRest,
    head: DEMO_HEAD,
    rows: f.onSite.map((c) => [
      c.name,
      c.supplier,
      money(c.rateMinor, c.currency),
      isNearest(c)
        ? `${c.months} of ${months(f.limitMonths)} · ${near.periods.length} ${near.periods.length === 1 ? 'supplier' : 'suppliers'}`
        : months(c.months),
    ]),
    sites: f.onSite.map((c) => c.site),
    watchRows: f.onSite.flatMap((c, i) => (isNearest(c) ? [i] : [])),
    watch: { months: near.months, limit: f.limitMonths },
    card: {
      job: job.title,
      detail: [months(job.months), job.site, ...(job.band ? [bandText(job.band)] : []), DEMO_READY].join(' · '),
      yes: DEMO_YES,
    },
  }
}

/** Every word the demo shows before a press, for the guards that read the page. */
export function homeDemoCopy(d: HomeDemo = homeDemo()): string[] {
  return [
    ASK_ETYME, DEMO_INTRO, DEMO_LABEL, d.company, DEMO_ASKED, d.question, d.answer, ...d.head,
    ...d.rows.flatMap((r, i) => [r[0], d.sites[i], ...r.slice(1)]), ...d.watchRows.map(() => DEMO_WATCH),
    d.card.job, d.card.detail, d.card.yes, DEMO_NOT_NOW,
  ]
}
