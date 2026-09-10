import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { DeskPicker, type Programme } from './desk-picker'

/**
 * Three running programmes, from whichever desk is yours.
 *
 * The buyer of this product is not one person. A contingent workforce
 * office is a manager who needs somebody, a VP who signs for the money,
 * a clerk who pays what matched, and an officer who answers for tenure
 * and paperwork — and each of them evaluates a product by sitting at
 * their own desk and finding their own work waiting. So the door says
 * which desk, and each lands on its own queue.
 *
 * Everything below is true of the seeded programmes (lib/seed-programmes)
 * and stays true when the seed is re-run. Nothing here describes a
 * screen that does not exist.
 */

const PROGRAMMES: Programme[] = [
  {
    slug: 'world-nike',
    name: 'Nike',
    where: 'Beaverton, OR',
    about:
      'Three suppliers, one of them supplying through a bench vendor it never names. ' +
      'A planning analyst on her second supplier here, fourteen months into an eighteen-month cap.',
  },
  {
    slug: 'world-corning',
    name: 'Corning',
    where: 'Corning, NY',
    about:
      'A glass plant hiring validation, MES and quality people. A supplier whose liability ' +
      'certificate runs out in twelve days, and a past contractor who is clear to come back.',
  },
  {
    slug: 'world-terumo-bct',
    name: 'Terumo BCT',
    where: 'Lakewood, CO',
    about:
      'A medical device maker. One SAP consultant is twenty-three months on site across two ' +
      'suppliers, against a cap of eighteen — a number neither supplier can see.',
  },
]

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/"><EtymeLogo size="md" /></Link>
        <Link href="/" className="text-sm text-etyme-muted hover:text-etyme-ink">← Back</Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <p className="eyebrow">A running programme</p>
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

        <DeskPicker programmes={PROGRAMMES} />

        <section className="mt-16 max-w-2xl">
          <p className="eyebrow">The other side of the same placements</p>
          <p className="mt-2 text-sm leading-relaxed text-etyme-muted">
            Every contractor above was placed by a supplier that is also here. Computer Systems sells
            into Nike and Terumo BCT; Vertex Global into Corning and Terumo BCT. Sit at one to see what
            a supplier sees of the same contract — and what it cannot.
          </p>
          <DeskPicker
            programmes={[
              { slug: 'world-computer-systems', name: 'Computer Systems Inc', where: 'Prime supplier', about: 'Sells into Nike and Terumo BCT. Buys one of those people from a bench vendor.' },
              { slug: 'world-vertex-global', name: 'Vertex Global', where: 'Prime supplier', about: 'Sells into Corning and Terumo BCT.' },
            ]}
            supplier
          />
        </section>
      </main>
    </div>
  )
}
