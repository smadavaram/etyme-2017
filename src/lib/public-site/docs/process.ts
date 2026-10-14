/**
 * The process: a job request through to pay and the end of the work, in
 * order, one page per stage.
 *
 * ── Why the documentation is cut this way. Decided 2026-09-30 ────────
 *
 * Until today the documentation was ten long party pages, each carrying
 * every stage from one desk, and the product pages linked into the
 * middle of them (`/docs/client#l1-3`). The founder: "It lands them
 * abruptly on sites in the middle of the page, with no links to the
 * previous or next content, and not explaining the complete functional
 * process." And on how to cut it: "split job requirement and master data
 * like business partner (customer, vendor) and consultant management,
 * and matching, screening, application tracking."
 *
 * So the process is its own set of pages, in the order of the home
 * page's four steps. Each opens on a flow chart, then short lines, then
 * the contents of the whole process with "you are here", then the
 * drawing and the stations table for that stage, read as one party at a
 * time. The party pages keep their opening section — the party's
 * position on a deal and how to read a drawing — and list the stages
 * from that desk.
 *
 * ── Nothing was rewritten to get here ────────────────────────────────
 *
 * The drawings, the stations tables and the glossaries are the party
 * pages' own HTML, cut at their sections when the page is drawn
 * (`sectionOf`). No fact moved by hand, so none can have been dropped.
 * The flow charts and the lines here are new, and each line says what a
 * station in the tables below already says, in fewer words.
 */

import type { DemoTarget, FlowBox } from '../flow'
import { PARTIES, type PartyDoc } from './index'
import { notARuleLines } from '../modules'

/**
 * A short section added under a page's lines: a title and its lines, one
 * idea each. Added 2026-10-14, when the product pages were cut to the
 * home page's shape and the facts they carried moved here, to the page
 * whose step they belong to (coordinator, the same day: "the facts that
 * left the public pages must not leave the site").
 */
export interface DocSection {
  id: string
  title: string
  lines: string[]
}

/**
 * A refusal, quoted as the software says it, with what happens next. The
 * phrase is found verbatim in the source file by the public-pages guard,
 * so a refusal quoted here cannot drift from the sentence a user is shown.
 * Moved from the product pages' "What it refuses" on 2026-10-14.
 */
export interface DocRefusal {
  says: string
  then: string
  /** Stops it, warns and lets it through with a reason, or sends it to the desk that owns it. */
  kind: 'BLOCK' | 'WARN' | 'ROUTE'
  source: string
  phrase: string
}

/** What a refusal's chip says. */
export const REFUSAL_KIND: Record<DocRefusal['kind'], string> = { BLOCK: 'Stops', WARN: 'Warns', ROUTE: 'Goes to a desk' }
export const REFUSES_TITLE = 'What it refuses, in its own words'

export interface ProcessPage {
  slug: string
  title: string
  /** Where it sits against the home page's four steps. */
  when: string
  /** The step it belongs to, if one. */
  step: 1 | 2 | 3 | 4 | null
  /** One line under the title. Names contractors or suppliers. */
  lede: string
  flow: FlowBox[]
  lines: string[]
  /** The id of the party pages' section that draws this stage, if any. */
  section: string | null
  demo?: DemoTarget
  /** Short sections under the lines. */
  more?: DocSection[]
  /** The refusals that happen at this stage, quoted. */
  refuses?: DocRefusal[]
}

export const PROCESS: ProcessPage[] = [
  {
    slug: 'source-to-contract',
    title: 'Source: job request to award',
    when: 'Steps 1 and 2',
    step: 1,
    lede: 'A hiring manager asks for a contractor, and the job goes only to the suppliers Procurement cleared.',
    flow: [
      { who: 'CLIENT', t: 'The hiring manager raises a job request' },
      { who: 'CLIENT', t: 'HR, Procurement and the lead clear it, or the rules do' },
      { who: 'CLIENT', t: 'Procurement releases it to cleared suppliers' },
      { who: 'WORKER', t: 'A person agrees to be put forward' },
      { who: 'SUPPLIER', t: 'The supplier submits them, at its rate' },
      { who: 'CLIENT', t: 'The hiring manager interviews and awards' },
    ],
    lines: [
      'The job request carries the job, the months and the rate.',
      'Within plan, the rules clear it. No person needs to approve it.',
      'Outside plan, HR reads the job and Procurement checks the suppliers.',
      'The lead who owns the cost center signs the money, after both.',
      'Nobody signs their own, including the person who raised it.',
      'A hiring manager cannot choose who sees the job. Procurement does.',
      'Each supplier’s rate band is on its own invitation, so no supplier sees another’s.',
      'Consent to be put forward is the worker’s own, and only theirs to give.',
      'The award raises the order and its first line. A supplier cannot award its own.',
    ],
    refuses: [
      {
        says: 'This supplier was not among the suppliers Procurement cleared for this requirement.',
        then: 'Not sent. Ask Procurement to add the supplier, or leave it out.',
        kind: 'BLOCK', source: 'src/app/api/requisitions/[id]/distribute/route.ts',
        phrase: 'not among the suppliers Procurement cleared for this requirement',
      },
      {
        says: '$140/hr is 17% above the $120/hr you already pay for this skill',
        then: 'Not refused, and not let through quietly. It goes to Procurement, which owns the rate.',
        kind: 'ROUTE', source: 'src/lib/requisition-approval.ts', phrase: '/hr you already pay for this skill',
      },
      {
        says: 'Bill rate $152/hr exceeds maximum $150/hr.',
        then: 'Warned, not blocked. The manager records a reason, and it stays on the row with their name.',
        kind: 'WARN', source: 'src/lib/governance.ts', phrase: 'exceeds maximum $',
      },
      {
        says: 'This supplier has no current insurance verification on file.',
        then: 'Nobody can be submitted through it until its cover is back in date.',
        kind: 'BLOCK', source: 'src/lib/governance.ts', phrase: 'has no current insurance verification on file.',
      },
      {
        says: 'This person has already been submitted to this requirement. First submission wins.',
        then: 'The second firm is told it was second, rather than finding out at the interview.',
        kind: 'BLOCK', source: 'src/app/api/submissions/route.ts',
        phrase: 'This person has already been submitted to this requirement. First submission wins.',
      },
      {
        says: '$124/hr is above the $118/hr ceiling you were given',
        then: 'A warning, not a refusal. The client sees the rate against the band before shortlisting.',
        kind: 'WARN', source: 'src/app/api/submissions/route.ts', phrase: 'ceiling you were given',
      },
      {
        says: 'You are sending this on at $98/hr, which is less than the $104/hr you were quoted.',
        then: 'A warning, not a block. A firm sending a person up the chain is told when the price goes the wrong way.',
        kind: 'WARN', source: 'src/lib/forwarding.ts', phrase: 'you were quoted.',
      },
    ],
    section: 'l1-1',
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/requisitions', seat: 'the hiring manager' },
  },
  {
    slug: 'contract-to-onboard',
    title: 'Award to first day',
    when: 'Step 2',
    step: 2,
    lede: 'The award writes the order and the contractor’s contract, and the papers are checked before day one.',
    flow: [
      { who: 'PROGRAM_OFFICE', t: 'An agreement is signed, if the firms want one' },
      { who: 'CLIENT', t: 'Procurement raises the purchase order' },
      { who: 'SUPPLIER', t: 'A sell line and a buy line are written for the person' },
      { who: 'WORKER', t: 'The person sends papers through a link' },
      { who: 'SUPPLIER', t: 'The person and the company are cleared' },
      { who: 'SUPPLIER', t: 'The contract is activated' },
    ],
    lines: [
      'Two checks, not one: the person is cleared, and the company is cleared.',
      'The agreement (MSA) is optional. Both firms sign it, and the later date counts.',
      'The purchase order is one document. The supplier receives it as its sales order.',
      'The order is the header, with a spending limit. Each line is one person at one rate.',
      'Your own W2 employee gets no order. Employment is the paperwork.',
      'The person’s papers come through a link, with no sign-in.',
      'A missing US work form (I-9) or lapsed insurance blocks the start.',
      'A missing background check warns, and the reason is recorded.',
      'Activation moves both lines: the sell line and the buy line.',
    ],
    refuses: [
      {
        says: 'Priya Raghunathan cannot start without I-9 and E-Verify.',
        then: 'Get it on file, then activate. Nobody can wave a missing US work form (I-9) through.',
        kind: 'BLOCK', source: 'src/lib/contract-clearance.ts', phrase: 'cannot start without',
      },
      {
        says: 'Still waiting on background check for Ravi Adebayo. The contract can start with a reason recorded.',
        then: 'The reason keeps the name of whoever gave it. The verdict on a background check is the screening provider’s.',
        kind: 'WARN', source: 'src/lib/contract-clearance.ts', phrase: 'The contract can start with a reason recorded.',
      },
      {
        says: 'Kwame Mensah has 24 months tenure (time limit: 18).',
        then: 'Blocked where the client’s rule blocks. No extension, award or start until the break is served.',
        kind: 'BLOCK', source: 'src/lib/governance.ts', phrase: 'months tenure (time limit: ',
      },
    ],
    section: 'l1-2',
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/contracts', seat: 'the program manager' },
  },
  {
    slug: 'work-to-approve',
    title: 'Week filed to week signed',
    when: 'Step 3',
    step: 3,
    lede: 'The contractor files the week, the client signs it, and each supplier below accepts the same week.',
    flow: [
      { who: 'WORKER', t: 'The worker files the week' },
      { who: 'RULES', t: 'It is checked against the contract' },
      { who: 'CLIENT', t: 'The hiring manager signs it' },
      { who: 'SUPPLIER', t: 'The employer accepts what it will pay for' },
      { who: 'RULES', t: 'The signed week is the receipt everyone bills from' },
    ],
    lines: [
      'Staffing delivers no goods. The signed week is the proof the work happened: the timesheet receipt.',
      'Only the worker files the week. Nobody else may.',
      'Before anyone signs, hours over the contract or past its end are flagged.',
      'Nobody signs their own hours.',
      'A week is approved if nobody replies only when the order says so.',
      'The client signs first. Then each firm below accepts the same week, in turn.',
      'Two companies sign one row of hours, never one row per level.',
      'A milestone the client accepted is another kind of receipt.',
    ],
    refuses: [
      {
        says: 'Nobody approves their own hours.',
        then: 'The person who filed the week cannot sign it. Only the company being billed approves.',
        kind: 'BLOCK', source: 'src/app/api/timesheets/[id]/approve/route.ts', phrase: 'Nobody approves their own hours.',
      },
      {
        says: '44h claimed on a 40h-a-week job.',
        then: 'Flagged and shown first. An approval anyway carries the reason on the signature.',
        kind: 'WARN', source: 'src/lib/timesheet-flag.ts', phrase: 'h-a-week job.',
      },
    ],
    section: 'l1-3',
    demo: { as: 'world-nike', desk: 'hiring', screen: '/dashboard/timesheets', seat: 'the hiring manager' },
  },
  {
    slug: 'expenses',
    title: 'An expense, receipt to repayment',
    when: 'Step 3',
    step: 3,
    lede: 'A contractor files an expense with its receipt, and the client approves it before any supplier bills it.',
    flow: [
      { who: 'WORKER', t: 'The worker files it, with the receipt' },
      { who: 'CLIENT', t: 'The client approves it, or refuses with a reason' },
      { who: 'SUPPLIER', t: 'An approved expense rides the next bill' },
      { who: 'RULES', t: 'The approval is the receipt in the check' },
      { who: 'CLIENT', t: 'The client pays it with the bill' },
      { who: 'SUPPLIER', t: 'Whoever pays the worker pays them back' },
    ],
    lines: [
      'An expense is the second kind of receipt.',
      'The worker files the amount, the category and the receipt.',
      'The order says whether the client pays for it, and up to what limit.',
      'A refusal carries its reason, and the worker is told on their own channel.',
      'An approved expense goes on the next bill as a line of its own.',
      'An unapproved expense never reaches a bill.',
      'An employee is paid back by payroll. A sub-vendor’s person is paid back on the sub’s invoice.',
    ],
    section: 'expenses',
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/expenses', seat: 'the program manager' },
  },
  {
    slug: 'approve-to-bill',
    title: 'Signed week to bill',
    when: 'Step 4',
    step: 4,
    lede: 'Each supplier bills its customer from the signed week, and the client pays only what matched.',
    flow: [
      { who: 'SUPPLIER', t: 'The supplier raises the bill from the sell line' },
      { who: 'CLIENT', t: 'AP receives it. The due date counts from here' },
      { who: 'CLIENT', t: 'AP pays what matched' },
      { who: 'SUPPLIER', t: 'The supplier applies the cash' },
      { who: 'SUPPLIER', t: 'An unpaid bill ages from its due date' },
    ],
    lines: [
      'The firm that issues a document names it. The firm bills its customer.',
      'The due date belongs to the bill and counts from the day the client received it.',
      'A bill can name four parties: sold-to, bill-to, ship-to and payer.',
      'The client never pays a bill that did not match.',
      'A short payment goes to a person to decide.',
      'A dispute ends in a credit note, which reverses the revenue.',
      'Exposure adds what is unpaid, unbilled and committed.',
      'Collections can stop the work or write off the debt.',
    ],
    section: 'l1-4',
    demo: { as: 'world-nike', desk: 'ap', screen: '/dashboard/invoices', seat: 'the AP clerk' },
  },
  {
    slug: 'approve-to-pay',
    title: 'Invoice receipt to payment',
    when: 'Step 4',
    step: 4,
    lede: 'A supplier’s invoice is received and checked, and an employee is paid by payroll.',
    flow: [
      { who: 'SUPPLIER', t: 'The supplier issues its invoice' },
      { who: 'CLIENT', t: 'It is received as an invoice receipt' },
      { who: 'RULES', t: 'The three-way check runs' },
      { who: 'CLIENT', t: 'A failed check is a decision on a desk' },
      { who: 'CLIENT', t: 'The payment run pays what matched' },
      { who: 'WORKER', t: 'The worker is paid by payroll' },
    ],
    lines: [
      'The three-way check: the hours, the invoice receipt, and the contract rate must all agree.',
      'The supplier’s invoice keeps its own number. It is received, never raised.',
      'A failed check is a decision on a desk, with a reason.',
      'Whoever approves the payment run is not the person who raised it.',
      'The remittance says what was paid, and for what.',
      'An employee is paid by payroll, on accepted hours only.',
      'The worker sees their own pay, never the bill rate.',
      'Tax data goes to the payroll bureau: 1099 and W-2 data.',
      'In a chain, each firm above does the same for the firm below it.',
    ],
    refuses: [
      {
        says: 'No line on this invoice is backed by an approved timesheet or expense',
        then: 'Not paid, and nobody can waive it. Finance can see who has the week.',
        kind: 'BLOCK', source: 'src/lib/three-way-match.ts',
        phrase: 'No line on this invoice is backed by an approved timesheet or expense',
      },
      {
        says: 'PO-2026-SET8P has $3,200 left; this invoice is $7,400, over by $4,200',
        then: 'Not paid until the order is raised, or a person with the authority records a reason.',
        kind: 'WARN', source: 'src/lib/three-way-match.ts', phrase: 'this invoice is',
      },
    ],
    section: 'l1-5',
    demo: { as: 'world-nike', desk: 'ap', screen: '/dashboard/invoices', seat: 'the AP clerk' },
  },
  {
    slug: 'record-to-report',
    title: 'Posting to your books',
    when: 'After step 4',
    step: null,
    lede: 'What you bill and pay for your contractors becomes one balanced journal entry each, in the books you keep.',
    flow: [
      { who: 'RULES', t: 'Receipts and payroll are posted' },
      { who: 'RULES', t: 'Each becomes one balanced journal entry' },
      { who: 'CLIENT', t: 'Your terms are mapped to your accounts' },
      { who: 'BOOKS', t: 'Each entry is sent to your books once' },
      { who: 'BOOKS', t: 'It is read back, and each gap gets an owner' },
    ],
    lines: [
      'Etyme posts into your books. It does not replace them.',
      'Each entry is exported once, to the accounting system you already run.',
      'A master contract is an optional tag that rolls several contracts into one deal.',
      'Profit is shown by the deal, as margin.',
      'Earned against cash shows the days to get paid, in real months.',
    ],
    section: 'l1-6',
  },
  {
    slug: 'govern-and-protect',
    title: 'Time on site and the logs',
    when: 'Throughout',
    step: null,
    lede: 'Time on site belongs to the contractor at the client, across every supplier, and every read is logged.',
    flow: [
      { who: 'RULES', t: 'Each day on site is counted once per person' },
      { who: 'CLIENT', t: 'The compliance officer reads the ledger' },
      { who: 'RULES', t: 'Near the time limit it warns; at the limit it blocks' },
      { who: 'RULES', t: 'Nobody decides two desks' },
      { who: 'RULES', t: 'Every read and every automatic act is logged' },
    ],
    lines: [
      'Time on site (tenure) belongs to the person at the client, across every supplier.',
      'A day counts once, however many firms billed it.',
      'The worker type is recorded: W2, 1099 or paid through their own company.',
      'Approval chains run by rule and by name.',
      'Supplier standing is probation, approved or preferred.',
      'The system records everything it does on its own, with why, and whether it can be undone.',
      'Every read of another person’s data leaves a row, refusals too.',
      'The company keeps its own do-not-return list.',
    ],
    more: [
      {
        id: 'adds-up',
        title: 'How time on site adds up',
        lines: [
          'One person worked fourteen months through one supplier.',
          'Then three months through a second, and two through a third.',
          'That is nineteen months on site at one client.',
          'None of the three suppliers can see the other two.',
          'Etyme counts each day once, across every supplier.',
        ],
      },
      {
        id: 'cost',
        title: 'What it costs when somebody finally asks',
        lines: [
          'Nobody is fined on the day a contractor passes eighteen months.',
          'The cost today is three weeks of asking, and a number nobody trusts.',
          'When somebody checks, the cost is one of three things.',
          'A co-employment claim counts every supplier together. It lands on the client, not on the supplier that billed the first year.',
          'A supplier whose insurance lapsed keeps working. Etyme reads the certificate’s dates and stops a start until it is renewed.',
          'A bill is paid with no signed week behind it. Etyme pays only what matches a signed week and an order.',
        ],
      },
      {
        id: 'not-a-rule',
        title: 'What runs on its own, and what is not a plain rule',
        lines: notARuleLines(),
      },
    ],
    refuses: [
      {
        says: 'Lucía Fernández is at 14 of 18 months (78% of the time limit)',
        then: 'A warning at three quarters of the time limit, so the manager sees the end months ahead.',
        kind: 'WARN', source: 'src/lib/governance.ts', phrase: '% of the time limit)',
      },
    ],
    section: 'l1-7',
    demo: { as: 'world-nike', desk: 'compliance', screen: '/dashboard/tenure', seat: 'the compliance officer' },
  },
  {
    slug: 'when-work-ends',
    title: 'When the work ends',
    when: 'At the end',
    step: null,
    lede: 'The client and the supplier see the end of a contract coming, and the contractor’s time on site stays with them.',
    flow: [
      { who: 'RULES', t: 'Eight weeks out, the contract is marked as ending' },
      { who: 'SUPPLIER', t: 'The supplier plans the worker’s next project' },
      { who: 'CLIENT', t: 'The client extends, replaces or lets it end' },
      { who: 'RULES', t: 'After the last day, both lines end' },
      { who: 'RULES', t: 'A break in service is counted before any return' },
    ],
    lines: [
      'Fifty-six days before the end date, the contract is marked as rolling off, with the reason logged.',
      'The client’s dashboard lists the contracts ending soon.',
      'An extension is checked against the time limit first. At the limit it is blocked.',
      'A replacement is a new contract on the same terms. The old one ends.',
      'The daily job ends a contract once its last day has passed, on both sides.',
      'Time on site stays with the person, across every supplier.',
      'Inside a break in service, the screen shows the date a person may return, not a button.',
    ],
    section: null,
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/program', seat: 'the program manager' },
  },
]

export function processAt(slug: string): ProcessPage | null {
  return PROCESS.find((p) => p.slug === slug) ?? null
}

/**
 * The parties whose pages draw this stage, in the operating model's order.
 * The first is the view shown when no party is chosen: the client where
 * the client draws it, since the client is the customer.
 */
export function partiesFor(p: ProcessPage): PartyDoc[] {
  if (!p.section) return []
  return PARTIES.map((x) => x.doc).filter((d) => sectionOf(d, p.section!) !== null)
}

/**
 * One section of a party page's HTML, cut at its own `<section>` tags.
 * The HTML is written in this repository (see `./index`), and every
 * section on it is a top-level `<section class="ch-sec" ...>`.
 */
export function sectionOf(doc: PartyDoc, id: string): string | null {
  for (const part of sectionsOf(doc)) if (part.id === id) return part.html
  return null
}

/** Every top-level section of a party page, with its id; the opening section has none. */
export function sectionsOf(doc: PartyDoc): { id: string | null; html: string }[] {
  const starts = [...doc.html.matchAll(/<section class="ch-sec"/g)].map((m) => m.index!)
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : doc.html.length
    const html = doc.html.slice(start, end).trim()
    const id = /^<section class="ch-sec"[^>]*\sid="([^"]+)"/.exec(html)?.[1] ?? null
    return { id, html }
  })
}

/** The route of a process page, read as a party or as the default view. */
export function processRoute(slug: string, party?: string): string {
  return party ? `/docs/process/${slug}/${party}` : `/docs/process/${slug}`
}

/** Every process page and every party's view of it, as routes. */
export function processRoutes(): string[] {
  return [
    '/docs/process',
    ...PROCESS.flatMap((p) => [processRoute(p.slug), ...partiesFor(p).map((d) => processRoute(p.slug, d.slug))]),
  ]
}
