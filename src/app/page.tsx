import type { Metadata } from 'next'
import { TryDemo } from '@/components/try-demo'
import { JoinMural } from '@/lib/public-site/join-mural'
import { SiteHeader, SiteFooter } from '@/lib/public-site/frame'
import { CloseBand } from '@/lib/public-site/close-band'
import { SEE_IT, GET_THE_AUDIT } from '@/lib/public-site/funnel'
import Link from 'next/link'
// Typed routes widen a string in an array to `string`, which Link will not
// take. The cast is at the render rather than on the data so the lists
// stay readable.
import type { Route } from 'next'

/**
 * The front door.
 *
 * ── Four bands and two screens. Rewritten 2026-09-27, twice ─────────
 *
 * The founder, the day after the page became a product page: it is
 * still too big. It was 1,280 words in seven bands, then five. The same
 * evening a CRO he showed it to said "the website seems too much data,
 * and you are already giving screenshots in the main page", and asked
 * whether the companies named were real customers. So it is four bands,
 * each saying one thing and leading to the page that says the rest:
 *
 *   1. what is this      the hero — the founder's headline, the category
 *                        line he decided, the outcome, one hook line, the
 *                        two ways in, and the program dashboard
 *   2. what does it do   #steps — four steps a line each, every one a
 *                        link to its part's page, beside one screen
 *   3. where it reaches  #join — the founder's line and the mural, quietly
 *   4. the door          #close — see it, get the audit, ask a person;
 *                        the program office offered once, quietly; one
 *                        line on price; the supplier's and the
 *                        contractor's doors as whole questions
 *
 * Where each band that left went, so nobody re-adds it here:
 *
 *   #gap   the four questions, each answered on a screen → /about#answered
 *          (why nobody can answer today was already /about#unanswered)
 *   #ways  VMS software or MSP provider, and the supplier's paragraph
 *                                                          → /about#ways
 *   the hero's record and span lines                       → /about#build
 *   #modules  the eight parts under four stages → the header's Product
 *          menu, on every page, grouped the same way; each step here
 *          links to its own part's page
 *   three of the four step screens → their module pages, each opening
 *          on its screen
 *
 * The earlier moves, 2026-09-27 morning, are unchanged: #exposure to
 * /compliance#cost, #lifecycle to /about#hire, #alongside to
 * /about#alongside, #who to /chain#down-the-chain, #compliance to
 * /governance#rules, #why to /about#price with one line kept here.
 * `positioning.test.ts` holds a word ceiling and a band count, and finds
 * each moved phrase where it went.
 *
 * ── The category, decided 2026-09-27 ─────────────────────────────────
 *
 * "Contingent workforce management for companies with 20 to 200
 * contractors. The vendor management system, sized for fifty contractors
 * rather than five thousand." The product spans the whole of contingent
 * work, requisition to invoice to compliance, so the category names the
 * whole. "Vendor management system" stays in the second sentence because
 * it is what a buyer's procurement searches for and the word that made
 * the CTO understand it. The niche is the size, not the label. It
 * replaced the eyebrow and the size sentence at once, so the page does
 * not say "vendor management system" twice above the fold.
 *
 * ── A real buyer read it. Rewritten 2026-09-20 ───────────────────────
 *
 * The CTO of a two-billion-dollar company with forty to fifty IT
 * contractors — the exact buyer — said he did not understand what the
 * app does, and that it looked like an AI app. So: screens before
 * sentences, and the category and the size with no company named. The
 * comparison to the incumbents is a sentence the founder says in a
 * conversation, where he can answer the next question.
 *
 * ── The hook is the not-knowing ──────────────────────────────────────
 *
 * Nobody is fined at month nineteen. Being asked how many contractors
 * you have and not knowing happens monthly. So the hero's one hook line
 * is the question and the three weeks, and tenure is not in it: it is
 * the moat, not the wedge (corrected 2026-09-17).
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

export const metadata: Metadata = {
  title: { absolute: 'Etyme | Contingent workforce management' },
  description:
    'Contingent workforce management for companies with 20 to 200 contractors. ' +
    'The vendor management system, sized for fifty contractors rather than five thousand.',
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
  { n: '01', t: 'Post a role to the suppliers you cleared', href: '/requisitions' },
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
  alt: 'An invoices screen: the outstanding total, an aging breakdown, and a table of supplier bills with the period, the total and what is paid.',
  caption: 'A bill with no signed week behind it is not paid. Every firm on this screen is a demo company — not a customer.',
  from: '/dashboard/invoices, what we owe, as the AP clerk',
  /**
   * When the image was taken, UTC. Pinned because the seeded world it
   * was photographed from is renamed from time to time, and a PNG cannot
   * be read by a test. The date is what catches a stale shot.
   */
  capturedAt: '2026-09-21T15:15:28Z',
}

/**
 * The founder's line, in a quiet band. Added 2026-09-27.
 *
 * "Join forces with global teams around the world" — his words, exactly,
 * and he was clear it is subtle and not a hero. So it is a heading in a
 * band below the four steps, with two sentences and a mural, and no
 * button of its own.
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-etyme-canvas">
      <SiteHeader />

      <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      {/* The founder's headline, then the category line he decided on
          2026-09-27, then one hook line, then the two ways in, then the
          product itself. The first sentence under the headline is set in
          ink and the second in the same paragraph, so the category and
          the word a buyer searches for read as one thought. */}
      <section className="border-b border-etyme-rule">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16">
          <h1 className="mb-6 max-w-[18ch] text-balance font-serif text-[40px] font-normal
                         leading-[1.03] tracking-[-0.02em] text-etyme-ink md:text-[60px]">
            Every contractor. Every supplier. One record.
          </h1>
          <p className="mb-4 max-w-[62ch] text-[19px] leading-relaxed text-etyme-muted md:text-[21px]">
            <span className="font-medium text-etyme-ink">Contingent workforce management for companies with 20 to 200 contractors.</span> The vendor management system, sized for fifty contractors rather than five thousand.
          </p>
          {/* The outcome, added 2026-09-27 on a buyer-side review: the
              reader is an operations leader or a CFO with a dozen
              suppliers and no procurement team to watch them. It comes
              after the category, never before it, because a visitor knows
              what kind of thing this is before they know what is good
              about it. It sells control, never outsourcing, and it is
              about the software in the hands of the client's own people —
              "your own people" is what keeps it from reading as the quiet
              program office offer in the close. */}
          <p className="mb-4 max-w-[62ch] text-[17px] font-medium leading-relaxed text-etyme-ink">
            Your own people get a procurement team’s control over every contractor and every supplier, without hiring one.
          </p>
          <p className="mb-8 max-w-[62ch] text-[17px] leading-relaxed text-etyme-ink">
            How many contractors are on your sites, which suppliers sent them, and what are
            they costing you? Most companies cannot answer without three weeks of asking.
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
              data-captured-at="2026-09-21T15:15:03Z"
              alt="The program dashboard: a sentence saying whether anything needs the reader today, then six numbers — on site, suppliers, this month, ending soon, the tenure cap and requirements — over a list of who is starting soon and which suppliers are on site."
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
          caption and a step never read as one paragraph.

          The eight-part tile band that stood under this until 2026-09-27
          is gone: the Product menu in the header carries all eight,
          grouped by stage, on every page. */}
      <section id="steps" className="scroll-mt-6 border-b border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">What it does, in four steps</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            A role goes out, a person starts, a week is signed, a bill is paid
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

      {/* ── Join forces ──────────────────────────────────────────── */}
      {/* The founder's line, 2026-09-27, and he was clear: subtle, not a
          hero. A heading a size under the others and two sentences, on
          the plain canvas, with no button of its own, over a mural that
          runs the full width of the band in the kit's mural style
          (lib/public-site/join-mural). */}
      <section id="join" className="scroll-mt-6 border-b border-etyme-rule">
        <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-4 px-4 pt-12 sm:px-6 md:grid-cols-[1fr_1fr] md:pt-16">
          <h2 className="max-w-[22ch] text-balance font-serif text-[26px] leading-snug
                         tracking-[-0.02em] text-etyme-ink md:text-[32px]">
            {JOIN.heading}
          </h2>
          <div>
            {JOIN.lines.map((line) => (
              <p key={line} className="mb-4 max-w-[48ch] text-[16px] leading-relaxed text-etyme-muted">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="mt-6 w-full overflow-hidden md:mt-8">
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
        {/* The two quieter doors, as whole sentences. A buyer-side review,
            2026-09-27, read "If you supply into a program instead" as a
            page that had broken: it had no verb, and the two doors after
            it are buttons, which a reader mode or a text extract drops.
            So each door is now a question that stands on its own, with the
            door as its answer, and a reader who never sees the button
            still reads two finished sentences.

            They stay buttons rather than links on purpose: each seats the
            visitor at a desk in one click by posting to /api/demo, and a
            plain link could only reach /demo, which opens on the client's
            desks. Making the door a real link that still seats in one
            click is a change to components/try-demo, which is Platform's. */}
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
