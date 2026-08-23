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
}: {
  className?: string
  label?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/demo', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not start a demo.')
      router.push('/dashboard')
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
