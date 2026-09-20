import { EtymeLogo } from '@/components/logo'
import { TryDemo } from '@/components/try-demo'
import { Ask } from '@/app/site/ask'
import { ASK_COPY } from '@/lib/public-site/leads'
import Link from 'next/link'
// Typed routes widen a string in an array to `string`, which Link will not
// take. The footer's routes are literals below; the cast is at the render
// rather than on the data so the list stays readable.
import type { Route } from 'next'

/**
 * The front door.
 *
 * ── What it argues, in order ─────────────────────────────────────────
 *
 *   1. what is this        the hero — the category, one comparison, a screen
 *   2. what does it do     #steps — four steps, each one a real screen
 *   3. why do I care       #gap — four questions nobody can answer
 *   4. who runs it         #ways — your own program office, or Etyme’s
 *   5. what does it cost   #exposure — the business case, never first
 *   6. is that real        #lifecycle — one hire, from every desk
 *   7. what changes        #monday — four screens that answer the four
 *   8. does it replace     #alongside — your ATS, your VMS, your suppliers
 *   9. who else is on it   #who — the chain, and the suppliers on it
 *  10. the AI honesty      #compliance
 *  11. what it costs       #why — not settled, and says so
 *
 * ── A real buyer read it. Rewritten 2026-09-20 ───────────────────────
 *
 * The founder gave this page to the CTO of a two-billion-dollar company
 * with forty to fifty IT contractors bought through staffing firms —
 * the exact buyer. He said he did not understand what the app does, and
 * that it looked like an AI app. The founder said "we are SAP
 * Fieldglass" and it connected at once.
 *
 * Two things follow, and both are now guarded in `lib/positioning`.
 *
 *   Screens before sentences. The top of the page is at most six
 *   sentences and then a real screen from the seeded demo, taken at
 *   Northbend Athletic's own desks. A dense table with numbers in it
 *   reads as enterprise software; a paragraph about "a record" reads as
 *   a pitch deck. Every image under `public/screens` names in `from`
 *   the desk and the route it came from, so it can be retaken.
 *
 *   One comparison, named, factual, once. "If you know SAP Fieldglass
 *   or Beeline, it is the same job, sized for a company with fifty
 *   contractors rather than five thousand." The guard that refused any
 *   named company allows exactly that sentence and no other, and makes
 *   no claim about either of them.
 *
 * What came out: the worked-example card in the hero — Priya
 * Raghunathan's placement as five rows of invented data. The dashboard
 * screenshot says the same thing with numbers the product actually
 * produced, which is the difference the CTO was pointing at.
 *
 * ── Outcomes, benefits and methods. Rewritten 2026-09-20 ─────────────
 *
 * The founder read the page and said: "The home page is filled with
 * metaphors rather than outcomes, benefits and methods." He is right,
 * and the structure was not the problem. The words were.
 *
 * So every sentence on this page now says one of three things, and the
 * writing rule is in the file rather than in a chat log:
 *
 *   an outcome  what the client can do or see that they cannot today
 *   a benefit   why that matters, in money, time or risk
 *   a method    how the software does it, concretely
 *
 * And a fourth only where it is literally true: a proof — a demo desk, a
 * screen name, the sentence the software actually says. The three gates
 * below are quoted from `lib/contract-clearance`, `lib/document-stages`
 * and `lib/three-way-match`, and the test reads those files rather than
 * taking this page's word for it.
 *
 * What came out, and what it was standing for:
 *
 *   "That's the gap."                     → what is missing, then what Etyme is
 *   "Including the ones you didn't hire"  → contractors a supplier's subcontractor placed
 *   "Fourteen months, then three, then two"  → 14 + 3 + 2 = 19, said as arithmetic
 *   "a hop into an email client"          → a hop to a company that is not on Etyme
 *   "before lunch instead of by Thursday" → the four screens, named
 *   "a full book behind it, and it is yours to break" → a full month of data
 *
 * Sentences are about twenty words. Nothing here uses a semicolon, an em
 * dash or a parenthetical, because the reader is a program manager who
 * may be reading English as a second language and reads it once.
 *
 * ── Tenure is the moat, not the wedge. Corrected 2026-09-17 ──────────
 *
 * This page used to have a section of its own arguing tenure, placed
 * above everything describing how the product works, on the reasoning
 * that tenure was the sharpest wedge. The founder reversed that:
 * "Tenure is nobody's problem — only you expect it to be solved."
 *
 * A wedge is why they buy. A moat is why they cannot leave. Tenure is a
 * fine moat — once every supplier's contracts for a client sit in one
 * place, a number becomes computable that no VMS and no supplier can
 * produce — and a bad wedge. So the ledger stays, as one question of
 * four, with the arithmetic beside it. It no longer has a section, and
 * it is no longer above the product.
 *
 * ── Who runs the program. Decided 2026-09-20, twice ──────────
 *
 * Etyme now offers to run a client’s program itself, as a vendor-neutral
 * program office. The page carried that as a choice in the hero, in the
 * founder’s own two labels, until he read it the same day: “MSP selling
 * should be undercover selling and more as value addition rather than
 * fully pitching for the market. Remove the threat if any to supply
 * chain.”
 *
 * So the record is what this page sells. The service is one quiet
 * sentence under the record sentence — your own program office runs it,
 * and if you would rather not staff one, Etyme can run it for you on the
 * same record — and #ways explains it in six plain sentences. The two
 * labels stay as sub-headings there, because the founder named them and
 * a buyer knows them, but they no longer lead. Nothing sizes Etyme
 * against an MSP, and `sizesAgainstIncumbents` keeps it that way.
 *
 * Neutrality is unchanged and is said in that section rather than only
 * in the footer: Etyme supplies nobody and runs no bench in either way.
 * A supplier reading this page has to believe that, or it does not put
 * its consultants in the system and there is no network. Nothing here
 * reads as aimed at a supplier either — the rate questions are about
 * what the client itself cannot answer, never about catching anybody,
 * and `readsAsAimedAtSuppliers` reads the whole page for it.
 *
 * ── The hook is the not-knowing; the business case is the exposure ───
 *
 * Two sentences doing two jobs, and the page needs both in that order.
 * People buy because somebody asks a basic question about their own
 * workforce and the honest answer is "I'll get back to you". That
 * happens monthly. They then justify the purchase to finance with what
 * it costs when nobody can answer. The penalty never leads.
 *
 * ── Written to the client ────────────────────────────────────────────
 *
 * The client is the customer, decided 2026-09-10. This page is written
 * to the program manager, the CFO and the procurement lead by name. A
 * hiring manager who reads "primes, subs, bench operators" as four
 * equal audiences concludes this is software for staffing firms and
 * leaves. Suppliers get one plain sub-heading, late, and are welcome.
 *
 * ── Every claim here is checkable ────────────────────────────────────
 *
 * Numbers are what the seeded sandbox produces and are labeled as a
 * worked example where they are one. Nothing here draws a feature that
 * does not exist, which is the only reason a "look around" button can
 * sit beside it. No real company is named; the three programs named at
 * the door are invented firms the seed actually builds.
 */

/**
 * The header nav — Products, Industries, Compliance, Why Etyme.
 *
 * The flat six-word module list it replaced named stations with nothing
 * organizing them. An enterprise buyer evaluating a system of record
 * expects this shape. Every item links to a real section on this page;
 * nothing here promises a screen that does not exist.
 *
 * Industries is deliberately not a set of vertical product pages — the
 * core stays horizontal, and the note under the menu says so, so the
 * menu argues for the positioning it could otherwise contradict.
 */
const NAV_MENUS: { label: string; items: { t: string; d?: string; href: string }[]; note?: string }[] = [
  {
    label: 'Products',
    items: [
      { t: 'What it does, in four steps', d: 'A role goes out, a person starts, a week is signed, a bill is paid.', href: '#steps' },
      { t: 'Your contractors', d: 'Every contractor on site, across every supplier, one row each.', href: '#monday' },
      { t: 'Requisitions & suppliers', d: 'Raised, approved, released to the suppliers you cleared.', href: '#lifecycle' },
      { t: 'Hours, invoices & bills', d: 'Signed hours, and bills matched to the order behind them.', href: '#lifecycle' },
      { t: 'Rates across suppliers', d: 'What each supplier charges for the same skill, side by side.', href: '#monday' },
    ],
  },
  {
    label: 'Industries',
    items: [
      { t: 'Manufacturing & quality', href: '#lifecycle' },
      { t: 'Healthcare & clinical', href: '#lifecycle' },
      { t: 'Skilled trades & field services', href: '#lifecycle' },
      { t: 'Professional & corporate services', href: '#lifecycle' },
    ],
    note: 'One product. No industry-specific version to buy.',
  },
  {
    label: 'Compliance',
    items: [
      { t: 'Work authorization', d: 'Blocked, not warned, where the law is behind it.', href: '#lifecycle' },
      { t: 'Tenure & co-employment', d: 'Counted per person across suppliers, not per assignment.', href: '#exposure' },
      { t: 'Insurance & good standing', d: 'A lapsed certificate stops a start until it is renewed.', href: '#exposure' },
      { t: 'Governance & approvals', d: 'Every override keeps the name of whoever gave it.', href: '#exposure' },
    ],
  },
  {
    label: 'Why Etyme',
    items: [
      { t: 'Who sits at the program office desks', href: '#ways' },
      { t: 'Never runs a bench, never places anybody', href: '#why' },
      { t: 'Governance is never a paid tier', href: '#why' },
      { t: 'Rules first, a model only on what is left', href: '#compliance' },
      { t: 'Free while we prove it out', href: '#why' },
    ],
  },
]

/**
 * What it does, in four steps, each one a real screen.
 *
 * This replaced the worked example that sat in the hero: one
 * contractor's placement as five rows of invented data. It was true to
 * the product and it was still a drawing, and the buyer who read this
 * page said he could not tell what the app does.
 *
 * Each step is two sentences and one screenshot from the seeded demo.
 * `from` is the desk and the route the image came from, so anybody can
 * retake it after a redesign: seat at Northbend Athletic with
 * `POST /api/demo {"as":"world-nike","desk":"..."}` and screenshot the
 * route at 1440×900.
 *
 * Nothing in a caption is a claim the image does not show. The numbers
 * in them are read off the screenshots themselves, which is the only
 * kind of number this page is allowed to carry.
 */
const STEPS: {
  n: string
  t: string
  says: string
  img: string
  alt: string
  caption: string
  from: string
  /**
   * When the image was taken, UTC. Pinned because the seeded world it
   * was photographed from is renamed from time to time — a town, a job
   * title — and a PNG cannot be read by a test. A shot taken before the
   * rename shows a name that no longer exists anywhere else, and the
   * only thing that can catch it is the date beside `from`.
   */
  capturedAt: string
}[] = [
  {
    n: '01',
    t: 'Post a role to the suppliers you cleared',
    says: 'You open a role and release it to the suppliers procurement has cleared. Every supplier submits against the same role, and each person arrives on one screen with the firm that sent them and the rate it asked.',
    img: '/screens/submissions.png',
    alt: 'A Candidates screen: nine people from three suppliers, each row naming the consultant, the role, the supplier, the rate and the stage.',
    caption: 'The hiring manager at Northbend Athletic. Nine people from three suppliers, each row carrying the firm that sent them, the rate it asked and where the person has got to.',
    from: '/dashboard/submissions as the hiring manager',
    capturedAt: '2026-09-20T22:19:07Z',
  },
  {
    n: '02',
    t: 'Interview, choose, and the paperwork is written',
    says: 'Interview rounds are arranged on the record, and the supplier and the candidate are told on their own channels. The award writes the contract with the person, the rate and the dates on it, against the order that holds the ceiling.',
    img: '/screens/purchase-orders.png',
    alt: 'An orders screen: one order per supplier, what is left of what was authorized, and a line naming the person and their rate.',
    caption: 'What Northbend Athletic has authorized. One order per supplier, a line for each person at their own rate, and how much of the ceiling is left to bill against.',
    from: '/dashboard/purchase-orders as the program manager',
    capturedAt: '2026-09-20T22:19:12Z',
  },
  {
    n: '03',
    t: 'Contractors file their weeks and your manager approves them',
    says: 'The contractor files their own week and nobody else may file it for them. The manager who owns the work signs it, and a week over the hours on the role is flagged before anybody signs.',
    img: '/screens/timesheets.png',
    alt: 'A timesheets screen: three weeks waiting on a signature, each row naming the person, the period, the hours, the bill rate and what the week is worth.',
    caption: 'The hiring manager at Northbend Athletic. Three weeks waiting on a signature, with the hours, the bill rate and what each week is worth. One of them is over the hours on the role.',
    from: '/dashboard/timesheets as the hiring manager',
    capturedAt: '2026-09-20T22:19:39Z',
  },
  {
    n: '04',
    t: 'Each supplier bills, and you pay what matched',
    says: 'Every supplier bills on the same screen, against hours your own manager has already signed. A bill with no signed week behind it, or no room left on the order, is not paid.',
    img: '/screens/invoices.png',
    alt: 'An invoices screen: the outstanding total, an aging breakdown, and a table of supplier bills with the period, the total and what is paid.',
    caption: 'The accounts payable clerk at Northbend Athletic. Two supplier invoices open, one paid this period, $17,400 outstanding and none of it overdue.',
    from: '/dashboard/invoices, what we owe, as the AP clerk',
    capturedAt: '2026-09-20T22:19:45Z',
  },
]

/**
 * The four questions a client cannot answer about its own workforce.
 *
 * Not invented for the page. These arrive from a board member, an
 * auditor or a new CFO, and each is answered today by asking every
 * supplier for a spreadsheet and adding them up by hand.
 *
 * Each carries two plain sentences rather than an argument: what
 * happens today, and what happens with Etyme, naming the screen that
 * does it. A reader who stops here has learned four outcomes.
 *
 * Tenure is the fourth of four and gets one line. It is the moat, not
 * the wedge, and a page that leads with it is selling a fear the buyer
 * does not hold. The arithmetic is spelled out because the number is
 * the whole point and nobody believes it in prose.
 */
const CANNOT_ANSWER: { q: string; today: string; etyme: string; detail?: string }[] = [
  {
    q: 'How many contractors are on our sites right now?',
    today: 'Each supplier counts its own contractors. Nobody adds the counts up, and two attempts give two totals.',
    etyme: 'The Workforce screen lists every contractor on site today, one row per person, across every supplier.',
  },
  {
    q: 'What are we spending on them this quarter, and with whom?',
    today: 'Bills arrive on different dates into different inboxes. The quarter ends before the number is assembled.',
    etyme: 'The Program screen shows the quarter by supplier, from bills that matched a signed timesheet and an order.',
  },
  {
    q: 'Are we paying two suppliers different money for the same work?',
    today: 'Rates sit on invitations and in email. Putting them side by side means asking each supplier what it charges.',
    etyme: 'The Rates screen puts every supplier’s rate for the same skill on one screen, with the date each was agreed.',
  },
  {
    q: 'Who has been here longest?',
    today: 'Time through one supplier and time through another read as two contractors, each with less time than the person has.',
    etyme: 'The Tenure screen counts each person’s days on your sites across every supplier, once per day.',
    detail:
      'One person worked 14 months through supplier A, 3 through B, 2 through C. ' +
      'That is 19 months on your site. None of the three suppliers can see the other two.',
  },
]

/**
 * Two of those four questions, answered on the screen that answers them.
 *
 * The four questions above are the hook. A reader who has just been
 * told what they cannot answer is entitled to see the answer rather
 * than read a promise of one, so the two that are hardest to believe —
 * every contractor across every supplier, and one person's months on
 * site counted across all of them — are shown as the screens.
 *
 * `from` is where each image was taken, so it can be retaken.
 */
const ANSWERS: { q: string; img: string; alt: string; caption: string; from: string; capturedAt: string }[] = [
  {
    q: 'How many contractors are on our sites, and whose are they?',
    img: '/screens/contractors.png',
    alt: 'A contractors table: one row per person, with the supplier that sent them, their status, where they are and their months on site.',
    caption: 'Eight people at Northbend Athletic, with the supplier that put each of them forward, the months each has been on site and the date they were last engaged.',
    from: '/dashboard/people, table view, as the program manager',
    capturedAt: '2026-09-20T22:21:34Z',
  },
  {
    q: 'Who has been here longest?',
    img: '/screens/tenure.png',
    alt: 'A tenure table: four people, the vendors each worked through, the months counted across all of them, and the standing against an 18 month cap.',
    caption: 'The same people counted across suppliers. Fourteen months through two firms against an eighteen month cap, and one person in a break until 30 October.',
    from: '/dashboard/tenure as the program manager',
    capturedAt: '2026-09-20T22:20:18Z',
  },
]

/**
 * Who sits at the program office desks, in the buyer’s own two labels.
 *
 * Decided 2026-09-20: a client runs the program with its own people, or
 * Etyme runs it for them on the same record. The labels are the
 * buyer’s rather than ours because a program manager has already
 * evaluated things called both of those.
 *
 * ── Shrunk the same day, on the founder ──────────────────────────────
 *
 * “MSP selling should be undercover selling and more as value addition
 * rather than fully pitching for the market.” So the record is the way,
 * and the service is the quiet second option: three plain sentences
 * saying what a client gets, who holds the seats, and what happens if
 * the service ends. It argues with nobody and it is sized against
 * nobody.
 *
 * What is deliberately not here: any suggestion that Etyme supplies the
 * people in either one. The paragraph under both says so, because a
 * supplier reading this page has to believe it before it will put its
 * consultants in the system.
 */
const TWO_WAYS: { label: string; lines: string[] }[] = [
  {
    label: 'VMS software',
    lines: [
      'Your own program office runs the program on Etyme.',
      'You keep the desks you already staff, and you pay nobody to run them.',
      'Your people hold the program seats. Etyme holds the record, the rules and the trail behind every decision.',
    ],
  },
  {
    label: 'MSP provider',
    lines: [
      'You get a program office without hiring one.',
      'Etyme staff sit in seats your company grants them, work to your rules, and every read they make is logged.',
      'The record stays yours if the service ends.',
    ],
  },
]

/**
 * The business case, which is not the reason anybody buys.
 *
 * People buy because they cannot answer the four questions above. They
 * justify the purchase to finance with these three. Each one is a risk
 * and then the method that closes it, in that order, because a risk
 * with no method under it is a scare.
 */
const EXPOSURE: { t: string; p: string }[] = [
  {
    t: 'A co-employment claim counts every supplier together',
    p:
      'One contractor can work two years on your site through two suppliers. ' +
      'The claim lands on you, not on the supplier that billed the first year. ' +
      'Etyme counts days per person across suppliers and blocks a new submission at your limit.',
  },
  {
    t: 'A supplier whose insurance lapsed keeps working',
    p:
      'Cover runs out in March and its contractors are on your site in April. ' +
      'Nobody watches the date on the certificate, because it lives in an inbox. ' +
      'Etyme reads the dates on the certificate and stops a start until the supplier renews it.',
  },
  {
    t: 'A bill is paid with no signed timesheet behind it',
    p:
      'It matched no timesheet and no order line. It was paid because the month ' +
      'closes and somebody has to approve it. ' +
      'Etyme pays only bills that match a signed week and an order.',
  },
]

/**
 * How a placement moves — six milestones, not eighteen states.
 *
 * This was eighteen numbered stages, which is the internal lifecycle
 * printed on a marketing page. It broke the product's own rule: three
 * words, not nineteen states. That rule exists because the 2017
 * timeline exposed the cycle engine's own enum to users, and the
 * eighteen-stage grid was doing it to a stranger who had not signed up.
 *
 * gate: true marks the three milestones that can stop the deal rather
 * than only record it.
 */
const LIFECYCLE: { t: string; d: string; gate?: boolean }[] = [
  { t: 'Raised', d: 'A manager needs somebody, with a budget and a rate band', gate: true },
  { t: 'Released', d: 'To the suppliers your program office cleared' },
  { t: 'Awarded', d: 'One person, one seat, and the order that pays for it', gate: true },
  { t: 'Cleared', d: 'Work authorization, checks and insurance, before day one', gate: true },
  { t: 'Working', d: 'Hours signed, bills matched, everybody paid' },
  { t: 'Ended', d: 'Notice, handover, and the days on site keep counting' },
]

/**
 * Four questions, four screens that already exist.
 *
 * `route` is the screen it opens and the test checks the folder is
 * really there. A page describing a screen nobody built is the exact
 * failure the positioning guard exists to stop.
 *
 * Written to the desks that ask: the program manager opens the first,
 * the CFO reads the second and the third, procurement lives in the
 * fourth.
 */
const MONDAY = [
  {
    screen: 'Program',
    route: 'program',
    desk: 'The program manager',
    q: 'What needs me today, and what are we spending?',
    a:
      'It opens on one sentence: what needs you today, and how much of it is urgent. ' +
      'Under that: on site now, suppliers, this month, ending soon. ' +
      'Every number is a link to the rows behind it.',
  },
  {
    screen: 'Workforce',
    route: 'people',
    desk: 'The CFO',
    q: 'How many contractors do we have, and whose are they?',
    a:
      'One row per person, not one per contract. A contractor bought through a prime ' +
      'and a sub is one person on your site, counted once. The row carries the contract ' +
      'you pay, never another supplier’s margin.',
  },
  {
    screen: 'Rates',
    route: 'rate-history',
    desk: 'The procurement lead',
    q: 'Are we paying two suppliers differently for the same work?',
    a:
      'Every rate, the date it changed and who agreed it. The spread across suppliers ' +
      'for one skill is a number no single supplier can show you, because each one ' +
      'knows only its own.',
  },
  {
    screen: 'Tenure',
    route: 'tenure',
    desk: 'The compliance officer',
    q: 'Who has been here longest?',
    a:
      'Days on your sites, added up across every supplier that has ever supplied them, ' +
      'counted once per day however many firms billed it. It is shown against your own ' +
      'limit, with the contracts that make the number.',
  },
]

/**
 * The three gates, quoted from the code that says them.
 *
 * A buyer who does not believe the software refuses anything has read a
 * dashboard, not a control. So the page quotes the refusal rather than
 * describing it, and `proof` is the part of the sentence that is a
 * literal in `source` — the test opens that file and looks. A gate
 * reworded on this page and not in the product fails the build.
 *
 * `says` is what a reader sees on the screen, with the runtime names
 * filled in from the worked example above.
 */
const GATES: { when: string; says: string; why: string; source: string; proof: string[] }[] = [
  {
    when: 'When a start is blocked, the screen says:',
    says: 'Priya Raghunathan cannot start without an I-9. Get an I-9 on file, then activate.',
    why: 'A missing background check warns instead of blocking. Whoever proceeds gives a reason, and the reason is kept on the record.',
    source: 'src/lib/contract-clearance.ts',
    proof: ['cannot start without', 'on file, then activate.'],
  },
  {
    when: 'When a supplier’s cover has lapsed, the screen says:',
    says: 'Nobody can be submitted through Brightmoor Talent until it is back in date.',
    why: 'Etyme reads the dates on the certificate. Cover that begins next month does not cover a contractor starting this week.',
    source: 'src/lib/document-stages.ts',
    proof: ['Nobody can be submitted through', 'until it is back in date'],
  },
  {
    when: 'When a bill has no signed timesheet behind it, the screen says:',
    says: 'No line on this invoice is backed by an approved timesheet or expense. Nobody can wave this through.',
    why: 'The bill waits on the accounts payable desk until a signed week and an order line sit behind it.',
    source: 'src/lib/three-way-match.ts',
    proof: ['No line on this invoice is backed by an approved timesheet or expense', 'Nobody can wave this through'],
  },
]

/**
 * The supply side, in three lines, near the end.
 *
 * This was "Who this is for": the company hiring, the prime, the sub
 * and the bench operator, four columns of equal weight. Speaking to
 * four audiences is speaking sharply to none.
 *
 * Subtle is not absent. The network only works because the suppliers
 * are on it, and a supplier who reads this page as hostile does not
 * join. So the section is a client narrative about the chain the client
 * already buys through, and these three lines sit at the end of it: one
 * outcome each, for what changes on Monday.
 */
const SUPPLY = [
  {
    who: 'A prime',
    line:
      'Send a role to your sub without giving up the client’s name, and see a ' +
      'duplicate submission before your client sees it.',
  },
  {
    who: 'A sub',
    line:
      'Price a role against the real band before you answer, and get paid on the ' +
      'hours the client approved.',
  },
  {
    who: 'A bench vendor',
    line:
      'Your consultant stays unnamed until there is a signed right to represent, ' +
      'and what you are paid never travels in either direction.',
  },
]

/** What is settled about the commercials, in the absence of a price. */
const DECIDED = [
  {
    t: 'Governance is never a paid tier',
    p:
      'Tenure caps, approval chains and the record of who approved what are ' +
      'included for everybody. Any company with two hiring managers needs them. ' +
      'Charging extra for them loses the deal before the negotiation starts.',
  },
  {
    t: 'Etyme never runs a bench and never places anybody',
    p:
      'We sit between the firms that do. The moment we compete with our own ' +
      'suppliers, they stop putting their people in the system and the network ' +
      'stalls. It is built into how this works, not a policy we might change.',
  },
  {
    t: 'Looking around costs nothing and needs no card',
    p:
      'You get a live workspace with a worked example in it, and you can change ' +
      'anything in there. If it is not useful in there, a price was never going ' +
      'to fix that.',
  },
]

/**
 * Whether the census door is open.
 *
 * The census is the first step for a client weighing the MSP provider
 * service: it sends what it already has on its contractors, and one
 * named person sends back a single page saying who is on its sites,
 * what it is spending, and what could not be seen.
 *
 * It was false until 2026-09-20, because a link to a page that is not
 * there costs more trust than no link at all. `src/app/census/page.tsx`
 * now exists, with the four steps behind it, so the door is open. The
 * positioning test reads both the constant and the page file, so the
 * two cannot disagree again.
 */
const CENSUS_IS_OPEN = true

/**
 * The three seeded programs named at the door.
 *
 * Invented companies, and the page says so where it names them. Three
 * real enterprises were named here until 2026-09-15 — they were the
 * seeded demo tenants, and above a button they read as three live
 * customers. `__tests__/invariants/demo-names.test.ts` refuses the old
 * names coming back anywhere; `lib/positioning` refuses any real
 * company on this page at all.
 *
 * What each says is read off `app/demo/seats.ts`, which is read off the
 * seed. The Cavanaugh line said "a certificate that runs out in twelve
 * days" until 2026-09-20 and the seed never built one, which is the
 * reason this list says what is behind the door rather than what would
 * sound good above it.
 */
const PROGRAMS = [
  { name: 'Northbend Athletic', what: 'Three suppliers. One supplies through a bench vendor the client never sees. A week of hours waits for a signature.' },
  { name: 'Cavanaugh Glassworks', what: 'One contractor is on site on a purchase order with no agreement behind it. Somebody starts soon with no I-9 on file.' },
  { name: 'Talvern Medical', what: 'One contractor is on site across two suppliers, past the limit the program sets. Neither supplier can produce that number.' },
]

/**
 * The footer.
 *
 * Three legal pages shipped and nothing pointed at them, so they were
 * live and invisible. A client's security review finds a document by
 * looking in the footer; finding nothing there is indistinguishable
 * from a company that never wrote one.
 *
 * What is deliberately not here: no About, no Careers, no Blog, no
 * status page, no social links, no street address, no support mailbox.
 * Every one of those is a link to something that does not exist, and a
 * footer full of dead links costs more trust than a short one.
 *
 * The three legal documents each say on their own face that they are
 * drafts written from the code and not yet reviewed by a lawyer. The
 * footer says it before the click rather than after it.
 */
const FOOTER: { heading: string; links: { label: string; href: string }[]; note?: string }[] = [
  {
    heading: 'The product',
    links: [
      { label: 'Four questions you cannot answer', href: '#gap' },
      { label: 'Who sits at the desks', href: '#ways' },
      { label: 'What it costs when nobody can answer', href: '#exposure' },
      { label: 'One hire, from every desk', href: '#lifecycle' },
      { label: 'What changes on Monday', href: '#monday' },
      { label: 'The chain you buy through', href: '#who' },
      { label: 'What it costs', href: '#why' },
    ],
  },
  {
    heading: 'Start',
    links: [
      { label: 'Look around an example program', href: '/demo' },
      { label: 'Ask us something', href: '#contact' },
      { label: 'Sign in', href: '/login' },
    ],
    note: 'No card and no sign-up to look. A person reads what you send.',
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms of service', href: '/terms' },
      { label: 'Privacy notice', href: '/privacy' },
      { label: 'Data processing addendum', href: '/dpa' },
    ],
    note: 'Drafts, written from the code itself and not yet reviewed by a lawyer. Each one says so on its face, and lists what counsel still has to decide.',
  },
]

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-etyme-canvas">
      {/* ── The header ───────────────────────────────────────── */}
      {/* Every label below renders through {expr} rather than as literal
          JSX text, so the menu cannot shift the hero words the founder
          signed off — `lib/positioning` reads text nodes in source
          order, and "Sign in" is deliberately the first of them. */}
      <header className="border-b border-etyme-rule">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-3 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Etyme — home">
            <EtymeLogo size="md" />
          </Link>

          <ul className="ml-6 hidden items-center gap-1 text-sm lg:flex">
            {NAV_MENUS.map((menu) => (
              <li key={menu.label} className="group relative">
                <button
                  type="button"
                  className="rounded-md px-3 py-2 text-etyme-muted transition-colors
                             hover:text-etyme-ink focus-visible:text-etyme-ink focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-etyme-action/40"
                >
                  {menu.label}
                </button>
                <div
                  className="invisible absolute left-0 top-full z-20 w-72 -translate-y-1 pt-2
                             opacity-0 transition-all duration-100
                             group-hover:visible group-hover:translate-y-0 group-hover:opacity-100
                             group-focus-within:visible group-focus-within:translate-y-0
                             group-focus-within:opacity-100"
                >
                  <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-2 shadow-xl">
                    {menu.items.map((item) => (
                      <a
                        key={item.t}
                        href={item.href}
                        className="block rounded-lg px-3 py-2.5 hover:bg-etyme-canvas"
                      >
                        <span className="block text-[13px] font-medium text-etyme-ink">
                          {item.t}
                        </span>
                        {item.d && (
                          <span className="mt-0.5 block text-[12px] leading-snug text-etyme-muted">
                            {item.d}
                          </span>
                        )}
                      </a>
                    ))}
                    {menu.note && (
                      <p className="mt-1 border-t border-etyme-rule px-3 pt-2 text-[11px] text-etyme-faint">
                        {menu.note}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Link
            href="/login"
            className="ml-auto rounded-lg border border-etyme-rule px-4 py-2 text-sm font-medium
                       text-etyme-muted transition-colors hover:border-etyme-ink hover:text-etyme-ink"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      {/* Category first, the way Concur says travel and expense before
          it says anything clever — and then the product itself, before
          another sentence about it.

          Rebuilt 2026-09-20 after the CTO of a two-billion-dollar
          company with forty to fifty contractors read the old one and
          said he could not tell what the app does. Five sentences and
          then a screen: the eyebrow is the category in the words a
          buyer already uses, the headline is the line the founder
          signed off, the subhead is concrete nouns only, and the
          comparison names the two systems he would recognize, once,
          factually, with no claim about either.

          The screenshot under it is the program dashboard at Northbend
          Athletic, an invented company the seed builds, taken from
          /dashboard/program as the program manager. The worked-example
          card that stood beside the headline is gone: it said the same
          thing in invented rows, and invented rows are what a pitch
          deck is made of. */}
      <section className="border-b border-etyme-rule">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16">
          <p className="eyebrow mb-4">
            Vendor management system
          </p>
          <h1 className="mb-6 max-w-[18ch] text-balance font-serif text-[40px] font-normal
                         leading-[1.03] tracking-[-0.02em] text-etyme-ink md:text-[60px]">
            Every contractor. Every supplier. One record.
          </h1>
          <p className="mb-5 max-w-[62ch] text-[19px] leading-relaxed text-etyme-ink md:text-[21px]">
            See every contractor on your sites, which supplier sent them, what they
            cost, and how long they have been there. Approve their timesheets. Pay
            one matched invoice per supplier.
          </p>
          {/* The one named comparison on the whole page. It is here
              because the founder said "we are SAP Fieldglass" to a buyer
              who had read three paragraphs without understanding any of
              them, and it landed at once. Factual, once, and it says
              nothing about either product — `lib/positioning` allows
              this sentence and refuses every other named company. */}
          <p className="mb-9 max-w-[62ch] text-[16px] leading-relaxed text-etyme-muted">
            A vendor management system for companies with twenty to two hundred
            contractors. If you know SAP Fieldglass or Beeline, it is the same job,
            sized for a company with fifty contractors rather than five thousand.
          </p>

          <figure className="overflow-hidden rounded-xl border border-etyme-rule
                             bg-etyme-raised shadow-sm">
            {/* Taken from the seeded demo world on the date stamped on the
                image below, UTC — the same stamp the step screens carry
                beside `from`. A test cannot read a PNG, so the date is
                the only thing that can tell a shot taken before a rename
                in the demo world from one taken after it. */}
            <img
              src="/screens/program-dashboard.png"
              data-captured-at="2026-09-20T22:18:50Z"
              alt="The program dashboard: a sentence saying whether anything needs the reader today, then six numbers — on site, suppliers, this month, ending soon, the tenure cap and requirements — over a list of who is starting soon and which suppliers are on site."
              width={1440}
              height={900}
              className="block h-auto w-full border-b border-etyme-rule"
            />
            <figcaption className="px-5 py-3.5 text-[13px] leading-relaxed text-etyme-muted">
              The program manager’s desk at Northbend Athletic, an invented company in
              the example program. Three contractors on site through three suppliers,
              $60,000 this month, one person near the cap.
            </figcaption>
          </figure>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* One door for companies, not two. Demand and supply are
                positions on a deal, not properties of a firm — a prime
                is demand toward its sub and supply toward its client on
                the same placement — so a page that forked on it asked a
                question a third of the market cannot answer. */}
            <TryDemo
              side="HIRING"
              asks
              label="Open an example program →"
              className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                         shadow-sm transition-opacity hover:opacity-90"
            />
            <a
              href="#steps"
              className="px-2 py-3.5 text-sm font-medium text-etyme-muted underline
                         underline-offset-4 transition-colors hover:text-etyme-ink"
            >
              What it does, in four steps →
            </a>
          </div>
          {/* The primary door is a client desk and everything else is a
              text link, because this page is written to the company
              hiring. The contractor's own door stays reachable all the
              same — a person who is the work is not an audience to drop,
              and `__tests__/invariants/demo-candidate.test.ts` holds it
              here and at the close. */}
          <p className="mt-5 max-w-[52ch] font-mono text-[12px] leading-relaxed text-etyme-muted">
            No card, no sign-up. You land at a program manager’s desk in an invented
            company with a full month of data in it.{' '}
            <TryDemo
              side="CANDIDATE"
              label="See it as a candidate →"
              className="text-etyme-muted underline underline-offset-2 hover:text-etyme-ink"
            />
          </p>

          {/* Now that the list has been shown, the page may use the word
              for it. The offer to run the program is the quiet sentence
              under it, once, and a reader may take it or leave it —
              "MSP selling should be undercover selling and more as value
              addition rather than fully pitching for the market." */}
          <div className="mt-10 grid gap-8 border-t border-etyme-rule pt-8 md:grid-cols-2">
            <div>
              <p className="text-[17px] leading-relaxed text-etyme-ink md:text-[19px]">
                Etyme keeps one record of every contractor across every staffing
                supplier you use.
              </p>
              <p className="mt-3 text-[16px] leading-relaxed text-etyme-muted">
                Your own program office runs it. If you would rather not staff one,
                Etyme can run it for you on the same record.
              </p>
            </div>
            <p className="border-l-2 border-etyme-rule pl-4 text-[15px] leading-relaxed
                          text-etyme-ink">
              Requisition, suppliers, submissions, screening, interviews, onboarding,
              timesheets, invoices, compliance. One record holds all of it, and each
              desk opens the part that is its own.
            </p>
          </div>
        </div>
      </section>

      {/* ── What it does, in four steps ───────────────────────────── */}
      {/* The answer to "I do not understand what the app does", and it
          is four screens rather than four claims. Each step is two
          sentences and one image from the seeded demo, and nothing in a
          caption is a number the image does not show.

          Why four and not ten: a CTO recognizes post, choose, approve,
          pay. The ten stations of a placement are in #lifecycle below,
          where somebody who wants them will look. */}
      <section id="steps" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <p className="eyebrow mb-3">What it does, in four steps</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            A role goes out, a person starts, a week is signed, a bill is paid
          </h2>
          <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
            Every screen below is the example program as it stands today. You can open
            all four and change anything in them.
          </p>

          <ol className="mt-12 space-y-16">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="grid gap-6 md:grid-cols-[0.8fr_1.2fr] md:items-start md:gap-10"
              >
                <div>
                  <span className="block font-mono text-[11px] tabular-nums text-etyme-faint">
                    {s.n}
                  </span>
                  <h3 className="mt-2 text-balance font-serif text-[23px] leading-snug text-etyme-ink">
                    {s.t}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-etyme-muted">{s.says}</p>
                </div>
                <figure className="overflow-hidden rounded-xl border border-etyme-rule
                                   bg-etyme-raised shadow-sm">
                  <img
                    src={s.img}
                    alt={s.alt}
                    width={1440}
                    height={900}
                    loading="lazy"
                    className="block h-auto w-full border-b border-etyme-rule"
                  />
                  <figcaption className="px-5 py-3.5 text-[13px] leading-relaxed text-etyme-muted">
                    {s.caption}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The hook: four questions ─────────────────────────────── */}
      {/* Nobody is fined at month nineteen, and a page that opens on the
          penalty is selling a fear the buyer does not hold — "we have
          never been caught" is true and it ends the conversation. Being
          asked how many contractors you have and not knowing happens
          monthly. Each question carries Today and With Etyme, so the
          reader gets four outcomes rather than four complaints. */}
      <section id="gap" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <p className="eyebrow mb-3">Why this matters</p>
          <h2 className="max-w-[32ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            Etyme shows every contractor on your sites, including contractors your
            suppliers’ subcontractors placed
          </h2>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="max-w-[44ch] font-serif text-[21px] leading-snug text-etyme-ink md:text-[25px]">
                You can name every employee on your payroll. Nobody can name
                every contractor on your sites.
              </p>
              <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-etyme-muted">
                A supplier hired almost all of them. Sometimes a supplier’s
                subcontractor did. They badge in on Monday and turn up on a bill
                at the end of the month. No system you own counts them the same
                way twice.
              </p>
              <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-etyme-ink">
                A CFO, an auditor or a board member asks how many contractors you
                have. The program manager says: let me come back to you. Then
                three weeks of asking every supplier for a spreadsheet, and
                procurement chasing the two that do not reply. The number that
                comes back is one nobody fully trusts.
              </p>
              <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-etyme-muted">
                No supplier can add that up, and no supplier is hiding anything.
                Each one sees only its own contractors. A VMS sees inside one
                program. You cannot get the total by asking, because nobody you
                could ask is holding all of it. Etyme records every contract from
                every supplier in one place and adds them up.
              </p>
            </div>

            <ul className="space-y-px overflow-hidden rounded-xl border border-etyme-rule bg-etyme-rule">
              {CANNOT_ANSWER.map((item) => (
                <li key={item.q} className="bg-etyme-raised px-5 py-4">
                  <p className="text-balance font-serif text-[19px] leading-snug text-etyme-ink">
                    {item.q}
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-etyme-faint">
                      Today
                    </span>{' '}
                    {item.today}
                  </p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-etyme-ink">
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em]"
                          style={{ color: 'var(--color-verified)' }}>
                      With Etyme
                    </span>{' '}
                    {item.etyme}
                  </p>
                  {item.detail && (
                    <p className="mt-2 border-t border-etyme-rule pt-2 text-[13px] leading-relaxed text-etyme-ink">
                      {item.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Two of the four, answered by the screen that answers them.
              A reader who has just been told what they cannot answer is
              entitled to see the answer rather than a promise of one. */}
          <div className="mt-14 border-t border-etyme-rule pt-10">
            <p className="max-w-[54ch] text-[17px] leading-relaxed text-etyme-ink">
              Here are two of those answers, on the screens that give them.
            </p>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              {ANSWERS.map((a) => (
                <figure
                  key={a.img}
                  className="overflow-hidden rounded-xl border border-etyme-rule
                             bg-etyme-raised shadow-sm"
                >
                  <img
                    src={a.img}
                    alt={a.alt}
                    width={1440}
                    height={900}
                    loading="lazy"
                    className="block h-auto w-full border-b border-etyme-rule"
                  />
                  <figcaption className="px-5 py-3.5">
                    <span className="block text-[13px] font-semibold text-etyme-ink">{a.q}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-etyme-muted">
                      {a.caption}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Who sits at the desks ────────────────────── */}
      {/* It comes after the four questions and before the business case,
          because a reader who has just been shown what they cannot
          answer asks who is going to do something about it. The record
          is the way, and the service is the quiet second option — the
          founder asked on 2026-09-20 for it to be sold as a value added
          rather than pitched. The two labels are the buyer’s own and
          they sit inside the section rather than leading it. The
          paragraph under both is the neutrality commitment, said in the
          one place a reader is weighing whether to hand Etyme the
          program. */}
      <section id="ways" className="border-b border-etyme-rule scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <p className="eyebrow mb-3">Who sits at the desks</p>
          <h2 className="max-w-[28ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            The record is the product, and your own people run the program on it
          </h2>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
            Most clients staff the program office themselves. If you would rather
            not, Etyme can sit at those desks instead. The record is the same
            either way and it stays yours.
          </p>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-etyme-rule
                          bg-etyme-rule md:grid-cols-2">
            {TWO_WAYS.map((w) => (
              <div key={w.label} className="bg-etyme-raised p-6 md:p-7">
                <h3 className="text-[15px] font-semibold text-etyme-ink">{w.label}</h3>
                {w.lines.map((line, i) => (
                  <p
                    key={line}
                    className={
                      i === 0
                        ? 'mt-3 text-[16px] leading-relaxed text-etyme-ink'
                        : 'mt-2.5 text-[15px] leading-relaxed text-etyme-muted'
                    }
                  >
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-8 max-w-[62ch] border-t border-etyme-rule pt-6">
            <h3 className="text-[17px] font-semibold text-etyme-ink">
              What Etyme never does in either way
            </h3>
            <p className="mt-2 text-[16px] leading-relaxed text-etyme-ink">
              It never supplies a contractor and never runs a bench, so it has no
              reason to favor one supplier.
            </p>
            <p className="mt-2 text-[16px] leading-relaxed text-etyme-muted">
              Your people keep the decisions that are yours: which roles to open, who
              to hire, and what to approve.
            </p>
          </div>
        </div>
      </section>

      {/* ── The business case, after the hook ────────────────────── */}
      {/* Two sentences doing two jobs. The hook is the not-knowing; this
          is what it costs when nobody can answer, and it is what goes on
          the paper to finance. It never leads. */}
      <section id="exposure" className="border-b border-etyme-rule scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <p className="eyebrow mb-3">What you write for finance</p>
          <h2 className="max-w-[24ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            What it costs when nobody can answer
          </h2>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
            Nobody is fined on the day a contractor passes eighteen months. There
            is no tenure regulator, and most companies have never been caught by
            any of this. The cost today is the three weeks and the wrong number.
            The cost when somebody finally checks is one of these three.
          </p>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {EXPOSURE.map((e) => (
              <div key={e.t} className="border-t-2 border-etyme-attention pt-5">
                <h3 className="mb-2 text-[17px] font-semibold leading-snug text-etyme-ink">{e.t}</h3>
                <p className="text-[15px] leading-relaxed text-etyme-muted">{e.p}</p>
              </div>
            ))}
          </div>

          {/* What stood here until 2026-09-20: “An MSP normally wants a
              program of hundreds of contractors. Etyme’s program office
              takes programs with five to fifteen suppliers.” It is a
              competitive claim about firms nobody here has spoken to, on
              behalf of a service nobody has yet delivered, and it tells
              the reader they are the client the real ones would not
              take. `sizesAgainstIncumbents` keeps it off. */}

          <p className="mt-10 max-w-[58ch] border-t border-etyme-rule pt-6 text-[15px]
                        leading-relaxed text-etyme-muted">
            Where a limit is legally grounded, Etyme blocks and says why. Rate
            bands, headcount plans and supplier tiers warn, take a reason, and
            let you proceed. Nothing here is ever silently allowed, and every
            override keeps the name of whoever gave it.
          </p>
        </div>
      </section>

      {/* ── One hire, from every desk ────────────────────────────── */}
      {/* Six milestones. This was eighteen numbered stages, which is the
          internal lifecycle printed on a marketing page — the same
          mistake the 2017 timeline made when it showed users the cycle
          engine's own enum. Three words, not nineteen states.

          The three gates are the part a buyer does not believe until it
          is written down, so the page quotes what the screen says. */}
      <section id="lifecycle" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">One hire, from every desk</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            One hire moves through six milestones, and three of them can stop it
          </h2>
          <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
            The hiring manager raises it, HR reads the role, procurement audits
            the suppliers, and the lead who owns the cost center signs the money.
            The supplier submits, you award, compliance clears the start, the
            plant signs the week, and accounts payable pays what matched. Nobody
            signs their own. The three in clay can stop the deal. The other three
            record what happened.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg
                          border border-etyme-rule bg-etyme-rule sm:grid-cols-2
                          md:grid-cols-3 lg:grid-cols-6">
            {LIFECYCLE.map((s, i) => (
              <div
                key={s.t}
                className="p-4"
                style={{
                  background: s.gate ? 'var(--color-raised)' : 'var(--color-surface)',
                  boxShadow: s.gate ? 'inset 3px 0 0 var(--color-attention)' : undefined,
                }}
              >
                <span className="block font-mono text-[10px] tabular-nums text-etyme-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="mt-1 block text-[14px] font-semibold leading-snug text-etyme-ink">
                  {s.t}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-etyme-muted">
                  {s.d}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-8 max-w-[58ch] text-[15px] leading-relaxed text-etyme-ink">
            Here are the three that stop it, in the words the screen uses.
          </p>

          <ul className="mt-4 grid gap-6 md:grid-cols-3">
            {GATES.map((g) => (
              <li key={g.says} className="border-t border-etyme-rule pt-4">
                <p className="font-mono text-[11px] leading-snug text-etyme-faint">{g.when}</p>
                <p className="mt-1.5 text-[15px] font-semibold leading-snug"
                   style={{ color: 'var(--color-attention)' }}>
                  {g.says}
                </p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-etyme-muted">{g.why}</p>
              </li>
            ))}
          </ul>

          <p className="mt-8 max-w-[58ch] text-[14px] leading-relaxed text-etyme-muted">
            Inside, a placement moves through more states than six. Nobody using
            it has to learn any of them. It is one record, end to end, for one
            company or for nine of them in a chain.
          </p>
        </div>
      </section>

      {/* ── What changes ─────────────────────────────────────────── */}
      {/* The four questions from the hook, and the four screens that
          answer them — named with the route, so a test can check the
          screen exists rather than taking the page's word for it. */}
      <section id="monday" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 scroll-mt-6">
        <p className="eyebrow mb-3">What changes on Monday</p>
        <h2 className="max-w-[24ch] text-balance font-serif text-3xl leading-tight
                       tracking-[-0.02em] text-etyme-ink md:text-[42px]">
          Four screens answer the four questions
        </h2>
        <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-etyme-muted">
          Today each of these takes a phone call, a spreadsheet and a guess.
          Every figure on these four screens comes off work that was recorded: a
          signed timesheet, a matched bill, a day on site. You can open all four
          in the example program.
        </p>

        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {MONDAY.map((m) => (
            <div key={m.screen} className="rounded-xl border border-etyme-rule bg-etyme-raised p-6">
              <div className="flex items-baseline justify-between gap-3">
                <p className="stat-label">{m.screen}</p>
                <p className="font-mono text-[11px] text-etyme-faint">{m.desk}</p>
              </div>
              <h3 className="mt-2 text-balance font-serif text-[21px] leading-snug text-etyme-ink">
                {m.q}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-etyme-muted">{m.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Does it replace what I have ──────────────────────────── */}
      {/* This was thirteen-pixel gray text under an arrow diagram and it
          is the most useful sentence on the page. */}
      <section id="alongside" className="border-y border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.85fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">What it sits beside</p>
              <h2 className="max-w-[20ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-[42px]">
                Keep your ATS, your VMS and every supplier you already use
              </h2>
              <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-etyme-muted">
                Etyme sits in front of the systems you already use and replaces
                none of them. There is nothing to switch off and no supplier to
                drop. Your suppliers submit and bill on Etyme, and what Etyme
                adds is the one record across all of them.
              </p>
            </div>

            <ul className="space-y-6">
              <li className="border-t border-etyme-rule pt-4">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  Work arrives the way it already does
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-etyme-muted">
                  Paste in a forwarded email, a role description, or five of them
                  at once. They come back as seats, with duplicates already
                  merged. Nobody has to change how they send you work.
                </p>
              </li>
              <li className="border-t border-etyme-rule pt-4">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  Your suppliers do not need to sign up first
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-etyme-muted">
                  Paste the distribution list you already use. You can send a role
                  today to every firm on it, whether or not it has an Etyme
                  account. A hop to a company that is not on Etyme leaves the
                  record, and the screen says so.
                </p>
              </li>
              <li className="border-t border-etyme-rule pt-4">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  What is yours stays yours
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-etyme-muted">
                  Your rates, your suppliers and your contractors’ records stay
                  yours. Every list exports to CSV from the screen it is on.
                  Anybody this system holds data about can ask for a copy of it,
                  or ask to be forgotten, from their own page.
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Who else is on it ────────────────────────────────────── */}
      {/* The client is the customer, decided 2026-09-10. The suppliers
          are here because their client is, and they get one plain
          sub-heading at the end — not four audiences as equals, which is
          how a hiring manager came away believing this was software for
          staffing firms. */}
      <section id="who" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 scroll-mt-6">
        <p className="eyebrow mb-3">The chain you already buy through</p>
        <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                       tracking-[-0.02em] text-etyme-ink md:text-[42px]">
          Etyme sends your role down the chain and records what each supplier sees
        </h2>
        <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
          You send a role to one supplier. That supplier sends it to another, and
          that one sends it to the firm that has the person. Today every hop is
          an email forwarded as it arrived, because editing it takes longer than
          anybody has. Your company name, your rate and your manager’s words end up
          two firms past the agreement that covers them.
        </p>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-ink">
          Etyme describes the end client where the agreement forbids naming it. A
          medical device maker in the Denver area is enough to price the work. A
          blind key lets two competing suppliers see that they have submitted the
          same person, without either learning anything about the other. Every
          hop records what was sent, to whom, under which agreement, and what was
          withheld.
        </p>
        <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-etyme-muted">
          The same resume reaches you from more than one supplier. You cannot
          tell whether a rate is the person’s or the chain’s. Somebody you
          have used before arrives as a stranger. One record across the chain
          fixes all three.
        </p>

        <div className="mt-12 rounded-xl border border-etyme-rule bg-etyme-surface p-6 md:p-8">
          <p className="max-w-[58ch] text-[15px] leading-relaxed text-etyme-ink">
            <span className="font-semibold">If you are a staffing supplier</span>{' '}
            you are on it because your client is, and nothing about it competes
            with you. Your rates and the names of your own sub-vendors stay
            private at every step, in both directions, at any depth. Your client
            stays your client.
          </p>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-etyme-muted">
            Etyme never supplies a person and never runs a bench. Prime, sub and
            bench are positions on a deal, not kinds of company. The same firm is
            a prime this week and a sub next week.
          </p>

          <ul className="mt-6 grid gap-5 sm:grid-cols-3">
            {SUPPLY.map((s) => (
              <li key={s.who} className="border-t border-etyme-rule pt-3">
                <p className="stat-label">{s.who}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-etyme-muted">{s.line}</p>
              </li>
            ))}
          </ul>

          <p className="mt-6 max-w-[58ch] border-t border-etyme-rule pt-4 text-[14px]
                        leading-relaxed text-etyme-muted">
            Where Etyme runs a client’s program, none of that changes. Approvals
            come back faster, your bills are matched and paid without chasing,
            and the spreadsheets stop.
          </p>
        </div>
      </section>

      {/* ── Rules first, model second ────────────────────────────── */}
      {/* The heading used to say "about half of what looks like AI here
          is not", which nobody could check. The count is from
          lib/autonomy, which names every action this system takes, and
          the test recomputes it rather than trusting the words. The
          denominator is on the page for the same reason: it is the count
          of unprompted actions, not the whole product. The last sentence
          names no ordinal on purpose — the count grows every time
          somebody adds an action, and "the one that is left" stays true
          while "the thirteenth" goes stale. */}
      <section id="compliance" className="border-y border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">What runs on its own</p>
              <h2 className="max-w-[26ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-[42px]">
                Most of what runs without being asked is a rule, not a model
              </h2>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-etyme-muted">
                Twenty-three things in here happen without anybody asking for
                them. Twenty-two of the twenty-three are a date, a threshold or a count: a
                permit running out, an agreement past its term, a retention
                period that has ended. The one that is left scores a person
                against a role, and it falls back to arithmetic when there is no
                model to call.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
                <p className="stat-label" style={{ color: 'var(--color-verified)' }}>
                  Plain rules
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-etyme-muted">
                  A rate against the band. A permit about to expire. A missing
                  document. The same person submitted twice. Each one is right
                  every time, costs nothing to run, and explains itself in a
                  sentence you can push back on.
                </p>
              </div>
              <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
                <p className="stat-label">A model, on what is left</p>
                <p className="mt-2 text-[15px] leading-relaxed text-etyme-muted">
                  It reads CVs, drafts messages and scores a person against a
                  role. Never decides whether someone can legally work. Every
                  score carries what it is made of and what it could not find. A
                  bare number with no explanation is a bug here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What it costs ────────────────────────────────────────── */}
      {/* A page with no price makes a reader assume enterprise sales and
          leave. We do not have one yet, so it says that rather than
          nothing — and says what is settled, which is the shape. */}
      <section id="why" className="border-b border-etyme-rule scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <p className="eyebrow mb-3">What it costs</p>
          <h2 className="max-w-[22ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            There is no price on this page because we have not settled one
          </h2>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
            Etyme is free while we prove it out with the first five firms.
            Founding firms keep the terms we agree with them, in writing, before
            they start. We will not put a number on this page that we would have
            to take back later.
          </p>
          {/* The shape of the fee, with no number in it, said once and
              plainly because it is a fact a supplier will read. A
              program office is paid by the suppliers as a percentage of
              what they bill, and what matters on a public page is that a
              supplier reads it here rather than discovering it when they
              join. The number is the founder’s and does not exist yet. */}
          <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-ink">
            Where Etyme runs the program, it is paid the way program offices are
            paid: a percentage the suppliers pay on their billings, disclosed to
            every supplier when they join.
          </p>
          <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-ink">
            Three things about the money are settled already, because they would
            be expensive to change later.
          </p>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {DECIDED.map((d) => (
              <div key={d.t} className="border-t-2 border-etyme-ink pt-5">
                <h3 className="mb-2 text-[17px] font-semibold text-etyme-ink">{d.t}</h3>
                <p className="text-[15px] leading-relaxed text-etyme-muted">{d.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The door ─────────────────────────────────────────── */}
      {/* One call to action: a client desk in a seeded program. The
          three firms named here are inventions the seed actually
          builds, and the page says they are invented — three real
          enterprises stood here until 2026-09-15 and read as three live
          customers. The supplier door is second and quieter, because a
          supplier is welcome and is not who this page is written to. */}
      <section className="border-b border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="max-w-[24ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            Sit at the program office desk and ask it the four questions
          </h2>

          {/* The first step for a client considering the MSP provider
              service, and the first thing it gets back is a page rather
              than a call. Behind CENSUS_IS_OPEN until /census exists. */}
          {CENSUS_IS_OPEN && (
            <p className="mt-6 max-w-[56ch] rounded-xl border border-etyme-rule bg-etyme-raised
                          p-5 text-[15px] leading-relaxed text-etyme-muted">
              <span className="font-semibold text-etyme-ink">
                If you are considering Etyme as your MSP provider
              </span>{' '}
              start with a census. You send what you already hold on your
              contractors, and a named person sends back one page. It names who is
              on your sites, what you are spending, and what your own files could
              not answer.{' '}
              <Link
                href={'/census' as Route}
                className="text-etyme-action underline underline-offset-4 hover:opacity-80"
              >
                Start with a census →
              </Link>
            </p>
          )}

          <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-etyme-muted">
            You land at a program manager’s desk in an invented company with a
            full month of data in it. Each program has several suppliers, a history
            across them, and something waiting at every desk. The companies are
            invented. Everything under them behaves as it would with yours.
          </p>

          <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-etyme-rule
                         bg-etyme-rule sm:grid-cols-3">
            {PROGRAMS.map((p) => (
              <li key={p.name} className="bg-etyme-raised px-5 py-4">
                <p className="text-[15px] font-semibold text-etyme-ink">{p.name}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-etyme-muted">{p.what}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link
              href="/demo"
              className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                         shadow-sm transition-opacity hover:opacity-90"
            >
              Pick a client desk →
            </Link>
            <span className="font-mono text-[12px] text-etyme-muted">
              No card. No sign-up. Nothing to uninstall afterwards.
            </span>
          </div>

          <p className="mt-10 max-w-[56ch] border-t border-etyme-rule pt-6 text-[15px]
                        leading-relaxed text-etyme-muted">
            <span className="font-semibold text-etyme-ink">If you supply into a program instead</span>{' '}
            there is a supplier’s desk in the same example world, with its own
            bench, its own bills, and the client above it.{' '}
            <TryDemo
              side="BENCH"
              label="Sit at a supplier’s desk →"
              className="text-etyme-action underline underline-offset-4 hover:opacity-80"
            />
          </p>

          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-etyme-muted">
            <span className="font-semibold text-etyme-ink">If you are on a contract yourself</span>{' '}
            a contractor gets their own page, with the week they filed, what they
            are paid, and what this system holds about them.{' '}
            <TryDemo
              side="CANDIDATE"
              label="See it as a candidate →"
              className="text-etyme-action underline underline-offset-4 hover:opacity-80"
            />
          </p>
        </div>
      </section>

      {/* ── The ask ──────────────────────────────────────────────── */}
      {/* Quiet on purpose, and last. A page that opens with a form is a
          page that wants something before it has given anything.

          The words are in src/lib/public-site/leads.ts so a test can read
          them: no newsletter, no sequence, no price. */}
      <section id="contact" className="scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">{ASK_COPY.eyebrow}</p>
              <h2 className="max-w-[18ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-4xl">
                {ASK_COPY.heading}
              </h2>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-etyme-muted">
                {ASK_COPY.body}
              </p>
            </div>
            <Ask source="HOME_PAGE" />
          </div>
        </div>
      </section>

      <footer className="border-t border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <EtymeLogo size="md" />
              <p className="mt-4 max-w-[32ch] text-[14px] leading-relaxed text-etyme-muted">
                The system of record for contingent workers: the layer between a
                company and every staffing supplier it uses.
              </p>
              <p className="mt-3 max-w-[32ch] text-[13px] leading-relaxed text-etyme-faint">
                Etyme never runs a bench and never places anybody.
              </p>
            </div>

            {FOOTER.map((group) => (
              <div key={group.heading}>
                <p className="stat-label">{group.heading}</p>
                <ul className="mt-3 space-y-2">
                  {group.links.map((l) => (
                    <li key={l.href}>
                      {l.href.startsWith('#') ? (
                        <a
                          href={l.href}
                          className="text-[14px] leading-snug text-etyme-muted underline-offset-2
                                     transition-colors hover:text-etyme-ink hover:underline"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link
                          href={l.href as Route}
                          className="text-[14px] leading-snug text-etyme-muted underline-offset-2
                                     transition-colors hover:text-etyme-ink hover:underline"
                        >
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                {group.note && (
                  <p className="mt-3 max-w-[30ch] text-[12px] leading-snug text-etyme-faint">
                    {group.note}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-3
                          border-t border-etyme-rule pt-6">
            <p className="font-mono text-[11px] text-etyme-faint">
              © {new Date().getFullYear()} Etyme Inc.
            </p>
            <p className="font-mono text-[11px] text-etyme-faint">
              Requisition to invoice, across every supplier.
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
