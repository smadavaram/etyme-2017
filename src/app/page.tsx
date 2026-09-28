import type { Metadata } from 'next'
import { TryDemo } from '@/components/try-demo'
import { JoinMural } from '@/lib/public-site/join-mural'
import { SiteHeader, SiteFooter } from '@/lib/public-site/frame'
import { CloseBand } from '@/lib/public-site/close-band'
import { SEE_IT, GET_THE_AUDIT } from '@/lib/public-site/funnel'
import { PRODUCT_STAGES } from '@/lib/public-site/nav'
import { ModuleIcon } from '@/lib/public-site/module-icons'
import Link from 'next/link'
// Typed routes widen a string in an array to `string`, which Link will not
// take. The cast is at the render rather than on the data so the lists
// stay readable.
import type { Route } from 'next'

/**
 * The front door.
 *
 * ── Five bands, in plain words. 2026-09-28, evening ──────────────────
 *
 * The founder's go-to-market edit list, the same day the tiles came
 * back: "vendor management system" is banned on public pages, and the
 * words are plain and defined once — a job, not a role or a requisition;
 * a job request where the object is meant; a bill, never an invoice;
 * the three-way check, defined where it is first named; a time limit,
 * not a tenure cap. See CLAUDE.md, "Plain words on public pages, defined
 * once". The tiles stay (the founder, the same evening, reversing a
 * brief that removed them); their heading no longer names the category
 * by a word the page may not use.
 *
 * The morning's direction still holds: "Hero section can still be
 * compact and impactful. Less theory there. Declare category as
 * Enterprise Contingent workforce mgmt. Don't limit to 50–500
 * consultants — keep the business open for all." And on who reads it:
 * "You are targeting well-versed IT people; they rarely buy anything
 * because of claims. Our main goal is registering as a trustworthy
 * brand."
 *
 *   1. what is this      the hero — the founder's headline, the category,
 *                        one line saying what the software does, the two
 *                        ways in, and the program dashboard. Nothing else
 *   2. what does it do   #steps — four steps a line each, every one a
 *                        link to its part's page, beside one screen
 *   3. what is in it     #modules — the eight parts under the four stages
 *                        of the Product menu, a name, an icon and one
 *                        line each, and no screenshots
 *   4. where it reaches  #join — the founder's line and its two
 *                        sentences on a dark band, the mural drawn for
 *                        the dark under them, full width
 *   5. the door          #close — see it, get the audit, ask a person;
 *                        the program office once, quietly; one line on
 *                        price; where to check us before trusting us;
 *                        the supplier's and the contractor's doors as
 *                        whole questions
 *
 * The header stays on screen as the page scrolls (lib/public-site/frame),
 * and each band is a snap point, by proximity rather than mandatory, so a
 * long band or a phone never traps the reader; a reader who asked for
 * reduced motion gets no snapping at all.
 *
 * Where each band that left went, so nobody re-adds it here:
 *
 *   the hook line (how many contractors, three weeks of asking)
 *          → /about#unanswered, where it was already said in full.
 *          "Less theory" in the hero, and a claim about what "most
 *          companies" cannot do is not one a reader can check
 *   #gap   the four questions, each answered on a screen → /about#answered
 *   #ways  VMS software or MSP provider, and the supplier's paragraph
 *                                                          → /about#ways
 *   the hero's record and span lines                       → /about#build
 *   three of the four step screens → their module pages, each opening
 *          on its screen
 *
 * The earlier moves, 2026-09-27, are unchanged: #exposure to
 * /compliance#cost, #lifecycle to /about#hire, #alongside to
 * /about#alongside, #who to /chain#down-the-chain, #compliance to
 * /governance#rules, #why to /about#price with one line kept here.
 * `positioning.test.ts` holds a word ceiling and a band count, and finds
 * each moved phrase where it went.
 *
 * ── The category, decided 2026-09-28 ─────────────────────────────────
 *
 * "Enterprise contingent workforce management", open to every size. The
 * line it replaces named a range of 20 to 200 contractors and "sized for
 * fifty contractors rather than five thousand"; the founder struck the
 * range, and `sizesTheBuyer` in `lib/positioning` refuses one coming
 * back. "Vendor management system" was said once more, over the eight
 * parts, until the evening of the same day, when the founder banned it
 * on public pages; `vendorManagementSystem` in `lib/positioning` refuses
 * it coming back.
 *
 * ── Show, don't claim ─────────────────────────────────────────────────
 *
 * The reader is an engineer or an IT leader who discounts adjectives. So
 * every sentence is either a plain description of what the software does
 * or a fact a reader can check on this site: the demo with no account,
 * the screens, the public documentation, the security position that says
 * what is not done yet. `unverifiableClaims` in `lib/positioning` refuses
 * the hype words and the time promises nobody has measured.
 *
 * ── A real buyer read it. Rewritten 2026-09-20 ───────────────────────
 *
 * The CTO of a two-billion-dollar company with forty to fifty IT
 * contractors — the exact buyer — said he did not understand what the
 * app does, and that it looked like an AI app. So: screens before
 * sentences, and the category with no company named. The comparison to
 * the incumbents is a sentence the founder says in a conversation, where
 * he can answer the next question.
 *
 * ── The program office is offered quietly. Decided 2026-09-20 ────────
 *
 * "MSP selling should be undercover selling and more as value addition
 * rather than fully pitching for the market." Once on this page, in the
 * close, and never in a headline. What it means is on /about#ways.
 *
 * ── Every claim here is checkable ────────────────────────────────────
 *
 * Numbers are what the seeded sandbox produces. Nothing here draws a
 * feature that does not exist, names a real company, or promises an
 * account: sign-in for real tenants is not configured, so every button
 * leads to something a stranger can open today.
 */

/**
 * The title only. The description is the layout's, inherited, so the home
 * page and every other page say one sentence in a search result and a
 * link preview and cannot disagree — until 2026-09-28 the two carried the
 * same literal twice, and a category change had to be made in two files
 * owned by two agents. `site-description.test.ts` holds that the home
 * page declares none of its own.
 */
export const metadata: Metadata = {
  title: { absolute: 'Etyme | Enterprise contingent workforce management' },
}

/**
 * What it does, in four steps, and one screen for all four.
 *
 * A CTO recognizes post, choose, approve, pay. One line each, and each
 * line leads to the page for that part of the product, so the step is
 * the way deeper rather than a tile beside it.
 *
 * ── One screen, not four. Decided 2026-09-27, on a buyer's review ────
 *
 * A CRO the founder showed the site to: "the website seems too much
 * data, and you are already giving screenshots in the main page." Four
 * full-size screens under the hero screen was the "too much". Screens
 * before sentences still holds — the page shows the product, twice: the
 * program dashboard in the hero, and here the bill paid only against a
 * signed week, which is the step a CFO checks first. The other three
 * screens are on their own module pages, one click from the step that
 * names them, so nothing left the site.
 */
const STEPS: { n: string; t: string; href: string }[] = [
  { n: '01', t: 'Post a job to the suppliers you cleared', href: '/requisitions' },
  { n: '02', t: 'Interview, choose, and the paperwork is written', href: '/contracts' },
  { n: '03', t: 'Contractors file their weeks and your manager approves them', href: '/timesheets' },
  { n: '04', t: 'Each supplier bills, and you pay what matched', href: '/invoices' },
]

/**
 * The one screen under the four steps. `from` is the desk and the route
 * the image came from, so anybody can retake it: seat at the example
 * program with `POST /api/demo {"as":"world-nike","desk":"ap"}` and
 * screenshot the route at 1440×900. Nothing in the caption is a claim the
 * image does not show.
 */
const STEP_SCREEN = {
  img: '/screens/invoices.png',
  alt: 'An invoice receipts screen: the outstanding total, an aging breakdown, and a table of invoice receipts with the period, the total and what is paid.',
  caption: 'A bill with no signed week behind it is not paid. Every firm on this screen is a demo company — not a customer.',
  from: '/dashboard/invoices, what we owe, as the AP clerk',
  /**
   * When the image was taken, UTC. Pinned because the seeded world it
   * was photographed from is renamed from time to time, and a PNG cannot
   * be read by a test. The date is what catches a stale shot.
   */
  capturedAt: '2026-09-28T19:09:20Z',
}

/**
 * The founder's line, in a dark band. Added 2026-09-27.
 *
 * "Join forces with global teams around the world" — his words, exactly.
 * He was clear it is subtle and not a sales pitch, so it has no button of
 * its own; on 2026-09-28 he asked for the band to read like a second hero,
 * so it sits on the brand's ink with the heading at hero weight, the two
 * sentences beside it and the mural drawn for the dark under them.
 *
 * It reads to both sides of the trade at once: a client reads suppliers
 * it can bring in from anywhere, a supplier reads clients it can serve
 * from anywhere. "Global" is where it could overreach, so the second
 * sentence says the one thing about other countries the record actually
 * does: it asks for each country's paperwork by that country's rules
 * (`lib/packet-derivation`, behind `/api/packets`). Each document it
 * names is listed in `backedBy` with the words in the source that ask
 * for it, and the test opens that file. What it deliberately does not
 * say: bill or pay in more than one currency, run payroll in each
 * country, or any count of countries. The two sentences stay two,
 * because one sentence cannot carry both sides and the three documents
 * without running past thirty words.
 */
const JOIN = {
  heading: 'Join forces with global teams around the world.',
  lines: [
    'A client can work with suppliers in other countries, and a supplier can serve clients outside its own, on one record.',
    'Each country’s paperwork is asked for by its own rules: a W-9 in the United States, GST and PAN in India, a VAT position in the United Kingdom.',
  ],
  backedBy: [
    { says: 'W-9', country: 'US', source: 'src/lib/packet-derivation.ts', proof: "label: 'W-9'" },
    { says: 'GST and PAN', country: 'IN', source: 'src/lib/packet-derivation.ts', proof: "label: 'GST registration'" },
    { says: 'VAT position', country: 'GB', source: 'src/lib/packet-derivation.ts', proof: "label: 'VAT registration'" },
  ],
}

/**
 * One scroll lands on one band. The snap is set on the document from the
 * page's own wrapper — `[html:has(&)]` reaches the root element only while
 * this page is drawn, so no other page snaps and globals.css (shared, the
 * architect's) is not touched. `motion-safe` leaves it off for a reader who
 * asked for reduced motion, and proximity rather than mandatory never
 * holds a reader inside a band taller than the screen, which on a phone is
 * most of them. The header sets the scroll padding (lib/public-site/frame),
 * so a snapped band starts under it rather than behind it.
 */
export default function LandingPage() {
  return (
    <div
      className="min-h-screen bg-etyme-canvas
                 [html:has(&)]:motion-safe:snap-y [html:has(&)]:motion-safe:snap-proximity"
    >
      <SiteHeader />

      <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      {/* Five seconds, decided 2026-09-28: the founder's headline, the
          category, one line saying what the software does, the two ways
          in, and the product itself. "Less theory there." The hook line
          that sat here went to /about#unanswered. */}
      <section className="snap-start border-b border-etyme-rule">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16">
          <h1 className="mb-5 max-w-[18ch] text-balance font-serif text-[40px] font-normal
                         leading-[1.03] tracking-[-0.02em] text-etyme-ink md:text-[60px]">
            Every contractor. Every supplier. One record.
          </h1>
          <p className="mb-3 text-[19px] font-medium leading-snug text-etyme-ink md:text-[22px]">
            Enterprise contingent workforce management.
          </p>
          {/* What the software does, as a description rather than a
              promise, 2026-09-28: the reader is an engineer who discounts
              "control" and checks verbs. Each verb is a screen in the
              demo under the buttons. "Your own people" keeps it from
              reading as the program office offered quietly in the close,
              and it sells control, never outsourcing. */}
          <p className="mb-8 max-w-[62ch] text-[17px] leading-relaxed text-etyme-muted">
            Your own people approve the jobs, sign the timesheets and pay only matched bills, across every supplier.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={SEE_IT.href as Route}
              className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                         shadow-sm transition-opacity hover:opacity-90"
            >
              {`${SEE_IT.t} →`}
            </Link>
            <Link
              href={GET_THE_AUDIT.href as Route}
              className="rounded-lg border border-etyme-rule bg-etyme-raised px-6 py-3.5 text-sm
                         font-semibold text-etyme-ink transition-colors hover:border-etyme-ink"
            >
              {GET_THE_AUDIT.t}
            </Link>
          </div>

          <figure className="mt-10 overflow-hidden rounded-xl border border-etyme-rule
                             bg-etyme-raised shadow-sm">
            {/* Taken from the seeded demo world on the date stamped on the
                image, UTC — the same stamp the step screens carry beside
                `from`. A test cannot read a PNG, so the date is the only
                thing that can tell a shot taken before a rename in the
                demo world from one taken after it. */}
            <img
              src="/screens/program-dashboard.png"
              data-captured-at="2026-09-28T19:09:17Z"
              alt="The program dashboard: a sentence saying whether anything needs the reader today, then six numbers — on site, suppliers, this month, ending soon, the time limit and requirements — over a list of who is starting soon and which suppliers are on site."
              width={1440}
              height={900}
              className="block h-auto w-full border-b border-etyme-rule"
            />
            {/* "No card. No sign-up." sat under the two buttons until
                2026-09-27. The outcome line took the last of the six
                sentences allowed before the first screen, so the note moved
                here, onto the screen it is about, the way every module
                page's caption says the example program opens without an
                account. */}
            <figcaption className="px-5 py-3.5 text-[13px] leading-relaxed text-etyme-muted">
              The program manager’s desk at Northbend Athletic; every firm on this screen is a demo company — not a customer. Open it yourself. No card. No sign-up.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── What it does, in four steps ───────────────────────────── */}
      {/* The answer to "I do not understand what the app does": four
          steps a line each, every one leading to its own page, and one
          screen beside them. The caption sits inside the screen's frame,
          under the image and after the steps in reading order, so a
          caption and a step never read as one paragraph. */}
      <section id="steps" className="snap-start border-b border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">What it does, in four steps</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            A job goes out, a person starts, a week is signed, a bill is paid
          </h2>

          <div className="mt-10 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <ol className="divide-y divide-etyme-rule border-y border-etyme-rule">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <Link
                    href={s.href as Route}
                    className="group flex items-baseline gap-4 py-5"
                  >
                    <span className="font-mono text-[12px] tabular-nums text-etyme-faint">{s.n}</span>
                    <span className="text-balance font-serif text-[20px] leading-snug text-etyme-ink
                                     group-hover:text-etyme-action">
                      {s.t}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>

            <figure className="overflow-hidden rounded-xl border border-etyme-rule bg-etyme-raised shadow-sm">
              <img
                src={STEP_SCREEN.img}
                alt={STEP_SCREEN.alt}
                width={1440}
                height={900}
                loading="lazy"
                className="block h-auto w-full border-b border-etyme-rule"
              />
              <figcaption className="px-4 py-2.5 text-[12.5px] italic leading-relaxed text-etyme-muted">
                {STEP_SCREEN.caption}
              </figcaption>
            </figure>
          </div>

        </div>
      </section>

      {/* ── The eight parts ─────────────────────────────────────── */}
      {/* Back on the page 2026-09-28, in the founder's words: "it was one
          section that was nice and also made quick sense." The same four
          stages and eight parts as the header's Product menu, drawn from
          the same data (PRODUCT_STAGES), so the menu and the page teach
          one map and cannot drift. Each tile is a name, the kit's icon and
          one line, and opens its part's page. No screenshots in the tiles:
          the CRO who read the page on 2026-09-27 said it had too many
          screens, and the two it keeps are the hero's and the steps'.
          The heading said "One vendor management system" until the
          founder banned the phrase on public pages the same evening; it
          now says what the band is in plain words. The tile for bills
          carries the three-way check's definition as its line, which is
          where the home page first names the check. */}
      <section id="modules" className="snap-start border-b border-etyme-rule">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">What is in it</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            Everything in it, in the order a hire moves through it
          </h2>

          <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCT_STAGES.map((stage) => (
              <div key={stage.heading}>
                <p className="stat-label border-b border-etyme-rule pb-2">{stage.heading}</p>
                <ul className="mt-3 space-y-3">
                  {stage.items.map((m) => (
                    <li key={m.href}>
                      <Link
                        href={m.href as Route}
                        className="group flex gap-3 rounded-xl border border-etyme-rule bg-etyme-raised px-4 py-3.5
                                   transition-shadow hover:shadow-md"
                      >
                        <ModuleIcon href={m.href} className="mt-0.5 shrink-0 text-etyme-action" />
                        <span>
                          <span className="block text-[15px] font-semibold leading-snug text-etyme-ink
                                           group-hover:text-etyme-action">
                            {m.t}
                          </span>
                          <span className="mt-1 block text-[13px] leading-snug text-etyme-muted">{m.d}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Join forces ──────────────────────────────────────────── */}
      {/* The founder's line, 2026-09-27, in a dark band since the evening
          of 2026-09-28: "a dark band that reads like a second hero", with
          more presence than the plain canvas gave it, and still subtle —
          his words unchanged, no button of its own, nothing sold. The
          ground is the brand's ink, not a chosen color. The heading is in
          the canvas color on it, 14.3 to 1, and the two sentences in the
          canvas at 78% over the ink, 9.2 to 1 — both computed, both held in
          positioning.test.ts. The mural under them is drawn for the dark
          (lib/public-site/join-mural): canvas line work on the ink, with
          the kit's brighter violet and its orange as the two touches. */}
      <section id="join" className="snap-start border-b border-etyme-ink bg-etyme-ink">
        <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-5 px-4 pt-16 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:items-end md:pt-24">
          <h2 className="max-w-[20ch] text-balance font-serif text-[32px] leading-[1.08]
                         tracking-[-0.02em] text-etyme-canvas md:text-[48px]">
            {JOIN.heading}
          </h2>
          <div>
            {JOIN.lines.map((line) => (
              <p key={line} className="mb-4 max-w-[48ch] text-[16px] leading-relaxed text-etyme-canvas/[0.78] md:text-[17px]">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="mt-8 w-full overflow-hidden md:mt-12">
          <JoinMural />
        </div>
      </section>

      {/* ── The close ───────────────────────────────────────────── */}
      {/* The same close every public page ends in (lib/public-site/
          close-band), with the ask form beside it here. What only this
          page says at its close: the program office, once and quietly;
          the price, in one line; and the two quieter doors, a supplier's
          desk and a contractor's own page, as text links rather than
          buttons, because this page is written to the company hiring. */}
      <CloseBand id="close" withForm>
        <p className="mt-6 max-w-[54ch] border-t border-etyme-rule pt-5 text-[14px] leading-relaxed text-etyme-muted">
          If you would rather not staff a program office, Etyme can run it for you on the same record.{' '}
          <Link
            href={'/about#ways' as Route}
            className="text-etyme-action underline underline-offset-4 hover:opacity-80"
          >
            How that works →
          </Link>
        </p>
        <p id="why" className="mt-3 max-w-[54ch] scroll-mt-6 text-[14px] leading-relaxed text-etyme-muted">
          There is no price on this page because we have not settled one. Etyme is free while we prove it out with the first five firms.{' '}
          <Link
            href={'/about#price' as Route}
            className="text-etyme-action underline underline-offset-4 hover:opacity-80"
          >
            Why it’s free for the first five firms →
          </Link>
        </p>
        {/* Where to check us, added 2026-09-28 on the founder's "our main
            goal is registering as a trustworthy brand". An engineer
            trusts what he can read, so this points at the two things on
            the site that say more than a page can: every flow in public
            documentation, and a security position that says what is not
            done yet. No certification, no uptime and no customer count,
            because none of them exists to point at. */}
        <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
          Before you trust us:{' '}
          <Link
            href={'/docs' as Route}
            className="text-etyme-action underline underline-offset-4 hover:opacity-80"
          >
            the documentation is public
          </Link>
          , and{' '}
          <Link
            href={'/security' as Route}
            className="text-etyme-action underline underline-offset-4 hover:opacity-80"
          >
            the security position says what is not built yet
          </Link>
          .
        </p>
        {/* The two quieter doors, as whole sentences. A buyer-side review,
            2026-09-27, read "If you supply into a program instead" as a
            page that had broken: it had no verb, and the two doors after
            it were buttons, which a reader mode or a text extract drops.
            So each door is now a question that stands on its own, with the
            door as its answer, so a reader who never sees the door still
            reads two finished sentences.

            Each door is a real link since e83e8797: TryDemo draws an <a>
            with an address every reader sees, and a click still seats the
            visitor at a desk in one step by posting to /api/demo. */}
        <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
          <span className="font-semibold text-etyme-ink">Supply people to a program instead?</span>{' '}
          <TryDemo
            side="BENCH"
            label="Sit at a supplier’s desk →"
            className="text-etyme-action underline underline-offset-4 hover:opacity-80"
          />
        </p>
        <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
          <span className="font-semibold text-etyme-ink">Work in a program as a contractor?</span>{' '}
          <TryDemo
            side="CANDIDATE"
            label="See it as a candidate →"
            className="text-etyme-action underline underline-offset-4 hover:opacity-80"
          />
        </p>
      </CloseBand>
      </main>

      <SiteFooter />
    </div>
  )
}
