/**
 * The eight module pages, as data.
 *
 * ── Where they came from ─────────────────────────────────────────────
 *
 * The structure is the static marketing site's, on the `development`
 * branch of the old repository (`requisitions.html` and its seven
 * siblings): key capabilities, the complaint, what Etyme does, what it
 * looks like, what it refuses, read the flow. The founder kept it on
 * 2026-09-26, and "what it refuses" is the most Etyme section on the
 * site — a product that says what it will not do is a product with rules.
 *
 * ── What changed on the way in ───────────────────────────────────────
 *
 * 1. **Every page opens on a real screen.** The static pages had a
 *    drawing and no table. After a CTO read the home page and could not
 *    tell what the product does, the rule became screens before
 *    sentences. Each page's first image is a screenshot from the seeded
 *    demo, with the desk and route it was taken from and when, so it
 *    can be retaken after a redesign exactly as the home page's are.
 *
 * 2. **Every claim was read against the code, and four did not survive.**
 *    "An eleven-item checklist" — the supplier checklist has thirteen
 *    items, so the number went. "A bill past the order cap is refused,
 *    nobody overrides it" — the balance check is overridable with a name
 *    and a reason (`OVERRIDABLE.PO_BALANCE` in `lib/three-way-match`),
 *    while the missing signed week is the one nobody can waive; the page
 *    says so the right way round now. "Start confirmed on site" — no code
 *    records an arrival, so it went. "Visas chased at ninety, sixty and
 *    thirty days" — what the code does is mark a visa expiring inside
 *    ninety days, so that is what the page says.
 *
 * 3. **Every refusal quotes the software.** Each example names the file
 *    that says it and a phrase the test finds there, so a refusal on a
 *    marketing page cannot drift from the sentence a user is shown. The
 *    static site's "The level below Brightmoor is not yours to read" was
 *    a sentence no screen says; the chain page quotes the one it does.
 *
 * 4. **The complaint is a situation, not a testimonial.** The static
 *    pages set each complaint in quotation marks over a line of
 *    attribution. Nobody said them, and a quotation nobody said is an
 *    invented customer. So each is written as the situation, with the
 *    desk that has it named beside it.
 *
 * 5. **No company is named**, the supplier's rates and its sub-vendors'
 *    names are said to stay private on the chain page, and every
 *    sentence is under thirty words. `lib/positioning` checks all three.
 */

import { ACTIONS, ALL_ACTIONS } from '@/lib/autonomy'

export interface Screen {
  /** Under /public. */
  img: string
  alt: string
  /** What the image shows, in numbers read off the image itself. */
  caption: string
  /** The desk and route it was taken from, so it can be retaken. */
  from: string
  /** When, UTC. A PNG cannot be read by a test; the date can. */
  capturedAt: string
}

export interface Refusal {
  /** The sentence a user is shown, with example names in it. */
  says: string
  /** What happens next, in a sentence or two. */
  then: string
  /**
   * Whether the software stops it, warns and lets it through with a
   * reason, or sends it to the desk that owns the question. Never a
   * fourth answer: nothing is silently permitted (Addendum E).
   */
  kind: 'BLOCK' | 'WARN' | 'ROUTE'
  /** The file that says it. */
  source: string
  /** A phrase from `says` that appears verbatim in `source`. */
  phrase: string
}

export interface ModulePage {
  slug: string
  route: `/${string}`
  /** 1 to 8, the order a hire moves through them. */
  n: number
  title: string
  /** One or two sentences under the title. Names contractors or suppliers. */
  lede: string
  screen: Screen
  capabilities: { t: string; d: string }[]
  complaint: { text: string; whose: string; gloss: string }
  does: string[]
  /** The milestones, as a strip, and the clause under it. */
  stages: { steps: string[]; under: string }
  /** What the screen shows, said as what a reader would do with it. */
  looks: string[]
  refuses: Refusal[]
  refusesNote: string
  /** The documentation page that draws this flow. */
  flow: { href: string; label: string }
  /**
   * A section carried over from the home page, drawn after "What it
   * refuses". See `More` below.
   */
  more?: More
}

/**
 * A section that used to be on the home page.
 *
 * ── Why the module pages grew one section each, 2026-09-27 ────────────
 *
 * The founder: the home page is too long and should read like a
 * Microsoft or SAP product page, not an essay. It was 3,771 words in
 * twelve bands. A product page can be short because every band links to
 * depth, and the depth went live the day before — these eight pages,
 * the documentation, the security position and About.
 *
 * So the home page's long middle was moved, not deleted. Three of its
 * sections belong to one station each and are here, under that
 * station's own page: what it costs when nobody can answer (compliance),
 * the chain the client buys through (the chain), and how much of what
 * runs on its own is a rule (governance). The rest went to About.
 * `positioning.test.ts` finds each moved phrase where it went, so a
 * section cannot be dropped from both pages by accident.
 */
export interface More {
  /** The anchor, so the home page and the footer can link straight to it. */
  id: string
  title: string
  paragraphs: string[]
  items?: { t: string; d: string }[]
}

// ── How much runs on its own, counted rather than typed ──────────────
//
// The home page said "Twenty-four things in here happen without anybody
// asking" as a literal, and a test recomputed it from `lib/autonomy` so
// the literal failed the build the day somebody added an action. Here
// the sentence is computed from the same ladder, so it cannot go stale
// at all, and the test still reads it against the ladder.

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
 * The example client, said with what it is every time it is named.
 *
 * A buyer-side review, 2026-09-27: a CTO reading a caption that named
 * Northbend Athletic asked "are these real?" — and an invented company
 * that reads as a customer is fake social proof, which loses the trust
 * moment on its own. So the name never appears on a public page without
 * the founder's label, "a demo company — not a customer" (decided the
 * same evening, after "invented" did not land), in the same sentence, and
 * `__tests__/invariants/public-example-names.test.ts` holds it.
 */
const NORTHBEND = 'Northbend Athletic, a demo company — not a customer'

export const MODULES: ModulePage[] = [
  {
    slug: 'requisitions',
    route: '/requisitions',
    n: 1,
    title: 'Job requests & suppliers',
    lede:
      'A manager says what they need, and most requirements clear the moment they are raised. ' +
      'Once approved, a job goes only to the suppliers Procurement cleared, each at its own rate band.',
    screen: {
      img: '/screens/requisitions.png',
      alt: 'A requirements screen: one open job, seven cleared by rule with no human needed, one waiting on a person, and a job over plan waiting on approval.',
      caption:
        `The program manager at ${NORTHBEND}. Eight job requests: seven cleared by rule with nobody approving them, ` +
        'and one over plan waiting on a person, with the reason on the row.',
      from: '/dashboard/requisitions as the program manager',
      capturedAt: '2026-09-28T19:09:23Z',
    },
    capabilities: [
      { t: 'Raise in plain terms', d: 'A job, a budget, a rate band and a cost center. Most open the moment they are raised.' },
      { t: 'Rules clear first', d: 'Headcount plan, budget and the going rate are checked by rule. A person sees it only when one fails.' },
      { t: 'Three desks, in order', d: 'HR reads the job, Procurement audits the suppliers, the cost-center lead signs the money last.' },
      { t: 'Released to cleared suppliers only', d: 'Procurement names the firms. Each gets its own rate band and cannot see anyone else’s.' },
      { t: 'Invitations that expire', d: 'Fourteen days unless somebody sets another date, so a job never sits with a firm that went quiet.' },
      { t: 'A supplier, cleared by four desks', d: 'Your lead, Procurement, HR and Finance each verify their own items, and the recommender is none of them.' },
    ],
    complaint: {
      text:
        'A hiring manager emails three agencies she likes. Procurement finds out when the bills arrive, ' +
        'and one of the three was never approved to work with the company at all.',
      whose: 'Procurement, at a company with more suppliers than it thinks it has.',
      gloss:
        'Nobody in that story did anything wrong by their own lights. The manager needed somebody and the agencies answered. ' +
        'The rule saying which firms may be used lived in a document, and a document cannot stop an email.',
    },
    does: [
      'A requirement is raised with a budget, a rate band and a cost center. Rules read it first: the headcount plan, the budget, and the rate against the going rate. ' +
        'If every check passes it opens straight away.',
      'If one fails, it goes to the desk that owns that check. HR reads the job, Procurement audits the sourcing, and the cost-center lead signs the money last. ' +
        'Whoever raised it cannot approve it.',
      'When Procurement approves, it names the suppliers it cleared, and only those firms can be sent the job. ' +
        'Each supplier gets its own rate band and cannot see anyone else’s.',
      'A firm becomes a supplier the same way. Your lead confirms the need, Procurement qualifies it, HR clears compliance and Finance approves it. ' +
        'Whoever recommended the firm decides none of it.',
    ],
    stages: { steps: ['Raised', 'Cleared', 'Released'], under: 'to the suppliers Procurement named, and nobody else' },
    looks: [
      'The counts across the top say how much of the work nobody had to touch: cleared automatically, against waiting on a person.',
      'A job over plan says so on its own row, in a sentence, with the name of the person it is waiting on.',
      'Open the example program to raise one yourself as the hiring manager, then approve it from another desk.',
    ],
    refuses: [
      {
        says: 'Pinnacle Resourcing was not among the suppliers Procurement cleared for this requirement.',
        then: 'Pinnacle Resourcing is a demo company — not a customer. Not sent. Ask Procurement to add them, or leave them out. A hiring manager cannot choose who sees a job.',
        kind: 'BLOCK',
        source: 'src/app/api/requisitions/[id]/distribute/route.ts',
        phrase: 'not among the suppliers Procurement cleared for this requirement',
      },
      {
        says: '$140/hr is 17% above the $120/hr you already pay for this skill',
        then: 'Not refused, and not let through quietly. It goes to Procurement, the desk that owns the rate, and opens when Procurement says yes.',
        kind: 'ROUTE',
        source: 'src/lib/requisition-approval.ts',
        phrase: '/hr you already pay for this skill',
      },
    ],
    refusesNote:
      'Whoever recommended a supplier cannot decide it, and a rejection needs a reason the requester can read. ' +
      'With Brightmoor Staffing, a demo company — not a customer, the screen says: “You recommended Brightmoor Staffing, so the desks decide it without you.”',
    flow: { href: '/docs/client#l1-1', label: 'Source to contract, from the client’s desk' },
  },

  {
    slug: 'submissions',
    route: '/submissions',
    n: 2,
    title: 'Submissions & screening',
    lede:
      'Every supplier submits against the same job, and each person arrives on one screen with the firm that sent them and the rate it asked. ' +
      'Two firms sending the same person is caught before anyone is interviewed.',
    screen: {
      img: '/screens/submissions.png',
      alt: 'A candidates screen: nine people from three suppliers, each row naming the consultant, the job, the supplier, the rate and the stage.',
      caption:
        `The hiring manager at ${NORTHBEND}. Nine people from three suppliers, each row carrying the firm that sent them, ` +
        'the rate it asked and where the person has got to.',
      from: '/dashboard/submissions as the hiring manager',
      capturedAt: '2026-09-28T19:09:26Z',
    },
    capabilities: [
      { t: 'One screen for every supplier', d: 'Each candidate arrives with the firm that sent them and the rate it asked.' },
      { t: 'Duplicates held', d: 'The same person twice on a requirement: the first submission wins, and the second firm is told.' },
      { t: 'Nine screening checks', d: 'Budget, already submitted, work authorization, can start, supplier engaged, governance, not barred, skills evidenced, worked here before.' },
      { t: 'Rate against the band', d: 'Above the ceiling or below the floor warns. Neither blocks a submission.' },
      { t: 'Interviews in rounds', d: 'Rounds in turn. The supplier and the candidate are told on their own channels.' },
      { t: 'The award takes the position', d: 'One person, one position, and the order that pays for it. The last position filled stands the other suppliers down.' },
    ],
    complaint: {
      text:
        'Four agencies send the same candidate at four different rates, and two of them argue about whose he is. ' +
        'Meanwhile the one the manager actually wanted is at the bottom of somebody’s inbox.',
      whose: 'A hiring manager at a company with more than one supplier.',
      gloss:
        'Suppliers compete, and that is the point of having more than one. But when each submission is an email, the client does the reconciling. ' +
        'Which person is which, who sent them first, and whether the rate on the résumé is the rate on the bill.',
    },
    does: [
      'A supplier can submit only to a job it was sent, only while its insurance is in date, and only a person who agreed to be represented by it. ' +
        'Its own employee is the one exception, and the employee is told.',
      'The submission lands on one screen for the client, with the firm that sent it and the rate it asked. ' +
        'The same person submitted twice to a requirement is held: the first submission wins.',
      'Screening reads every arrival against the same nine checks. Then shortlist, interview and award. ' +
        'An award takes a position, and when the last position is taken the other suppliers are stood down.',
    ],
    stages: { steps: ['Submitted', 'Shortlisted', 'Interview', 'Awarded'], under: 'one screen, one rate each' },
    looks: [
      'One row per person, whichever supplier sent them, with the firm, the rate it asked and the stage beside each.',
      'The rate sits beside the firm that asked it, so two suppliers pricing the same skill differently are side by side without anybody building a spreadsheet.',
      'Open the example program as the hiring manager to shortlist somebody and propose an interview.',
    ],
    refuses: [
      {
        says: 'This person has already been submitted to this requirement. First submission wins.',
        then: 'The second firm is told it was second, rather than finding out at the interview.',
        kind: 'BLOCK',
        source: 'src/app/api/submissions/route.ts',
        phrase: 'This person has already been submitted to this requirement. First submission wins.',
      },
      {
        says: '$124/hr is above the $118/hr ceiling you were given',
        then: 'A warning, not a refusal. The supplier can submit, and the client sees the rate against the band before shortlisting.',
        kind: 'WARN',
        source: 'src/app/api/submissions/route.ts',
        phrase: 'ceiling you were given',
      },
    ],
    refusesNote:
      'Only the client can award; a supplier cannot award its own. And a firm cannot submit a person who has not agreed to be represented by it, unless that person is its own employee.',
    flow: { href: '/docs/client#l1-1', label: 'Source to contract, from the client’s desk' },
  },

  {
    slug: 'contracts',
    route: '/contracts',
    n: 3,
    title: 'Contracts & onboarding',
    lede:
      'The award writes the contract, with the contractor, the rate and the dates on it, against the order that holds the ceiling. ' +
      'Before day one the papers are checked: a missing US work form (I-9) or lapsed insurance blocks a start, and the rest warns and takes a reason.',
    screen: {
      img: '/screens/contracts.png',
      alt: 'A contracts table: six contracts at one client, each naming the order it sits on, the consultant, the bill rate, the dates and the status.',
      caption:
        `The program manager at ${NORTHBEND}. Six contracts, three active, each on the order it bills against, ` +
        'with the bill rate, the dates, and whether it is tagged to a master contract.',
      from: '/dashboard/contracts, table view, as the program manager',
      capturedAt: '2026-09-28T19:09:31Z',
    },
    capabilities: [
      { t: 'The award writes the contract', d: 'The person, the bill rate, the dates and the job request, on a sell line and a buy line.' },
      { t: 'An order with a ceiling', d: 'One order per supplier, a line per person. The order carries the ceiling; the line carries the rate.' },
      { t: 'Ways to be engaged', d: 'W-2 through the supplier, their own company, independent, or contract to hire. A type your company does not accept is a block.' },
      { t: 'Papers that block a start', d: 'An I-9, general liability and workers’ compensation cover, and a professional license where the job needs one.' },
      { t: 'Papers that warn', d: 'A background check or an NDA still outstanding. The contract can start with a reason recorded.' },
      { t: 'The MSA is optional', d: 'A client that sends one order and one contractor is never made to paper an agreement first.' },
    ],
    complaint: {
      text:
        'The contract says one rate and the purchase order says another. ' +
        'The person started three weeks before anyone found the I-9 was missing.',
      whose: 'The onboarding team, at a company with contractors from four suppliers.',
      gloss:
        'Three documents, written by three people from three copies of the same conversation. Each was right when it was written. ' +
        'Nothing tied them to each other, so nothing noticed when they drifted.',
    },
    does: [
      'Awarding a candidate writes the paperwork. The sell line carries the person, the bill rate, the dates and the job request. ' +
        'The buy line carries how the person is engaged, and the rate on it is the rate that was awarded.',
      'An order is one document with a line per person. The client calls it a purchase order and the supplier calls it a sales order. ' +
        'There is no second copy to drift.',
      'A contract is activated only when the papers clear. An I-9, liability and workers’ compensation cover, and a license where the job needs one block a start until they are on file.',
      'A background check or an NDA still outstanding warns, and the contract can start with a reason recorded against the name of whoever gave it.',
    ],
    stages: { steps: ['Award', 'Contract', 'Order'], under: 'written together, never re-keyed' },
    looks: [
      'Every contract at your sites, whichever supplier holds it, with the order it bills against in the first column.',
      'A contract not yet on an order says so, rather than leaving a blank somebody has to interpret.',
      'Open the example program as the program manager and open any contract to see the paperwork it is waiting on.',
    ],
    refuses: [
      {
        says: 'Priya Raghunathan cannot start without I-9 and E-Verify.',
        then: 'Get it on file, then activate. A missing I-9, lapsed cover and a lapsed license block a start, and nobody can wave them through.',
        kind: 'BLOCK',
        source: 'src/lib/contract-clearance.ts',
        phrase: 'cannot start without',
      },
      {
        says: 'Still waiting on background check for Ravi Adebayo. The contract can start with a reason recorded.',
        then: 'The reason is kept with the name of whoever gave it. The verdict on a background check is the screening provider’s, never Etyme’s.',
        kind: 'WARN',
        source: 'src/lib/contract-clearance.ts',
        phrase: 'The contract can start with a reason recorded.',
      },
    ],
    refusesNote:
      'A worker type your company does not accept is a block, not a warning. An order cannot be raised to your own W-2 employee, because there is nothing to buy.',
    flow: { href: '/docs/client#l1-2', label: 'Contract to onboard, from the client’s desk' },
  },

  {
    slug: 'timesheets',
    route: '/timesheets',
    n: 4,
    title: 'Timesheets & expenses',
    lede:
      'The contractor files their own week, or the supplier that employs them does. ' +
      'The manager who owns the work signs it, nobody approves their own hours, and a week that looks wrong is flagged before anybody signs.',
    screen: {
      img: '/screens/timesheets.png',
      alt: 'A timesheets screen: weeks waiting for a signature and weeks approved, each with the person, the period, the hours, the bill rate and the value, one of them a 44-hour week over the hours.',
      caption:
        `The hiring manager at ${NORTHBEND}. Weeks waiting for a signature sit beside weeks already approved, each at its bill rate, ` +
        'and one 44-hour week runs over the job’s hours and waits on a decision.',
      from: '/dashboard/timesheets as the hiring manager',
      capturedAt: '2026-09-28T19:09:34Z',
    },
    capabilities: [
      { t: 'Filed once, against the contract', d: 'By the person or their employer. Never twice for one week.' },
      { t: 'Nobody signs their own', d: 'Only the company being billed approves, and a rejection says why.' },
      { t: 'Signed twice', d: 'The client signs so the supplier may bill. The employer accepts so the person is paid.' },
      { t: 'Flagged before anyone signs', d: 'Over twelve hours a day, over sixty a week, over the job’s hours, or past the contract’s end. Warns, never blocks.' },
      { t: 'Reminders before it is due', d: 'At seven, three and one day out.' },
      { t: 'Quiet weeks, approved on a term', d: 'Only if your agreement turns it on, and never a week with a question over it.' },
    ],
    complaint: {
      text:
        'Every Monday the manager gets four spreadsheets in four formats and signs what she is sent. ' +
        'Then the bill arrives with different hours.',
      whose: 'A hiring manager who signs for contractors from three suppliers.',
      gloss:
        'The hours were right when the person wrote them down. They were re-keyed by the supplier, summarized by the prime and copied into the bill. ' +
        'Each copy was a chance to be wrong.',
    },
    does: [
      'A week is filed once, against the contract, by the person or by the supplier that employs them. Submitting locks it. ' +
        'Only the company being billed can approve it, and nobody approves their own hours.',
      'The signed week carries two signatures. The client approves it, so the supplier may bill. The employer accepts it, so the person can be paid.',
      'Before anyone signs, the sheet is read. More than twelve hours in a day, sixty in a week, more than the job allows, or a day past the contract’s end is flagged and shown first.',
      'Expenses are filed against the contract in six categories, and only approved, billable expenses reach a bill.',
    ],
    stages: { steps: ['Filed once', 'Signed twice', 'Flagged first'], under: 'nobody approves their own' },
    looks: [
      'The flagged week sits on top, with the decision it needs and the hours in question.',
      'Approved weeks sit under it with the bill rate and what each week is worth, so the manager signs a number rather than a spreadsheet.',
      'Open the example program as the hiring manager to approve a week, or approve one anyway with a reason.',
    ],
    refuses: [
      {
        says: 'Nobody approves their own hours.',
        then: 'The person who filed the week cannot sign it. Only the company being billed approves.',
        kind: 'BLOCK',
        source: 'src/app/api/timesheets/[id]/approve/route.ts',
        phrase: 'Nobody approves their own hours.',
      },
      {
        says: '44h claimed on a 40h-a-week role.',
        then: 'Flagged and shown first. The manager who owns the work decides, and an approval anyway carries the reason on the signature.',
        kind: 'WARN',
        source: 'src/lib/timesheet-flag.ts',
        phrase: 'h-a-week role.',
      },
    ],
    refusesNote:
      'Nothing here re-keys hours. The number the person wrote is the number every firm above them bills from.',
    flow: { href: '/docs/client#l1-3', label: 'Work to approve, from the client’s desk' },
  },

  {
    slug: 'invoices',
    route: '/invoices',
    n: 5,
    title: 'Bills & the three-way check',
    lede:
      'A supplier’s bill is paid only when it passes. The three-way check: the hours, the bill, and the contract rate must all agree. ' +
      'Where they do not, nothing is paid and the reason is a sentence.',
    screen: {
      img: '/screens/invoices.png',
      alt: 'A bills screen: the outstanding total, an aging breakdown, and a table of supplier bills with the period, the total and what is paid.',
      caption:
        `The accounts payable clerk at ${NORTHBEND}. Two supplier bills open, one paid this period, ` +
        '$17,400 outstanding and none of it overdue.',
      from: '/dashboard/invoices, what we owe, as the AP clerk',
      capturedAt: '2026-09-28T19:09:20Z',
    },
    capabilities: [
      { t: 'Billed from signed hours', d: 'A supplier bills only from weeks the client already signed.' },
      { t: 'The three-way check', d: 'Signed hours, bill, contract rate. A line with no signed week behind it is never paid.' },
      { t: 'Room on the order', d: 'A bill past what is left on the order waits for the order to be raised, or a reason with a name on it.' },
      { t: 'The rate is the contract’s', d: 'A rate that differs from the contract is not waived on a bill. It is a contract change.' },
      { t: 'Never paid twice', d: 'A week already on another bill fails the check, and nobody can override it.' },
      { t: 'Money moves two ways', d: 'A supplier is paid against its bill. An employee is paid by payroll. Nobody sees a rate above their own.' },
    ],
    complaint: {
      text:
        'Three suppliers bill on three cycles into two inboxes. By the time finance has the quarter assembled, the quarter is over. ' +
        'Nobody can say which bill belongs to which signed week.',
      whose: 'The finance team, at a company buying through more than one staffing supplier.',
      gloss:
        'Every supplier’s bill is right by its own lights. Each was built from its own copy of the hours, keyed in again at each level of the chain.',
    },
    does: [
      'The signed week is the receipt. Two companies sign it, and one row of hours travels the whole chain, so the hours the client approved are the hours everybody bills from.',
      'A bill is checked line by line: a signed week behind each line, hours billed against hours approved, the rate against the contract, and room on the order.',
      'Where a check fails, the bill is not paid and the screen says which check and why. Some checks take a reason and a name; the missing week and the double billing never do.',
    ],
    stages: { steps: ['Signed hours', 'Bill', 'Contract rate'], under: 'all three agree, or not paid' },
    looks: [
      'What is outstanding, how old it is, and a row per supplier bill with its period, total and what has been paid.',
      'Open any bill for the check itself: each test, passed or failed, in a sentence.',
      'Open the example program as the AP clerk to see what is waiting on a decision.',
    ],
    refuses: [
      {
        says: 'No line on this invoice is backed by an approved timesheet or expense',
        then: 'Not paid, and nobody can waive it. The week is waiting on the manager who owns it, and finance can see who has it.',
        kind: 'BLOCK',
        source: 'src/lib/three-way-match.ts',
        phrase: 'No line on this invoice is backed by an approved timesheet or expense',
      },
      {
        says: 'PO-2026-SET8P has $3,200 left; this invoice is $7,400, over by $4,200',
        then: 'Not paid until the order is raised, or somebody with the authority records a reason. The reason keeps their name.',
        kind: 'WARN',
        source: 'src/lib/three-way-match.ts',
        phrase: 'this invoice is',
      },
    ],
    refusesNote:
      'Money leaves in two directions. A supplier’s bill is received and checked against the order behind it. An employee is paid by payroll instead, and sees what they are paid, never what a firm above them charges.',
    flow: { href: '/docs/client#l1-5', label: 'Approve to pay, from the client’s desk' },
  },

  {
    slug: 'compliance',
    route: '/compliance',
    n: 6,
    title: 'Compliance & tenure',
    lede:
      'Tenure is counted per contractor at your company, across every supplier and every assignment, and a day on site counts once. ' +
      'Your time limit is how long one person may work at your company. Etyme blocks at the time limit and warns before it.',
    screen: {
      img: '/screens/compliance.png',
      alt: 'A tenure table: four people, the suppliers each came through, the months counted across all of them against an 18 month time limit, and whether each is fine, approaching, or in a break.',
      caption:
        `The program manager at ${NORTHBEND}. Fourteen months through two suppliers, counted as one person at 78% of an eighteen month time limit. ` +
        'One person is in a break until 7 November.',
      from: '/dashboard/tenure as the program manager',
      capturedAt: '2026-09-28T19:09:37Z',
    },
    capabilities: [
      { t: 'Tenure per person', d: 'Across every supplier and assignment. A day on site counts once, and only days already served count.' },
      { t: 'Warns at three quarters', d: 'Of your time limit. The default time limit is eighteen months and the default break in service is thirty days.' },
      { t: 'Blocks at the time limit', d: 'No new award, extension or start until the break is served, and the screen shows the date.' },
      { t: 'Insurance that stops submissions', d: 'A supplier with no current liability or workers’ compensation cover on file can submit nobody.' },
      { t: 'Visas watched', d: 'A visa inside ninety days of running out is marked as expiring.' },
      { t: 'Rate parity, reported', d: 'The same job filled by two suppliers at two prices, and how far apart. Reported, not enforced.' },
    ],
    complaint: {
      text:
        'One person worked fourteen months through one supplier, three through a second and two through a third. ' +
        'That is nineteen months on site, and none of the three suppliers can see the other two.',
      whose: 'The HR team, at a company with an eighteen month limit.',
      gloss:
        'Each supplier’s count is honest and each is wrong, because each starts the clock the day it placed the person. ' +
        'The only party who could add the three together is the client.',
    },
    does: [
      'Tenure belongs to the person, not the assignment. Etyme adds up every day on site at your company across all suppliers, counts an overlapping day once, and counts only days already served.',
      'The time limit and the break in service are your settings. At three quarters of the time limit the row turns to a warning.',
      'At the time limit, a new award, extension or start is blocked with a sentence that says why. A returning person inside a break is shown the date they are eligible, instead of a button.',
      'The same desk watches the papers. A supplier whose cover has lapsed can submit nobody until it is back in date, and every check writes a row with its outcome.',
    ],
    stages: { steps: ['Counted per person', 'Warns at three quarters', 'Blocks at the time limit'], under: 'and says why' },
    looks: [
      'One row per person, with every supplier they came through on the same row, and the months counted across all of them.',
      'The status says fine, approaching, or in a break, and a break shows the date the person is eligible again.',
      'Open the example program as the program manager or the compliance officer to read everybody’s tenure.',
    ],
    refuses: [
      {
        says: 'Kwame Mensah has 24 months tenure (cap: 18).',
        then: 'Blocked. No extension, award or start until the break is served. The screen shows the date, and nobody can wave it through.',
        kind: 'BLOCK',
        source: 'src/lib/governance.ts',
        phrase: 'months tenure (cap: ',
      },
      {
        says: 'Lucía Fernández is at 14 of 18 months (78% of cap)',
        then: 'A warning at three quarters of the time limit, so the manager sees the end coming with four months to plan rather than four days.',
        kind: 'WARN',
        source: 'src/lib/governance.ts',
        phrase: '% of cap)',
      },
    ],
    refusesNote:
      'Rate parity is reported, not enforced. What to do about two prices for one job is your call, and a rate above the band is a warning that takes a reason.',
    flow: { href: '/docs/client#l1-7', label: 'Govern and protect, from the client’s desk' },
    // Moved from the home page's #exposure, 2026-09-27. The business case
    // follows the hook and never leads, so it sits on the station whose
    // exposure it describes rather than on the front door.
    more: {
      id: 'cost',
      title: 'What it costs when nobody can answer',
      paragraphs: [
        'Nobody is fined on the day a contractor passes eighteen months. ' +
          'There is no tenure regulator, and most companies have never been caught by any of this.',
        'The cost today is the three weeks and the wrong number. ' +
          'The cost when somebody finally checks is one of these three.',
      ],
      items: [
        {
          t: 'A co-employment claim counts every supplier together',
          d:
            'One contractor can work two years on your site through two suppliers. ' +
            'The claim lands on you, not on the supplier that billed the first year. ' +
            'Etyme counts days per person across suppliers and blocks the award at your limit.',
        },
        {
          t: 'A supplier whose insurance lapsed keeps working',
          d:
            'Cover runs out in March and its contractors are on your site in April. ' +
            'Nobody watches the date on the certificate, because it lives in an inbox. ' +
            'Etyme reads the dates on the certificate and stops a start until the supplier renews it.',
        },
        {
          t: 'A bill is paid with no signed timesheet behind it',
          d:
            'It matched no timesheet and no order line. It was paid because the month ' +
            'closes and somebody has to approve it. ' +
            'Etyme pays only bills that match a signed week and an order.',
        },
      ],
    },
  },

  {
    slug: 'chain',
    route: '/chain',
    n: 7,
    title: 'The chain',
    lede:
      'Your supplier, the firm it buys from, and the firm that employs the contractor on your site. ' +
      'Each firm sees only the level it buys and sells at, and hours are filed once and billed up the chain from the same signed week.',
    screen: {
      img: '/screens/chain.png',
      alt: 'A contractor’s page at a client: seven months into an eighteen month time limit across every supplier, supplied through the supplier the client pays, with one firm below it that is not named.',
      caption:
        `The program manager at ${NORTHBEND}, reading one contractor. She is here through the supplier the client pays, at the rate the client pays, ` +
        'with one firm below them that the page does not name.',
      from: '/dashboard/people/[id] for a contractor supplied through a chain, as the program manager',
      capturedAt: '2026-09-28T19:09:40Z',
    },
    capabilities: [
      { t: 'Every step recorded', d: 'Client, supplier, the firm it buys from, the employer. Each firm buys from the one below it.' },
      { t: 'One rate per level', d: 'Each firm sees the rate it pays and the rate it charges, and no other. You see the rate you pay.' },
      { t: 'Names private, standing never', d: 'Your supplier’s sub-vendors stay private unless your agreement with it requires disclosure. Insurance and work authorization are always shown.' },
      { t: 'Hours filed once', d: 'At the bottom of the chain. Each firm above bills the same signed week at its own rate.' },
      { t: 'Forwarded without a price', d: 'A candidate sent up the chain carries no rate from below. A lower onward rate warns.' },
      { t: 'Asked for through the supplier you pay', d: 'Ask for somebody you know, and the ask goes to the supplier you pay for them.' },
    ],
    complaint: {
      text:
        'The company pays one agency. The person on site has an email address from a firm nobody there has heard of. ' +
        'When she was hurt, three firms each said she was somebody else’s.',
      whose: 'The risk team, at a company that buys through a prime supplier.',
      gloss:
        'Subcontracting is normal and mostly fine. The prime keeps the relationship and a smaller firm has the person. ' +
        'What goes wrong is that nobody has written down who employs the person, or who insured them.',
    },
    does: [
      'A placement is a chain of contracts. Each firm sells to the one above and buys from the one below, and the chain ends where a firm employs the person itself.',
      'Your supplier’s rates and its sub-vendors’ names stay private. You always see whether the firm employing the person on your site is insured and authorized.',
      'Where your agreement with a supplier requires disclosure, you see the firm below it by name. That is a term you ask for at signing, and it is off unless you do.',
      'Hours are filed once, at the bottom. Once you approve the week, each firm above bills the same week at its own rate.',
    ],
    stages: { steps: ['One signed week', 'One rate per level', 'Standing at every level'], under: 'however many firms' },
    looks: [
      'The contractor’s own page, as you know her: how long she has been here across every supplier, and who can put her forward.',
      'The engagement names the supplier you pay and the rate you pay, and says that one firm stands below them without naming it.',
      'Open the example program as the program manager and open any contractor who came through a chain.',
    ],
    refuses: [
      {
        says: 'Supplied through Computer Systems Inc.',
        then: 'Computer Systems Inc is a demo company — not a customer. The firm below the supplier you pay is not named, unless your agreement with that supplier requires it. Its insurance and authorization are never hidden.',
        kind: 'BLOCK',
        source: 'src/lib/chain-names.ts',
        phrase: 'Supplied through ',
      },
      {
        says: 'You are sending this on at $98/hr, which is less than the $104/hr you were quoted.',
        then: 'A warning, not a block. A firm may send a candidate up the chain at any price, and it is told when the price is going the wrong way.',
        kind: 'WARN',
        source: 'src/lib/forwarding.ts',
        phrase: 'you were quoted.',
      },
    ],
    refusesNote:
      'A firm cannot submit a person who has not put themselves on its bench, its workers waiting for a project, unless it employs them. A chain deeper than eight firms is treated as a fault in the data, not as a business model.',
    flow: { href: '/docs/prime-vendor', label: 'The chain, from the prime vendor’s desk' },
    // Moved from the home page's #who, 2026-09-27, with the line each for
    // a prime, a sub and a bench vendor. The home page keeps the one
    // paragraph a supplier must read beside the offer to run a program:
    // its rates and its sub-vendors' names stay private, its client stays
    // its client.
    more: {
      id: 'down-the-chain',
      title: 'Etyme sends your job down the chain and records what each supplier sees',
      paragraphs: [
        'You send a job to one supplier. That supplier sends it to another, and that one sends it to the firm that has the person. ' +
          'Today every hop is an email forwarded as it arrived, because editing it takes longer than anybody has. ' +
          'Your company name, your rate and your manager’s words end up two firms past the agreement that covers them.',
        'Etyme describes the end client where the agreement forbids naming it. ' +
          'A medical device maker in the Denver area is enough to price the work. ' +
          'A blind key lets two competing suppliers see that they have submitted the same person, without either learning anything about the other. ' +
          'Every hop records what was sent, to whom, under which agreement, and what was withheld.',
        'The same resume reaches you from more than one supplier. ' +
          'You cannot tell whether a rate is the person’s or the chain’s. ' +
          'Somebody you have used before arrives as a stranger. One record across the chain fixes all three.',
        'Prime, sub and bench are positions on a deal, not kinds of company. ' +
          'The same firm is a prime this week and a sub next week.',
      ],
      items: [
        {
          t: 'A prime',
          d: 'Send a job to your sub without giving up the client’s name, and see a duplicate submission before your client sees it.',
        },
        {
          t: 'A sub',
          d: 'Price a job against the real band before you answer, and get paid on the hours the client approved.',
        },
        {
          t: 'A bench vendor',
          d: 'Your consultant stays unnamed until there is a signed right to represent, and what you are paid never travels in either direction.',
        },
      ],
    },
  },

  {
    slug: 'governance',
    route: '/governance',
    n: 8,
    title: 'Governance',
    lede:
      'Where a limit on contractors or suppliers is legally grounded, Etyme blocks and says why. ' +
      'Everywhere else it warns, takes a reason and lets you proceed. Nothing is silently allowed.',
    screen: {
      img: '/screens/governance.png',
      alt: 'A compliance overview: the client’s contingent workforce policy, with a time limit, a break in service and supplier insurance set to block, and a rate band set to warn.',
      caption:
        `The policy of ${NORTHBEND}, as its program manager reads it. The time limit on how long one person may stay, the break in service and supplier insurance block; ` +
        'the rate band warns and asks for a reason.',
      from: '/dashboard/compliance as the program manager',
      capturedAt: '2026-09-28T19:09:43Z',
    },
    capabilities: [
      { t: 'Blocks where the law is behind it', d: 'Time limit, break in service, work authorization, lapsed supplier insurance, a person signing their own.' },
      { t: 'Warns everywhere else', d: 'Rate band, headcount plan, supplier tier. A reason is recorded and the work proceeds.' },
      { t: 'Every decision written down', d: 'Rule, subject, outcome and reason, even a pass. An override keeps the name of whoever gave it.' },
      { t: 'L0 to L5', d: 'Every action the system takes on its own is graded, from observing and telling somebody to acting on a written rule.' },
      { t: 'Reversible by a person', d: 'What the system did on its own is listed, with a way to put it back where it can be.' },
      { t: 'Reads are logged', d: 'Every read of another person’s data writes a row, refusals included.' },
    ],
    complaint: {
      text:
        'The last system had forty rules and every one was a pop-up somebody clicked past. ' +
        'When the auditor asked who approved the exception, the honest answer was that the system let it through.',
      whose: 'The compliance team, at a company that has already bought one system.',
      gloss:
        'A rule that can be clicked past is a suggestion with a log entry, and the log rarely says who. ' +
        'Systems get there by treating every check the same, until nobody reads any of them.',
    },
    does: [
      'Every check is sorted into one of two kinds before it is written. Where the law is behind a limit, Etyme blocks, and the block is a sentence that says why.',
      'Everywhere else it warns, records a reason and proceeds: a rate outside the band, a headcount plan, a supplier below the tier Procurement set.',
      'Every decision is written down, even a pass, with the name of whoever overrode it. Approving a timesheet without a person is off until your agreement turns it on.',
    ],
    stages: { steps: ['Blocks', 'Warns', 'Records'], under: 'where the law is behind it, everywhere else, and even a pass' },
    looks: [
      'Your own policy, one rule per row, with whether it blocks or warns and the parameters it runs on.',
      'The settings are yours: the time limit, the break, the band. The kind of check is not, because a legal limit that warns is not a limit.',
      'Open the example program as the compliance officer to read the checks recorded on people and firms.',
    ],
    refuses: [
      {
        says: 'Brightmoor Staffing has no current insurance verification on file.',
        then: 'Brightmoor Staffing is a demo company — not a customer. Nobody can be submitted through it until its cover is back in date, and new starts wait for it too.',
        kind: 'BLOCK',
        source: 'src/lib/governance.ts',
        phrase: 'has no current insurance verification on file.',
      },
      {
        says: 'Bill rate $152/hr exceeds maximum $150/hr.',
        then: 'Warned, not blocked. The manager records a reason and proceeds, and the reason stays on the row with their name.',
        kind: 'WARN',
        source: 'src/lib/governance.ts',
        phrase: 'exceeds maximum $',
      },
    ],
    refusesNote:
      'Governance is included for every account, and it is never a paid tier.',
    flow: { href: '/docs/client#l1-7', label: 'Govern and protect, from the client’s desk' },
    // Moved from the home page's #compliance, 2026-09-27. The counts are
    // computed from `lib/autonomy` above rather than typed, and the
    // sentence after them names no ordinal, because "the one that is
    // left" stays true while "the thirteenth" goes stale.
    more: {
      id: 'rules',
      title: 'Most of what runs without being asked is a rule, not a model',
      paragraphs: [
        `${capital(spelled(UNPROMPTED.length))} things in here happen without anybody asking for them. ` +
          `${capital(spelled(BY_RULE.length))} of the ${spelled(UNPROMPTED.length)} are a date, a threshold or a count: ` +
          'a permit running out, an agreement past its term, a retention period that has ended.',
        'The one that is left scores a person against a job, and it falls back to arithmetic when there is no model to call.',
      ],
      items: [
        {
          t: 'Plain rules',
          d:
            'A rate against the band. A permit about to expire. A missing document. The same person submitted twice. ' +
            'Each one is right every time, costs nothing to run, and explains itself in a sentence you can push back on.',
        },
        {
          t: 'A model, on what is left',
          d:
            'It reads CVs, drafts messages and scores a person against a job. Never decides whether someone can legally work. ' +
            'Every score carries what it is made of and what it could not find. A bare number with no explanation is a bug here.',
        },
      ],
    },
  },
]

/** The module at a route, or null. */
export function moduleAt(route: string): ModulePage | null {
  return MODULES.find((m) => m.route === route) ?? null
}

/** Every word a reader sees on a module page, split at the fold. */
export function copyOfModule(m: ModulePage): { hero: string[]; body: string[] } {
  return {
    hero: [m.title, m.lede],
    body: [
      m.screen.caption,
      ...m.capabilities.flatMap((c) => [c.t, c.d]),
      m.complaint.text, m.complaint.whose, m.complaint.gloss,
      ...m.does,
      ...m.stages.steps, m.stages.under,
      ...m.looks,
      ...m.refuses.flatMap((r) => [r.says, r.then]),
      m.refusesNote,
      ...(m.more ? [m.more.title, ...m.more.paragraphs, ...(m.more.items ?? []).flatMap((i) => [i.t, i.d])] : []),
      m.flow.label,
    ],
  }
}
