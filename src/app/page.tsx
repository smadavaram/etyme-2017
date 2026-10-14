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
 *   hero        the question and the category line, word for word
 *   #demo       the live product, read-only, in a frame: the seeded
 *               Northbend Athletic program manager's screens from
 *               /embed/demo, labeled as a sample, with four chips —
 *               Source, Submit, Approve, Pay — each moving the frame to
 *               its step, and one button to the full demo
 *   #sign-up    "Seen enough? Set up your company.", sign-up first, the
 *               audit second, and every party's door on one small line,
 *               Clients first
 *   then one line for security, and the footer
 *
 * Cut, and where each went (CLAUDE.md, the same section): the problem
 * band (the demo answers the four questions on its first screen); the
 * platform band and its cards (the chips); specialist teams around the
 * world and what is set once (the documentation); the desks band and the
 * Platform, Solutions and How It Works items in this page's header (six
 * audiences on one page speak to none); the three screenshots and their
 * captions (the live product); the security band's four cards (one line
 * and the link); the audit form and the close (the audit is the second
 * call, on its own page); the trust card. Ask Etyme and Teams are not
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
 * The frame, the four chips, the sign-up band, the security line and the
 * footer live in `lib/public-site/skeleton`, since 2026-10-14, because
 * the eight product pages and the four party doors draw the same ones
 * (the founder: "make sure even the sub pages and doors follow the same
 * structure"). This page adds only its question and the category.
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
      <SiteHeader onHome />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Hero: the question and the category, word for word ── */}
        <section id="top" className="max-w-[760px] pb-6 pt-10 md:pt-14">
          <h1 className="text-balance font-serif text-[34px] font-normal leading-[1.06] tracking-[-0.02em] text-etyme-ink md:text-[52px]">
            Know what every contractor costs, across every supplier.
          </h1>
          <p className="mt-3 text-[17px] leading-snug text-etyme-muted md:text-[18px]">
            Enterprise contingent workforce management.
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
