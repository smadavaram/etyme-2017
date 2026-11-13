/**
 * The home page's Ask Etyme demo, as plain data: Northbend Athletic's
 * hiring manager asking what she pays across every supplier this month,
 * the answer, the three contractors under it, and the card that sends the
 * HCM integration lead job to suppliers.
 *
 * Nothing here is typed in. It is the first step of the Northbend story
 * (`STORY[0]` in `./story`), which `story-panel.test.ts` reads against
 * the seed name by name and figure by figure: the $135,200 for the seven
 * contractors at current rates, the four suppliers, each contractor's
 * supplier, rate and whole months here, the job's band and months. So the
 * home page cannot say a figure the demo does not hold.
 *
 * Since the founder's reference page (2026-11-13) the same facts are drawn
 * the way the reference draws them: the answer's figure in bold, the
 * months cell "6 months" under "Time here", a "Watch limit" tag beside the
 * contractor whose months are counted against the limit, and the card as
 * the job's title over one line of its months, place, band and "Ready to
 * send to suppliers". Only the shape changes here; every figure is still
 * the story's, and `watch` carries Lucía Fernández's months and the limit
 * to the hero's glance.
 *
 * Plain data, so the client component that draws it imports no seed.
 */

import { STORY, ASK_ETYME, cellText, type Cell } from './story'
import {
  DEMO_NOT_NOW, DEMO_HEAD, DEMO_WATCH, DEMO_READY, DEMO_YES, DEMO_ASKED, DEMO_INTRO, DEMO_LABEL, DEMO_COMPANY,
} from './home-words'

export interface HomeDemo {
  question: string
  /** The answer, split after its figure: "$135,200 a month:" is drawn in bold. */
  answer: string
  answerLead: string
  answerRest: string
  head: readonly string[]
  rows: string[][]
  /** The rows whose contractor carries the "Watch limit" tag: the story's attention cell. */
  watchRows: number[]
  /** The months and the limit in the attention cell ("14 of 18"), for the hero's glance; null where the story holds none. */
  watch: { months: number; limit: number } | null
  card: { job: string; detail: string; yes: string }
}

const isAttention = (c: Cell) => typeof c === 'object' && 'pill' in c && c.pill === 'att'

/** The months cell, said with its unit: "6" is "6 months", "1" is "1 month", "14 of 18 · 2 suppliers" is "14 of 18 months · 2 suppliers". */
export function withMonths(cell: string): string {
  return cell.replace(/^(\d+)( of \d+)?/, (_, n: string, of?: string) => `${n}${of ?? ''} ${!of && n === '1' ? 'month' : 'months'}`)
}

export function homeDemo(): HomeDemo {
  const step = STORY[0]
  const question = step.chat.find((m) => m.who === 'me')!
  const [answer, offer] = step.chat.filter((m) => m.who === 'etyme')
  const cut = answer.text.indexOf(':') + 1
  const last = step.table.head.length - 1
  const watchRows: number[] = []
  let watch: HomeDemo['watch'] = null
  step.table.rows.forEach((r, i) => r.forEach((c) => {
    if (!isAttention(c)) return
    watchRows.push(i)
    const m = cellText(c).match(/(\d+) of (\d+)/)
    if (m && !watch) watch = { months: Number(m[1]), limit: Number(m[2]) }
  }))
  // The card's title is "job · months · place"; its second line ends in the band, "$a–b an hour".
  const [job, ...where] = offer.card!.t.split(' · ')
  const band = offer.card!.s.split(' · ').pop()!.replace(/ an hour$/, '/hr')
  return {
    question: question.text,
    answer: answer.text,
    answerLead: answer.text.slice(0, cut),
    answerRest: answer.text.slice(cut).trim(),
    head: DEMO_HEAD,
    rows: step.table.rows.map((r) => r.map((c, j) => (j === last ? withMonths(cellText(c)) : cellText(c)))),
    watchRows,
    watch,
    card: { job, detail: [...where, band, DEMO_READY].join(' · '), yes: DEMO_YES },
  }
}

/** Every word the demo shows before a press, for the guards that read the page. */
export function homeDemoCopy(d: HomeDemo = homeDemo()): string[] {
  return [
    ASK_ETYME, DEMO_INTRO, DEMO_LABEL, DEMO_COMPANY, DEMO_ASKED, d.question, d.answer, ...d.head,
    ...d.rows.flat(), ...d.watchRows.map(() => DEMO_WATCH), d.card.job, d.card.detail, d.card.yes, DEMO_NOT_NOW,
  ]
}
