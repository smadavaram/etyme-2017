import Link from 'next/link'
import { EtymeLogo, EtymeClockMark } from '@/components/logo'

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative bg-etyme-ink overflow-hidden">
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
            <p className="text-sm font-semibold tracking-[0.14em] uppercase text-etyme-amber mb-4 animate-fade-in">
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
              <Link
                href="/login"
                className="inline-flex items-center px-6 py-3.5 text-sm font-semibold
                           text-etyme-ink bg-white rounded-lg hover:bg-white/90
                           transition-colors shadow-lg shadow-white/10"
              >
                Get started
              </Link>
              <a
                href="#how-it-works"
                className="text-sm font-medium text-white/50 hover:text-white/80
                           transition-colors"
              >
                See how it works →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Argument ─────────────────────────────────── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <p className="eyebrow mb-3">The argument</p>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em] leading-snug mb-4 text-balance">
          AI eats the front of the chain.
          <br />
          It cannot touch the back.
        </h2>
        <p className="text-base text-etyme-muted max-w-2xl mb-12 leading-relaxed">
          A staffing company makes money today because it knows who is available
          and the client does not. AI closes that gap. Everything after it —
          employment, timesheets, invoices, compliance — remains irreducibly human
          and legal.
        </p>

        {/* Pipeline */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { n: '01', t: 'Find', d: 'Search, hotlists, outreach', fades: true },
            { n: '02', t: 'Screen', d: 'Resumes, write-ups, submissions', fades: true },
            { n: '03', t: 'Interview', d: 'Scheduling, follow-ups', fades: true },
            { n: '04', t: 'Select', d: 'Rate negotiation, offers', fades: true },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-xl p-4 border transition-all"
              style={{
                background: '#FFFBEB',
                borderColor: '#FCD34D',
              }}
            >
              <div className="text-[10px] font-bold text-etyme-amber mb-1">{s.n}</div>
              <div className="text-sm font-semibold mb-0.5">{s.t}</div>
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
              className="rounded-xl p-4 border transition-all"
              style={{
                background: '#ECFDF5',
                borderColor: '#A7F3D0',
              }}
            >
              <div className="text-[10px] font-bold text-etyme-green mb-1">{s.n}</div>
              <div className="text-sm font-semibold mb-0.5">{s.t}</div>
              <div className="text-xs text-etyme-muted leading-snug">{s.d}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-6 text-xs text-etyme-muted">
          <span className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded"
              style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}
            />
            AI collapses this
          </span>
          <span className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded"
              style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}
            />
            Someone still has to do this — Etyme makes it work
          </span>
        </div>
      </section>

      {/* ── Three Pillars ─────────────────────────────────── */}
      <section className="bg-white border-y border-etyme-border">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-24">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="evidence-dot" />
                <span className="text-xs font-semibold uppercase tracking-widest text-etyme-green">
                  Evidence
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2">
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
                <span
                  className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                  style={{ background: '#7C3AED' }}
                />
                <span className="text-xs font-semibold uppercase tracking-widest text-etyme-purple">
                  Compliance
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2">
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
                <span
                  className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                  style={{ background: '#F59E0B' }}
                />
                <span className="text-xs font-semibold uppercase tracking-widest text-etyme-amber">
                  Transparency
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2">
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
      <section className="bg-etyme-ink">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-20 text-center">
          <EtymeClockMark size={40} className="mx-auto mb-6 opacity-30" />
          <h2 className="text-2xl md:text-3xl font-semibold text-white mb-3 tracking-[-0.02em]">
            Run a staffing company at a fraction of the headcount.
          </h2>
          <p className="text-sm text-white/40 max-w-lg mx-auto mb-8">
            Three recruiters instead of thirty. But you still employ people, sponsor
            visas, and move money every two weeks. Etyme is the system that makes that possible.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center px-8 py-3.5 text-sm font-semibold
                       text-etyme-ink bg-white rounded-lg hover:bg-white/90
                       transition-colors"
          >
            Get started free
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="bg-etyme-ink border-t border-white/5">
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
