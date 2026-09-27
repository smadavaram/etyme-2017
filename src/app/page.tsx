import type { Metadata } from 'next'
import { TryDemo } from '@/components/try-demo'
import { JoinMural } from '@/lib/public-site/join-mural'
import { SiteHeader, SiteFooter } from '@/lib/public-site/frame'
import { CloseBand } from '@/lib/public-site/close-band'
import { PRODUCT_STAGES } from '@/lib/public-site/nav'
import { SEE_IT, GET_THE_AUDIT } from '@/lib/public-site/funnel'
import Link from 'next/link'
// Typed routes widen a string in an array to `string`, which Link will not
// take. The cast is at the render rather than on the data so the lists
// stay readable.
import type { Route } from 'next'

/**
 * The front door.
 *
 * ── Five bands, about five hundred words. Rewritten 2026-09-27 ───────
 *
 * The founder, the day after the page became a product page: it is
 * still too big. It was 1,280 words in seven bands. Now it is five, and
 * each says one thing and leads to the page that says the rest:
 *
 *   1. what is this      the hero — the founder's headline, the category
 *                        line he decided, one hook line, the two ways in,
 *                        and the program dashboard
 *   2. what does it do   #steps — four steps, a line and a screen each
 *   3. what is in it     #modules — the eight parts under the same four
 *                        stage headings as the Product menu, so the page
 *                        and the header teach one map
 *   4. where it reaches  #join — the founder's line and the mural, quietly
 *   5. the door          #close — see it, get the audit, ask a person;
 *                        the program office offered once, quietly; one
 *                        line on price
 *
 * Where each band that left went, so nobody re-adds it here:
 *
 *   #gap   the four questions, each answered on a screen → /about#answered
 *          (why nobody can answer today was already /about#unanswered)
 *   #ways  VMS software or MSP provider, and the supplier's paragraph
 *                                                          → /about#ways
 *   the hero's record and span lines                       → /about#build
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
 * What it does, in four steps, each one a real screen.
 *
 * A CTO recognizes post, choose, approve, pay. One line each since
 * 2026-09-27: the step says the verb, the caption says what the screen
 * under it shows. `from` is the desk and the route the image came from,
 * so anybody can retake it: seat at Northbend Athletic with
 * `POST /api/demo {"as":"world-nike","desk":"..."}` and screenshot the
 * route at 1440×900. Nothing in a caption is a claim the image does not
 * show.
 */
const STEPS: {
  n: string
  t: string
  img: string
  alt: string
  caption: string
  from: string
  /**
   * When the image was taken, UTC. Pinned because the seeded world it
   * was photographed from is renamed from time to time, and a PNG cannot
   * be read by a test. The date is what catches a stale shot.
   */
  capturedAt: string
}[] = [
  {
    n: '01',
    t: 'Post a role to the suppliers you cleared',
    img: '/screens/submissions.png',
    alt: 'A Candidates screen: nine people from three suppliers, each row naming the consultant, the role, the supplier, the rate and the stage.',
    caption: 'Nine people from three suppliers, each at the rate asked.',
    from: '/dashboard/submissions as the hiring manager',
    capturedAt: '2026-09-21T15:15:10Z',
  },
  {
    n: '02',
    t: 'Interview, choose, and the paperwork is written',
    img: '/screens/purchase-orders.png',
    alt: 'An orders screen: one order per supplier, what is left of what was authorized, and a line naming the person and their rate.',
    caption: 'One order per supplier, and the ceiling left to bill.',
    from: '/dashboard/purchase-orders as the program manager',
    capturedAt: '2026-09-21T15:15:16Z',
  },
  {
    n: '03',
    t: 'Contractors file their weeks and your manager approves them',
    img: '/screens/timesheets.png',
    alt: 'A timesheets screen: one week flagged at 168 hours with an overtime decision on it. The approved weeks sit under it, each row naming the person, the period, the hours, the bill rate and what the week is worth.',
    caption: 'A week over the hours is flagged above the signed ones.',
    from: '/dashboard/timesheets as the hiring manager',
    capturedAt: '2026-09-21T15:15:22Z',
  },
  {
    n: '04',
    t: 'Each supplier bills, and you pay what matched',
    img: '/screens/invoices.png',
    alt: 'An invoices screen: the outstanding total, an aging breakdown, and a table of supplier bills with the period, the total and what is paid.',
    caption: 'A bill with no signed week behind it is not paid.',
    from: '/dashboard/invoices, what we owe, as the AP clerk',
    capturedAt: '2026-09-21T15:15:28Z',
  },
]

/**
 * The founder's line, in a quiet band. Added 2026-09-27.
 *
 * "Join forces with global teams around the world" — his words, exactly,
 * and he was clear it is subtle and not a hero. So it is a heading in a
 * band below the module tiles, with two sentences and a mural, and no
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
          <p className="mt-4 font-mono text-[12px] text-etyme-muted">
            No card and no sign-up.
          </p>

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
            <figcaption className="px-5 py-3.5 text-[13px] leading-relaxed text-etyme-muted">
              The program manager’s desk at Northbend Athletic, an invented company in the example program.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── What it does, in four steps ───────────────────────────── */}
      {/* The answer to "I do not understand what the app does": four
          screens rather than four claims, a line each. */}
      <section id="steps" className="scroll-mt-6 border-b border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">What it does, in four steps</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            A role goes out, a person starts, a week is signed, a bill is paid
          </h2>

          <ol className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-2">
            {STEPS.map((s) => (
              <li key={s.n}>
                <figure className="overflow-hidden rounded-xl border border-etyme-rule
                                   bg-etyme-raised shadow-sm">
                  <img
                    src={s.img}
                    alt={s.alt}
                    width={1440}
                    height={900}
                    loading="lazy"
                    className="block h-auto w-full border-b border-etyme-rule"
                  />
                  <figcaption className="px-4 py-2.5 text-[12.5px] leading-relaxed text-etyme-muted">
                    {s.caption}
                  </figcaption>
                </figure>
                <h3 className="mt-4 flex items-baseline gap-3 text-balance font-serif text-[20px] leading-snug text-etyme-ink">
                  <span className="font-mono text-[11px] tabular-nums text-etyme-faint">{s.n}</span>
                  {s.t}
                </h3>
              </li>
            ))}
          </ol>

          <p className="mt-10 text-[15px]">
            <Link
              href={'/docs/client' as Route}
              className="font-medium text-etyme-action underline underline-offset-4 hover:opacity-80"
            >
              Every step, desk by desk, in the documentation →
            </Link>
          </p>
        </div>
      </section>

      {/* ── The eight parts ─────────────────────────────────────── */}
      {/* Drawn from the header's Product menu, group by group, so the
          page and the menu teach one map: the same four stages, the same
          eight names, the same line under each. */}
      <section id="modules" className="scroll-mt-6 border-b border-etyme-rule">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">What is in it</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            Eight parts of one record, in the order a hire moves through them
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
                        className="group block rounded-xl border border-etyme-rule bg-etyme-raised px-4 py-3.5
                                   transition-shadow hover:shadow-md"
                      >
                        <span className="block text-[15px] font-semibold leading-snug text-etyme-ink
                                         group-hover:text-etyme-action">
                          {m.t}
                        </span>
                        <span className="mt-1 block text-[13px] leading-snug text-etyme-muted">{m.d}</span>
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
            What is settled →
          </Link>
        </p>
        <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
          <span className="font-semibold text-etyme-ink">If you supply into a program instead</span>{' '}
          <TryDemo
            side="BENCH"
            label="Sit at a supplier’s desk →"
            className="text-etyme-action underline underline-offset-4 hover:opacity-80"
          />
          <span className="mx-2 text-etyme-faint" aria-hidden="true">·</span>
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
