import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { DemoChip } from '@/components/shell/demo-chip'
import { ProgramDoors, FirmDoors, PersonDoors } from './desk-picker'
import {
  CLIENT_PROGRAMS,
  SUPPLIER_SEATS,
  PROGRAM_OFFICE_SEATS,
  INTEGRATOR_SEATS,
  CANDIDATE_SEATS,
  NEXT_STEP_LEAD,
} from './seats'
import { GET_THE_AUDIT, ASK_A_PERSON } from '@/lib/public-site/funnel'

/**
 * The second page a client sees, one click after the home page.
 *
 * ── Why it opens on the client ───────────────────────────────────────
 *
 * The client is the customer (CLAUDE.md, decided 2026-09-10) and this
 * page did not read that way. It opened on three programs and then gave
 * four more sections of equal weight to integrators, program offices
 * and primes — so a hiring manager who arrived from a page written for
 * them met a wall of staffing-firm vocabulary and concluded this was
 * software for staffing firms. Suppliers come anyway, because their
 * client is here; they read it over the client's shoulder, and the page
 * is now laid out that way: the programs first and large, every
 * supplying firm together and quieter under one sub-heading, the people
 * last.
 *
 * ── What is on the page is true of the world behind it ───────────────
 *
 * Every sentence describes a row the seed actually writes, and the ones
 * that name a number — a 44-hour week, twelve days of cover,
 * twenty-three months across two suppliers — are checked against the
 * seeded world in `__integration__/demo-seats.test.ts`. A door that
 * promises something the world does not hold is worse than a door that
 * promises nothing, because the visitor presses it.
 *
 * The seats themselves are in ./seats, where a test can read them.
 *
 * ── The way back to the funnel ───────────────────────────────────────
 *
 * A visitor arrives here from "See it with a month of data", the first
 * rung of the ladder in `lib/public-site/funnel`, and until 2026-09-27
 * the page had no second rung: nothing said what to do after looking.
 * One quiet line at the foot now offers the next two, in the funnel's
 * own words and to its own addresses — the audit and a person — and
 * never an account, because sign-in for a real tenant is not open.
 * `site-description.test.ts` reads the line against `promisesAnAccount`.
 */

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6 sm:px-6">
        <Link href="/"><EtymeLogo size="md" /></Link>
        <Link href="/" className="text-sm text-etyme-muted hover:text-etyme-ink">← Back</Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        {/* Said first and plainly, before anybody reads a name or a number:
            the founder, 2026-09-29 — people must know they are looking at
            simulated data. The same chip the product draws in front of a
            made-up company's name. */}
        <div
          role="note"
          className="mb-8 flex items-start gap-3 rounded-panel border border-etyme-action-line bg-etyme-action-wash px-4 py-3"
        >
          <DemoChip className="mt-0.5" />
          <p className="text-[13.5px] leading-relaxed text-etyme-ink">
            <strong className="font-semibold">Simulated data.</strong> Every company, person and
            number on this page is made up for the demo. These are demo companies, not
            customers. Nothing you change here touches anything real.
          </p>
        </div>

        {/* ── The client's own desk ─────────────────────────────── */}
        <p className="eyebrow">A running program, from your desk</p>
        <h1
          className="mt-2 max-w-3xl font-serif text-[34px] leading-[1.1] tracking-[-0.02em] sm:text-[42px]"
          style={{ textWrap: 'balance' }}
        >
          Every contractor on every site, across every supplier.
        </h1>
        <div className="mt-4 max-w-2xl text-[15px] leading-relaxed text-etyme-muted">
          <p>
            Three companies buy contract work from several suppliers. Each has a year of history.
            Something is waiting at every desk today:
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            <li>a week of hours to sign</li>
            <li>a job request to clear</li>
            <li>a bill that matched</li>
            <li>a person past the time limit on how long one person may stay</li>
          </ul>
          <p className="mt-3">
            Pick your desk. There is nothing to set up and nothing to sign. The data is shared:
            everybody else at that company sees what you change.
          </p>
        </div>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-etyme-faint">
          Northbend Athletic, Cavanaugh Glassworks, Talvern Medical and every firm that supplies
          them are demo companies — not customers. Nothing here is real data, and nobody named is
          a real person. Their web and email addresses use reserved names nobody can register,
          and re-seeding puts it all back as it was.
        </p>

        {/* Which desk to sit at, not which kind of firm the visitor is:
            every door under it is a desk at a client program, so the
            question picks a seat and never asks anybody to classify their
            company as buyer or seller (the "one door" rule). Added
            2026-09-28 on the founder's go-to-market list. */}
        <p className="mt-10 font-serif text-[20px] tracking-[-0.02em] text-etyme-ink">Which one are you?</p>
        <div className="mt-4">
          <ProgramDoors programs={CLIENT_PROGRAMS} />
        </div>

        <div className="mt-6 max-w-2xl text-[13px] leading-relaxed text-etyme-muted">
          <p>Each desk opens on its own work:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>The hiring manager needs somebody.</li>
            <li>The approver signs for the money.</li>
            <li>The AP clerk pays what matched, and cannot raise a job request.</li>
            <li>The compliance officer tracks how long each person has been on site.</li>
          </ul>
        </div>

        {/* ── The suppliers, over the client's shoulder ─────────── */}
        {/* The id is the no-script landing of the home page's supplier door
            (components/try-demo): a reader without a script follows the
            link here instead of being seated. */}
        <section id="supplier" className="mt-16 scroll-mt-6 border-t border-etyme-rule pt-10">
          <p className="eyebrow">The same placements, from the supplier’s side</p>
          <h2 className="mt-2 font-serif text-[24px] tracking-[-0.02em]">
            The firms that supply them
          </h2>
          <div className="mt-3 max-w-2xl space-y-2 text-[14px] leading-relaxed text-etyme-muted">
            <p>
              Every contractor above came through a firm listed here. Each firm sells to the firm
              above it and buys from the firm below.
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>Primes: the suppliers the client pays.</li>
              <li>Not only IT: a nurse staffing firm and a plant maintenance staffing firm.</li>
              <li>A bench vendor below a prime. The client never learns its name.</li>
              <li>Two program offices, which work inside a client&rsquo;s program without being the client.</li>
              <li>Two integrators, which staff a job with their own employees.</li>
            </ul>
            <p>
              Sit at one to see what it shows the client, what it pays the firm below, and what
              neither of them can see.
            </p>
          </div>
          <div className="mt-6">
            <FirmDoors firms={[...SUPPLIER_SEATS, ...PROGRAM_OFFICE_SEATS, ...INTEGRATOR_SEATS]} />
          </div>
        </section>

        {/* ── And the person the work is about ──────────────────── */}
        <section id="candidate" className="mt-16 scroll-mt-6 border-t border-etyme-rule pt-10">
          <p className="eyebrow">The people doing the work</p>
          <h2 className="mt-2 font-serif text-[24px] tracking-[-0.02em]">
            See it as the person, not the firm
          </h2>
          <div className="mt-3 max-w-2xl space-y-2 text-[14px] leading-relaxed text-etyme-muted">
            <p>Six consultants in six industries, each on a different kind of contract:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>an integrator&rsquo;s own employee</li>
              <li>a consultant on a bench, sold through a prime</li>
              <li>a consultant on a US work visa (H-1B), two firms below the client</li>
              <li>a travel nurse paid through her own company</li>
              <li>somebody with no bench and no employer yet, which is where every consultant starts</li>
              <li>a staffing firm&rsquo;s hourly employee, whose pay rose from $66 to $70 in month six</li>
            </ul>
            <p>
              Each door opens on that person&rsquo;s own work. That is their hours, their
              placement, what they were asked for, or a line saying there is nothing yet. It never
              opens on a company&rsquo;s records.
            </p>
          </div>
          <div className="mt-6">
            <PersonDoors people={CANDIDATE_SEATS} />
          </div>
        </section>

        {/* ── The next step, quietly ───────────────────────────── */}
        <p className="mt-16 border-t border-etyme-rule pt-6 text-[14px] leading-relaxed text-etyme-muted">
          {NEXT_STEP_LEAD}{' '}
          <a href={GET_THE_AUDIT.href} className="text-etyme-action hover:underline">
            {GET_THE_AUDIT.t}
          </a>
          , or{' '}
          <a href={ASK_A_PERSON.href} className="text-etyme-action hover:underline">
            {ASK_A_PERSON.t.toLowerCase()}
          </a>
          .
        </p>
      </main>
    </div>
  )
}
