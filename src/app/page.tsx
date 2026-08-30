import { EtymeLogo } from '@/components/logo'
import { TryDemo } from '@/components/try-demo'
import { Ask } from '@/app/site/ask'
import { ASK_COPY } from '@/lib/public-site/leads'
import Link from 'next/link'

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
 * ── Everything below it, rewritten ───────────────────────────────────
 *
 * The hero was right and the rest of the page was written to somebody
 * we are not selling to yet. "Three checks your suppliers cannot run",
 * "Stop reading bad submissions", "Nobody has to be replaced" — every
 * section addressed a client with eleven suppliers. Phase 1 ships to
 * paying staffing firms, so the page was selling to the people who are
 * not the customers in front of the people who are.
 *
 * And nowhere did it say how any of this works as a business: not who
 * pays, not what it costs, not what it sits beside, not what anybody
 * does differently on Monday. A visitor could not answer "is this for
 * me and what would I do with it", which is the only question a landing
 * page has to answer.
 *
 * So, in order: who it is for and why the chain needs the same product
 * at every hop; what it sits beside rather than replaces; the four
 * questions a firm answers with a phone call and a guess today; the
 * tenure argument on its own, because it is the sharpest wedge and it
 * was the second of three bullets in a grid; and what it costs, which
 * is not settled and says so.
 *
 * Cut: the shortlist panel and the score breakdown. Both were real
 * proof and both made the page read as a screening tool — the demo
 * button proves the product better than a picture of it does.
 *
 * ── Every claim here is checkable ────────────────────────────────────
 *
 * The numbers are what the seeded sandbox produces, and are labelled as
 * a worked example where they are one. Nothing here is a drawing of a
 * feature that does not exist, which is the only reason a "Look around"
 * button can sit next to it.
 *
 * Two claims came off this page because nothing stands behind them:
 * "your data exports in full, any time" — the eighteen lists built on
 * the shared table export to CSV, which is a smaller promise — and
 * "set-up takes an afternoon", which nobody has measured.
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
 * nothing organising them. An enterprise buyer evaluating a system of
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
      { t: 'Requisitions & sourcing', d: 'Roles arrive as seats — duplicates merge on their own.', href: '#lifecycle' },
      { t: 'Screening & submissions', d: 'Rules run first, one judgement second.', href: '#lifecycle' },
      { t: 'Timesheets & invoicing', d: 'Hours approved, invoices matched to the order.', href: '#monday' },
      { t: 'Tenure ledger', d: 'One number, across every supplier a person has worked through.', href: '#tenure' },
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
      { t: 'Work authorisation', d: 'Blocked, not warned, where the law is behind it.', href: '#tenure' },
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
  { when: 'Started', what: '1 Oct', detail: 'PO NW-40118 · cost centre EA-4100' },
  { when: 'Hours', what: '152', detail: '4 timesheets approved' },
  { when: 'Invoiced', what: '$11,856', detail: '45 day terms · matched to the PO' },
]

/**
 * The contingent contract lifecycle. Eighteen stages, in order.
 *
 * This is the actual visual proof of the product — not a list of nine
 * module names with arrows between them, which told a visitor nothing
 * about how a placement actually moves. Eighteen numbered stages does:
 * it is the closest thing on the page to opening the app.
 *
 * gate: true marks the four stages that can stop the deal rather than
 * only record it — the same four the internal delivery matrix marks in
 * clay, for the same reason.
 */
const LIFECYCLE: { t: string; d: string; gate?: boolean }[] = [
  { t: 'Demand raised', d: 'A manager needs somebody' },
  { t: 'Approved to source', d: 'Budget, headcount, rate band', gate: true },
  { t: 'Released to suppliers', d: 'Who sees it, at what rate band' },
  { t: 'Submitted', d: 'CV, rate, availability, right to represent' },
  { t: 'Screened', d: 'Rules first, then one judgement' },
  { t: 'Interviewed', d: 'Three-party scheduling and feedback' },
  { t: 'Selected', d: 'The client picks' },
  { t: 'Awarded', d: 'Seat closes, others stood down', gate: true },
  { t: 'Papered', d: 'MSA, SOW, PO, sell and buy contracts' },
  { t: 'Cleared', d: 'Work authorisation, checks, insurance', gate: true },
  { t: 'Started', d: 'Badge, access, first day on site' },
  { t: 'Working', d: 'Time and expense, approved and accepted' },
  { t: 'Billed', d: 'Invoice raised against the order' },
  { t: 'Paid', d: 'Consultant paid, client collected' },
  { t: 'Changed', d: 'Rate change, extension, transfer', gate: true },
  { t: 'Rolled off', d: 'Notice, handover, releasing-soon pool' },
  { t: 'Settled', d: 'Order closed, balance to the cost centre' },
  { t: 'Alumni', d: 'Tenure ledger keeps counting' },
]

/**
 * The chain, as positions rather than as kinds of company.
 *
 * Nobody says this out loud and it is the thing that decides the shape
 * of the product: the same firm is a prime on Monday's role and a sub
 * on Tuesday's. Build for one of them and the other has to keep the
 * spreadsheet anyway.
 */
const POSITIONS = [
  {
    who: 'The company hiring',
    sees:
      'Eleven suppliers, eleven spreadsheets. You know what each contract costs. ' +
      'You don’t know what any one person actually costs you, or how long ' +
      'they’ve really been on site.',
  },
  {
    who: 'The prime',
    sees:
      'Holds the client relationship, and an agreement that says don’t name ' +
      'the client further down the chain. Forwards the raw email anyway — ' +
      'redacting it properly is more work than most people bother with.',
  },
  {
    who: 'The sub',
    sees:
      'Answers a role with half the picture. Prices it off a title, a rate, ' +
      'and a guess about who is really behind it.',
  },
  {
    who: 'The bench operator',
    sees:
      'Has the person, can’t see the job. Only learns the client’s name ' +
      'once there is a signed right to represent — which is exactly why ' +
      'benches don’t trust portals.',
  },
]

/**
 * The same four parties, said as what they get rather than what they
 * are missing. Concur's own homepage does this: one card per audience,
 * three lines each, nothing to scroll past to find your own name.
 *
 * Every line is a real screen or a real rule already built — nothing
 * here is a feature promised for later.
 */
const GETS = [
  {
    who: 'The company hiring',
    lines: [
      'One record per contractor, across every supplier they use',
      'Real tenure and real margin — not what a vendor self-reports',
      'Approvals that clear on their own, inside the policy you set',
    ],
  },
  {
    who: 'The prime',
    lines: [
      'Forward a role without leaking who the client is',
      'See a duplicate submission before your client does',
      'Bill the moment a milestone is signed off, not a guess later',
    ],
  },
  {
    who: 'The sub',
    lines: [
      'Know the real band before you price a role',
      'One submission, never sent twice by accident',
      'Paid on hours that were actually approved, not disputed later',
    ],
  },
  {
    who: 'The bench operator',
    lines: [
      'Your bench stays private until there is a signed right to represent',
      'See exactly what a day of waiting is costing you',
      'One profile, submitted anywhere, tracked everywhere it goes',
    ],
  },
]

/**
 * Four questions, four screens that already exist.
 *
 * Not a feature list. These are the four things a staffing firm answers
 * today with a phone call, a spreadsheet and a guess, and each line
 * describes what the screen actually does rather than what it is called.
 */
const MONDAY = [
  {
    screen: 'Leads',
    q: 'A role arrived. Is it four roles, or one role four times?',
    a:
      'Adverts and forwarded emails turn into seats on their own. Three primes ' +
      'carrying the same seat show up as one — because submitting your person ' +
      'through all three just gets them rejected three times.',
  },
  {
    screen: 'Bench',
    q: 'Do we have anybody, and what is the bench costing while it waits?',
    a:
      'Who’s free right now, who’s about to be, and what every idle ' +
      'day is costing you — per person and across the whole bench, against ' +
      'what’s actually open.',
  },
  {
    screen: 'Profitability',
    q: 'What does this placement actually make?',
    a:
      'Not bill rate minus pay rate times hours. The client signed off on forty ' +
      'hours, you accepted thirty-eight — the real margin is neither of those ' +
      'simple numbers. Every figure comes straight off what actually happened.',
  },
  {
    screen: 'Payables',
    q: 'Who owes us, and whose work are we financing?',
    a:
      'Your client pays you on day 75 against 60-day terms. You pay your sub on ' +
      'day 30. That gap is your own cash funding somebody else’s payroll — and ' +
      'nobody sends you a bill for it.',
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
                <TryDemo
                  side="HIRING"
                  label="See it as the company →"
                  className="rounded-lg bg-white px-6 py-3.5 text-sm font-semibold
                             text-etyme-navy shadow-lg shadow-white/10 transition-colors
                             hover:bg-white/90"
                />
                <TryDemo
                  side="BENCH"
                  label="See it as the supplier →"
                  className="rounded-lg border border-white/20 px-6 py-3.5 text-sm
                             font-semibold text-white/85 transition-colors
                             hover:border-white/40 hover:text-white"
                />
              </div>
              <p className="mt-4 font-mono text-xs text-white/55">
                No card, no sign-up. Your own worked example, seeded and yours to break.
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

      {/* ── The lifecycle ────────────────────────────────────────── */}
      {/* A layer is proved by breadth, not by argument, and a picture of
          the whole thing beats a paragraph describing it every time. This
          is the one section on the page that shows the product rather
          than talking about it. */}
      <section id="lifecycle" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-16">
          <p className="eyebrow mb-2">How a placement actually moves</p>
          <h2 className="max-w-[26ch] text-balance font-serif text-2xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-3xl">
            Eighteen stages, one record the whole way through
          </h2>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-etyme-muted">
            The four in clay can stop the deal. Everything else just
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
            One record, end to end — one company, or nine of them in a chain.
          </p>
        </div>
      </section>

      {/* ── Who this is for ──────────────────────────────────────── */}
      {/* The page used to pick one reader — a client with eleven
          suppliers — and every other reader bounced. The product serves
          a chain, so the page says so. */}
      <section id="who" className="mx-auto max-w-6xl px-6 py-16 md:py-24 scroll-mt-6">
        <p className="eyebrow mb-3">Who this is for</p>
        <h2 className="max-w-[22ch] text-balance font-serif text-3xl leading-tight
                       tracking-[-0.02em] text-etyme-ink md:text-4xl">
          A role goes down a chain. A person comes back up it.
        </h2>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-muted">
          Client, MSP, prime, sub, bench vendor — a role passes through all of
          them. At every hop, someone forwards an email with more in it than they
          should send, because retyping it properly takes too long. Every firm
          ends up holding its own half of the same contractor’s story.
          Nobody has the whole thing.
        </p>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-etyme-ink">
          Prime, sub and bench are positions on a deal, not kinds of company. The
          same firm can be a prime this week and a sub next week — same people,
          different deal. That’s why this is one product, not four.
        </p>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {POSITIONS.map((p) => (
            <div key={p.who} className="border-t-2 border-etyme-ink pt-5">
              <h3 className="mb-2 text-[17px] font-semibold text-etyme-ink">{p.who}</h3>
              <p className="text-[15px] leading-relaxed text-etyme-muted">{p.sees}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What each one gets ───────────────────────────────────── */}
      {/* The Concur move: one card per audience, three lines each, and
          you find your own name in one glance instead of reading four
          paragraphs to work out which one is you. */}
      <section className="border-y border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="eyebrow mb-3">What each one gets</p>
          <h2 className="max-w-[20ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-4xl">
            Find yourself below — that&rsquo;s what you get
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {GETS.map((g) => (
              <div key={g.who} className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
                <h3 className="mb-3 text-[15px] font-semibold text-etyme-ink">{g.who}</h3>
                <ul className="space-y-2.5">
                  {g.lines.map((line) => (
                    <li key={line} className="flex gap-2 text-[13.5px] leading-snug text-etyme-muted">
                      <span aria-hidden style={{ color: 'var(--color-verified)' }}>✓</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What it sits beside ──────────────────────────────────── */}
      {/* This was thirteen-pixel grey text under an arrow diagram and it
          is the most useful sentence on the page. */}
      <section className="border-y border-etyme-rule bg-etyme-surface">
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
                  Roles arrive the way they already do
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-etyme-muted">
                  Paste in a forwarded email, an advert, five of them at once —
                  they come back as seats, duplicates already merged. Nobody
                  has to change how they send you work.
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
                  Your bench, your rates, your client relationships — all
                  yours. Every list exports to CSV straight from the screen.
                  You never have to ask us for your own data.
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Monday ───────────────────────────────────────────────── */}
      {/* Four questions a firm answers today with a phone call and a
          guess, and the four screens that answer them instead. */}
      <section id="monday" className="mx-auto max-w-6xl px-6 py-16 md:py-24 scroll-mt-6">
        <p className="eyebrow mb-3">What changes on Monday</p>
        <h2 className="max-w-[24ch] text-balance font-serif text-3xl leading-tight
                       tracking-[-0.02em] text-etyme-ink md:text-4xl">
          Four questions, answered before lunch instead of by Thursday
        </h2>
        <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-etyme-muted">
          Right now, every one of these gets answered with a phone call, a
          spreadsheet and a guess. Here, they’re four screens — and
          they’re why firms keep paying after month one.
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

      {/* ── Tenure ───────────────────────────────────────────────── */}
      {/* The sharpest wedge, and it was the second of three bullets in a
          grid. Efficiency loses to "we are managing fine". A number
          nobody can produce and a lawyer wants does not. */}
      <section id="tenure" className="border-y border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">Tenure</p>
              <h2 className="max-w-[20ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-4xl">
                Nobody can tell you how long a contractor has actually been on site
              </h2>
              <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-etyme-muted">
                Ask each supplier and each one tells you the truth — about
                their own contract. Fourteen months. Three months. Two
                months. But the person’s actually been at that client
                for nineteen months straight. No single supplier can add
                that up, because none of them can see the other two.
              </p>
              <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-etyme-ink">
                It is an exposure rather than a saving, and that’s
                exactly why we lead with it. A company doing fine on
                efficiency is still carrying this risk — and usually finds
                out about it from a lawyer, not from us.
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
        </div>
      </section>

      {/* ── Rules first, model second ────────────────────────────── */}
      {/* Two cards instead of two paragraphs — the split itself is the
          point, so it should look split. */}
      <section id="compliance" className="mx-auto max-w-6xl px-6 py-16 md:py-20 scroll-mt-6">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <h2 className="max-w-[18ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-4xl">
            About half of what looks like AI here is not
          </h2>
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
                Reads CVs, drafts messages. Never decides whether someone
                can legally work. Every score comes with what it&rsquo;s
                made of and what it couldn&rsquo;t find — a bare number
                with no explanation is a bug here, not a feature.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── What it costs ────────────────────────────────────────── */}
      {/* A page with no price makes a reader assume enterprise sales and
          leave. We do not have one yet, so it says that rather than
          nothing — and says what is settled, which is the shape. */}
      <section id="why" className="border-y border-etyme-rule bg-etyme-surface scroll-mt-6">
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
            We’re building this with a small number of firms instead
            of launching to everyone. You get direct access to the people
            building it. We get a real chain to build against.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <TryDemo
              side="HIRING"
              label="See it as the company →"
              className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                         transition-opacity hover:opacity-90"
            />
            <TryDemo
              side="BENCH"
              label="See it as the supplier →"
              className="rounded-lg border border-etyme-rule px-6 py-3.5 text-sm font-semibold
                         text-etyme-ink transition-colors hover:border-etyme-ink"
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
      <section className="border-t border-etyme-rule bg-etyme-surface">
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

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t
                        border-etyme-rule pt-6">
          <EtymeLogo size="sm" />
          <p className="font-mono text-[11px] text-etyme-faint">
            Contract staffing, end to end.
          </p>
        </div>
      </footer>
    </main>
  )
}
