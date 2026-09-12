'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * "Look around" — a seat in the seeded world, in one click.
 *
 * No sign-up. A prospect who has to create an account before seeing
 * anything looks at the form and leaves, and we never learn whether the
 * product was any good.
 *
 * ── Where the door leads ─────────────────────────────────────────────
 *
 * A company seat lands in the twenty-firm world lib/seed-world builds —
 * a client sits at Nike, a bench vendor at CloudEPA — not in a private
 * copy with a made-up name. This used to mint "Oxford Corp" for anybody
 * who picked the client seat, and the founder, who had just watched
 * Nike, Corning and Terumo BCT get built, opened the product and asked
 * why it said Oxford. The world is the demo; the button is a door into
 * it, and the words on the door say which firm is behind it.
 *
 * A candidate is the exception and still gets their own seeded agency:
 * they are one person, not a firm, and the world's consultants are
 * somebody's bench.
 *
 * It says how long it takes, because a button that hangs for four
 * seconds with no explanation is a button people press twice.
 */

/**
 * The firm each company seat sits at, and the desk where one is chosen.
 *
 * Nike's programme manager, because that desk sees the whole programme
 * (the clerk sees invoices, the hiring manager their own roles).
 * Computer Systems is the prime on Nike's own placements, so a visitor
 * who tries both seats is looking at one deal from both ends.
 */
const WORLD_SEAT: Record<string, { as: string; desk?: string; firm: string }> = {
  CLIENT: { as: 'world-nike', desk: 'programme', firm: 'Nike' },
  MSP:    { as: 'world-aptiva', firm: 'Aptiva Workforce' },
  GSI:    { as: 'world-teleworld', firm: 'Teleworld Solutions' },
  PRIME:  { as: 'world-computer-systems', firm: 'Computer Systems Inc' },
  BENCH:  { as: 'world-cloudepa', firm: 'CloudEPA' },
  // The old buyer's door means the client's chair.
  HIRING: { as: 'world-nike', desk: 'programme', firm: 'Nike' },
}
export function TryDemo({
  className,
  label = 'Look around',
  side = 'HIRING',
  asks,
}: {
  className?: string
  label?: string
  /**
   * Which chair they sit in.
   *
   * A client and a supplier get different companies, different
   * navigation and different data. Sending somebody who clicked "I'm
   * hiring" into a staffing agency's bench would be demonstrating a
   * product they did not ask about.
   */
  side?: 'HIRING' | 'BENCH' | 'CANDIDATE'
  /**
   * Ask which seat before seeding, instead of assuming one.
   *
   * The schema knows five kinds of company and this button offered
   * three, so an MSP and a GSI had no way in and a prime vendor and a
   * bench vendor got the same world despite being on opposite sides of
   * the same trade.
   *
   * Asked on click rather than as five buttons on the page: a hero with
   * five calls to action converts worse than one with two, and the
   * question only matters once somebody has decided to look.
   *
   * One picker, not two. This used to take BUYING or SUPPLYING and show
   * three seats or two, behind two buttons — which put a fork in the
   * front door on a distinction the product exists to say is not a
   * property of a firm. Computer Systems is supply toward its client and
   * demand toward its sub-vendor on the same placement. So: one door,
   * five seats, and demand/supply survives as a heading inside the
   * choice rather than a question asked before it.
   */
  asks?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const GROUPS: { heading: string; seats: { seat: string; label: string; note: string }[] }[] = [
    {
      heading: 'You buy the work',
      seats: [
        { seat: 'CLIENT', label: 'A company hiring contractors', note: 'You pay for it. You never touch a CV. Sit at Nike.' },
        { seat: 'MSP', label: 'An MSP running the programme', note: 'You run it on the client\'s behalf. Sit at Aptiva Workforce.' },
        { seat: 'GSI', label: 'A systems integrator delivering a project', note: 'Your own people, and bought ones. Sit at Teleworld Solutions.' },
      ],
    },
    {
      heading: 'You supply it',
      seats: [
        { seat: 'PRIME', label: 'A prime vendor', note: 'You hold the paper on people you did not source. Sit at Computer Systems Inc.' },
        { seat: 'BENCH', label: 'A staffing firm with a bench', note: 'You sourced them. You are furthest from the money. Sit at CloudEPA.' },
      ],
    },
  ]

  async function start(pick?: string) {
    setBusy(true)
    setError(null)
    try {
      // A company seat is a chair in the world; a candidate gets their own.
      const chosen = pick ?? side
      const world = WORLD_SEAT[chosen]
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          world ? { as: world.as, ...(world.desk ? { desk: world.desk } : {}) } : { side: chosen }
        ),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not start a demo.')
      // Land where the product is sharpest for that chair, not on a
      // generic dashboard they have to navigate out of.
      router.push(body.data?.landing ?? '/dashboard')
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  // Nothing is seeded until they answer. The same chain either way —
  // what changes is which seat in it they get, and therefore whose book
  // they are looking at.
  if (asks && asking && !busy) {
    return (
      <span className="inline-flex flex-col items-start gap-2 rounded-lg border border-white/20 bg-black/20 p-3">
        <span className="text-[11px] uppercase tracking-[0.08em] text-white/55">
          Which one are you?
        </span>
        {GROUPS.map((g) => (
          <span key={g.heading} className="flex flex-col items-start gap-2">
            {/* The demand/supply line, demoted from a door to a heading.
                It is still true of a seat on one deal; it was never true
                of a firm, which is why it no longer forks the front. */}
            <span className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/35">
              {g.heading}
            </span>
            {g.seats.map((s) => (
              <button
                key={s.seat}
                onClick={() => start(s.seat)}
                className="text-left text-sm text-white/85 transition-colors hover:text-white"
              >
                {s.label}
                <span className="block text-xs text-white/45">{s.note}</span>
              </button>
            ))}
          </span>
        ))}
        <button
          onClick={() => setAsking(false)}
          className="text-xs text-white/40 underline underline-offset-2 hover:text-white/70"
        >
          Never mind
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <button
        onClick={() => (asks ? setAsking(true) : start())}
        disabled={busy}
        className={className}
      >
        {busy ? 'Taking your seat…' : label}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  )
}
