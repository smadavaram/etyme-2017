import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { TryDemo } from '@/components/try-demo'

/**
 * The front door, led by the buyer.
 *
 * The old page sold the back office — "the evidence layer for contingent
 * work" — which is the half nobody is being asked to pay for and the
 * half no visitor can evaluate from a paragraph. It had one door and no
 * proof on the screen.
 *
 * This one leads with the hiring side, because that is the side being
 * sold, and because a client who mandates Etyme brings twelve suppliers
 * with them. The supplier door is still here and still works on its own
 * — a vendor with a bench and no client on the platform gets value from
 * day one — but it is second.
 *
 * ── Every number below is real ───────────────────────────────────────
 *
 * The pile shown in the hero is what the screen actually produces on the
 * seeded sandbox: ten arrived, four worth reading, and the six reasons.
 * Nothing here is a mockup of a feature that does not exist, which is
 * the only reason the "Look around" button can sit next to it.
 */

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
          <nav className="mb-16 flex items-center justify-between md:mb-20">
            <EtymeLogo size="lg" inverted />
            <Link
              href="/login"
              className="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium
                         text-white/70 transition-colors hover:border-white/25 hover:text-white"
            >
              Sign in
            </Link>
          </nav>

          <div className="grid items-start gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em]"
                 style={{ color: '#00D4FF' }}>
                For companies that hire contractors
              </p>
              <h1 className="mb-6 max-w-[14ch] text-balance text-4xl font-semibold
                             leading-[1.05] tracking-[-0.03em] text-white md:text-[56px]">
                Stop reading bad submissions.
              </h1>
              <p className="mb-9 max-w-xl text-lg leading-relaxed text-white/55 md:text-xl">
                A hard role gets a hundred CVs and most are noise. The work was
                never finding people — it&rsquo;s finding the four worth an
                interview. Etyme sits in front of the suppliers you already use
                and does that part.
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

            {/* The pile. Exactly what the product produces — not a drawing
                of one. */}
            <div className="overflow-hidden rounded-xl bg-etyme-surface shadow-2xl">
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

      {/* ── Bring your own suppliers ──────────────────────────── */}
      <section className="border-y border-etyme-rule bg-etyme-surface">
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
