import type { Metadata } from 'next'
import { SiteHeader } from '@/lib/public-site/frame'
import { CountedLink } from '@/lib/public-site/counted-link'
import { LiveDemo, SignUpBand, SecurityLine, SkeletonFooter, PRIMARY_BUTTON } from '@/lib/public-site/skeleton'
import { OPEN_DEMO } from '@/lib/public-site/skeleton-words'
import { SEE_IT } from '@/lib/public-site/funnel'

/**
 * The front door.
 *
 * ── The home page is the product, and the slop is gone ──────────────
 *
 * The founder approved this page on 2026-10-14 ("Build it", on the
 * drawing he corrected three times). Three sections and about a hundred
 * and ten words, and the test for every word: which buyer asked for it,
 * and can the reader check it by clicking something on this page.
 *
 *   hero        the category line and the question, word for word, and
 *               since the founder's drawing of 2026-10-19 one line under
 *               them: most companies cannot answer it without three weeks
 *               and a spreadsheet nobody trusts. Since the same day the
 *               category sits above the headline as the hero's eyebrow
 *               (founder: "the category be on top over hero text")
 *   #demo       the product shown working, in one compact panel
 *               (`lib/public-site/story-panel`, since the founder's
 *               "Build it" later on 2026-10-14): Ask Etyme answers, a
 *               decision card presses itself, the table changes, across
 *               four chips — Job, Candidates, Timesheets, Invoices — with
 *               every name and figure the seeded demo's, and one button
 *               to the full demo. Since 2026-10-19 the bar names the
 *               person in front of each step (Marcus Oyelaran, Helena
 *               Marsh, Renata Kowal) and the line under it says they are
 *               three people at a demo company on one morning
 *   #sign-up    "Seen enough? Set up your company.", one button, Sign up,
 *               and every party's door on one small line, Clients first
 *   then one line for security, and the footer
 *
 * Cut, and where each went (CLAUDE.md, the same section): the problem
 * band (the demo answers the four questions on its first screen); the
 * platform band and its cards (the chips); specialist teams around the
 * world and what is set once (the documentation); the roles band and the
 * Platform, Solutions and How It Works items in this page's header (six
 * audiences on one page speak to none); the three screenshots and their
 * captions (the live product); the security band's four cards (one line
 * and the link); the audit form and the close; the trust card. And on
 * the same day, later: the audit call itself, from the band and the
 * header (the founder: "Does anyone need the audit form? I think it's
 * useless."). Ask Etyme and Teams are not
 * sold here: Ask Etyme is the demo's first screen, and Teams waits for a
 * real card tapped in a real tenant.
 *
 * ── Rules that still bind ────────────────────────────────────────────
 *
 * Category first, never one module, never AI, never a supply claim, no
 * named company but the demo's own, labeled as a sample beside it, no
 * size of buyer, no claim a reader cannot check, plain words, written to
 * the client. `lib/positioning` holds each and `positioning.test.ts`
 * reads this file against them.
 *
 * ── The pieces every other page shares ───────────────────────────────
 *
 * The panel, the sign-up band, the security line and the
 * footer live in `lib/public-site/skeleton`, since 2026-10-14, because
 * the eight product pages and the four party doors draw the same ones
 * (the founder: "make sure even the sub pages and doors follow the same
 * structure"). This page adds only its category and its question.
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

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Hero: the category on top, then the question, word for word ── */}
        <section id="top" className="max-w-[760px] pb-6 pt-10 md:pt-14">
          <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-etyme-muted">
            Enterprise contingent workforce management.
          </p>
          <h1 className="text-balance font-serif text-[34px] font-normal leading-[1.06] tracking-[-0.02em] text-etyme-ink md:text-[52px]">
            Know what every contractor costs, across every supplier.
          </h1>
          <p className="mt-3 text-[16px] leading-snug text-etyme-muted">
            Most companies cannot answer this without three weeks and a spreadsheet nobody trusts.
          </p>
        </section>

        {/* ── The product, live and read-only, at the overview ──── */}
        <LiveDemo>
          <CountedLink href={SEE_IT.href} event="demo_cta_clicked" className={PRIMARY_BUTTON}>
            {OPEN_DEMO}
          </CountedLink>
        </LiveDemo>

        {/* ── Sign-up, right under the product ──────────────────── */}
        <SignUpBand />

        {/* ── Security: one line and the link ───────────────────── */}
        <SecurityLine />
      </main>

      <SkeletonFooter />
    </div>
  )
}
