import { SiteHeader, SiteFooter } from '@/lib/public-site/frame'
import { DemoChip } from '@/components/shell/demo-chip'
import { ProgramDoors, DoorRows, OpenOnArrival } from './desk-picker'
import {
  CLIENT_PROGRAMS,
  SUPPLIER_SEATS,
  PROGRAM_OFFICE_SEATS,
  INTEGRATOR_SEATS,
  CANDIDATE_SEATS,
  NEXT_STEP_LEAD,
  FIRST_SUPPLIERS,
  fillDoors,
} from './seats'
import { doorFacts } from './door-facts'
import { ASK_A_PERSON } from '@/lib/public-site/funnel'
import { CLIENT_SIGN_UP } from '@/lib/public-site/skeleton-words'

/**
 * The second page a client sees, one click after the home page.
 *
 * ── One screen, since 2026-10-15 ─────────────────────────────────────
 *
 * The founder said "Build it" on a drawing that cut every public page to
 * one screen: "no one is reading large content … make it real and make
 * it simple". This page was 1,874 words before anybody could click. It
 * is now a heading, one line, three client cards and one short list:
 * pick a company and a role.
 *
 * Nothing was taken away but words. Every seat the page offered is still
 * here: a client's other roles behind "More roles", a firm's roles
 * behind "Roles" on its row, and every other firm and person under the
 * fold at the foot of the list.
 *
 * ── Why it opens on the client ───────────────────────────────────────
 *
 * The client is the customer (CLAUDE.md, decided 2026-09-10). The
 * clients come first and large; the suppliers read it over their
 * shoulder, quieter, below; the people last, under the fold.
 *
 * ── What is on the page is true of the world behind it ───────────────
 *
 * Every line describes a row the seed actually writes, and the ones that
 * name a number are checked against the seeded world in
 * `__integration__/demo-seats.test.ts`. The seats are in ./seats, where a
 * test can read them.
 *
 * ── The way on ───────────────────────────────────────────────────────
 *
 * One quiet line at the foot: sign up, or ask a person, in the shared
 * words. `site-description.test.ts` reads it.
 */

/** Read on every visit: a door's numbers come from the world as it is today. */
export const dynamic = 'force-dynamic'

export default async function DemoPage() {
  const facts = await doorFacts()
  const others = [
    ...SUPPLIER_SEATS.filter((s) => !FIRST_SUPPLIERS.includes(s.slug)),
    ...PROGRAM_OFFICE_SEATS,
    ...fillDoors(INTEGRATOR_SEATS, facts, new Date()),
  ]
  const first = FIRST_SUPPLIERS.map((slug) => SUPPLIER_SEATS.find((s) => s.slug === slug)!)
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
        <h1
          className="font-serif text-[32px] leading-[1.1] tracking-[-0.02em] sm:text-[40px]"
          style={{ textWrap: 'balance' }}
        >
          Pick a company and a role
        </h1>
        {/* Said before any company is named: the founder, 2026-09-29 —
            people must know they are looking at made-up data. The same
            chip the product draws in front of a made-up company. */}
        <p role="note" className="mt-3 flex items-center gap-2 text-[15px] text-etyme-muted">
          <DemoChip />
          <span>Demo companies, not customers. Nothing you change touches anything real.</span>
        </p>

        <h2 className="mt-10 font-serif text-[22px] tracking-[-0.02em]">Clients</h2>
        <div className="mt-4">
          <ProgramDoors programs={CLIENT_PROGRAMS} />
        </div>

        {/* The id is the no-script landing of the home page's supplier
            door (components/try-demo). */}
        <section id="supplier" className="mt-12 scroll-mt-6">
          <h2 className="font-serif text-[22px] tracking-[-0.02em]">Suppliers</h2>
          <div className="mt-4">
            <DoorRows firms={first} />
          </div>
          <details id="everyone" className="mt-3">
            <summary className="cursor-pointer py-2 text-[14px] font-medium text-etyme-action">
              All suppliers, MSPs, integrators and workers →
            </summary>
            <div className="mt-3">
              <DoorRows firms={others} />
            </div>
            {/* The home page's worker door lands here: /demo#candidate. */}
            <h3 id="candidate" className="mt-8 scroll-mt-6 text-[14px] font-semibold">Workers</h3>
            <div className="mt-2">
              <DoorRows people={CANDIDATE_SEATS} />
            </div>
          </details>
          <OpenOnArrival fold="everyone" />
        </section>

        <p className="mt-16 border-t border-etyme-rule pt-6 text-[14px] leading-relaxed text-etyme-muted">
          {NEXT_STEP_LEAD}{' '}
          <a href={CLIENT_SIGN_UP.href} className="text-etyme-action hover:underline">
            {CLIENT_SIGN_UP.t}
          </a>
          , or{' '}
          <a href={ASK_A_PERSON.href} className="text-etyme-action hover:underline">
            {ASK_A_PERSON.t.toLowerCase()}
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
