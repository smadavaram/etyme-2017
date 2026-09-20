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
 *   1. what is this        the hero — the category, then the span
 *   2. why do I care       #gap — four questions nobody can answer
 *   3. what does it cost   #exposure — the business case, never first
 *   4. is that real        #lifecycle — one hire, from every desk
 *   5. what changes        #monday — four screens that answer the four
 *   6. does it replace     #alongside — your ATS, your VMS, your suppliers
 *   7. who else is on it   #who — the chain, over the client's shoulder
 *   8. the AI honesty      #compliance
 *   9. what it costs       #why — not settled, and says so
 *
 * ── Tenure is the moat, not the wedge. Corrected 2026-09-17 ──────────
 *
 * This page used to have a section of its own arguing tenure, placed
 * above everything describing how the product works, on the reasoning
 * that tenure was the sharpest wedge. The founder reversed that:
 * "Tenure is nobody's problem — only you expect it to be solved."
 *
 * He is right. Cross-supplier identity resolution is a beautiful
 * engineering problem, and a builder mistakes a problem that is
 * satisfying to solve for one somebody is paying to have solved. Nobody
 * wakes up worried about month nineteen; there is no tenure regulator;
 * "we have never been caught" is usually true.
 *
 * A wedge is why they buy. A moat is why they cannot leave. Tenure is a
 * fine moat — once every supplier's contracts for a client sit in one
 * place, a number becomes computable that no VMS and no supplier can
 * produce — and a bad wedge. So the ledger stays, as one question of
 * four, in one line with the arithmetic beside it. It no longer has a
 * section, and it is no longer above the product.
 *
 * ── The hook is the not-knowing; the business case is the exposure ───
 *
 * Two sentences doing two jobs, and the page needs both in that order.
 * People buy because somebody asks a basic question about their own
 * workforce and the honest answer is "I'll get back to you". That
 * happens monthly. They then justify the purchase to finance with what
 * it costs when somebody stops accepting the caveat — a co-employment
 * claim, a supplier whose cover lapsed in March, a bill paid with no
 * signed week behind it. The penalty never leads.
 *
 * ── Written to the client, read over the shoulder ────────────────────
 *
 * The client is the customer, decided 2026-09-10. This page is written
 * to the program manager, the CFO and the procurement lead by name. A
 * hiring manager who reads "primes, subs, bench operators" as four
 * equal audiences concludes this is software for staffing firms and
 * leaves. The suppliers come anyway, because their client is here — so
 * the chain gets one section, late, and the page never turns to face it.
 *
 * ── Every claim here is checkable ────────────────────────────────────
 *
 * Numbers are what the seeded sandbox produces and are labeled as a
 * worked example where they are one. Nothing here draws a feature that
 * does not exist, which is the only reason a "look around" button can
 * sit beside it. No real company is named; the three programs named at
 * the door are invented firms the seed actually builds.
 *
 * ── Why the drawing is a grid and not the lane diagram ───────────────
 *
 * `docs/lanes/streams.mjs` renders the same ten stations as a ten-lane
 * swim-lane SVG, and it is the better picture — for a reader at a desk
 * with a wide screen and ten minutes. It is a thousand pixels wide,
 * needs horizontal scroll on a phone, and lives in a file no domain
 * owns and this page may not import into the Next build. So the six
 * milestones below stay a grid that stacks, and the lane drawing stays
 * where it is good: the party documents and the competitive page.
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
      { t: 'Your contractors', d: 'Everybody on site, across every supplier, one row each.', href: '#monday' },
      { t: 'Requisitions & suppliers', d: 'Raised, approved, released to the firms you cleared.', href: '#lifecycle' },
      { t: 'Hours, invoices & bills', d: 'Signed hours, bills matched to the order behind them.', href: '#lifecycle' },
      { t: 'Rates across suppliers', d: 'What each firm charges for one skill, side by side.', href: '#monday' },
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
      { t: 'Tenure & co-employment', d: 'Added up across suppliers, not per assignment.', href: '#exposure' },
      { t: 'Insurance & good standing', d: 'A start date is a floor; a lapse stops the work.', href: '#exposure' },
      { t: 'Governance & approvals', d: 'Every override keeps the name of whoever gave it.', href: '#exposure' },
    ],
  },
  {
    label: 'Why Etyme',
    items: [
      { t: 'Never runs a bench, never places anybody', href: '#why' },
      { t: 'Governance is never a paid tier', href: '#why' },
      { t: 'Rules first, a model only on what is left', href: '#compliance' },
      { t: 'Free while we prove it out', href: '#why' },
    ],
  },
]

/**
 * One contractor, end to end.
 *
 * The point of a system of record is that it holds the parts nobody
 * else joins up: the submission, the interview, the order, the hours
 * and the bill, for one person, through the firm that supplied her.
 *
 * A shortlist sat in this slot once and made the whole page read as a
 * hiring tool, which is what a shortlist is.
 */
const RECORD = [
  { when: 'Submitted', what: '2 Sep', detail: '$78/hr · screened and cleared' },
  { when: 'Interviewed', what: '9 Sep', detail: 'two rounds · offer made' },
  { when: 'Started', what: '1 Oct', detail: 'PO NW-40118 · cost center EA-4100' },
  { when: 'Hours', what: '152', detail: '4 weeks signed by the plant' },
  { when: 'Billed', what: '$11,856', detail: '45 day terms · matched to the order' },
]

/**
 * The four questions a client cannot answer about its own workforce.
 *
 * Not invented for the page. These arrive from a board member, an
 * auditor or a new CFO, and each is answered today by asking every
 * supplier for a spreadsheet and adding them up by hand.
 *
 * They are the hook, and they are deliberately not compliance
 * questions. Tenure is the fourth of four and gets one line — it is the
 * moat, not the wedge, and a page that leads with it is selling a fear
 * the buyer does not hold.
 */
const CANNOT_ANSWER: { q: string; today: string; detail?: string }[] = [
  {
    q: 'How many contractors are on our sites right now?',
    today: 'Each supplier knows its own. Nobody adds them up, and whoever tries gets a different total the second time.',
  },
  {
    q: 'What are we spending on them this quarter, and with whom?',
    today: 'Bills arrive on different rhythms into different inboxes. The quarter’s number gets assembled after the quarter.',
  },
  {
    q: 'Are we paying two suppliers different money for the same work?',
    today: 'Rates sit on invitations and in email. Nobody can put them side by side without asking each firm what it charges.',
  },
  {
    q: 'Who has been here longest?',
    today: 'Twelve months through one supplier and twelve through another read as two contractors with a year each.',
    detail: 'Fourteen months, then three, then two — nineteen on your site, and none of the three firms can see the other two.',
  },
]

/**
 * The business case, which is not the reason anybody buys.
 *
 * People buy because they cannot answer the four questions above. They
 * justify the purchase to finance with these. Both sentences are needed
 * and the order is not interchangeable: a page that opens on the
 * penalty is selling a fear the buyer does not hold, and "we have never
 * been caught" ends that conversation because it is true.
 */
const EXPOSURE: { t: string; p: string }[] = [
  {
    t: 'Co-employment, on a number you never had',
    p:
      'Twelve months through one supplier and twelve through another is the same ' +
      'person on your site for two years. The claim is made against you, not ' +
      'against the firm that billed the first year.',
  },
  {
    t: 'A supplier whose cover lapsed in March',
    p:
      'Its people were on your site in April. Nobody was told, because nobody ' +
      'was watching the date on a certificate that lives in somebody’s inbox.',
  },
  {
    t: 'A bill paid with no signed week behind it',
    p:
      'It matched no timesheet and no order line. It was paid because the month ' +
      'closes and somebody has to approve it before it does.',
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
  { t: 'Raised', d: 'A manager needs somebody, with a budget and a band', gate: true },
  { t: 'Released', d: 'To the suppliers your program office cleared' },
  { t: 'Awarded', d: 'One person, one seat. The order and its first line', gate: true },
  { t: 'Cleared', d: 'Authorization, checks, insurance. An I-9 blocks', gate: true },
  { t: 'Working', d: 'Hours signed, bills matched, everybody paid' },
  { t: 'Ended', d: 'Notice, handover — and time on site keeps counting' },
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
      'Opens on a sentence about you — six things need you, six are urgent, or ' +
      'nothing does. Under it: on site now, suppliers, this month, ending soon. ' +
      'Every number is a link to the rows that made it.',
  },
  {
    screen: 'Workforce',
    route: 'people',
    desk: 'The CFO’s first question',
    q: 'How many contractors do we have, and whose are they?',
    a:
      'One row per person, not one per contract. Somebody bought through a prime ' +
      'and a sub is one person on your site, counted once — with the contract you ' +
      'actually pay on the row, never somebody else’s margin.',
  },
  {
    screen: 'Rates',
    route: 'rate-history',
    desk: 'The procurement lead',
    q: 'Are we paying two suppliers differently for the same work?',
    a:
      'Every rate, when it changed and who agreed it. The spread across suppliers ' +
      'for one skill is a number no single supplier can show you, because each ' +
      'one only knows its own.',
  },
  {
    screen: 'Tenure',
    route: 'tenure',
    desk: 'Compliance, once a quarter',
    q: 'Who has been here longest?',
    a:
      'Days on site, added up across every supplier that has ever supplied them, ' +
      'counted once per day however many firms billed for it. Against your own ' +
      'cap, with the contracts that made the number.',
  },
]

/**
 * The three gates, in the words the refusal actually uses.
 *
 * A refusal says what is missing and what to do, never a code. These
 * are the three places the product stops a deal instead of recording
 * it, and a buyer who does not believe the software refuses anything
 * has read a dashboard, not a control.
 */
const GATES: { says: string; why: string }[] = [
  {
    says: 'No I-9, no start.',
    why: 'The refusal names the person and says what to get on file. A missing background check warns instead, and keeps the reason somebody gave.',
  },
  {
    says: 'Cover that lapsed in March stops the work in March.',
    why: 'Not the week somebody noticed. A certificate that starts next month does not cover a person starting this week, either.',
  },
  {
    says: 'A bill with no signed week behind it is not paid.',
    why: 'It becomes a decision on the accounts payable desk, with a reason attached, instead of a payment nobody can explain in June.',
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
 * already buys through, and these three lines sit at the end of it: a
 * supplier recognizes itself, understands it is welcome, and the page
 * never turns to face it.
 */
const SUPPLY = [
  {
    who: 'A prime',
    line:
      'Send a role down the chain without leaking who the client is, and see a ' +
      'duplicate submission before your client does.',
  },
  {
    who: 'A sub',
    line:
      'Know the real band before you price a role, and get paid on the hours ' +
      'that were actually approved rather than the ones that were argued about.',
  },
  {
    who: 'A bench operator',
    line:
      'Your bench stays private until there is a signed right to represent, and ' +
      'what you are being paid never travels — in either direction, at any depth.',
  },
]

/** What is settled about the commercials, in the absence of a price. */
const DECIDED = [
  {
    t: 'Governance is never a paid tier',
    p:
      'Tenure caps, approval chains, the record of who approved what — ' +
      'everybody gets these, full stop. Any company with two hiring ' +
      'managers needs them. Charge extra for this and you lose the deal ' +
      'before you even get to negotiate.',
  },
  {
    t: 'Etyme never runs a bench and never places anybody',
    p:
      'We sit between the firms that do. The moment we start competing ' +
      'with our own suppliers, they stop putting their people in the ' +
      'system and the whole network stalls. This isn’t a policy we might ' +
      'change later — it’s built into how the thing works.',
  },
  {
    t: 'Looking around costs nothing and needs no card',
    p:
      'You get a live workspace with a real worked example — go break it. ' +
      'If it’s not obviously useful in there, no price tag was going to ' +
      'fix that.',
  },
]

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
 * The slugs behind them stay what they were, because an address is not
 * a word anybody reads.
 */
const PROGRAMS = [
  { name: 'Northbend Athletic', what: 'Three suppliers, one of them buying from a bench vendor it never names.' },
  { name: 'Cavanaugh Glassworks', what: 'A supplier whose liability certificate runs out in twelve days.' },
  { name: 'Talvern Medical', what: 'One contractor, twenty-three months on site across two suppliers. Cap is eighteen.' },
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
      { label: 'What it costs when somebody asks', href: '#exposure' },
      { label: 'One hire, from every desk', href: '#lifecycle' },
      { label: 'What changes on Monday', href: '#monday' },
      { label: 'Who else is on it', href: '#who' },
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
          it says anything clever. The eyebrow is the category, the
          headline is the record, the line under the subhead is the span
          — named once, so no single station reads as the product. */}
      <section className="border-b border-etyme-rule">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 md:pb-24 md:pt-20">
          <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <p className="eyebrow mb-4">
                Contingent workforce management
              </p>
              <h1 className="mb-6 max-w-[16ch] text-balance font-serif text-[40px] font-normal
                             leading-[1.03] tracking-[-0.02em] text-etyme-ink md:text-[60px]">
                Every contractor. Every supplier. One record.
              </h1>
              <p className="mb-6 max-w-[46ch] text-[19px] leading-relaxed text-etyme-muted md:text-[21px]">
                You hire contractors through staffing firms — one, five, eleven of
                them. Nobody has one record that follows a person from the job
                posting to the invoice, across every firm you use. That’s the gap.
              </p>
              <p className="mb-9 max-w-[48ch] border-l-2 border-etyme-rule pl-4 text-[15px]
                            leading-relaxed text-etyme-ink">
                Requisition, suppliers, submissions, screening, interviews,
                onboarding, timesheets, invoices, compliance — one record, read
                from the desk of whoever does that job.
              </p>

              <div className="flex flex-wrap items-center gap-3">
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
                  href="#gap"
                  className="px-2 py-3.5 text-sm font-medium text-etyme-muted underline
                             underline-offset-4 transition-colors hover:text-etyme-ink"
                >
                  What it answers →
                </a>
              </div>
              {/* The primary door is a client desk and everything else is
                  a text link, because this page is written to the company
                  hiring. The contractor's own door stays reachable all the
                  same — a person who is the work is not an audience to
                  drop, and `__tests__/invariants/demo-candidate.test.ts`
                  holds it here and at the close. */}
              <p className="mt-5 max-w-[44ch] font-mono text-[12px] leading-relaxed text-etyme-muted">
                No card, no sign-up. You land at a program office desk with a
                full book behind it, and it is yours to break.{' '}
                <TryDemo
                  side="CANDIDATE"
                  label="See it as a candidate →"
                  className="text-etyme-muted underline underline-offset-2 hover:text-etyme-ink"
                />
              </p>
            </div>

            {/* One contractor, end to end. A system of record looks like
                this; a shortlist in this slot made the whole page read as
                a hiring tool, which is what a shortlist is. */}
            <div className="overflow-hidden rounded-xl border border-etyme-rule bg-etyme-surface shadow-sm">
              <div className="border-b border-etyme-rule bg-etyme-canvas px-5 py-3.5">
                <p className="stat-label">Worked example · one contractor, end to end</p>
                <p className="mt-1.5 text-[15px] font-semibold text-etyme-ink">Priya Raghunathan</p>
                <p className="font-mono text-[11px] text-etyme-faint">
                  Brightmoor Talent → Calder Manufacturing · quality validation
                </p>
              </div>

              {RECORD.map((r) => (
                <div
                  key={r.when}
                  className="flex items-baseline gap-3 border-b border-etyme-rule px-5 py-3"
                >
                  <span className="w-[94px] shrink-0 font-mono text-[10.5px] uppercase
                                   tracking-[0.06em] text-etyme-faint">
                    {r.when}
                  </span>
                  <span className="w-[64px] shrink-0 text-[13px] font-semibold tabular-nums
                                   text-etyme-ink">
                    {r.what}
                  </span>
                  <span className="font-mono text-[11px] leading-snug text-etyme-muted">
                    {r.detail}
                  </span>
                </div>
              ))}

              <div className="bg-etyme-canvas px-5 py-4">
                <p className="stat-label">What no one system holds</p>
                <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-etyme-ink">
                  The posting, the person, the hours and the bill — through the
                  firm that supplied her, on one row, for as long as she is here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The hook: four questions ─────────────────────────────── */}
      {/* Nobody is fined at month nineteen, and a page that opens on the
          penalty is selling a fear the buyer does not hold — "we have
          never been caught" is true and it ends the conversation. Being
          asked how many contractors you have and not knowing happens
          monthly. Tenure is the fourth of the four and gets one line. */}
      <section id="gap" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <p className="eyebrow mb-3">Why this matters</p>
          <h2 className="max-w-[20ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            Every contractor on your sites. Including the ones you didn’t hire.
          </h2>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="max-w-[44ch] font-serif text-[21px] leading-snug text-etyme-ink md:text-[25px]">
                You can name every employee on your payroll. Nobody can name
                every contractor on your sites.
              </p>
              <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-etyme-muted">
                You hired almost none of them yourself. A supplier did — or a
                supplier’s supplier. They badge in on Monday, they turn up on a
                bill at the end of the month, and no system you own counts them
                the same way twice.
              </p>
              <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-etyme-ink">
                So when a CFO, an auditor or a board member asks a simple
                question about your own workforce, the honest answer from the
                program manager is “let me come back to you”. Then three weeks
                of asking eleven suppliers for spreadsheets, and procurement
                chasing the two who do not reply. Then a number nobody fully
                trusts, including the person who assembled it.
              </p>
              <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-etyme-muted">
                No supplier can add that up, and not because anybody is hiding
                anything: each one can only see its own slice. A VMS sees inside
                one program. You cannot get it by asking, because nobody you
                could ask is holding all of it. That is why the record has to sit
                above the suppliers rather than inside one of them.
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
                  {item.detail && (
                    <p className="mt-2 border-t border-etyme-rule pt-2 text-[13px] leading-relaxed text-etyme-ink">
                      {item.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── The business case, after the hook ────────────────────── */}
      {/* Two sentences doing two jobs. The hook is the not-knowing; this
          is what it costs when somebody stops accepting the caveat, and
          it is what goes on the paper to finance. It never leads. */}
      <section id="exposure" className="border-b border-etyme-rule scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <p className="eyebrow mb-3">What you write for finance</p>
          <h2 className="max-w-[24ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            The question comes monthly. The bill comes the week somebody stops
            accepting the caveat.
          </h2>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
            Nobody is fined on the day a contractor passes eighteen months.
            There is no tenure regulator, and most companies have never been
            caught by any of this. That is exactly why it is the business case
            and not the reason — it is what justifies the spend, once somebody
            has already decided they are tired of not knowing.
          </p>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {EXPOSURE.map((e) => (
              <div key={e.t} className="border-t-2 border-etyme-attention pt-5">
                <h3 className="mb-2 text-[17px] font-semibold leading-snug text-etyme-ink">{e.t}</h3>
                <p className="text-[15px] leading-relaxed text-etyme-muted">{e.p}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 max-w-[58ch] border-t border-etyme-rule pt-6 text-[15px]
                        leading-relaxed text-etyme-muted">
            Where a cap is legally grounded, the system blocks and says why.
            Rate bands, headcount plans and supplier tiers warn, ask for a
            reason, and let you proceed. Nothing here is ever silently
            allowed, and every override keeps the name of whoever gave it.
          </p>
        </div>
      </section>

      {/* ── One hire, from every desk ────────────────────────────── */}
      {/* Six milestones. This was eighteen numbered stages, which is the
          internal lifecycle printed on a marketing page — the same
          mistake the 2017 timeline made when it showed users the cycle
          engine's own enum. Three words, not nineteen states.

          The three gates are the part a buyer does not believe until it
          is written down: software that only records is a dashboard. */}
      <section id="lifecycle" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">One hire, from every desk</p>
          <h2 className="max-w-[26ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[42px]">
            Six milestones, one record the whole way through
          </h2>
          <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
            The hiring manager raises it, HR reads the role, procurement audits
            the suppliers, the lead who owns the cost center signs the money,
            the supplier submits, you award, compliance clears the start, the
            plant signs the week and accounts payable pays what matched. Nobody
            signs their own. The three in clay can stop the deal; everything
            else records what happened.
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

          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {GATES.map((g) => (
              <li key={g.says} className="border-t border-etyme-rule pt-4">
                <p className="text-[15px] font-semibold leading-snug"
                   style={{ color: 'var(--color-attention)' }}>
                  {g.says}
                </p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-etyme-muted">{g.why}</p>
              </li>
            ))}
          </ul>

          <p className="mt-8 max-w-[58ch] text-[14px] leading-relaxed text-etyme-muted">
            Inside, a placement moves through a good deal more than six states.
            Nobody using it has to learn any of them — one record, end to end,
            one company or nine of them in a chain.
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
          Four questions, answered before lunch instead of by Thursday
        </h2>
        <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-etyme-muted">
          Right now, every one of these gets answered with a phone call, a
          spreadsheet and a guess. Here they are four screens, and every figure
          on them comes off what actually happened — a signed timesheet, a
          matched bill, a day on site. Open all four in the example program.
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
                Etyme sits in front of what you already use — it doesn’t
                replace it. Nothing to switch off, no supplier onboarding
                project, nobody to kick out. It keeps the one record that spans
                everything else, which none of your other tools do.
              </p>
            </div>

            <ul className="space-y-6">
              <li className="border-t border-etyme-rule pt-4">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  Work arrives the way it already does
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-etyme-muted">
                  Paste in a forwarded email, a role description, five of them at
                  once — they come back as seats, duplicates already merged.
                  Nobody has to change how they send you work.
                </p>
              </li>
              <li className="border-t border-etyme-rule pt-4">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  Your suppliers don’t need to sign up first
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-etyme-muted">
                  Paste the distribution list you already use. Every firm on it,
                  you can send a role to today — whether they’ve heard of Etyme
                  or not. Where a hop leaves the platform the record says so,
                  because a hop into somebody’s email client is not a control.
                </p>
              </li>
              <li className="border-t border-etyme-rule pt-4">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  What’s yours stays yours
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-etyme-muted">
                  Your rates, your suppliers, your contractors’ records — all
                  yours. Every list exports to CSV from the screen it is on, and
                  anybody this system holds data about can ask for a copy of it,
                  or ask to be forgotten, from their own page.
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Who else is on it ────────────────────────────────────── */}
      {/* The client is the customer, decided 2026-09-10. The suppliers
          are here because their client is, and they read this section
          over the client's shoulder — not four audiences as equals,
          which is how a hiring manager came away believing this was
          software for staffing firms. */}
      <section id="who" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 scroll-mt-6">
        <p className="eyebrow mb-3">The chain you already buy through</p>
        <h2 className="max-w-[22ch] text-balance font-serif text-3xl leading-tight
                       tracking-[-0.02em] text-etyme-ink md:text-[42px]">
          Your role goes further down than you think. So does your name.
        </h2>
        <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
          You send a role to a supplier. It goes to a prime, who sends it to a
          sub, who sends it to the firm that actually has the person. At every
          hop somebody forwards the email as it arrived, because redacting it
          properly takes longer than anybody has — which is how your company
          name, your rate and your manager’s words end up two firms past the
          agreement that said they wouldn’t.
        </p>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-ink">
          It is also why the same résumé reaches you three times from three
          firms, why you cannot tell whether a rate is the person’s or the
          chain’s, and why somebody you have already used arrives as a
          stranger. One record across the whole chain fixes all three at
          once — and every hop is written down: what was sent, to whom, under
          which agreement, and what was withheld.
        </p>

        <div className="mt-12 rounded-xl border border-etyme-rule bg-etyme-surface p-6 md:p-8">
          <p className="max-w-[58ch] text-[15px] leading-relaxed text-etyme-ink">
            <span className="font-semibold">Supplying into a program like this?</span>{' '}
            You are on it because your client is, and nothing about it competes
            with you — Etyme never runs a bench and never places anybody. Prime,
            sub and bench are positions on a deal, not kinds of company: the same
            firm is a prime this week and a sub next week, which is why this is
            one product and not four.
          </p>

          <ul className="mt-6 grid gap-5 sm:grid-cols-3">
            {SUPPLY.map((s) => (
              <li key={s.who} className="border-t border-etyme-rule pt-3">
                <p className="stat-label">{s.who}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-etyme-muted">{s.line}</p>
              </li>
            ))}
          </ul>
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
              <h2 className="max-w-[18ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-[42px]">
                Most of what looks like AI here is a rule, and we would rather say so
              </h2>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-etyme-muted">
                Twenty things in here happen without anybody asking for them.
                Nineteen of the twenty are a date, a threshold or a count —
                a permit running out, an agreement whose term has lapsed, a
                retention period that has run out. The one that is left scores
                a person against a role, and even that falls back to arithmetic
                when there is no model to call.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
                <p className="stat-label" style={{ color: 'var(--color-verified)' }}>
                  Plain rules
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-etyme-muted">
                  Rate against the band. An expiring permit. A missing
                  document. The same person submitted twice. Right every
                  time, free to run, and each one explains itself in a
                  sentence you can push back on.
                </p>
              </div>
              <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
                <p className="stat-label">A model, on what&rsquo;s left</p>
                <p className="mt-2 text-[15px] leading-relaxed text-etyme-muted">
                  Reads CVs, drafts messages, scores a person against a
                  role. Never decides whether someone can legally work.
                  Every score comes with what it&rsquo;s made of and what
                  it couldn&rsquo;t find — a bare number with no
                  explanation is a bug here, not a feature.
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
            Here’s the actual decision: Etyme is free while we prove it
            out with the first five firms. Founding firms keep whatever
            terms we agree — in writing, before you start, not as a vague
            promise in a paragraph like this one. Making up a number for a
            landing page is a number we’d have to walk back later, and
            you’d be right to hold that against us.
          </p>
          <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-ink">
            Three things about the money side are settled already — the
            ones that would be expensive to change later.
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
          <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-etyme-muted">
            Three example programs are seeded and waiting, each with several
            suppliers, a history across them and something at every desk. The
            companies are invented; everything under them behaves exactly as
            it would with yours.
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
            <span className="font-semibold text-etyme-ink">Supplying into one instead?</span>{' '}
            There is a supplier’s desk in the same seeded world — its own bench,
            its own bills, and the client above it.{' '}
            <TryDemo
              side="BENCH"
              label="Sit at a supplier’s desk →"
              className="text-etyme-action underline underline-offset-4 hover:opacity-80"
            />
          </p>

          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-etyme-muted">
            <span className="font-semibold text-etyme-ink">On a contract yourself?</span>{' '}
            A contractor gets their own page — the week they filed, what they
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
                The system of record for contingent workers — the layer between a
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
