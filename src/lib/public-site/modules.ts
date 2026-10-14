/**
 * The eight product pages, as data.
 *
 * ── One skeleton, decided by the founder 2026-10-14 ──────────────────
 *
 * "Make sure even the sub pages and doors follow the same structure."
 * Each product page is now the home page's shape, and nothing else:
 *
 *   1. one question as the headline, in the reader's words, and one line
 *      under it saying what the page is for
 *   2. the live product in the same read-only frame, opened at this
 *      page's step, with the four chips so a reader can walk on
 *   3. at most three short lines: what you do here, who is involved,
 *      what happens next
 *   4. the sign-up band, the same as the home page
 *   5. one security line, and the footer
 *
 * About a hundred and fifty words at most, checked by a test. What the
 * pages carried until that day — key capabilities, the complaint, what it
 * refuses, the flow chart, who is involved as cards, the screenshot —
 * is cut. The cut test is the home page's: which reader asked for it,
 * and can they check it by clicking something on this page. The frame
 * answers most of it by showing the screen; the documentation carries
 * the rest, in order, with its flow charts.
 *
 * The frame has five screens (`/embed/demo`): the overview and the four
 * steps. A page opens at the step it belongs to — Source for job requests
 * and governance; Submit for submissions, contracts and compliance;
 * Approve for timesheets; Pay for bills and the chain. Contracts and
 * compliance have no screen of their own in the frame, so they open at
 * Submit, the closest one; the button under the frame seats the reader at
 * the page's own screen in the full demo.
 *
 * Plain words, the founder's: a job and a job request, a bill for what a
 * firm issues upward, an invoice receipt for what it receives from below,
 * the time limit. No company named, no AI, nothing a reader cannot check
 * by clicking the frame or the button under it.
 */

import { ACTIONS, ALL_ACTIONS } from '@/lib/autonomy'
import type { EmbedStep } from '@/lib/sample-seat'
import type { DemoTarget } from './flow'
import { SPINE_ORDER } from './steps'
import { copyOfSkeleton, OPEN_DEMO } from './skeleton-words'

export interface ModulePage {
  slug: string
  route: `/${string}`
  /** 1 to 8: the page's place on the spine of four steps (`./steps`). */
  n: number
  /** The page's name: the Platform menu's word for it, and the tab's title. */
  title: string
  /** The headline: one question, in the reader's words. */
  question: string
  /** The one line under it: what this page is for. Names contractors or suppliers. */
  purpose: string
  /** The frame's starting screen. */
  step: EmbedStep
  /** What you do here, who is involved, what happens next. */
  lines: [string, string, string]
  /** Where the button under the frame seats the reader: this page's own screen, at the right desk. */
  demo: DemoTarget
  /** A link at the end of the last line, to the top of the page that says the rest. */
  link?: { t: string; href: string }
}

// ── How much runs on its own, counted rather than typed ──────────────
//
// The governance page says how many things happen without anybody asking
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
 * page on time on site and the logs (`./docs/process`, govern-and-protect),
 * one click from the governance page's last line, since 2026-10-14. A new
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

/** The governance page's counted line: how many things run unasked, and how many are a plain rule. */
export const RULE_COUNT_LINE =
  `${capital(spelled(BY_RULE.length))} of the ${spelled(UNPROMPTED.length)} things that run without anybody asking are a date, a threshold or a count.`

const AS_WRITTEN: Omit<ModulePage, 'n'>[] = [
  {
    slug: 'requisitions',
    route: '/requisitions',
    title: 'Job requests & suppliers',
    question: 'Which suppliers see this job, and at what rate?',
    purpose: 'Post a job once, to the suppliers Procurement cleared.',
    step: 'source',
    lines: [
      'The hiring manager raises a job request. Within plan, it goes out by rule.',
      'HR, Procurement and the cost-center lead clear a miss. Nobody signs their own.',
      'Each cleared supplier sees the job and its own rate band, never another’s.',
    ],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/requisitions', seat: 'the hiring manager' },
  },
  {
    slug: 'governance',
    route: '/governance',
    title: 'Governance',
    question: 'Who may approve what, and what stops a contractor?',
    purpose: 'Rules for every job request, start and bill.',
    step: 'source',
    lines: [
      'A rule blocks where the law is behind it, and warns with a reason elsewhere.',
      RULE_COUNT_LINE,
      'Each block is logged.',
    ],
    link: { t: 'What is not a rule', href: '/docs/process/govern-and-protect' },
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/compliance', seat: 'the program manager' },
  },
  {
    slug: 'contracts',
    route: '/contracts',
    title: 'Contracts & onboarding',
    question: 'Is this contractor cleared to start on Monday?',
    purpose: 'From the award to day one, with the papers checked.',
    step: 'submit',
    lines: [
      'Award a person. The order and the contract are written from the award.',
      'Procurement raises the order. Compliance checks the papers. A supplier cannot award its own.',
      'Nobody starts without a US work form (I-9) on file.',
    ],
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/contracts', seat: 'the program manager' },
  },
  {
    slug: 'submissions',
    route: '/submissions',
    title: 'Submissions & screening',
    question: 'Who did each supplier send for this job?',
    purpose: 'Every supplier’s people for one job, side by side.',
    step: 'submit',
    lines: [
      'Compare the people each supplier sent, with the rate each one asked.',
      'A supplier submits only a person who agreed. The hiring manager interviews and chooses.',
      'The first supplier to submit a person keeps them. Choosing one writes the contract.',
    ],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/submissions', seat: 'the hiring manager' },
  },
  {
    slug: 'compliance',
    route: '/compliance',
    title: 'Compliance & tenure',
    question: 'Which contractors are close to the time limit?',
    purpose: 'Papers and time on site, per person, across every supplier.',
    step: 'submit',
    lines: [
      'See each person’s months on site, added up across every supplier.',
      'Compliance checks papers before a start, and time on site before an offer.',
      'Past the time limit, your own rule blocks or warns. A lapsed insurance certificate stops work.',
    ],
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/tenure', seat: 'the program manager' },
  },
  {
    slug: 'timesheets',
    route: '/timesheets',
    title: 'Timesheets & expenses',
    question: 'Which contractor weeks are waiting for your signature?',
    purpose: 'The worker files the week, and your manager signs it.',
    step: 'approve',
    lines: [
      'Sign each week from the list. A week over the contract’s hours is flagged first.',
      'Only the worker files their week. Nobody approves their own hours.',
      'Each supplier bills from the signed week. Nobody types the hours again.',
    ],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/timesheets', seat: 'the hiring manager' },
  },
  {
    slug: 'invoices',
    route: '/invoices',
    title: 'Bills & the three-way check',
    question: 'Does each supplier’s invoice match the hours you signed?',
    purpose: 'Pay each supplier only what matched.',
    step: 'pay',
    lines: [
      'The three-way check: the hours, the invoice receipt, and the contract rate must all agree.',
      'Your AP clerk receives each supplier’s invoice as an invoice receipt.',
      'A receipt with no signed week behind it is not paid. A failed check says why.',
    ],
    demo: { as: 'world-nike', desk: 'ap', screen: '/dashboard/invoices', seat: 'the AP clerk' },
  },
  {
    slug: 'chain',
    route: '/chain',
    title: 'The chain',
    question: 'Who is between you and your contractor?',
    purpose: 'Each supplier sees only its own level.',
    step: 'pay',
    lines: [
      'You see who employs the person, and whether they are insured and authorized.',
      'A sub-vendor’s name and rates stay private. Where an agreement forbids it, the end client is described, not named.',
      'A blind key shows two suppliers they sent the same person, nothing else.',
    ],
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/people', seat: 'the program manager' },
  },
]

/**
 * The eight pages in the order of the four steps: each step's own page,
 * then the pages that hang under it (`./steps`, decided 2026-09-30). The
 * number is the page's place in that order, so the Platform menu reads
 * the same spine.
 */
export const MODULES: ModulePage[] = SPINE_ORDER.map((route, i) => {
  const m = AS_WRITTEN.find((x) => x.route === route)
  if (!m) throw new Error(`The spine names ${route}, and no product page is written for it`)
  return { ...m, n: i + 1 }
})

/** The module at a route, or null. */
export function moduleAt(route: string): ModulePage | null {
  return MODULES.find((m) => m.route === route) ?? null
}

/**
 * Every word a reader sees between the header and the footer, split at
 * the fold: the question and its line, then the three lines and what the
 * shared skeleton draws around them (`./skeleton-words`).
 */
export function copyOfModule(m: ModulePage): { hero: string[]; body: string[] } {
  return {
    hero: [m.question, m.purpose],
    body: [...m.lines, ...(m.link ? [m.link.t] : []), ...copyOfSkeleton({ step: m.step, button: OPEN_DEMO })],
  }
}
