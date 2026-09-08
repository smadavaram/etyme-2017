'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * "Look around" — a seeded workspace of their own, in one click.
 *
 * No sign-up. A prospect who has to create an account before seeing
 * anything looks at the form and leaves, and we never learn whether the
 * product was any good.
 *
 * It says how long it takes, because a button that hangs for four
 * seconds with no explanation is a button people press twice.
 */
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
   */
  asks?: 'BUYING' | 'SUPPLYING'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const SEATS =
    asks === 'BUYING'
      ? [
          { seat: 'CLIENT', label: 'A company hiring contractors', note: 'You buy the work.' },
          { seat: 'MSP', label: 'An MSP running the programme', note: 'You are invoiced. You never touch a CV.' },
          { seat: 'GSI', label: 'A systems integrator delivering a project', note: 'Your own people, and bought ones.' },
        ]
      : [
          { seat: 'PRIME', label: 'A prime vendor', note: 'You hold the paper on people you did not source.' },
          { seat: 'BENCH', label: 'A staffing firm with a bench', note: 'You sourced them. You are furthest from the money.' },
        ]

  async function start(pick?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ side: pick ?? side }),
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
        {SEATS.map((s) => (
          <button
            key={s.seat}
            onClick={() => start(s.seat)}
            className="text-left text-sm text-white/85 transition-colors hover:text-white"
          >
            {s.label}
            <span className="block text-xs text-white/45">{s.note}</span>
          </button>
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
        {busy ? 'Building your workspace…' : label}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  )
}
