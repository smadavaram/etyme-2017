/**
 * The four product pages, one per step, as data.
 *
 * ── Four steps, one story. Decided by the founder, 2026-10-15 ────────
 *
 * On the open menu sheet: "Menu pages almost seem useless and out of
 * context and do not tell their story cleanly — be an American sales guy
 * like Steve Jobs to attract people." He said "build it" on the drawing
 * that answered it (https://claude.ai/artifact/Vxb9LoJoEKhramwsnfq9Dc),
 * and its words are used here exactly. Every step page tells the story
 * the same way:
 *
 *   1. "Step n of 4 · Name", then one promise as the headline and one
 *      line under it
 *   2. "Today" beside "With Etyme": what goes wrong now, and what the
 *      record does instead
 *   3. the panel that shows the product working, opened at this step
 *      (`./story-panel`), with the line under it naming the person in
 *      front of the step (founder, 2026-10-19): Marcus Oyelaran for Job
 *      and Candidates, Helena Marsh for Timesheets, Renata Kowal for
 *      Invoices
 *   4. three lines: what you do, who is involved, what happens next
 *   5. Previous and Next, so the four pages read as one story: Job's
 *      Previous is the documentation's "How Etyme works", Invoices' Next
 *      is Sign up
 *   6. the sign-up band, the security line and the footer, as everywhere
 *
 * Eight pages became four. Governance folded into Job; contracts and
 * compliance into Candidates; the chain into Invoices. Their addresses
 * redirect (`./folded`). What those pages said is still said where a
 * reader who asks will find it: the documentation's step pages carry the
 * rules, the blocks and what runs on its own; the security position and
 * About carry the rest.
 *
 * No adjectives and no claim the panel or the demo cannot show. Plain
 * words: a job and a job request; what a supplier sends is its invoice,
 * received as an invoice receipt, and "invoice" stays in a sentence about
 * the supplier's own document; the US work form (I-9). No company named,
 * no AI.
 */

import { ACTIONS, ALL_ACTIONS } from '@/lib/autonomy'
import type { EmbedStep } from '@/lib/sample-seat'
import type { DemoTarget } from './flow'
import { STEPS } from './steps'
import { copyOfSkeleton, OPEN_DEMO, CLIENT_SIGN_UP, watching } from './skeleton-words'

/** A link to the page before or after a step, as drawn. */
export interface StepLink {
  t: string
  href: string
}

export interface ModulePage {
  slug: 'requisitions' | 'submissions' | 'timesheets' | 'invoices'
  route: `/${string}`
  /** 1 to 4: the step this page is (`./steps`). */
  n: 1 | 2 | 3 | 4
  /** The step's name: Job, Candidates, Timesheets, Invoices. Also the tab's title. */
  title: string
  /** "Step n of 4 · Name", above the headline. */
  eyebrow: string
  /** The headline: one promise. */
  headline: string
  /** The one line under it. */
  lede: string
  /** What goes wrong without the record, in a few short sentences. */
  today: string
  /** What the record does instead. */
  withEtyme: string
  /** The panel's starting step. */
  step: EmbedStep
  /** The line under the panel: the person in front of this page's step, at the demo company. */
  label: string
  /** What you do, who is involved, what happens next. */
  lines: [string, string, string]
  /** The page before this one, and the page after it. */
  prev: StepLink
  next: StepLink
  /** Where the button under the panel seats the reader: this step's own screen, at the right role. */
  demo: DemoTarget
}

/** The two labels over the pair, as drawn. */
export const PAIR_LABELS = { today: 'Today', withEtyme: 'With Etyme' } as const

/** The labels of the three lines, as drawn. */
export const LINE_LABELS = ['What you do', 'Who is involved', 'What happens next'] as const

/** Job's Previous: the documentation's home, whose title is "How Etyme works". */
export const BEFORE_THE_STEPS: StepLink = { t: 'How Etyme works', href: '/docs' }

/** Invoices' Next: the client's sign-up. */
export const AFTER_THE_STEPS: StepLink = { t: CLIENT_SIGN_UP.t, href: CLIENT_SIGN_UP.href }

// ── How much runs on its own, counted rather than typed ──────────────
//
// The documentation (when the work ends) says how many things happen without anybody asking
// and how many of those are a plain rule. Both numbers are computed from
// the automation ladder (`lib/autonomy`), so the sentence cannot go stale,
// and the test reads it against the ladder with its own table of words.

const UNPROMPTED = ALL_ACTIONS.map((name) => ACTIONS[name]).filter((a) => a.kind === 'UNPROMPTED')
const BY_RULE = UNPROMPTED.filter((a) => a.basis === 'RULE')

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** A count as a reader says it, "twenty-four", up to ninety-nine; digits beyond. */
export function spelled(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')
  return String(n)
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * What each unprompted act that is not a plain rule does, in one short
 * sentence, keyed by its name on the ladder. Named in the documentation's
 * page on the end of the work and time on site (`./docs/process`, when-work-ends),
 * since 2026-10-14. A new
 * act added to the ladder reaches the page in the ladder's own sentence
 * until somebody writes the short clause here, and a test checks every one
 * is described.
 */
export const WHAT_IS_LEFT: Record<string, string> = {
  PROACTIVE_MATCH:
    'Matching scores a person against a job, and falls back to arithmetic when there is no model to call.',
  TWIN_TOLD: 'The twin tells a person what a rule found.',
  TWIN_DREW_UP: 'The twin drafts a summary that a person reads.',
}

const NOT_A_RULE = ALL_ACTIONS.filter((name) => {
  const a = ACTIONS[name]
  return a.kind === 'UNPROMPTED' && a.basis !== 'RULE'
})

const clauseFor = (name: string): string => {
  if (WHAT_IS_LEFT[name]) return WHAT_IS_LEFT[name]
  const a = ACTIONS[name]
  return a.kind === 'UNPROMPTED' ? a.says : name
}

/**
 * The lines that name what runs on its own and is not a plain rule, one
 * idea a line, computed from the ladder: the count first, then each act.
 */
export function notARuleLines(): string[] {
  const left = NOT_A_RULE.map(clauseFor)
  return [
    RULE_COUNT_LINE,
    left.length === 0
      ? 'None is left: every one of them is a plain rule.'
      : `${capital(spelled(left.length))} ${left.length === 1 ? 'is' : 'are'} not a plain rule. Each does one thing:`,
    ...left,
    'None of them decides whether someone can legally work.',
  ]
}

/** The counted line, said on the documentation's page on the end of the work: how many things run unasked, and how many are a plain rule. */
export const RULE_COUNT_LINE =
  `${capital(spelled(BY_RULE.length))} of the ${spelled(UNPROMPTED.length)} things that run without anybody asking are a date, a threshold or a count.`


type AsWritten = Omit<ModulePage, 'n' | 'route' | 'title' | 'eyebrow' | 'prev' | 'next' | 'demo'>

/** The words of each step page, exactly as the founder approved them on 2026-10-15. */
const AS_WRITTEN: AsWritten[] = [
  {
    slug: 'requisitions',
    headline: 'Send the job once.',
    lede: 'Every approved supplier gets it at the same moment. Each sees only its own rate.',
    today: 'A hiring manager emails four suppliers. One never sees it. Nobody can say who quoted what.',
    withEtyme: 'One job request, sent to the suppliers Procurement approved. Within budget, it goes out with no approval.',
    step: 'source',
    label: watching('Marcus Oyelaran, hiring manager', 'at Northbend Athletic'),
    lines: [
      'Write the job, the months and the rate.',
      'The hiring manager, Procurement, and the budget owner when it is over plan.',
      'Suppliers send candidates.',
    ],
  },
  {
    slug: 'submissions',
    headline: 'Everyone who applied. One screen.',
    lede: 'Every supplier’s candidates for a job, side by side, with their rate and their papers.',
    today: 'Resumes land in five inboxes. The same person comes from two suppliers. On day one, the I-9 is missing.',
    withEtyme: 'One list per job. The first supplier to send a person wins. Nobody starts without a US work form (I-9).',
    step: 'submit',
    label: watching('Marcus Oyelaran, hiring manager', 'at Northbend Athletic'),
    lines: [
      'Compare, interview, choose one.',
      'The hiring manager, and HR for the papers.',
      'The order and the contract are written for you.',
    ],
  },
  {
    slug: 'timesheets',
    headline: 'Approve the week in one tap.',
    lede: 'Weeks that match the contract are ready to approve. The rest wait, with the reason.',
    today: 'Timesheets come by email and spreadsheet. A 44-hour week on a 40-hour contract gets paid anyway.',
    withEtyme: 'The contractor files the week. You see it flagged before you approve. Nobody approves their own hours.',
    step: 'approve',
    label: watching('Helena Marsh, a contractor', 'at Northbend Athletic'),
    lines: [
      'Approve the week, or send it back with a reason.',
      'The contractor and the hiring manager.',
      'Each supplier bills from the week you approved.',
    ],
  },
  {
    slug: 'invoices',
    headline: 'Pay only what you approved.',
    lede: 'Each supplier’s invoice is checked against the approved hours and the contract rate.',
    today: 'AP matches invoices to timesheets by hand. Extra hours and old rates slip through.',
    withEtyme: 'The hours, the invoice and the contract rate must agree. If they do, pay. If not, it says why.',
    step: 'pay',
    label: watching('Renata Kowal, AP clerk', 'at Northbend Athletic'),
    lines: [
      'Pay what matched, in one step.',
      'The AP clerk.',
      'Every contractor, every supplier and every dollar, in one place.',
    ],
  },
]

/**
 * The four pages in the order of the four steps. The route, the name,
 * the demo seat and Previous and Next are read off the spine (`./steps`),
 * so the menu, the pages and the documentation cannot disagree about the
 * order.
 */
export const MODULES: ModulePage[] = STEPS.map((s, i) => {
  const m = AS_WRITTEN.find((x) => `/${x.slug}` === s.route)
  if (!m) throw new Error(`The spine names ${s.route}, and no step page is written for it`)
  const before = STEPS[i - 1]
  const after = STEPS[i + 1]
  return {
    ...m,
    n: s.n,
    route: s.route,
    title: s.name,
    eyebrow: `Step ${s.n} of 4 · ${s.name}`,
    prev: before ? { t: before.name, href: before.route } : BEFORE_THE_STEPS,
    next: after ? { t: after.name, href: after.route } : AFTER_THE_STEPS,
    demo: s.demo,
  }
})

/** The module at a route, or null. */
export function moduleAt(route: string): ModulePage | null {
  return MODULES.find((m) => m.route === route) ?? null
}

/**
 * Every word a reader sees between the header and the footer, split at
 * the fold: the eyebrow, the headline and its line, and the pair, then
 * the three lines with their labels, Previous and Next, and what the
 * shared skeleton draws around them (`./skeleton-words`).
 *
 * The pair is above the fold: it sits straight under the line, before
 * the panel, and is on the first screen at 390 pixels wide as at 1280.
 * So the category guard (`lib/positioning`, category first) reads it
 * there. That matters on Timesheets, whose promise and line say
 * "the week" and whose pair says who files it: the contractor.
 */
export function copyOfModule(m: ModulePage): { hero: string[]; body: string[] } {
  return {
    hero: [m.eyebrow, m.headline, m.lede, PAIR_LABELS.today, m.today, PAIR_LABELS.withEtyme, m.withEtyme],
    body: [
      ...LINE_LABELS.flatMap((label, i) => [label, m.lines[i]]),
      m.prev.t, m.next.t,
      ...copyOfSkeleton({ step: m.step, button: OPEN_DEMO, label: m.label }),
    ],
  }
}
