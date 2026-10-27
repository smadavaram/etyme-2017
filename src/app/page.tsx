import type { Metadata } from 'next'
import { SiteHeader } from '@/lib/public-site/frame'
import { CountedLink } from '@/lib/public-site/counted-link'
import { CategoryLine, LiveDemo, SignUpBand, SecurityLine, SkeletonFooter, PRIMARY_BUTTON } from '@/lib/public-site/skeleton'
import { OPEN_DEMO } from '@/lib/public-site/skeleton-words'
import { SEE_IT } from '@/lib/public-site/funnel'
import { corvaneMap, seatOf, seatHrefs } from '@/lib/public-site/corvane-map'
import { CorvaneMapView } from '@/lib/public-site/corvane-map-view'
import { TalkToAPerson } from '@/lib/public-site/talk'
import { WhyBelow } from '@/lib/public-site/why-below'

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
 *               (founder: "the category be on top over hero text"), set in
 *               sentence case with no period, 13px and muted, one line
 *               at 375 (founder, the same day, on the capitals). Since
 *               2026-10-20 it is `CategoryLine`, which every step page
 *               and door draws too, from the one constant `CATEGORY`
 *   #demo       the product shown working, in one compact panel
 *               (`lib/public-site/story-panel`, since the founder's
 *               "Build it" later on 2026-10-14): Ask Etyme answers, a
 *               decision card presses itself, the table changes, across
 *               four chips — Job, Candidates, Timesheets, Invoices — with
 *               every name and figure the seeded demo's, and one button
 *               to the full demo. Since 2026-10-19 the bar names the
 *               person in front of each step (Marcus Oyelaran, Helena
 *               Marsh, Renata Kowal) and the line under it says they are
 *               three people at a demo company on one morning. On a
 *               phone the panel's button is also drawn straight under the
 *               hero (`LiveDemo`), so the first screen has one button
 *   #map        the map, since the founder's "Build it" of 2026-10-27 ("This
 *               is the vision of Etyme"): Corvane Packaging, a demo company,
 *               every contractor, supplier and site in eight countries on one
 *               record, read from four roles — CFO, Head of operations,
 *               Regional manager, Hiring manager — each a tab at its own
 *               address (`/?seat=operations`), read on the server so an
 *               advertisement can open one. Every name and figure is read
 *               from the seed (`lib/public-site/corvane-map`). The hero's
 *               line under the question became the drawing's lede the same
 *               day; the Northbend panel follows the map unchanged
 *   #why        under the panel, since the same "Build it": two drawings —
 *               a start refused on the I-9, and a receipt held over the
 *               signed hours — each a named person from the seed, then
 *               four lines: In it, Price, Security, Talk to a person
 *               (`lib/public-site/why-below`). "Talk to a person" also
 *               sits beside the demo button in the hero and beside Sign up
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

/** The map's four seats, worked out once from the seed: plain data, the same on every request. */
const MAP = corvaneMap()
const SEAT_HREFS = seatHrefs()

/** What Next hands the page: the address's query, of which `seat` is read. */
interface HomeParams { searchParams?: { seat?: string | string[] } }

/**
 * The page's demo button: in the hero beside "Talk to a person", as the
 * founder's drawing of 2026-10-27 has it, and again in the panel's footer
 * from md up.
 */
function OpenTheDemo() {
  return (
    <CountedLink href={SEE_IT.href} event="demo_cta_clicked" className={PRIMARY_BUTTON}>
      {OPEN_DEMO}
    </CountedLink>
  )
}

export default function LandingPage({ searchParams }: HomeParams) {
  const seat = seatOf(searchParams?.seat)
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Hero: the category on top, then the question, word for word ── */}
        <section id="top" className="max-w-[760px] pb-6 pt-10 md:pt-14">
          <CategoryLine />
          <h1 className="text-balance font-serif text-[34px] font-normal leading-[1.06] tracking-[-0.02em] text-etyme-ink md:text-[52px]">
            Know what every contractor costs, across every supplier.
          </h1>
          <p className="mt-3 text-[16px] leading-snug text-etyme-muted">
            Every contractor, every supplier, every site and every country, on one record. Read it as the CFO, a regional manager or a plant’s hiring manager.
          </p>
          {/* ── The two calls, as drawn: the demo, and a person ── */}
          <div data-hero-calls="" className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <OpenTheDemo />
            <TalkToAPerson />
          </div>
        </section>

        {/* ── The map: one record, read from four roles ─────────── */}
        <section id="map" aria-label="One record, read from four roles" className="scroll-mt-20 pb-8">
          <CorvaneMapView map={MAP} seat={seat} hrefs={SEAT_HREFS} />
          <p className="mt-3 text-[15px] leading-snug text-etyme-muted">{MAP.under}</p>
        </section>

        {/* ── The product, live and read-only, at the overview ──── */}
        <LiveDemo phoneButton={false}><OpenTheDemo /></LiveDemo>

        {/* ── Why, in two drawings and four lines ───────────────── */}
        <WhyBelow />

        {/* ── Sign-up, with a person beside it ──────────────────── */}
        <SignUpBand talk />

        {/* ── Security: one line and the link ───────────────────── */}
        <SecurityLine />
      </main>

      <SkeletonFooter />
    </div>
  )
}
