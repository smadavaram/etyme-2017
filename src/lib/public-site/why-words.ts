/**
 * Below the Northbend panel on the home page: two drawings and four lines.
 * The founder's "Build it", 2026-10-27, on the home-page drawing as a
 * whole (CLAUDE.md, "Below the fold, every public page says why in two
 * drawings and four lines"), after he read the page as a client's
 * indirect procurement manager: what stops a buyer is no price, nothing
 * for a vendor-risk review, nobody to talk to. So: what is in it, the
 * price, the security position, and a person.
 *
 * ── Every name and figure is the seed's ──────────────────────────────
 *
 * Read from `lib/seed-programmes` (Northbend Athletic) and the twin's
 * receipts (`lib/twin/seed-demo`), the same rows the panel above plays,
 * and checked again by `__tests__/invariants/story-panel-map.test.ts`.
 *
 *   drawing                              seed, and so the page
 *   "Priya Raman starts Monday",         Ingrid Sørensen, awarded at Northbend
 *   refused for the I-9                  and starting next week with no I-9 on
 *                                        file: the start Northbend's seed holds.
 *                                        Priya Raman has no such start.
 *   "Renata Kowal … order $98, week      the same: PR-2026-0441, 40 hours
 *   40 h, invoice 40 h, Pay $3,920;      accepted at Pinnacle's $98; PR-2026-0442
 *   41.5 h billed → held"                bills 41.5 against 40 and is held
 *
 * No customer, no number of days, no certification held, no vendor's
 * name: "No SOC 2 yet; it is next" says one that is not.
 *
 * Server only: the seed reaches the database client.
 */

import { PROGRAMMES } from '@/lib/seed-programmes'
import { NORTHBEND_TWIN_RECEIPTS } from '@/lib/twin/seed-demo'
import { format, fromMinor } from '@/lib/money'

import { TALK } from './talk'

export interface WhyDrawing {
  key: 'papers' | 'check'
  /** The person and what is in front of them, over the tile. */
  who: [string, string]
  /** The three papers on the tile. */
  cards: [string, string, string]
  /** Where the arrows lead: the good outcome (if any), and what stops. */
  ok: string | null
  stop: [string, string]
  claim: string
  sub: string
}

const money = (minor: number) => format(fromMinor(minor, 'USD'), { compact: true })
const hours = (h: number) => `${h} h`

/** When a start falls, said in weeks, never as a count of days. */
function startsIn(daysAhead: number): string {
  if (daysAhead <= 0) return 'starts today'
  if (daysAhead < 7) return 'starts this week'
  if (daysAhead < 14) return 'starts next week'
  return 'starts soon'
}

export function whyDrawings(): WhyDrawing[] {
  const nike = PROGRAMMES.find((p) => p.client === 'nike')!
  const noI9 = nike.placements.find((p) => p.papers === 'NO_I9' && p.state === 'DRAFT')!
  const [clean, held] = NORTHBEND_TWIN_RECEIPTS.filter((r) => r.number)
  const line = nike.placements.find((p) => p.person === clean.person && p.via[1] === clean.supplier && p.state === 'IN_PROGRESS')!
  const rate = line.rates[0]
  return [
    {
      key: 'papers',
      who: [`${noI9.person} ${startsIn(-noI9.startedDaysAgo)}`, 'Compliance checks the set'],
      cards: ['I-9', 'insurance', 'agreement'],
      ok: null,
      stop: ['No I-9 → start refused', 'Get it on file, then start.'],
      claim: 'Nobody starts without papers.',
      sub: 'The set is asked for, sent, and checked before day one. A lapsed insurance certificate blocks the supplier the same way.',
    },
    {
      key: 'check',
      who: [`${nike.people.ap}, AP clerk`, 'pays what the three agree on'],
      cards: [`order ${money(rate)}`, `week ${hours(clean.hoursAccepted)}`, `invoice ${hours(clean.hoursBilled)}`],
      ok: `Pay ${money(clean.hoursAccepted * rate)}`,
      stop: [`${hours(held.hoursBilled)} billed → held`, `the ${hours(held.hoursBilled - held.hoursAccepted)} wait for a signature`],
      claim: 'Nothing is paid on hours nobody signed.',
      sub: 'The order, the signed week and the invoice must agree. When they do not, the invoice is held and the supplier is told why.',
    },
  ]
}

/** The four lines, word for word from the drawing. `link` is the words that open `href`. */
export const FOUR_LINES: readonly { lead: string; text: string; link?: { words: string; href: string } }[] = [
  {
    lead: 'In it:',
    text: 'Jobs · Candidates · Timesheets · Invoices · Papers · Suppliers. Your suppliers and contractors join at no cost, and nobody at a supplier needs training. Signs in with your work account. Exports to your accounting system.',
  },
  { lead: 'Price:', text: 'free while we test. Founding firms keep their terms.' },
  {
    lead: 'Security:',
    text: 'what is done and what is not, on one page. No SOC 2 yet; it is next.',
    link: { words: 'on one page', href: '/security' },
  },
  {
    lead: `${TALK.t}:`,
    text: `${TALK.address}. One sentence is enough.`,
    link: { words: TALK.address, href: TALK.href },
  },
]

/** Every word the section shows, for the guards that count and read a page. */
export function copyOfWhy(): string[] {
  return [
    ...whyDrawings().flatMap((d) => [...d.who, ...d.cards, d.ok ?? '', ...d.stop, d.claim, d.sub]),
    ...FOUR_LINES.map((l) => `${l.lead} ${l.text}`),
  ].filter(Boolean)
}
