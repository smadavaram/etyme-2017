import type { Metadata } from 'next'
import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { CensusFlow } from './flow'
import {
  CENSUS_COPY,
  deletionPromise,
  kindsSentence,
  limitsSentence,
  promises,
} from '@/lib/census-copy'

/**
 * `/census` — the first step for a client weighing Etyme.
 *
 * ── What it argues, in order ─────────────────────────────────────────
 *
 *   1. what do I get      one page, five numbers, inside five working days
 *   2. what does it cost  nothing, and no account
 *   3. does it commit me  no — the first step whether they buy or not
 *   4. what do I send     the template first, or the files they hold
 *   5. what happens to it the six promises, each linking to the agreement
 *   6. how do I start     the form, then three steps revealed in turn
 *
 * The order is the order a committee asks in. An enterprise will not
 * upload supplier invoices to a website it found yesterday, and four
 * people have to say yes before a file moves: the program manager who
 * wants the number, the CFO who reads it, procurement who owns the
 * supplier relationships, and legal who owns the data. So what happens
 * to the file is above the form rather than below it.
 *
 * ── Almost none of the words are this page's ─────────────────────────
 *
 * The file kinds, the limits, the deletion promise, the queue sentence,
 * the refusal for a personal address and the receipt are all
 * `lib/census`'s, and the six promises are the census agreement's own
 * headings. `lib/census-copy` prints them; this page lays them out.
 * A marketing page that restates a limit in its own words is a page
 * that promises five files after somebody raises the limit to twenty.
 *
 * ── What is not here ─────────────────────────────────────────────────
 *
 * No price, because none is settled and inventing one is the founder's
 * decision alone. No model and no claim about one: a person reads the
 * file, and the agreement says so. No countdown and no invented
 * deadline — the only scarcity sentence on this page is the queue
 * position, which is a count of open censuses and nothing else.
 *
 * Owned by etyme-market (`app/census` in `lib/domains.ts`).
 */

export const metadata: Metadata = {
  title: 'Contractor census — Etyme',
  description:
    'Send what you already hold about your contractors. A named person at Etyme sends back ' +
    'one page inside five working days: who is on your sites by supplier, what you spend, ' +
    'where two suppliers charge differently for one skill, and what we could not see.',
}

export default function CensusPage() {
  const six = promises()
  const deletion = deletionPromise()

  return (
    <main className="min-h-screen bg-etyme-canvas">
      {/* ── The header ───────────────────────────────────────── */}
      <header className="border-b border-etyme-rule">
        <nav className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Etyme — home">
            <EtymeLogo size="md" />
          </Link>
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
      {/* Category first: contractors and the suppliers behind them,
          before anything about what is good. */}
      <section className="border-b border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 md:py-20">
          <p className="stat-label">{CENSUS_COPY.eyebrow}</p>
          <h1 className="mt-4 max-w-[22ch] text-balance font-serif text-4xl leading-[1.05]
                         tracking-[-0.02em] text-etyme-ink md:text-[56px]">
            {CENSUS_COPY.headline}
          </h1>
          <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-etyme-muted">
            {CENSUS_COPY.standfirst}
          </p>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-etyme-muted">
            {CENSUS_COPY.get.firstStep}
          </p>
        </div>
      </section>

      {/* ── What you get ─────────────────────────────────────── */}
      <section id="what-you-get" className="border-b border-etyme-rule">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 md:py-20">
          <h2 className="max-w-[26ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            {CENSUS_COPY.get.heading}
          </h2>

          <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-etyme-rule
                         bg-etyme-rule sm:grid-cols-2">
            {CENSUS_COPY.get.lines.map((line) => (
              <li key={line.label} className="bg-etyme-raised px-5 py-5">
                <p className="text-[15px] font-semibold text-etyme-ink">{line.label}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-etyme-muted">{line.says}</p>
              </li>
            ))}
            <li className="bg-etyme-raised px-5 py-5">
              <p className="text-[15px] font-semibold text-etyme-ink">It is free</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-etyme-muted">
                {CENSUS_COPY.get.free}
              </p>
            </li>
          </ul>
        </div>
      </section>

      {/* ── What you send ────────────────────────────────────── */}
      {/* The template first and on purpose: it is the lighter of the two
          and holds almost nothing personal, which is the point of
          offering it before the invoices. */}
      <section id="what-you-send" className="border-b border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 md:py-20">
          <h2 className="max-w-[26ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            {CENSUS_COPY.send.heading}
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
              <p className="text-[15px] font-semibold text-etyme-ink">
                {CENSUS_COPY.send.optionA.label}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">
                {CENSUS_COPY.send.optionA.says}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">
                {CENSUS_COPY.send.optionA.names}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">
                {CENSUS_COPY.send.optionA.how}
              </p>
              <a
                href={CENSUS_COPY.send.optionA.href}
                download
                className="mt-5 inline-block rounded-lg bg-etyme-action px-5 py-3 text-sm
                           font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                {CENSUS_COPY.send.optionA.button}
              </a>
            </div>

            <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
              <p className="text-[15px] font-semibold text-etyme-ink">
                {CENSUS_COPY.send.optionB.label}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">
                {CENSUS_COPY.send.optionB.says}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">
                {CENSUS_COPY.send.optionB.how}
              </p>
            </div>
          </div>

          {/* The kinds and the limits, built from the same constants the
              upload route refuses on. */}
          <p className="mt-6 max-w-[60ch] text-[14px] leading-relaxed text-etyme-muted">
            {kindsSentence()} {limitsSentence()}
          </p>
        </div>
      </section>

      {/* ── What we promise before any file moves ────────────── */}
      <section id="what-we-promise" className="border-b border-etyme-rule">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 md:py-20">
          <h2 className="max-w-[26ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            {CENSUS_COPY.promise.heading}
          </h2>
          <p className="mt-5 max-w-[56ch] text-[16px] leading-relaxed text-etyme-muted">
            {CENSUS_COPY.promise.standfirst}
          </p>

          <ul className="mt-8 divide-y divide-etyme-rule rounded-xl border border-etyme-rule
                         bg-etyme-raised">
            {six.map((promise) => (
              <li key={promise.heading} className="px-5 py-4">
                <p className="text-[15px] font-semibold text-etyme-ink">{promise.heading}</p>
                <p className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-etyme-muted">
                  {promise.says}
                </p>
              </li>
            ))}
          </ul>

          {/* The deletion promise, counted from the constant the nightly
              sweep counts from, and never a date computed here. */}
          <div className="mt-6 max-w-[60ch] rounded-xl border border-etyme-rule bg-etyme-surface p-5">
            {deletion.map((line) => (
              <p key={line} className="text-[14px] leading-relaxed text-etyme-muted first:text-etyme-ink">
                {line}
              </p>
            ))}
          </div>

          <p className="mt-6">
            <Link
              href="/legal/census-agreement"
              className="text-[15px] text-etyme-action underline underline-offset-4 hover:opacity-80"
            >
              {CENSUS_COPY.promise.agreementLabel}
            </Link>
          </p>
          <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-etyme-muted">
            {CENSUS_COPY.promise.versionSays}
          </p>
        </div>
      </section>

      {/* ── The form, then the steps after it ────────────────── */}
      <section id="ask" className="border-b border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 md:py-20">
          <CensusFlow />
        </div>
      </section>

      <footer className="bg-etyme-surface">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/" className="text-[14px] text-etyme-muted hover:text-etyme-ink">
              Home
            </Link>
            <Link
              href="/legal/census-agreement"
              className="text-[14px] text-etyme-muted hover:text-etyme-ink"
            >
              Census agreement
            </Link>
            <Link href="/privacy" className="text-[14px] text-etyme-muted hover:text-etyme-ink">
              Privacy notice
            </Link>
            <Link href="/terms" className="text-[14px] text-etyme-muted hover:text-etyme-ink">
              Terms of service
            </Link>
          </div>
          <p className="mt-6 max-w-[60ch] text-[13px] leading-relaxed text-etyme-faint">
            Etyme never runs a bench and never places anybody. A census names your suppliers and
            we do not write to any of them.
          </p>
        </div>
      </footer>
    </main>
  )
}
