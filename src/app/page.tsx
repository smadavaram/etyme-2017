import Link from 'next/link'
import { EtymeLogo, EtymeMark } from '@/components/logo'
import { TryDemo } from '@/components/try-demo'

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative bg-etyme-navy overflow-hidden">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 pt-8 pb-24 md:pt-12 md:pb-32">
          {/* Nav */}
          <nav className="flex items-center justify-between mb-20 md:mb-28">
            <EtymeLogo size="lg" inverted />
            <Link
              href="/login"
              className="text-sm font-medium text-white/70 hover:text-white
                         transition-colors px-5 py-2.5 rounded-lg
                         border border-white/10 hover:border-white/25"
            >
              Sign in
            </Link>
          </nav>

          {/* Headline */}
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-[0.14em] uppercase mb-4 animate-fade-in"
               style={{ color: '#00D4FF' }}>
              System of record
            </p>
            <h1 className="text-4xl md:text-[56px] font-semibold text-white leading-[1.1] tracking-[-0.03em] mb-6 text-balance animate-slide-up">
              The evidence layer for
              <br />
              contingent work.
            </h1>
            <p className="text-lg md:text-xl text-white/50 leading-relaxed max-w-2xl mb-10 animate-slide-up"
               style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
              AI eliminated the recruiter&rsquo;s search advantage. What remains is proof:
              that the work happened, that the person is authorized, that the money moved.
              Etyme is the system of record for everything after the hire.
            </p>
            <div className="flex items-center gap-4 animate-slide-up"
                 style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
              {/* A seeded workspace of their own, in one click. Nobody
                  evaluates a staffing system from a marketing page, and
                  nobody signs up to find out. */}
              <TryDemo
                label="Look around"
                className="inline-flex items-center px-6 py-3.5 text-sm font-semibold
                           text-etyme-navy bg-white rounded-lg hover:bg-white/90
                           transition-colors shadow-lg shadow-white/10
                           disabled:opacity-70"
              />
              <Link
                href="/login"
                className="text-sm font-medium text-white/50 hover:text-white/80
                           transition-colors"
              >
                Sign in →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Argument ─────────────────────────────────── */}
      <section id="how-it-works" className="bg-etyme-canvas">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
          <div className="eyebrow mb-3">The argument</div>
          <h2 className="font-serif text-2xl md:text-3xl tracking-[-0.02em] leading-snug mb-4 text-balance text-etyme-ink">
            AI eats the front of the chain.
            <br />
            It cannot touch the back.
          </h2>
          <p className="text-body text-etyme-muted max-w-2xl mb-12 leading-relaxed">
            A staffing company makes money today because it knows who is available
            and the client does not. AI closes that gap. Everything after it —
            employment, timesheets, invoices, compliance — remains irreducibly human
            and legal.
          </p>

          {/* Pipeline */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { n: '01', t: 'Find', d: 'Search, hotlists, outreach' },
              { n: '02', t: 'Screen', d: 'Resumes, write-ups, submissions' },
              { n: '03', t: 'Interview', d: 'Scheduling, follow-ups' },
              { n: '04', t: 'Select', d: 'Rate negotiation, offers' },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-lg p-4 border border-etyme-rule bg-etyme-surface"
              >
                <div className="text-[10px] font-bold mb-1 text-etyme-faint">{s.n}</div>
                <div className="text-sm font-semibold mb-0.5 text-etyme-ink">{s.t}</div>
                <div className="text-xs text-etyme-muted leading-snug">{s.d}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { n: '05', t: 'Employ', d: 'Contract, I-9, visa, insurance' },
              { n: '06', t: 'Track', d: 'Timesheets, approvals, cycles' },
              { n: '07', t: 'Pay', d: 'Invoices, payroll, C2C, float' },
              { n: '08', t: 'Prove', d: 'Verified hours, extensions' },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-lg p-4 border border-etyme-action/20 bg-etyme-action/5"
              >
                <div className="text-[10px] font-bold text-etyme-action mb-1">{s.n}</div>
                <div className="text-sm font-semibold mb-0.5 text-etyme-ink">{s.t}</div>
                <div className="text-xs text-etyme-muted leading-snug">{s.d}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-6 text-xs text-etyme-muted">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-etyme-surface border border-etyme-rule" />
              AI collapses this
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-etyme-action/5 border border-etyme-action/20" />
              Etyme makes this work
            </span>
          </div>
        </div>
      </section>

      {/* ── Three Pillars ─────────────────────────────────── */}
      <section className="bg-etyme-surface border-y border-etyme-rule">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-24">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="evidence-dot" />
                <span className="text-xs font-semibold uppercase tracking-widest text-etyme-verified">
                  Evidence
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-etyme-ink">
                Every action writes a record
              </h3>
              <p className="text-sm text-etyme-muted leading-relaxed">
                Timesheets, approvals, rate changes, compliance checks — each event is
                immutable and timestamped. When AI writes a flawless resume in seconds,
                resumes are worthless. Platform-attested receipts are the only
                trustworthy signal.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-[6px] h-[6px] rounded-full flex-shrink-0 bg-etyme-action" />
                <span className="text-xs font-semibold uppercase tracking-widest text-etyme-action">
                  Compliance
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-etyme-ink">
                Block where required. Warn everywhere else.
              </h3>
              <p className="text-sm text-etyme-muted leading-relaxed">
                Tenure limits, visa expiry, break-in-service — the system blocks when
                the law requires it. For everything else, it warns, captures a reason,
                and proceeds. Never silently permits.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-[6px] h-[6px] rounded-full flex-shrink-0 bg-etyme-attention" />
                <span className="text-xs font-semibold uppercase tracking-widest text-etyme-attention">
                  Transparency
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-etyme-ink">
                Trust by showing, not by hiding
              </h3>
              <p className="text-sm text-etyme-muted leading-relaxed">
                Rate progression, bench pay honoured, median tenure — trust is earned
                through visible evidence, not through the absence of disclosure.
                Two margins are distinguished: arbitrage and expertise.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="bg-etyme-navy">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-20 text-center">
          <EtymeMark size={40} className="mx-auto mb-6 opacity-40" />
          <h2 className="text-2xl md:text-3xl font-semibold text-white mb-3 tracking-[-0.02em]">
            Run a staffing company at a fraction of the headcount.
          </h2>
          <p className="text-sm text-white/40 max-w-lg mx-auto mb-8">
            Three recruiters instead of thirty. But you still employ people, sponsor
            visas, and move money every two weeks. Etyme is the system that makes that possible.
          </p>
          <TryDemo
            label="Look around — no sign-up"
            className="inline-flex items-center px-8 py-3.5 text-sm font-semibold
                       text-etyme-navy bg-white rounded-lg hover:bg-white/90
                       transition-colors disabled:opacity-70"
          />
          <p className="mt-3 text-xs text-white/35">
            Your own copy, filled with a working book. Break it however you like.
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="bg-etyme-navy border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
          <EtymeLogo size="sm" inverted />
          <p className="text-xs text-white/25">
            © {new Date().getFullYear()} Etyme Inc. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  )
}
