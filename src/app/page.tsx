import type { Metadata } from 'next'
import { SiteHeader } from '@/lib/public-site/frame'
import { CategoryLine, SkeletonFooter } from '@/lib/public-site/skeleton'
import { homeDemo } from '@/lib/public-site/home-demo'
import { homeCfoLines } from '@/lib/public-site/home-cfo'
import { SeeItWork, HomeDemoBlock, CfoView } from '@/lib/public-site/home-parts'
import { FILLED } from '@/lib/public-site/home-buttons'
import {
  HOME_HEADLINE, HOME_SUBHEAD, HOME_FIT, COMPLEMENT_LINE, START_FREE, UNDER_START,
  PROOF_HEADING, PROOF_CARDS, STRIP, PRICE_LINE, SECURITY_LINE, SECURITY_LINK,
  FINAL_HEADING, FINAL_LINE, FALLBACK_LEAD, FALLBACK_ADDRESS, FALLBACK_TAIL, HOME_HEADER_BUTTON,
} from '@/lib/public-site/home-words'

/**
 * The front door, rebuilt for conversion to the founder's brief of
 * 2026-11-13: "The current page has a strong story but no way to act."
 *
 * In order, and nothing else:
 *
 *   header      the wordmark, a plain Sign in, and one button, Start free
 *   #top        the category, the question, the locked positioning line,
 *               who it is for, what it sits beside, Start free with the
 *               line under it, and See it work
 *   #demo       Ask Etyme at Northbend Athletic, a demo company: the
 *               question, the answer, three contractors, the card that
 *               would send the job (`lib/public-site/home-demo`, the
 *               Northbend story's first step, read against the seed)
 *   #cfo        Corvane Packaging's CFO view, closed behind one button
 *   #record     one heading and three proof cards
 *   the strip, price and security, then #start, the last call
 *   then the one-row footer every public page shares
 *
 * Every word is a constant in `lib/public-site/home-words`, which
 * `home-page.test.ts` and `positioning.test.ts` read. The map with its
 * four role tabs, the panel that played by itself, the two drawings and
 * the four lines of 2026-10-27 left this page with it; an old role tab's
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

/** The demo and the CFO view, worked out once from the seed: plain data, the same on every request. */
const DEMO = homeDemo()
const CFO = homeCfoLines()

/** With no script the CFO view is shown open and its button is not drawn. */
const NO_SCRIPT_CFO = '#cfo-view{display:block!important}[data-cfo-toggle]{display:none!important}'

const SECTION_HEADING = 'text-balance font-serif text-[26px] font-normal leading-tight tracking-[-0.02em] text-etyme-ink md:text-[30px]'
const TEXT_LINK = 'text-etyme-action-press underline-offset-4 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40'

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas">
      <SiteHeader button={HOME_HEADER_BUTTON} />
      <noscript><style>{NO_SCRIPT_CFO}</style></noscript>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Hero ── */}
        <section id="top" className="max-w-[760px] pb-8 pt-10 md:pt-14">
          <CategoryLine />
          <h1 className="text-balance font-serif text-[34px] font-normal leading-[1.06] tracking-[-0.02em] text-etyme-ink md:text-[52px]">
            {HOME_HEADLINE}
          </h1>
          <p className="mt-4 text-[17px] leading-snug text-etyme-ink">{HOME_SUBHEAD}</p>
          <p className="mt-3 text-[15px] leading-snug text-etyme-muted">{HOME_FIT}</p>
          <p className="mt-1 text-[15px] leading-snug text-etyme-muted">{COMPLEMENT_LINE}</p>
          <div data-hero-calls="" className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-start">
            <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-[22rem]">
              <a href={START_FREE.href} className={`${FILLED} sm:self-start`}>{START_FREE.t}</a>
              <p className="text-[14px] leading-snug text-etyme-muted">{UNDER_START}</p>
            </div>
            <SeeItWork />
          </div>
        </section>

        {/* ── Ask Etyme, at a demo company ── */}
        <section id="demo" tabIndex={-1} aria-label="Ask Etyme, at a demo company" className="max-w-[760px] scroll-mt-20 pb-8 focus:outline-none">
          <HomeDemoBlock demo={DEMO} />
        </section>

        {/* ── The CFO view, closed ── */}
        <section id="cfo" aria-label="The CFO view, at a sample company" className="max-w-[760px] pb-10">
          <CfoView lines={CFO} />
        </section>

        {/* ── One record, three proofs ── */}
        <section id="record" className="pb-8">
          <h2 className={SECTION_HEADING}>{PROOF_HEADING}</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {PROOF_CARDS.map((c) => (
              <li key={c} className="min-w-0 rounded-lg border border-etyme-rule bg-etyme-surface p-5 text-[15px] leading-snug text-etyme-ink">
                {c}
              </li>
            ))}
          </ul>
        </section>

        {/* ── The strip, then price and security ── */}
        <section id="strip" aria-label="What is in it, the price and security" className="max-w-[760px] pb-8">
          <p className="text-[15px] leading-snug text-etyme-ink">{STRIP}</p>
          <p className="mt-3 text-[15px] leading-snug text-etyme-muted">{PRICE_LINE}</p>
          <p id="security" className="mt-1 text-[15px] leading-snug text-etyme-muted">
            {SECURITY_LINE}{' '}
            <a href={SECURITY_LINK.href} className={TEXT_LINK}>{SECURITY_LINK.t}</a>
          </p>
        </section>

        {/* ── The last call ── */}
        <section id="start" className="mb-10 grid gap-4 rounded-lg border border-etyme-rule bg-etyme-surface p-6 md:p-7">
          <h2 className={SECTION_HEADING}>{FINAL_HEADING}</h2>
          <p className="text-[15px] leading-snug text-etyme-muted">{FINAL_LINE}</p>
          <div>
            <a href={START_FREE.href} className={FILLED}>{START_FREE.t}</a>
          </div>
          <p className="text-[14px] leading-snug text-etyme-muted">
            {FALLBACK_LEAD}{' '}
            <a href={`mailto:${FALLBACK_ADDRESS}`} className={TEXT_LINK}>{FALLBACK_ADDRESS}</a>{' '}
            {FALLBACK_TAIL}
          </p>
        </section>
      </main>

      <SkeletonFooter />
    </div>
  )
}
