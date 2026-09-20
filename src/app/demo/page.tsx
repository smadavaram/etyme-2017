import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { ProgramDoors, FirmDoors, PersonDoors } from './desk-picker'
import {
  CLIENT_PROGRAMS,
  SUPPLIER_SEATS,
  PROGRAM_OFFICE_SEATS,
  INTEGRATOR_SEATS,
  CANDIDATE_SEATS,
  MISSING_DOOR,
} from './seats'

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
 */

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6 sm:px-6">
        <Link href="/"><EtymeLogo size="md" /></Link>
        <Link href="/" className="text-sm text-etyme-muted hover:text-etyme-ink">← Back</Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        {/* ── The client's own desk ─────────────────────────────── */}
        <p className="eyebrow">A running program, from your own desk</p>
        <h1
          className="mt-2 max-w-3xl font-serif text-[34px] leading-[1.1] tracking-[-0.02em] sm:text-[42px]"
          style={{ textWrap: 'balance' }}
        >
          Every contractor on every site, across every supplier.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-etyme-muted">
          Three companies, each buying contract work from several suppliers, each with a year
          of history behind it and something waiting at every desk this morning — a week of
          hours to sign, a requisition to clear, an invoice that matched, somebody past the
          tenure cap. Pick the desk that is yours. Nothing to set up and nothing to sign; the
          data is shared, and what you change, everybody else at that company sees.
        </p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-etyme-faint">
          It is all seeded: the companies are invented, their addresses are reserved names
          nobody can register, re-seeding puts it back the way it was, and nobody named
          anywhere on this page is real.
        </p>

        <div className="mt-10">
          <ProgramDoors programs={CLIENT_PROGRAMS} />
        </div>

        <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-etyme-muted">
          A program is not one seat. The manager who needs somebody, the lead who signs for
          the money, the clerk who pays what matched and the officer who answers for tenure
          each open on their own queue — and the clerk cannot raise a requisition, which is
          the point of having a clerk.
        </p>

        {/* ── The suppliers, over the client's shoulder ─────────── */}
        <section className="mt-16 border-t border-etyme-rule pt-10">
          <p className="eyebrow">The other side of the same placements</p>
          <h2 className="mt-2 font-serif text-[24px] tracking-[-0.02em]">
            The firms that supply them
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-etyme-muted">
            Every contractor above was placed by a firm that is also here — a prime, the bench
            vendor two rungs below it that the client never learns about, the office that runs
            a program without being the client, and two integrators who staff a seat off their
            own payroll. Each sells upward and buys downward. Sit at one to see both halves of
            its book: what it shows the client, what it pays the firm below, and what neither
            of them can see.
          </p>
          <div className="mt-6">
            <FirmDoors firms={[...SUPPLIER_SEATS, ...PROGRAM_OFFICE_SEATS, ...INTEGRATOR_SEATS]} />
          </div>
        </section>

        {/* ── And the person the work is about ──────────────────── */}
        <section className="mt-16 border-t border-etyme-rule pt-10">
          <p className="eyebrow">And the person the work is about</p>
          <h2 className="mt-2 font-serif text-[24px] tracking-[-0.02em]">
            See it as the person, not the firm
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-etyme-muted">
            Four consultants in four industries on four kinds of paper: an integrator&rsquo;s own
            employee, a bench listing sold on through a prime, an H1B two rungs down a chain,
            and a travel nurse paid corp to corp through the company she owns. Each door opens
            on that person&rsquo;s own work — their hours, their placement, what has been asked of
            them — and never on a company&rsquo;s book.
          </p>
          <div className="mt-6">
            <PersonDoors people={CANDIDATE_SEATS} />
          </div>
          <p className="mt-5 max-w-2xl rounded-panel border border-dashed border-etyme-rule p-4
                        text-[13px] leading-relaxed text-etyme-muted">
            {MISSING_DOOR}
          </p>
        </section>
      </main>
    </div>
  )
}
