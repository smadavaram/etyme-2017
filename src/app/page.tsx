import { EtymeLogo } from '@/components/logo'
import { TryDemo } from '@/components/try-demo'
import { Ask } from '@/app/site/ask'
import { ASK_COPY } from '@/lib/public-site/leads'
import Link from 'next/link'
// Typed routes widen a string in an array to `string`, which Link will not
// take. The footer's routes are literals two lines below; the cast is at
// the render rather than on the data so the list stays readable.
import type { Route } from 'next'

/**
 * The front door.
 *
 * ── The hero ─────────────────────────────────────────────────────────
 *
 * It had the right proof and the wrong headline. "Stop reading bad
 * submissions" is one module describing itself, and a visitor read the
 * whole page as a hiring tool — which is what it looked like, because
 * the hero showed a shortlist and nothing else.
 *
 * Concur's homepage says Travel and Expense before it says anything
 * clever. You know what it is in three words. A layer has to name its
 * category first and prove its span second, or it reads as whichever
 * feature happens to be on screen.
 *
 * So: the category in the eyebrow, the record in the headline, and a
 * hero panel showing one contractor end to end — submitted, interviewed,
 * started, timesheeted, invoiced, and nineteen months of tenure across
 * three suppliers. Nobody looks at that and thinks recruiting tool.
 *
 * ── The order below it, settled 2026-09-15 ───────────────────────────
 *
 * The page argued its wedge in section seven of nine. The tenure worked
 * example — nineteen months across three suppliers — is the entire
 * argument, and almost nobody reads that far. Before it sat eighteen
 * numbered lifecycle stages, which is a build artifact, and four
 * audiences addressed as equals, which is the plan from before the
 * client became the customer on 2026-09-10.
 *
 * The order now is the conversation a client actually has:
 *
 *   1. what is this            the hero, untouched
 *   2. why do I care           #gap — the question you cannot answer
 *   3. is that real            #tenure — the ledger, and #lifecycle
 *   4. what changes            #monday — four questions, four screens
 *   5. does it replace         #alongside — your ATS, your VMS, your suppliers
 *   6. who else is on it       #who — the chain, over the client's shoulder
 *   7. the AI honesty          #compliance
 *
 * Then what it costs, which is not settled and says so.
 *
 * ── The hook is the not-knowing, not the penalty ─────────────────────
 *
 * This page used to say tenure is "an exposure rather than a saving",
 * and lead with it. The founder was right that this loses: nobody is
 * fined at month nineteen, there is no tenure regulator, and a
 * compliance pitch loses to "we have never been caught" — which is
 * worse than losing to "we are managing fine", because it is true.
 *
 * What people actually feel is being asked a basic question about their
 * own workforce and not being able to answer it. How many contractors
 * do we have. What are we spending. Who has been here longest. That
 * happens monthly; the penalty is hypothetical. So #gap opens on the
 * not-knowing and closes on what it costs the week somebody insists —
 * two sentences doing two different jobs, in that order.
 *
 * ── Written to the client, read over the shoulder ────────────────────
 *
 * "Who this is for" used to address hiring companies, primes, subs and
 * bench operators as four equals. A hiring manager reads "primes, subs,
 * bench operators" and concludes this is software for staffing firms.
 * The client is the customer; the suppliers come anyway, because their
 * client is there. So the chain is one section, late, and it says out
 * loud who pays.
 *
 * ── Every claim here is checkable ────────────────────────────────────
 *
 * The numbers are what the seeded sandbox produces, and are labeled as
 * a worked example where they are one. Nothing here is a drawing of a
 * feature that does not exist, which is the only reason a "Look around"
 * button can sit next to it.
 *
 * Three claims came off this page because nothing stands behind them:
 * "your data exports in full, any time" — the eighteen lists built on
 * the shared table export to CSV, which is a smaller promise —
 * "set-up takes an afternoon", which nobody has measured — and the
 * names of three real enterprises, which were the seeded demo tenants
 * and read as three live customers.
 */

/**
 * One contractor, end to end.
 *
 * The whole point of a system of record is that it holds the parts
 * nobody else joins up: the submission, the interview, the purchase
 * order, the hours, the invoice, and the tenure that spans all three
 * suppliers who have ever supplied this person.
 */
/**
 * The header nav — Products, Industries, Compliance, Why Etyme.
 *
 * The flat six-word list it replaced ("Suppliers, Requisitions,
 * Screening, Timesheets, Invoices, Compliance") named modules with
 * nothing organizing them. An enterprise buyer evaluating a system of
 * record expects this shape — it's how Concur, Workday and every other
 * layer like this one structure a header. Every item below links to a
 * real section already on this page; nothing here promises a screen
 * that doesn't exist.
 *
 * Industries is deliberately not a set of vertical product pages —
 * CLAUDE.md is explicit that the core stays horizontal. The note under
 * it says so directly, so the menu argues for the same positioning it
 * could otherwise be read as contradicting.
 */
const NAV_MENUS: { label: string; items: { t: string; d?: string; href: string }[]; note?: string }[] = [
  {
    label: 'Products',
    items: [
      { t: 'Your contractors', d: 'Everybody on site, across every supplier, one row each.', href: '#monday' },
      { t: 'Tenure ledger', d: 'One number, across every supplier a person has worked through.', href: '#tenure' },
      { t: 'Requisitions & suppliers', d: 'Raised, approved, released to the firms you cleared.', href: '#lifecycle' },
      { t: 'Hours, invoices & bills', d: 'Signed hours, invoices matched to the order.', href: '#lifecycle' },
    ],
  },
  {
    label: 'Industries',
    items: [
      { t: 'IT & engineering', href: '#who' },
      { t: 'Healthcare & clinical', href: '#who' },
      { t: 'Skilled trades & field services', href: '#who' },
      { t: 'Professional & corporate services', href: '#who' },
    ],
    note: 'One product. No industry-specific version to buy.',
  },
  {
    label: 'Compliance',
    items: [
      { t: 'Work authorization', d: 'Blocked, not warned, where the law is behind it.', href: '#tenure' },
      { t: 'Tenure & co-employment', d: 'Aggregated across every supplier, not per assignment.', href: '#tenure' },
      { t: 'Document packets', d: 'Derived from the role — not a hardcoded checklist.', href: '#compliance' },
      { t: 'Governance & approvals', d: 'Every override keeps the name of whoever gave it.', href: '#tenure' },
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

const RECORD = [
  { when: 'Submitted', what: '2 Sep', detail: '$78/hr · screened and cleared' },
  { when: 'Interviewed', what: '9 Sep', detail: 'two rounds · offer made' },
  { when: 'Started', what: '1 Oct', detail: 'PO NW-40118 · cost center EA-4100' },
  { when: 'Hours', what: '152', detail: '4 timesheets approved' },
  { when: 'Invoiced', what: '$11,856', detail: '45 day terms · matched to the PO' },
]

/**
 * The four questions a client cannot answer about its own workforce.
 *
 * Not invented for the page. These are the ones that arrive from a board
 * member, an auditor or a new CFO, and each is answered today by asking
 * every supplier for a spreadsheet and adding them up by hand.
 *
 * They are the hook, and they are deliberately not compliance questions.
 * Nobody is fined at month nineteen; everybody is asked "how many
 * contractors do we have" at some point this quarter.
 */
const CANNOT_ANSWER = [
  'How many contractors are on our sites right now?',
  'What are we spending on them this quarter?',
  'Who has been here longest?',
  'Are we paying two suppliers different money for the same work?',
]

/**
 * How a placement moves — six milestones, not eighteen states.
 *
 * This was eighteen numbered stages, which is the internal lifecycle
 * printed on a marketing page. It broke the product's own rule: "three
 * words, not nineteen states — group internal states into the handful
 * of milestones a person actually acts on". That rule exists because
 * the 2017 timeline exposed the cycle engine's own enum to users, and
 * the eighteen-stage grid was doing it to a stranger who has not even
 * signed up.
 *
 * gate: true marks the three milestones that can stop the deal rather
 * than only record it.
 */
const LIFECYCLE: { t: string; d: string; gate?: boolean }[] = [
  { t: 'Raised', d: 'A manager needs somebody, with a budget and a band', gate: true },
  { t: 'Released', d: 'To the suppliers your program office cleared' },
  { t: 'Awarded', d: 'One person, one seat. Contracts written by the award', gate: true },
  { t: 'Cleared', d: 'Work authorization, checks, insurance. An I-9 blocks', gate: true },
  { t: 'Working', d: 'Hours signed, invoices matched, everybody paid' },
  { t: 'Ended', d: 'Notice, handover — and tenure keeps counting' },
]

/**
 * Four questions, four screens that already exist.
 *
 * Not a feature list, and written to the client rather than to the
 * supplier — these four were the staffing firm's questions (leads,
 * bench cost, placement margin, who is financing whom) on a page whose
 * customer is the company hiring.
 *
 * `route` is the screen it opens, and the test checks the folder is
 * really there. A page describing a screen nobody built is the exact
 * failure the positioning guard exists to stop.
 */
const MONDAY = [
  {
    screen: 'Program',
    route: 'program',
    q: 'What needs me today, and what are we spending?',
    a:
      'Opens on a sentence about you — six things need you, six are urgent, or ' +
      'nothing does. Under it: on site now, suppliers, this month, ending soon. ' +
      'Every number is a link to the rows that made it.',
  },
  {
    screen: 'Workforce',
    route: 'people',
    q: 'How many contractors do we have, and whose are they?',
    a:
      'One row per person, not one per contract. A consultant bought through a ' +
      'prime and a sub is one person on your site, counted once — with the ' +
      'contract you actually pay on the row, never somebody else’s margin.',
  },
  {
    screen: 'Tenure',
    route: 'tenure',
    q: 'Who has been here longest?',
    a:
      'Days on site, added up across every supplier that has ever supplied them, ' +
      'counted once per day however many firms billed for it. Against your own ' +
      'cap, with the contracts that made the number.',
  },
  {
    screen: 'Rates',
    route: 'rate-history',
    q: 'Are we paying two suppliers differently for the same work?',
    a:
      'Every rate, when it changed and who agreed it. The spread across suppliers ' +
      'for one skill is a number no single supplier can show you, because each ' +
      'one only knows its own.',
  },
]

/**
 * The supply side, in three lines, near the end.
 *
 * ── Why it is three lines and not four columns ───────────────────────
 *
 * This was "Who this is for": the company hiring, the prime, the sub and
 * the bench operator, four columns of equal weight. A hiring manager
 * reads "primes, subs, bench operators" and concludes this is software
 * for staffing firms, which is the plan from before the client became
 * the customer on 2026-09-10. Speaking to four audiences is speaking
 * sharply to none.
 *
 * Subtle is not absent. The network only works because the suppliers
 * are on it, and a supplier who reads this page as hostile — or as
 * having forgotten them — does not join. So the section is a client
 * narrative about the chain the client already buys through, and these
 * three lines sit at the end of it: a supplier recognizes itself,
 * understands it is welcome, and the page never turns to face it.
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
 * The tenure ledger, as a worked example.
 *
 * Three suppliers, three honest answers, one number none of them can
 * produce. It is the same person and the same client as the hero panel,
 * so a reader who scrolls sees the arithmetic behind the line they
 * already read.
 */
const LEDGER = [
  { supplier: 'Cloudepa Systems', months: '14 months', span: 'Feb 2024 – Apr 2025' },
  { supplier: 'Brightmoor Talent', months: '3 months', span: 'May 2025 – Aug 2025' },
  { supplier: 'Vertex Group', months: '2 months', span: 'Sep 2025 – Oct 2025' },
]

/**
 * The footer.
 *
 * ── Why this is not decoration ───────────────────────────────────────
 *
 * Three legal pages shipped and nothing pointed at them, so they were
 * live and invisible. A client's security review finds a document by
 * looking in the footer; finding nothing there is indistinguishable
 * from a company that never wrote one.
 *
 * The rest of it is the same argument. A logo and a tagline is a page
 * that ended, not a company that exists. What a first-time enterprise
 * visitor looks for down here is narrow and known: where the legal
 * documents are, how to reach a person, and what the sections above
 * were called so they can get back to one.
 *
 * ── What is deliberately not here ────────────────────────────────────
 *
 * No About, no Careers, no Blog, no status page, no social links, no
 * street address and no support mailbox. Every one of those is a link
 * to something that does not exist, and a footer full of dead links
 * costs more trust than a short one. The only inbound channel that
 * exists is the ask box on this page, which a person reads and answers,
 * so it is the only one offered.
 *
 * The three legal documents each say on their own face that they are
 * drafts written from the code and not yet reviewed by a lawyer. The
 * footer says it too, before the click rather than after it. A link
 * labeled "Terms of service" that opens a draft is exactly the small
 * dishonesty the rest of this page argues against.
 *
 * The DPA is in the list rather than held back for procurement. It is
 * counsel's document and a visitor will never read it — but the person
 * sent here to find it is a buyer's reviewer with a checklist, and one
 * extra line costs us nothing next to an email round trip.
 */
const FOOTER: { heading: string; links: { label: string; href: string }[]; note?: string }[] = [
  {
    heading: 'The product',
    links: [
      { label: 'The question you cannot answer', href: '#gap' },
      { label: 'Tenure', href: '#tenure' },
      { label: 'How a placement moves', href: '#lifecycle' },
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
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="bg-etyme-navy">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-8 md:pb-24">
          <nav className="mb-14 flex flex-wrap items-center gap-x-2 gap-y-4 md:mb-16">
            <EtymeLogo size="lg" inverted />

            {/* Products, Industries, Compliance, Why Etyme — see NAV_MENUS
                above for why this shape and not a flat module list. */}
            <ul className="ml-8 hidden items-center gap-1 text-sm lg:flex">
              {NAV_MENUS.map((menu) => (
                <li key={menu.label} className="group relative">
                  <button
                    type="button"
                    className="rounded-md px-3 py-2 text-white/55 transition-colors
                               hover:text-white focus-visible:text-white focus-visible:outline-none
                               focus-visible:ring-2 focus-visible:ring-white/40"
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
                    <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-2 shadow-2xl">
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
              className="ml-auto rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium
                         text-white/70 transition-colors hover:border-white/25 hover:text-white"
            >
              Sign in
            </Link>
          </nav>

          <div className="grid items-start gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em]"
                 style={{ color: '#00D4FF' }}>
                Contingent workforce management
              </p>
              <h1 className="mb-6 max-w-[15ch] text-balance text-4xl font-semibold
                             leading-[1.05] tracking-[-0.03em] text-white md:text-[52px]">
                Every contractor. Every supplier. One record.
              </h1>
              <p className="mb-9 max-w-xl text-lg leading-relaxed text-white/55 md:text-xl">
                You hire contractors through staffing firms — one, five, eleven of
                them. Nobody has one record that follows a person from the job
                posting to the invoice, across every firm you use. That’s the
                gap. That’s why nobody can tell you how long someone has
                actually been on site.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                {/* Not job-board language ("hiring", "a bench") — this
                    isn't a job board. Both buttons open the same seeded
                    workspace from a different seat in the chain, which
                    is the actual product: a layer with a view for every
                    party in it, not a tool for one of them. */}
                {/* One door for companies, not two. Demand and supply are
                    positions on a deal, not properties of a firm — a prime
                    is demand toward its sub and supply toward its client
                    on the same placement — so a page that forked on it
                    asked a question a third of the market cannot answer.
                    The five seats are behind this one button, grouped. */}
                <TryDemo
                  side="HIRING"
                  asks
                  label="See it as a company →"
                  className="rounded-lg bg-white px-6 py-3.5 text-sm font-semibold
                             text-etyme-navy shadow-lg shadow-white/10 transition-colors
                             hover:bg-white/90"
                />
              </div>
              <p className="mt-4 font-mono text-xs text-white/55">
                No card, no sign-up. Your own worked example, seeded and yours to break.{' '}
                <TryDemo
                  side="CANDIDATE"
                  label="See it as a candidate →"
                  className="text-white/70 underline underline-offset-2 hover:text-white"
                />
              </p>
              {/* The buyer's demo, by desk. A program office is four
                  or five jobs, and the person evaluating this runs one of
                  them — so the door says which.

                  This line named Nike, Corning and Terumo BCT until
                  2026-09-15. They are the seeded demo tenants, and above a
                  button that says "a running program" they read as three
                  live customers — three trademarked enterprises on a public
                  marketing page, none of whom has heard of us.

                  Describing them rather than naming them is the honest fix
                  and not only the safe one: inventing three plausible names
                  would still read as a customer list, and would name firms
                  the demo does not contain. What is true is that the
                  programs are seeded examples, and that they span three
                  industries on purpose — which is the thing worth saying. */}
              <p className="mt-2 font-mono text-xs text-white/55">
                Or sit in one of three example programs we seeded — a consumer brand, a
                materials manufacturer, a medical device maker — at whichever desk is yours.{' '}
                <a href="/demo" className="text-white/70 underline underline-offset-2 hover:text-white">
                  Pick a desk →
                </a>
              </p>
            </div>

            {/* One contractor, end to end. A shortlist in this slot made
                the whole page read as a hiring tool, which is what a
                shortlist is. This is what a system of record looks like. */}
            <div className="overflow-hidden rounded-xl bg-etyme-surface shadow-2xl">
              <div className="border-b border-etyme-rule bg-etyme-canvas px-5 py-3">
                <p className="stat-label">Contractor record</p>
                <p className="mt-1 text-[15px] font-semibold text-etyme-ink">Rohan Menon</p>
                <p className="font-mono text-[11px] text-etyme-faint">
                  Cloudepa Systems → Calder Manufacturing · Senior Java Developer
                </p>
              </div>

              {RECORD.map((r) => (
                <div
                  key={r.when}
                  className="flex items-baseline gap-3 border-b border-etyme-rule px-5 py-2.5"
                >
                  <span className="w-[86px] shrink-0 font-mono text-[11px] uppercase
                                   tracking-[0.08em] text-etyme-faint">
                    {r.when}
                  </span>
                  <span className="w-[74px] shrink-0 text-[13px] font-semibold tabular-nums
                                   text-etyme-ink">
                    {r.what}
                  </span>
                  <span className="font-mono text-[11px] leading-snug text-etyme-muted">
                    {r.detail}
                  </span>
                </div>
              ))}

              {/* The line no supplier can produce and no client can get by
                  asking, and the reason a compliance officer takes the
                  meeting. */}
              <div className="px-5 py-3" style={{ background: '#F7EDE6' }}>
                <p className="stat-label" style={{ color: 'var(--color-attention)' }}>
                  Tenure
                </p>
                <p className="mt-1 font-mono text-[12px] leading-snug"
                   style={{ color: 'var(--color-attention)' }}>
                  19 months on site, across 3 suppliers. Your cap is 18.
                </p>
                <p className="mt-1 font-mono text-[11px] text-etyme-muted">
                  Their own systems say 14, 3 and 2.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why do I care ────────────────────────────────────────── */}
      {/* The hook is the not-knowing. Nobody is fined at month nineteen,
          and a page that opens on the penalty is selling a fear the
          buyer does not hold — "we have never been caught" is true and
          it ends the conversation. Being asked how many contractors you
          have and not knowing happens monthly. */}
      <section id="gap" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <p className="eyebrow mb-3">Why this matters</p>
          <h2 className="max-w-[20ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-4xl">
            Every contractor on your sites. Including the ones you didn’t hire.
          </h2>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="max-w-[46ch] font-serif text-[21px] leading-snug text-etyme-ink md:text-[24px]">
                You can name every employee on your payroll. Nobody can name
                every contractor on your sites.
              </p>
              <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-etyme-muted">
                You hired almost none of them yourself. A supplier did — or a
                supplier’s supplier. They badge in on Monday, they turn up on an
                invoice at the end of the month, and no system you own counts
                them the same way twice.
              </p>
              <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-etyme-ink">
                So when somebody asks a simple question about your own workforce,
                the honest answer is “let me come back to you”. Then three weeks
                of asking eleven suppliers for spreadsheets. Then a number nobody
                fully trusts, including the person who assembled it.
              </p>
              <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-etyme-muted">
                Nobody is fined on the day a contractor passes eighteen months.
                That is not why this gets fixed. It gets fixed because the
                question comes round monthly — a board member, an auditor, a new
                CFO — and every time, the answer costs three weeks and still has
                to be caveated. The exposure decides what it costs the week
                somebody stops accepting the caveat: a co-employment claim, a
                misclassification finding, a rate you cannot defend because you
                never knew you were paying it twice.
              </p>
            </div>

            <ul className="space-y-px overflow-hidden rounded-xl border border-etyme-rule bg-etyme-rule">
              {CANNOT_ANSWER.map((q) => (
                <li key={q} className="bg-etyme-raised px-5 py-4">
                  <p className="text-[16px] leading-snug text-etyme-ink">{q}</p>
                  <p className="mt-1 font-mono text-[11px] text-etyme-faint">
                    Today: ask every supplier, then add it up by hand
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Is that real ─────────────────────────────────────────── */}
      {/* The sharpest wedge, and it used to be in section seven of nine.
          Tenure is the wedge because it is the number nobody can
          produce — a VMS sees inside one program, a supplier sees its
          own slice, neither can add them up — not because somebody gets
          punished for it. */}
      <section id="tenure" className="border-b border-etyme-rule scroll-mt-6">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">Is that real</p>
              <h2 className="max-w-[20ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-4xl">
                Nobody can tell you how long a contractor has actually been on site
              </h2>
              <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-etyme-muted">
                Ask each supplier and each one tells you the truth — about
                its own contract. Fourteen months. Three months. Two
                months. The person has been at that client for nineteen
                months without a break. No supplier can add that up,
                because none of them can see the other two.
              </p>
              <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-etyme-ink">
                Neither can the tools you already have. A VMS sees inside
                one program. A supplier sees its own slice. You cannot get
                it by asking, because nobody you could ask is holding all
                three answers. That is the number this is built around,
                and it is why the record has to sit above the suppliers
                rather than inside one of them.
              </p>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-etyme-muted">
                Where a cap is legally grounded, the system blocks and says
                why. Rate bands, headcount plans, vendor tiers — those just
                warn, ask for a reason, and let you proceed. Nothing here is
                ever silently allowed, and every override keeps the name of
                whoever gave it.
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-etyme-rule bg-etyme-raised">
              <div className="border-b border-etyme-rule bg-etyme-canvas px-5 py-3">
                <p className="stat-label">Worked example · one person, one client</p>
                <p className="mt-1 font-mono text-[11px] text-etyme-faint">
                  Three suppliers, three honest answers
                </p>
              </div>

              {LEDGER.map((l) => (
                <div key={l.supplier}
                     className="flex items-baseline justify-between gap-3 border-b border-etyme-rule px-5 py-3">
                  <span className="text-[14px] text-etyme-ink">{l.supplier}</span>
                  <span className="text-right">
                    <span className="block text-[14px] font-semibold tabular-nums text-etyme-ink">
                      {l.months}
                    </span>
                    <span className="block font-mono text-[11px] text-etyme-faint">{l.span}</span>
                  </span>
                </div>
              ))}

              <div className="px-5 py-4" style={{ background: '#F7EDE6' }}>
                <p className="stat-label" style={{ color: 'var(--color-attention)' }}>
                  Aggregated at the client
                </p>
                <p className="mt-1 font-serif text-[30px] leading-none tabular-nums"
                   style={{ color: 'var(--color-attention)' }}>
                  19 months
                </p>
                <p className="mt-2 font-mono text-[11px] leading-snug text-etyme-muted">
                  Their cap is 18. The next submission for this person is blocked, and
                  the block says which three contracts made the number.
                </p>
              </div>
            </div>
          </div>

          {/* The argument is made; the next thing a buyer wants is to
              poke it. A page that saves every door for the footer makes
              a reader who is convinced in section three scroll past six
              sections to act on it. */}
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4
                          border-t border-etyme-rule pt-6">
            <p className="max-w-[46ch] text-[15px] leading-relaxed text-etyme-muted">
              That ledger is seeded and live, on an example program you can open
              right now. Sort it, filter it, try to break the block.
            </p>
            <TryDemo
              side="HIRING"
              asks
              label="See it as a company →"
              className="rounded-lg bg-etyme-action px-5 py-3 text-sm font-semibold text-white
                         transition-opacity hover:opacity-90"
            />
          </div>
        </div>
      </section>

      {/* ── How it gets there ────────────────────────────────────── */}
      {/* Six milestones. This was eighteen numbered stages, which is the
          internal lifecycle printed on a marketing page — the same
          mistake the 2017 timeline made when it showed users the cycle
          engine's own enum. Three words, not nineteen states. */}
      <section id="lifecycle" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-16">
          <p className="eyebrow mb-2">How a placement moves</p>
          <h2 className="max-w-[26ch] text-balance font-serif text-2xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-3xl">
            Six milestones, one record the whole way through
          </h2>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-etyme-muted">
            The three in clay can stop the deal. Everything else just
            records what happened.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg
                          border border-etyme-rule bg-etyme-rule sm:grid-cols-2
                          md:grid-cols-3 lg:grid-cols-6">
            {LIFECYCLE.map((s, i) => (
              <div
                key={s.t}
                className="p-3.5"
                style={{
                  background: s.gate ? 'var(--color-raised)' : 'var(--color-surface)',
                  boxShadow: s.gate ? 'inset 3px 0 0 var(--color-attention)' : undefined,
                }}
              >
                <span className="block font-mono text-[10px] text-etyme-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-etyme-ink">
                  {s.t}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-etyme-muted">
                  {s.d}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[13px] text-etyme-muted">
            Inside, a placement moves through a good deal more than six states.
            Nobody using it has to learn any of them — one record, end to end,
            one company or nine of them in a chain.
          </p>
        </div>
      </section>

      {/* ── What changes ─────────────────────────────────────────── */}
      {/* Four questions a client answers today with a phone call and a
          guess, and the four screens that answer them instead. These
          were the staffing firm's four questions until 2026-09-15, on a
          page whose customer is the company hiring. */}
      <section id="monday" className="mx-auto max-w-6xl px-6 py-16 md:py-24 scroll-mt-6">
        <p className="eyebrow mb-3">What changes on Monday</p>
        <h2 className="max-w-[24ch] text-balance font-serif text-3xl leading-tight
                       tracking-[-0.02em] text-etyme-ink md:text-4xl">
          Four questions, answered before lunch instead of by Thursday
        </h2>
        <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-etyme-muted">
          Right now, every one of these gets answered with a phone call, a
          spreadsheet and a guess. Here, they’re four screens, and every
          figure on them comes off what actually happened — a signed
          timesheet, a matched invoice, a day on site. Open all four in
          the example program.
        </p>

        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {MONDAY.map((m) => (
            <div key={m.screen} className="rounded-xl border border-etyme-rule bg-etyme-raised p-6">
              <p className="stat-label">{m.screen}</p>
              <h3 className="mt-2 text-balance text-[19px] font-semibold leading-snug text-etyme-ink">
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
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.85fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">What it sits beside</p>
              <h2 className="max-w-[20ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-4xl">
                Keep your ATS, your VMS and every supplier you already use
              </h2>
              <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-etyme-muted">
                Etyme sits in front of what you already use — it doesn’t
                replace it. Nothing to switch off, no supplier onboarding
                project, nobody to kick out. It just keeps the one record that
                spans everything else, which none of your other tools do.
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
                  Paste the distribution list you already use. Every firm on
                  it, you can send a role to today — whether they’ve
                  heard of Etyme or not.
                </p>
              </li>
              <li className="border-t border-etyme-rule pt-4">
                <p className="text-[15px] font-semibold text-etyme-ink">
                  What’s yours stays yours
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-etyme-muted">
                  Your rates, your suppliers, your contractors’ records — all
                  yours. Every list exports to CSV straight from the screen.
                  You never have to ask us for your own data.
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Who else is on it ────────────────────────────────────── */}
      {/* The client is the customer, decided 2026-09-10. The suppliers
          are here because their client is, and they read this section
          over the client's shoulder — it is not four audiences as
          equals, which is how a hiring manager came away believing this
          was software for staffing firms. */}
      <section id="who" className="mx-auto max-w-6xl px-6 py-16 md:py-24 scroll-mt-6">
        <p className="eyebrow mb-3">The chain you already buy through</p>
        <h2 className="max-w-[22ch] text-balance font-serif text-3xl leading-tight
                       tracking-[-0.02em] text-etyme-ink md:text-4xl">
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
          stranger. One record across the whole chain is what fixes all
          three at once — and every hop is written down: what was sent, to
          whom, under which agreement, and what was withheld.
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
      {/* Two cards instead of two paragraphs — the split itself is the
          point, so it should look split.

          The heading used to say "about half of what looks like AI here
          is not", which nobody could check. The count below is from
          lib/autonomy, which names every action this system takes, and
          the test recomputes it rather than trusting the words. The
          denominator is stated on the page for the same reason: it is
          the count of unprompted actions, not the whole product. The
          last sentence names no ordinal on purpose — the count grows
          every time somebody adds an action, and "the one that is
          left" stays true while "the thirteenth" goes stale. */}
      <section id="compliance" className="border-y border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <h2 className="max-w-[18ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-4xl">
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
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <p className="eyebrow mb-3">What it costs</p>
          <h2 className="max-w-[22ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-4xl">
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

      {/* ── Close ────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center md:py-24">
          <h2 className="text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-4xl">
            Start with one role and one supplier you already use
          </h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-[17px] leading-relaxed text-etyme-muted">
            We’re building this with a small number of companies instead
            of launching to everyone. You get direct access to the people
            building it. We get a real chain to build against.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {/* Same one door as the hero. These two had no picker at
                all — they seeded straight into CLIENT or BENCH — so a
                visitor who scrolled past the hero got fewer seats than
                one who did not. */}
            <TryDemo
              side="HIRING"
              asks
              label="See it as a company →"
              className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                         transition-opacity hover:opacity-90"
            />
            <TryDemo
              side="CANDIDATE"
              label="See it as a candidate →"
              className="px-2 py-3.5 text-sm font-medium text-etyme-muted underline
                         underline-offset-2 transition-colors hover:text-etyme-ink"
            />
          </div>

          <ul className="mx-auto mt-10 flex max-w-lg flex-wrap justify-center gap-x-6 gap-y-2
                         font-mono text-[12px] text-etyme-muted">
            {[
              'No card to look around',
              'Keep your ATS, VMS and suppliers',
              'Lists export to CSV',
              'You talk to the people building it',
            ].map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── The ask ──────────────────────────────────────────────── */}
      {/* Quiet on purpose, and last. A page that opens with a form is a
          page that wants something before it has given anything.

          The words are in src/lib/public-site/leads.ts so a test can read
          them: no newsletter, no sequence, no price. The price is settled
          — free until five real vendors — and it is settled in CLAUDE.md
          rather than invented on a form somebody has to take back. */}
      <section id="contact" className="border-t border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
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
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
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
