/**
 * The home page's Ask Etyme demo, as plain data: Northbend Athletic's
 * hiring manager asking what she pays across every supplier this month,
 * the answer, the three contractors under it, and the card that sends the
 * HCM integration lead job to the three approved suppliers.
 *
 * Nothing here is typed in. It is the first step of the Northbend story
 * (`STORY[0]` in `./story`), which `story-panel.test.ts` reads against
 * the seed name by name and figure by figure: the $135,200 for the seven
 * contractors at current rates, the four suppliers, each contractor's
 * supplier, rate and whole months here, the job's band, months and the
 * three suppliers it is released to. So the home page cannot say a figure
 * the demo does not hold.
 *
 * Plain data, so the client component that draws it imports no seed.
 */

import { STORY, ASK_ETYME, cellText, type Cell } from './story'
import { DEMO_NOT_NOW } from './home-words'

export interface HomeDemo {
  question: string
  answer: string
  head: string[]
  rows: string[][]
  /** The cell drawn in the attention color: Lucía's months against the limit. */
  attention: [row: number, col: number][]
  card: { ask: string; job: string; detail: string; yes: string }
}

const text = (c: Cell) => cellText(c)
const isAttention = (c: Cell) => typeof c === 'object' && 'pill' in c && c.pill === 'att'

export function homeDemo(): HomeDemo {
  const step = STORY[0]
  const question = step.chat.find((m) => m.who === 'me')!
  const [answer, offer] = step.chat.filter((m) => m.who === 'etyme')
  const attention: [number, number][] = []
  step.table.rows.forEach((r, i) => r.forEach((c, j) => { if (isAttention(c)) attention.push([i, j]) }))
  return {
    question: question.text,
    answer: answer.text,
    head: step.table.head.map((h) => h.t),
    rows: step.table.rows.map((r) => r.map(text)),
    attention,
    card: { ask: offer.text, job: offer.card!.t, detail: offer.card!.s, yes: offer.card!.yes },
  }
}

/** Every word the demo shows, for the guards that read the page. */
export function homeDemoCopy(d: HomeDemo = homeDemo()): string[] {
  return [ASK_ETYME, d.question, d.answer, ...d.head, ...d.rows.flat(), d.card.ask, d.card.job, d.card.detail, d.card.yes, DEMO_NOT_NOW]
}
