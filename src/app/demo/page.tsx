import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { DeskPicker } from './desk-picker'
import {
  CLIENT_PROGRAMS,
  SUPPLIER_SEATS,
  PROGRAM_OFFICE_SEATS,
  INTEGRATOR_SEATS,
  CANDIDATE_SEATS,
} from './seats'

/**
 * Three running programs, from whichever desk is yours.
 *
 * The buyer of this product is not one person. A contingent workforce
 * office is a manager who needs somebody, a VP who signs for the money,
 * a clerk who pays what matched, and an officer who answers for tenure
 * and paperwork — and each of them evaluates a product by sitting at
 * their own desk and finding their own work waiting. So the door says
 * which desk, and each lands on its own queue.
 *
 * Everything below is true of the seeded programs (lib/seed-programmes,
 * lib/seed-world) and stays true when the seed is re-run. Nothing here
 * describes a screen that does not exist. The seats themselves are in
 * ./seats, where a test can read them.
 */

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/"><EtymeLogo size="md" /></Link>
        <Link href="/" className="text-sm text-etyme-muted hover:text-etyme-ink">← Back</Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <p className="eyebrow">A running program</p>
        <h1
          className="mt-2 max-w-2xl font-serif text-4xl leading-tight tracking-[-0.02em]"
          style={{ textWrap: 'balance' }}
        >
          Sit at a client&rsquo;s desk. Your own desk.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-etyme-muted">
          Three companies, each with several suppliers, a history, and something waiting at every
          desk: a requisition for the VP, a week of hours for the manager, an invoice for payables,
          a person over the tenure cap for compliance. Pick the desk that is yours. Nothing to set up;
          the data is shared, and what you change, everybody else at that company sees.
        </p>

        <DeskPicker programs={CLIENT_PROGRAMS} />

        <section className="mt-16">
          <p className="eyebrow">The other side of the same placements</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-etyme-muted">
            Every contractor above was placed by a supplier that is also here, and every one of those
            firms sells upward and buys downward. Sit at one to see both halves of its book — what it
            shows the client, what it pays the firm below, and what neither of them can see.
          </p>
          <DeskPicker programs={SUPPLIER_SEATS} supplier />
        </section>

        <section className="mt-16">
          <p className="eyebrow">The office that runs the program and is not the client</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-etyme-muted">
            An MSP runs a client&rsquo;s contingent program, sells into it, and staffs part of it off its
            own payroll. There is no bench listing for its own employee and no purchase order to itself
            — the employment contract already said both.
          </p>
          <DeskPicker programs={PROGRAM_OFFICE_SEATS} supplier />
        </section>

        <section className="mt-16">
          <p className="eyebrow">The firm that staffs a seat off its own payroll</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-etyme-muted">
            An integrator sells people it already employs. There is no bench listing to grant and
            nobody&rsquo;s consent to ask — the employment contract already said it — so the submission
            is an internal one and the client is told which firm the person works for. Both seats open
            at the delivery manager&rsquo;s desk, which is the desk that submits.
          </p>
          <DeskPicker programs={INTEGRATOR_SEATS} supplier />
        </section>

        <section className="mt-16">
          <p className="eyebrow">And the person the whole chain is about</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-etyme-muted">
            Four consultants in four industries, on four kinds of paper: an integrator&rsquo;s own
            employee, a bench listing through a prime, an H1B two rungs down a chain, and a travel
            nurse paid corp to corp through the company she owns. Each door opens on that person&rsquo;s
            own work — their hours, their placement, what has been asked of them — and never on a
            company&rsquo;s book.
          </p>
          <DeskPicker programs={CANDIDATE_SEATS} person />
        </section>
      </main>
    </div>
  )
}
