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
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ side }),
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

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <button onClick={start} disabled={busy} className={className}>
        {busy ? 'Building your workspace…' : label}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  )
}
