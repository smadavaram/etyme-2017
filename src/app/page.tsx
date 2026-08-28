import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { TryDemo } from '@/components/try-demo'

/**
 * The front door.
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
 * The shortlist is still here, further down, doing the job it is
 * actually good at: proving the screening is real. One station in the
 * chain rather than the whole product.
 *
 * ── Every number below is real ───────────────────────────────────────
 *
 * All of it is what the seeded sandbox produces. Nothing here is a
 * drawing of a feature that does not exist, which is the only reason a
 * "Look around" button can sit next to it.
 */

/**
 * One contractor, end to end.
 *
 * The whole point of a system of record is that it holds the parts
 * nobody else joins up: the submission, the interview, the purchase
 * order, the hours, the invoice, and the tenure that spans all three
 * suppliers who have ever supplied this person.
 */
const RECORD = [
  { when: 'Submitted', what: '2 Sep', detail: '$78/hr · screened and cleared' },
  { when: 'Interviewed', what: '9 Sep', detail: 'two rounds · offer made' },
  { when: 'Started', what: '1 Oct', detail: 'PO NW-40118 · cost centre EA-4100' },
  { when: 'Hours', what: '152', detail: '4 timesheets approved' },
  { when: 'Invoiced', what: '$11,856', detail: '45 day terms · matched to the PO' },
]

/** The span, in the order the work actually happens. */
const CHAIN = [
  'Requisition', 'Suppliers', 'Submissions', 'Screening', 'Interviews',
  'Onboarding', 'Timesheets', 'Invoices', 'Compliance',
]

const SHORTLIST = [
  { name: 'Rohan Menon', from: 'Cloudepa', rate: '$78', score: 94,
    note: 'First in. Vertex sent the same person later at $96.' },
  { name: 'Marta Farrow', from: 'Cloudepa', rate: '$79', score: 88,
    note: 'Worked here before — 14 months, through a vendor you no longer use.' },
  { name: 'James Whitfield', from: 'Brightmoor', rate: '$80', score: 81, note: null },
  { name: 'Lucia Braga', from: 'Brightmoor', rate: '$81', score: 76, note: null },
]

const HELD = [
  '$96 is $11 over the band you gave them. Ask Cloudepa to come to $85.',
  'Already put forward by Cloudepa on the 16th. First in wins.',
  'Blocked: 19 months tenure here, across three vendors. Your cap is 18.',
  'On your do-not-submit list: left mid-project without notice in March.',
  'Role needs a work permit and Vertex has not said what she holds.',
  'Kestrel was not invited and there is no agreement with them on file.',
]

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-etyme-canvas">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="bg-etyme-navy">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-8 md:pb-24">
          <nav className="mb-14 flex flex-wrap items-center gap-x-8 gap-y-4 md:mb-16">
            <EtymeLogo size="lg" inverted />
            {/* The modules, named. Concur says Expense, Travel, Invoice
                before it says anything clever, and you know what it is
                in three words. A layer that shows one feature gets read
                as that feature. */}
            <ul className="hidden items-center gap-6 text-sm text-white/55 lg:flex">
              {['Suppliers', 'Requisitions', 'Screening', 'Timesheets', 'Invoices', 'Compliance'].map(
                (m) => (
                  <li key={m}>{m}</li>
                )
              )}
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
                Etyme is the system of record for the people you employ through
                somebody else — from the requisition to the invoice, across every
                staffing supplier you use. That record does not exist anywhere
                today, which is why nobody can tell you how long a contractor has
                actually been on site.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <TryDemo
                  side="HIRING"
                  label="I'm hiring →"
                  className="rounded-lg bg-white px-6 py-3.5 text-sm font-semibold
                             text-etyme-navy shadow-lg shadow-white/10 transition-colors
                             hover:bg-white/90"
                />
                <TryDemo
                  side="BENCH"
                  label="I have a bench →"
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

      {/* ── The span ─────────────────────────────────────────────── */}
      {/* A layer is proved by breadth, not by argument. One strip does
          more than a paragraph ever will. */}
      <section className="border-b border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {CHAIN.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="text-[13px] text-etyme-ink">{step}</span>
                {i < CHAIN.length - 1 && (
                  <span className="text-etyme-faint" aria-hidden>
                    →
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-etyme-muted">
            One record, end to end. Keep your ATS, your VMS and every supplier
            you already use — Etyme sits in front of them, not instead of them.
          </p>
        </div>
      </section>

      {/* ── The three nobody else can run ─────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <h2 className="max-w-[20ch] text-balance font-serif text-3xl leading-tight
                       tracking-[-0.02em] text-etyme-ink md:text-4xl">
          Three checks your suppliers cannot run
        </h2>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-etyme-muted">
          Not because they would not — because they cannot see what the other
          eleven did with the same role. Sitting between all of them, we can.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            {
              t: 'The same person, four times',
              p: 'One consultant, submitted by four suppliers at four different rates. Merged into one entry — and you get to see all four prices, which is worth more than the tidying up.',
            },
            {
              t: 'Tenure across every vendor',
              p: 'Twelve months through one supplier plus twelve through another is twenty-four months of co-employment exposure. Neither supplier can see it. Neither can you, today.',
            },
            {
              t: 'Who actually delivers',
              p: 'Days to first CV, share that clears the screen, share that gets hired — built from your own hires, not from who emails you most. Your suppliers see their own card too.',
            },
          ].map((c) => (
            <div key={c.t} className="border-t-2 border-etyme-ink pt-5">
              <h3 className="mb-2 text-[17px] font-semibold text-etyme-ink">{c.t}</h3>
              <p className="text-[15px] leading-relaxed text-etyme-muted">{c.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Screening: one station, shown properly ─────────────── */}
      {/* The pile, demoted from the hero. It is the best proof in the
          product and the worst headline: put it on top and the whole
          page reads as a recruiting tool. */}
      <section className="border-y border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">Screening</p>
              <h2 className="max-w-[17ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-4xl">
                Stop reading bad submissions
              </h2>
              <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-etyme-muted">
                A hard role gets a hundred CVs and most are noise. The work was
                never finding people — it is finding the four worth an interview.
              </p>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-etyme-muted">
                Every one held back names what the supplier has to fix, because a
                screen that only says no trains them to send more, not better.
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-etyme-rule bg-etyme-raised">
              <div className="border-b border-etyme-rule bg-etyme-canvas px-5 py-3">
                <p className="stat-label">Senior Java Developer · Dallas</p>
                <p className="mt-1 font-mono text-[13px] text-etyme-ink">
                  10 arrived. 4 worth reading. 6 held back.
                </p>
              </div>

              {SHORTLIST.map((c) => (
                <div key={c.name} className="border-b border-etyme-rule px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold text-etyme-ink">{c.name}</span>
                    <span
                      className="font-serif text-[18px] tabular-nums"
                      style={{ color: c.score >= 85 ? 'var(--color-verified)' : undefined }}
                    >
                      {c.score}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-etyme-faint">
                    {c.from} · {c.rate}/hr
                  </p>
                  {c.note && (
                    <p className="mt-1.5 rounded px-2 py-1 font-mono text-[11px] leading-snug"
                       style={{ background: '#EDF1ED', color: 'var(--color-verified)' }}>
                      {c.note}
                    </p>
                  )}
                </div>
              ))}

              <div className="px-5 py-3">
                <p className="stat-label">Held back</p>
                <ul className="mt-2 space-y-1.5">
                  {HELD.slice(0, 3).map((h) => (
                    <li key={h} className="font-mono text-[11px] leading-snug text-etyme-muted">
                      {h}
                    </li>
                  ))}
                  <li className="font-mono text-[11px] text-etyme-faint">
                    and 3 more, each with what the supplier has to fix
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bring your own suppliers ──────────────────────────── */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="eyebrow mb-3">Nobody has to be replaced</p>
              <h2 className="max-w-[18ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-4xl">
                Keep the suppliers you already have
              </h2>
              <p className="mt-4 max-w-[50ch] text-[17px] leading-relaxed text-etyme-muted">
                Paste the distribution list you already email. Every firm on it
                becomes somebody you can send a role to today — whether or not
                they have heard of us. They find out because a role arrives,
                which is the only message a staffing firm opens first time.
              </p>
              <p className="mt-4 max-w-[50ch] text-[15px] leading-relaxed text-etyme-faint">
                No procurement exercise, no supplier onboarding project, no
                switching. Etyme sits in front of the supply chain you have.
              </p>
            </div>

            <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-6">
              <p className="stat-label">What a supplier sees</p>
              <p className="mt-3 font-serif text-[22px] leading-snug text-etyme-ink">
                Calder Manufacturing listed you as a supplier
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-etyme-muted">
                There is <strong className="text-etyme-ink">1 role waiting</strong> for
                you. Sign in and you can answer it straight away — no bench to
                build first, no setup.
              </p>
              <p className="mt-4 border-t border-etyme-rule pt-3 font-mono text-[11px] text-etyme-faint">
                Their bench, rates and client relationships stay theirs.
                Exportable in full, any time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Every score shows its working ─────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h2 className="max-w-[16ch] text-balance font-serif text-3xl leading-tight
                           tracking-[-0.02em] text-etyme-ink md:text-4xl">
              Every score shows its working
            </h2>
            <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-etyme-muted">
              You have seen &ldquo;AI matching&rdquo; before. Usually a keyword
              search with a percentage bolted on the front.
            </p>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-etyme-muted">
              The dull checks — rate against band, permit expiry, missing
              documents — are done by plain rules, not by a model. They are
              right every time and they cost nothing. Roughly half of what
              looks like AI here is not, and that is on purpose.
            </p>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-etyme-muted">
              A person reviews a sample every week. Software that grades its own
              homework will tell you it is brilliant while your suppliers
              quietly get worse.
            </p>
          </div>

          <div className="rounded-xl border border-etyme-rule bg-etyme-surface p-6">
            <p className="stat-label">What a 94 is made of</p>
            <ul className="mt-4 space-y-3">
              {[
                ['40/40', 'Spring Boot, 7 years', '“Spring Boot microservices, 2018–present” — CV p.2', true],
                ['25/25', 'AWS in production', '“EKS, RDS, migrated 40 services” — CV p.2', true],
                ['15/15', 'Located in Dallas', 'Address on file · hybrid acceptable', true],
                ['14/15', 'Available in the window', 'Free now, you wanted a two-week start', true],
                ['0/5', 'Kafka — nice to have', 'Not found anywhere in the CV', false],
              ].map(([pts, label, ev, ok]) => (
                <li key={label as string} className="flex gap-3 border-b border-etyme-rule pb-3 last:border-0">
                  <span
                    className="w-14 shrink-0 font-mono text-[12px] tabular-nums"
                    style={{ color: ok ? 'var(--color-verified)' : 'var(--color-attention)' }}
                  >
                    {ok ? '✓' : '✕'} {pts as string}
                  </span>
                  <span>
                    <span className="block text-[14px] text-etyme-ink">{label as string}</span>
                    <span className="block font-mono text-[11px] leading-snug text-etyme-faint">
                      {ev as string}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Close ────────────────────────────────────────────── */}
      <section className="border-t border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
          <h2 className="text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-4xl">
            Start with one role you are struggling to fill
          </h2>
          <p className="mx-auto mt-4 max-w-[46ch] text-[17px] leading-relaxed text-etyme-muted">
            We are building this with a small number of firms rather than
            launching at everybody. You will know within an hour whether it is
            worth your time.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <TryDemo
              side="HIRING"
              label="I'm hiring →"
              className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                         transition-opacity hover:opacity-90"
            />
            <TryDemo
              side="BENCH"
              label="I have a bench →"
              className="rounded-lg border border-etyme-rule px-6 py-3.5 text-sm font-semibold
                         text-etyme-ink transition-colors hover:border-etyme-ink"
            />
          </div>

          <ul className="mx-auto mt-10 flex max-w-lg flex-wrap justify-center gap-x-6 gap-y-2
                         font-mono text-[12px] text-etyme-muted">
            {[
              'Set-up takes an afternoon',
              'Keep your ATS, VMS and vendors',
              'Your data exports in full, any time',
              'You talk to the people building it',
            ].map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
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
