/**
 * The four steps: the one spine of the public site.
 *
 * ── Decided 2026-09-30 ───────────────────────────────────────────────
 *
 * The founder, on the home page's four steps landing readers in the
 * middle of documentation pages: "It lands them abruptly on sites in the
 * middle of the page, with no links to the previous or next content, and
 * not explaining the complete functional process." So the four steps on
 * the home page are the one spine for the home page, the product pages
 * and the documentation, in the same order:
 *
 *   1. Source               /requisitions   more: /governance
 *   2. Choose and start     /contracts      more: /submissions, /compliance
 *   3. Approve the weeks    /timesheets
 *   4. Bill and pay         /invoices       more: /chain
 *
 * The first step is Source, never Hire (the founder, the same day): a
 * contingent worker is sourced from a supplier, not hired.
 *
 * A step page says "Step n of 4", has Previous and Next at its top and
 * its bottom, and shows what you do, the real screen, who is involved and
 * what happens next. It ends with "See this step in the demo". The other
 * four product pages hang under the step they belong to, as "More in this
 * step", each with a way back to its step.
 *
 * The home page's own list of steps stays in `app/page.tsx`, word for
 * word; a test holds that it leads to these four pages, in this order.
 */

import type { Actor, DemoTarget, FlowBox } from './flow'
import { NORTHBEND_LABEL } from './example'

export interface Involved {
  /** The desk or party, in the trade's words. */
  who: string
  actor: Actor
  does: string
}

export interface Step {
  n: 1 | 2 | 3 | 4
  /** The step page's address: one of the product pages. */
  route: '/requisitions' | '/contracts' | '/timesheets' | '/invoices'
  /** The step's short name, used on every menu and every "Step n of 4". */
  name: string
  /** The home page's line for this step, word for word. */
  home: string
  /** What you do, as a chart. */
  flow: FlowBox[]
  /** Who is involved, one line each. */
  involved: Involved[]
  /** What happens next, in a line. */
  next: string
  /** The product pages that hang under this step, in order. */
  more: string[]
  /** The documentation's process pages for this step, in order. */
  process: string[]
  /** The exact screen in the example program, at the right desk. */
  demo: DemoTarget
}

export const STEPS: Step[] = [
  {
    n: 1,
    route: '/requisitions',
    name: 'Source',
    home: 'Post a job to the suppliers you cleared',
    flow: [
      { who: 'CLIENT', t: 'The hiring manager raises a job request' },
      { who: 'RULES', t: 'Plan, budget and rate are checked' },
      { who: 'CLIENT', t: 'A miss goes to HR, Procurement or the lead' },
      { who: 'CLIENT', t: 'Procurement names the suppliers' },
      { who: 'SUPPLIER', t: 'Each supplier gets the job and its own rate band' },
    ],
    involved: [
      { who: 'Hiring manager', actor: 'CLIENT', does: 'Raises the job request: the job, the months and the rate.' },
      { who: 'HR', actor: 'CLIENT', does: 'Reads the job when it is outside the plan.' },
      { who: 'Procurement', actor: 'CLIENT', does: 'Checks the suppliers, and names the ones who may quote.' },
      { who: 'Cost-center lead', actor: 'CLIENT', does: 'Signs the money last. Nobody signs their own.' },
      { who: 'Program office', actor: 'PROGRAM_OFFICE', does: 'Stands in where no lead is named yet.' },
      { who: 'Supplier', actor: 'SUPPLIER', does: 'Receives the job, and sees only its own rate band.' },
    ],
    next: 'Suppliers send people for the job. You interview, choose one, and the paperwork is written.',
    more: ['/governance'],
    process: ['source-to-contract'],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/requisitions', seat: 'the hiring manager' },
  },
  {
    n: 2,
    route: '/contracts',
    name: 'Choose and start',
    home: 'Interview, choose, and the paperwork is written',
    flow: [
      { who: 'SUPPLIER', t: 'A supplier submits a person who agreed' },
      { who: 'RULES', t: 'Each person is screened on arrival' },
      { who: 'CLIENT', t: 'The hiring manager interviews and awards' },
      { who: 'RULES', t: 'The award writes the order and the contract' },
      { who: 'CLIENT', t: 'Papers are checked before day one' },
      { who: 'SUPPLIER', t: 'The contract starts' },
    ],
    involved: [
      { who: 'Supplier', actor: 'SUPPLIER', does: 'Submits a person, at a rate, only with that person’s consent.' },
      { who: 'Worker', actor: 'WORKER', does: 'Agrees to be put forward, and sends papers through a link.' },
      { who: 'Hiring manager', actor: 'CLIENT', does: 'Interviews in rounds and awards. A supplier cannot award its own.' },
      { who: 'Procurement', actor: 'CLIENT', does: 'Raises the purchase order, with a spending limit.' },
      { who: 'Compliance officer', actor: 'CLIENT', does: 'Checks time on site before an offer, and the papers before a start.' },
    ],
    next: 'The contractor starts work and files their first week.',
    more: ['/submissions', '/compliance'],
    process: ['source-to-contract', 'contract-to-onboard'],
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/contracts', seat: 'the program manager' },
  },
  {
    n: 3,
    route: '/timesheets',
    name: 'Approve the weeks',
    home: 'Contractors file their weeks and your manager approves them',
    flow: [
      { who: 'WORKER', t: 'The worker files their own week' },
      { who: 'RULES', t: 'The week is checked against the contract' },
      { who: 'CLIENT', t: 'The hiring manager signs it' },
      { who: 'SUPPLIER', t: 'Each firm below accepts the same week' },
      { who: 'WORKER', t: 'The worker is owed pay once the employer accepts' },
    ],
    involved: [
      { who: 'Worker', actor: 'WORKER', does: 'Files their own week. Nobody else may.' },
      { who: 'Hiring manager', actor: 'CLIENT', does: 'Signs the week. Nobody approves their own hours.' },
      { who: 'Supplier', actor: 'SUPPLIER', does: 'Accepts the signed week in turn, and pays from it.' },
      { who: 'Program office', actor: 'PROGRAM_OFFICE', does: 'Sees flagged weeks first. A week is approved by silence only if the order says so.' },
    ],
    next: 'Each supplier bills from the signed week, and you pay what matched.',
    more: [],
    process: ['work-to-approve', 'expenses'],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/timesheets', seat: 'the hiring manager' },
  },
  {
    n: 4,
    route: '/invoices',
    name: 'Bill and pay',
    home: 'Each supplier bills, and you pay what matched',
    flow: [
      { who: 'SUPPLIER', t: 'The supplier sends its invoice' },
      { who: 'CLIENT', t: 'AP receives it as an invoice receipt' },
      { who: 'RULES', t: 'The three-way check runs' },
      { who: 'CLIENT', t: 'A failed check goes to a desk' },
      { who: 'CLIENT', t: 'AP pays what matched' },
      { who: 'SUPPLIER', t: 'The supplier pays its worker' },
    ],
    involved: [
      { who: 'Supplier', actor: 'SUPPLIER', does: 'Sends its invoice, only for weeks the client signed.' },
      { who: 'AP clerk', actor: 'CLIENT', does: 'Receives it as an invoice receipt, and pays what matched.' },
      { who: 'The rules', actor: 'RULES', does: 'Run the three-way check before anything is paid. A failed check says why.' },
      { who: 'Worker', actor: 'WORKER', does: 'Is paid by the employer, and sees their own pay, never the bill rate.' },
    ],
    next: 'The same signed weeks add up time on site, per person, across every supplier.',
    more: ['/chain'],
    process: ['approve-to-bill', 'approve-to-pay'],
    demo: { as: 'world-nike', desk: 'ap', screen: '/dashboard/invoices', seat: 'the AP clerk' },
  },
]

/** The step a product page is, or the step it hangs under. */
export function stepOf(route: string): { step: Step; isStep: boolean } | null {
  const own = STEPS.find((s) => s.route === route)
  if (own) return { step: own, isStep: true }
  const under = STEPS.find((s) => s.more.includes(route))
  return under ? { step: under, isStep: false } : null
}

/** Every product page in spine order: each step, then what hangs under it. */
export const SPINE_ORDER: string[] = STEPS.flatMap((s) => [s.route, ...s.more])

/** The one sentence under every demo button, naming the example with what it is. */
export function demoNote(seat: string): string {
  return `You sit as ${seat} at ${NORTHBEND_LABEL}. No account is needed.`
}

/** Every word a step adds to its page, for the guard. */
export function copyOfStep(s: Step): string[] {
  return [
    `Step ${s.n} of 4`, s.name,
    ...s.flow.map((b) => b.t),
    ...s.involved.flatMap((i) => [i.who, i.does]),
    s.next,
    demoNote(s.demo.seat),
  ]
}
