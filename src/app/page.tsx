import type { Metadata } from 'next'
import { SiteHeader } from '@/lib/public-site/frame'
import { CategoryLine, SkeletonFooter } from '@/lib/public-site/skeleton'
import { homeDemo } from '@/lib/public-site/home-demo'
import { homeCfo, homeGlanceHeld } from '@/lib/public-site/home-cfo'
import { SeeItWork, HomeDemoBlock, CfoView } from '@/lib/public-site/home-parts'
import { FILLED, FILLED_ON_INK, OUTLINE_ON_INK } from '@/lib/public-site/home-buttons'
import {
  HOME_HEADLINE, HOME_SUBHEAD, RECORD_LINE, HOME_FIT_LEAD, HOME_FIT_REST, COMPLEMENT_LINE, START_FREE, UNDER_START,
  HOME_NAV, GLANCE_TITLE, glanceHeld, GLANCE_MONTHS, GLANCE_LINES, GLANCE_NOTE,
  PROOF_HEADING, PROOF_LABELS, proofCards, STRIP,
  PRICE_TITLE, PRICE_LINE, PRICE_MORE, SECURITY_TITLE, SECURITY_LINE, SECURITY_LINK, SECURITY_MORE,
  FINAL_HEADING, FINAL_LINE, SEE_IT_AGAIN, FALLBACK_LEAD, FALLBACK_ADDRESS, FALLBACK_TAIL, SAMPLE_NOTE, HOME_HEADER_BUTTON,
} from '@/lib/public-site/home-words'

/**
 * The front door, rebuilt for conversion to the founder's brief of
 * 2026-11-13 ("The current page has a strong story but no way to act"),
 * and brought the same day to the structure of the reference page that
 * brief names ("match its structure and copy"), section by section:
 *
 *   header      the wordmark; from 760 wide four in-page links (Demo, CFO
 *               view, How it holds, Price & security); Sign in; Start free
 *   #top        two columns from 900 wide: the category, the question, the
 *               locked line, "Every contractor. Every supplier. One
 *               record.", two ticked lines, Start free and See it work, the
 *               line under them; beside them "At a glance", what is billed
 *               over the signed hours on the held supplier invoices, and Aoife Kelly's
 *               17 of 18 months, both the seed's
 *   #demo       Ask Etyme at Corvane Packaging, a sample company
 *               (`lib/public-site/home-demo`, read from corvaneDemoFacts
 *               and the product's own spend arithmetic)
 *   #cfo        Corvane Packaging's CFO view, a card closed behind one button
 *
 * One sample company for the whole page since 2026-11-13 (founder: "we
 * are talking about companies spending 40-50 million a year; make the
 * numbers realistic"): the first number a buyer at that scale reads is
 * at their own scale. Northbend Athletic stays on every product page,
 * door, the documentation and /demo.
 *   #proof      "Held until it agrees", three cards, the strip on ink
 *   #pricing    price and security, two cards
 *   #start      the last call on ink, and the sample note
 *   then the one-row footer every public page shares
 *
 * Four things differ from the reference on purpose:
 *   - Etyme's own branding, not the reference's: the brand kit's colors,
 *     type and corners and the real logo (CLAUDE.md "Design system"; the
 *     founder, 2026-11-12: "Stick to the branding we had"). Its dark green
 *     panels are the kit's ink; never the logo's vivid green on a control.
 *   - The complement line names no vendor (`COMPLEMENT_LINE`).
 *   - Start free opens the sign-up that exists, never a mail link, and
 *     Sign in stays in the header.
 *   - The footer is the one row every public page draws; the reference's
 *     footer note is the last line of the last section (`SAMPLE_NOTE`).
 *
 * Every word is a constant in `lib/public-site/home-words`, which
 * `home-page.test.ts` and `positioning.test.ts` read. An old role tab's
 * address (`/?seat=operations`) still answers with this page.
 */

/**
 * The title only. The description is the layout's, inherited, so the home
 * page and every other page say one sentence in a search result and a
 * link preview and cannot disagree. `site-description.test.ts` holds that
 * the home page declares none of its own.
 */
export const metadata: Metadata = {
  title: { absolute: 'Etyme | Enterprise contingent workforce management' },
}

/** The demo, the CFO view and the glance's held figure, worked out once from the seed: plain data, the same on every request. */
const DEMO = homeDemo()
const CFO = homeCfo()
const HELD = homeGlanceHeld()

/** With no script the CFO view is shown open and its button is not drawn. */
const NO_SCRIPT_CFO = '#cfo-view{display:block!important}[data-cfo-toggle]{display:none!important}'

const SECTION_HEADING = 'text-balance font-serif text-[28px] font-normal leading-tight tracking-[-0.02em] text-etyme-ink md:text-[32px]'
const TEXT_LINK = 'text-etyme-action-press underline underline-offset-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40'
const CARD = 'min-w-0 rounded-lg border border-etyme-rule bg-etyme-raised p-5'
const SMALL_HEAD = 'text-[12px] font-semibold uppercase tracking-[0.07em] text-etyme-faint'

function Tick() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 shrink-0 text-etyme-action">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas">
      <SiteHeader button={HOME_HEADER_BUTTON} links={HOME_NAV} />
      <noscript><style>{NO_SCRIPT_CFO}</style></noscript>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Hero: two columns from 900 wide; on a phone the glance sits under the left column ── */}
        <section id="top" className="grid gap-8 pb-10 pt-10 min-[900px]:grid-cols-[1.15fr_0.85fr] min-[900px]:items-start min-[900px]:gap-12 md:pt-16">
          <div className="min-w-0">
            <CategoryLine />
            <h1 className="text-balance font-serif text-[36px] font-normal leading-[1.05] tracking-[-0.02em] text-etyme-ink md:text-[54px]">
              {HOME_HEADLINE}
            </h1>
            <p className="mt-5 max-w-[36em] text-[17px] leading-relaxed text-etyme-muted md:text-[18px]">{HOME_SUBHEAD}</p>
            <p className="mt-5 font-serif text-[19px] leading-snug text-etyme-ink md:text-[20px]">{RECORD_LINE}</p>
            <ul className="mt-5 grid gap-2.5 text-[15px] leading-snug text-etyme-muted">
              <li className="flex gap-2.5"><Tick /><span><strong className="font-semibold text-etyme-ink">{HOME_FIT_LEAD}</strong> {HOME_FIT_REST}</span></li>
              <li className="flex gap-2.5"><Tick /><span>{COMPLEMENT_LINE}</span></li>
            </ul>
            {/* Start free and See it work side by side, the line under both. */}
            <div data-hero-calls="" className="mt-7 flex flex-wrap gap-3">
              <a href={START_FREE.href} className={FILLED}>{START_FREE.t}</a>
              <SeeItWork />
            </div>
            <p className="mt-3.5 text-[14px] leading-snug text-etyme-muted">{UNDER_START}</p>
          </div>

          {/* At a glance: both figures are Corvane's, from the seed — what the
              three-way check holds this month over the signed hours, and the
              months of the contractor nearest the limit. A figure the seed
              cannot support is left off. */}
          <aside aria-label={GLANCE_TITLE} className="min-w-0 rounded-lg bg-etyme-ink p-5 text-etyme-canvas shadow-sm sm:p-6">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-etyme-canvas/75">{GLANCE_TITLE}</h2>
            <dl className="mt-4 grid gap-4 min-[340px]:grid-cols-2">
              {HELD && (
                <div className="min-w-0">
                  <dt className="sr-only">{glanceHeld(HELD.invoices)}</dt>
                  <dd className="font-serif text-[24px] leading-none tabular-nums min-[420px]:text-[28px]">{HELD.amount}</dd>
                  <dd className="mt-1.5 text-[13px] leading-snug text-etyme-canvas/80">{glanceHeld(HELD.invoices)}</dd>
                </div>
              )}
              {DEMO.watch && (
                <div className="min-w-0">
                  <dt className="sr-only">{GLANCE_MONTHS}</dt>
                  <dd className="font-serif text-[24px] leading-none tabular-nums min-[420px]:text-[28px]">{DEMO.watch.months} / {DEMO.watch.limit}</dd>
                  <dd className="mt-1.5 text-[13px] leading-snug text-etyme-canvas/80">{GLANCE_MONTHS}</dd>
                </div>
              )}
            </dl>
            <ul className="mt-5 grid gap-3 border-t border-etyme-canvas/20 pt-4 text-[14px] leading-relaxed">
              {GLANCE_LINES.map((l) => (
                <li key={l} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-etyme-attention" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12.5px] leading-snug text-etyme-canvas/70">{GLANCE_NOTE}</p>
          </aside>
        </section>

        {/* ── Ask Etyme, at the sample company ── */}
        <section id="demo" tabIndex={-1} aria-label="Ask Etyme, at a sample company" className="scroll-mt-20 pb-4 focus:outline-none">
          <HomeDemoBlock demo={DEMO} />
        </section>

        {/* ── The CFO view, closed ── */}
        <section id="cfo" aria-label="The CFO view, at a sample company" className="scroll-mt-20 pb-10">
          <CfoView cfo={CFO} />
        </section>

        {/* ── Held until it agrees: three proofs, then the strip on ink ── */}
        <section id="proof" className="scroll-mt-20 pb-10">
          <h2 className={SECTION_HEADING}>{PROOF_HEADING}</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {proofCards(HELD).map((c, i) => (
              <li key={c} className={CARD}>
                <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-etyme-action-press">{PROOF_LABELS[i]}</p>
                <p className="mt-2.5 text-[15px] font-semibold leading-snug text-etyme-ink">{c}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-etyme-ink p-5 text-[15px] leading-relaxed text-etyme-canvas">{STRIP}</p>
        </section>

        {/* ── Price and security: two cards side by side from 760 wide ── */}
        <section id="pricing" aria-label="Price and security" className="grid scroll-mt-20 gap-3 pb-10 min-[760px]:grid-cols-2">
          <div className={CARD}>
            <h2 className={SMALL_HEAD}>{PRICE_TITLE}</h2>
            <p className="mt-2.5 text-[15.5px] font-semibold leading-snug text-etyme-ink">{PRICE_LINE}</p>
            <p className="mt-2 text-[14.5px] leading-snug text-etyme-muted">{PRICE_MORE}</p>
          </div>
          <div id="security" className={CARD}>
            <h2 className={SMALL_HEAD}>{SECURITY_TITLE}</h2>
            <p className="mt-2.5 text-[15.5px] font-semibold leading-snug text-etyme-ink">{SECURITY_LINE}</p>
            <p className="mt-2 text-[14.5px] leading-snug text-etyme-muted">
              <a href={SECURITY_LINK.href} className={TEXT_LINK}>{SECURITY_LINK.t}</a>. {SECURITY_MORE}
            </p>
          </div>
        </section>

        {/* ── The last call, on ink ── */}
        <section id="start" className="mb-6 rounded-lg bg-etyme-ink p-6 text-etyme-canvas md:p-10">
          <h2 className="max-w-[14em] text-balance font-serif text-[30px] font-normal leading-tight tracking-[-0.02em] md:text-[34px]">{FINAL_HEADING}</h2>
          <p className="mt-3 max-w-[36em] text-[16px] leading-relaxed text-etyme-canvas/90">{FINAL_LINE}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={START_FREE.href} className={FILLED_ON_INK}>{START_FREE.t}</a>
            <SeeItWork className={OUTLINE_ON_INK} label={SEE_IT_AGAIN} />
          </div>
          <p className="mt-5 text-[14.5px] leading-snug text-etyme-canvas/85">
            {FALLBACK_LEAD}{' '}
            <a href={`mailto:${FALLBACK_ADDRESS}`} className="inline-block py-2 font-semibold underline underline-offset-[3px] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-canvas/60">{FALLBACK_ADDRESS}</a>{' '}
            {FALLBACK_TAIL}
          </p>
        </section>
        <p className="mb-8 text-[13px] leading-snug text-etyme-muted">{SAMPLE_NOTE}</p>
      </main>

      <SkeletonFooter />
    </div>
  )
}
