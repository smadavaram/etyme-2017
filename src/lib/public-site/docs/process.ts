/**
 * The four steps and the end of the work: five pages, one per step.
 *
 * ── Cut to one screen. Decided by the founder, 2026-10-15 ────────────
 *
 * "AI slop … no one is reading large content. Read all the public pages
 * like security documentation etc; make it real and make it simple." He
 * said "Build it" on a drawing that cut every public page to one screen.
 * Until that day the process was nine pages of 900 to 1,400 words, each a
 * flow chart, a dozen lines, a 13-row stations table, a glossary and a
 * drawing read as one of ten parties. The nine are five now:
 *
 *   Job                 took "Job: from job request to award"
 *   Candidates          took "Award to first day"
 *   Timesheets          took "Week filed to week signed" and expenses
 *   Invoices            took billing, paying and posting to your books
 *   When the work ends  took time on site and the logs
 *
 * Every page is the same shape, about 180 words: Previous and Next, "Step
 * n of 4", the title and one line, who does what as four to six boxes,
 * the rules in three to five lines, what it stops in at most three of the
 * sentences the product really shows, and "See this step in the demo".
 * The old addresses go to these pages (`./redirects`).
 *
 * ── What is kept, and what is checked ────────────────────────────────
 *
 * A refusal is quoted as the software says it, and the public-pages
 * guard finds its phrase verbatim in the file named beside it, so a
 * sentence here cannot drift from the one a user is shown. Every rule
 * line says something the code does today.
 */

import type { DemoTarget, FlowBox } from '../flow'
import { notARuleLines } from '../modules'

/**
 * A refusal, quoted as the software says it. `then` is said only where
 * the quote alone leaves the reader asking what happens next.
 */
export interface DocRefusal {
  says: string
  then?: string
  /** Stops it, or warns and lets it through with a reason. */
  kind: 'BLOCK' | 'WARN'
  source: string
  phrase: string
}

/** What a refusal's chip says. */
export const REFUSAL_KIND: Record<DocRefusal['kind'], string> = { BLOCK: 'Stops', WARN: 'Warns' }

/** The headings every step page carries, in order. */
export const STEP_HEADINGS = { flow: 'Who does what', rules: 'The rules', cost: 'What a miss costs', stops: 'What it stops' } as const

export interface StepPage {
  slug: 'job' | 'candidates' | 'timesheets' | 'invoices' | 'when-work-ends'
  /** 1 to 4, or null for the page after the four steps. */
  n: 1 | 2 | 3 | 4 | null
  title: string
  /** One line under the title. Names contractors or suppliers. */
  lede: string
  /** The docs home's line beside this step. */
  home: string
  flow: FlowBox[]
  rules: string[]
  /** A short list under the rules, where a page has one more thing to say. */
  more?: { title: string; lines: string[] }
  /**
   * What it costs the client when this step goes wrong without a rule
   * (founder, 2026-10-15, bringing back "the money side of each risk").
   * CLAUDE.md: the hook is the not-knowing; the business case is what it
   * costs when somebody finally asks. Plain facts, no figure Etyme cannot
   * show, and "can" where the cost depends on the case.
   */
  cost: string[]
  stops: DocRefusal[]
  demo: DemoTarget
}

export const STEP_PAGES: StepPage[] = [
  {
    slug: 'job',
    n: 1,
    title: 'Job',
    lede: 'The hiring manager asks for a contractor. The job goes only to approved suppliers.',
    home: 'the hiring manager asks, and the job goes to approved suppliers',
    flow: [
      { who: 'CLIENT', role: 'Hiring manager', t: 'Writes the job request: the job, the months, the rate' },
      { who: 'CLIENT', role: 'HR · Procurement · the budget owner', t: 'Approve it, or the rules do' },
      { who: 'CLIENT', role: 'Program manager or Procurement', t: 'Sends it to approved suppliers' },
      { who: 'SUPPLIER', role: 'Supplier', t: 'Puts people forward, each with their consent' },
    ],
    rules: [
      'Within the plan and the budget, the job goes out with no approval.',
      'Nobody approves their own job request.',
      'Only the program manager or Procurement sends the job. The hiring manager cannot.',
      'Each supplier sees its own rate range, never another’s.',
    ],
    cost: [
      'A rate nobody checked is paid on every hour of the contract.',
      'Two suppliers sending the same person can each claim the fee.',
    ],
    stops: [
      {
        says: 'This supplier was not among the suppliers Procurement cleared for this requirement.',
        kind: 'BLOCK', source: 'src/app/api/requisitions/[id]/distribute/route.ts',
        phrase: 'not among the suppliers Procurement cleared for this requirement',
      },
      {
        says: 'This person has already been submitted to this requirement. First submission wins.',
        kind: 'BLOCK', source: 'src/app/api/submissions/route.ts',
        phrase: 'This person has already been submitted to this requirement. First submission wins.',
      },
      {
        says: 'Bill rate $152/hr exceeds maximum $150/hr.',
        then: 'The manager gives a reason, and it is kept.',
        kind: 'WARN', source: 'src/lib/governance.ts', phrase: 'exceeds maximum $',
      },
    ],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/requisitions', seat: 'the hiring manager' },
  },
  {
    slug: 'candidates',
    n: 2,
    title: 'Candidates',
    lede: 'Suppliers send people who agreed to it. You interview, choose one, and the papers are checked.',
    home: 'suppliers send people, you interview and choose',
    flow: [
      { who: 'SUPPLIER', role: 'Supplier', t: 'Sends a person who agreed to it' },
      { who: 'RULES', role: 'The rules', t: 'Check each person on arrival' },
      { who: 'CLIENT', role: 'Hiring manager', t: 'Interviews and chooses one' },
      { who: 'WORKER', role: 'Worker', t: 'Sends papers through a link' },
      { who: 'CLIENT', role: 'Compliance officer', t: 'Checks the papers before day one' },
    ],
    rules: [
      'A supplier needs the person’s consent. A firm’s own employee is told instead.',
      'Only the client chooses. The choice writes the order and the contract.',
      'Nobody starts without a US work form (I-9) on file.',
      'A missing background check warns, and the reason is kept.',
    ],
    cost: [
      'A missing I-9 can mean a federal fine for the employer, per form.',
      'If a supplier’s insurance has lapsed, a claim from its worker can land on you.',
    ],
    stops: [
      {
        says: 'Priya Raghunathan cannot start without I-9 and E-Verify.',
        kind: 'BLOCK', source: 'src/lib/contract-clearance.ts', phrase: 'cannot start without',
      },
      {
        says: 'This supplier has no current insurance verification on file.',
        kind: 'BLOCK', source: 'src/lib/governance.ts', phrase: 'has no current insurance verification on file.',
      },
      {
        says: 'Still waiting on background check for Ravi Adebayo. The contract can start with a reason recorded.',
        kind: 'WARN', source: 'src/lib/contract-clearance.ts', phrase: 'The contract can start with a reason recorded.',
      },
    ],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/submissions', seat: 'the hiring manager' },
  },
  {
    slug: 'timesheets',
    n: 3,
    title: 'Timesheets',
    lede: 'The contractor files the week. The manager approves it, and every supplier pays from it.',
    home: 'the contractor files the week, the manager approves it',
    flow: [
      { who: 'WORKER', role: 'Worker', t: 'Files their own week, and expenses with receipts' },
      { who: 'RULES', role: 'The rules', t: 'Check the week against the contract' },
      { who: 'CLIENT', role: 'Hiring manager', t: 'Approves the week, or sends it back with a reason' },
      { who: 'SUPPLIER', role: 'Each supplier below', t: 'Accepts the same week, in turn' },
    ],
    rules: [
      'Only the worker files the week. Nobody else may.',
      'Nobody approves their own hours.',
      'Hours over the contract, or past its last day, are flagged before anyone approves.',
      'An approved expense goes on the next bill as a line of its own.',
    ],
    cost: [
      'Hours nobody checked are billed to you, and are hard to get back once paid.',
      'A week approved by the person who worked it is a week nobody approved.',
    ],
    stops: [
      {
        says: 'Nobody approves their own hours.',
        kind: 'BLOCK', source: 'src/app/api/timesheets/[id]/approve/route.ts', phrase: 'Nobody approves their own hours.',
      },
      {
        says: '44h claimed on a 40h-a-week job.',
        then: 'Approving it anyway needs a reason, and it is kept.',
        kind: 'WARN', source: 'src/lib/timesheet-flag.ts', phrase: 'h-a-week job.',
      },
    ],
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/timesheets', seat: 'the hiring manager' },
  },
  {
    slug: 'invoices',
    n: 4,
    title: 'Invoices',
    lede: 'Each supplier sends its invoice for approved weeks. You pay only what matches.',
    home: 'each supplier sends its invoice, you pay what matches',
    flow: [
      { who: 'SUPPLIER', role: 'Supplier', t: 'Sends its invoice for approved weeks' },
      { who: 'CLIENT', role: 'AP clerk', t: 'Receives it as an invoice receipt' },
      { who: 'RULES', role: 'The rules', t: 'Run the three-way check' },
      { who: 'CLIENT', role: 'AP clerk', t: 'Pays what matched' },
      { who: 'BOOKS', role: 'Your books', t: 'Get each entry once' },
    ],
    rules: [
      'The three-way check: the hours, the invoice receipt, and the contract rate must all agree.',
      'A line with no approved week behind it is never paid. Nobody can waive that.',
      'Going over the order’s limit needs a named person and a reason.',
      'An employee is paid by payroll, and never sees the bill rate.',
    ],
    cost: [
      'An invoice paid with no approved week behind it is money you have to ask for back.',
      'Paying past the order’s limit spends budget nobody approved.',
    ],
    stops: [
      {
        says: 'No line on this invoice is backed by an approved timesheet or expense',
        kind: 'BLOCK', source: 'src/lib/three-way-match.ts',
        phrase: 'No line on this invoice is backed by an approved timesheet or expense',
      },
      {
        says: 'PO-2026-SET8P has $3,200 left; this invoice is $7,400, over by $4,200',
        then: 'Paid once the order is raised, or a named person gives a reason.',
        kind: 'WARN', source: 'src/lib/three-way-match.ts', phrase: 'this invoice is',
      },
    ],
    demo: { as: 'world-nike', desk: 'ap', screen: '/dashboard/invoices', seat: 'the AP clerk' },
  },
  {
    slug: 'when-work-ends',
    n: null,
    title: 'When the work ends',
    lede: 'The last day of a contract, and the time on site each contractor keeps.',
    home: 'the last day, and time on site',
    flow: [
      { who: 'RULES', role: 'The rules', t: 'Mark the contract as ending, eight weeks out' },
      { who: 'SUPPLIER', role: 'Supplier', t: 'Plans the worker’s next project' },
      { who: 'PROGRAM_OFFICE', role: 'Program manager', t: 'Extends, replaces or lets it end' },
      { who: 'RULES', role: 'The rules', t: 'End the contract after its last day' },
    ],
    rules: [
      'Time on site is the person’s, across every supplier. A day counts once.',
      'An extension is checked against the time limit first. At the limit it is blocked.',
      'Inside a break in service, the screen shows the date a person may return.',
    ],
    more: { title: 'What runs on its own', lines: notARuleLines() },
    cost: [
      'A contractor kept past your time limit can be claimed as your employee, with the benefits that follow.',
      'When an auditor asks who has been here longest, a missing date is an answer you cannot give.',
    ],
    stops: [
      {
        says: 'Kwame Mensah has 24 months tenure (time limit: 18).',
        kind: 'BLOCK', source: 'src/lib/governance.ts', phrase: 'months tenure (time limit: ',
      },
      {
        says: 'Lucía Fernández is at 14 of 18 months (78% of the time limit)',
        then: 'A warning, months ahead of the limit.',
        kind: 'WARN', source: 'src/lib/governance.ts', phrase: '% of the time limit)',
      },
    ],
    demo: { as: 'world-nike', desk: 'compliance', screen: '/dashboard/tenure', seat: 'the compliance officer' },
  },
]

export function stepPageAt(slug: string): StepPage | null {
  return STEP_PAGES.find((p) => p.slug === slug) ?? null
}

/** The address of a step page. */
export function stepRoute(p: { slug: string }): string {
  return `/docs/${p.slug}`
}

/** "Step 1 of 4", or "After step 4" for the end of the work. */
export function stepEyebrow(p: StepPage): string {
  return p.n ? `Step ${p.n} of 4` : 'After step 4'
}

/** The short label a link to a step page carries: "Step 2 · Candidates", "After · When the work ends". */
export function stepLabel(p: StepPage): string {
  return `${p.n ? `Step ${p.n}` : 'After'} · ${p.title}`
}
