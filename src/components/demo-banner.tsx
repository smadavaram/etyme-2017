'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DemoChip } from '@/components/shell/demo-chip'

/**
 * Says demo, on every screen, without apologizing for it.
 *
 * Every number below this line is invented. A visitor who takes a seeded
 * rate benchmark for a reading of their own market has been misled by us,
 * and "it looked like demo data" is exactly the judgment nobody should
 * have to make.
 *
 * It also carries the two things somebody in a demo actually wants: how
 * long it lasts, and how to start again after they have broken it — which
 * they should, because that is what a demo is for.
 */
export function DemoBanner() {
  const router = useRouter()
  const [demo, setDemo] = useState<{ companyName: string; daysLeft: number | null } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/demo')
      .then((r) => r.json())
      .then((b) => b.data?.inDemo && setDemo(b.data))
      .catch(() => {})
  }, [])

  if (!demo) return null

  async function startAgain() {
    setBusy(true)
    await fetch('/api/demo', { method: 'DELETE' }).catch(() => {})
    await fetch('/api/demo', { method: 'POST' }).catch(() => {})
    router.refresh()
    window.location.href = '/dashboard'
  }

  // Quiet, on purpose: one line on the surface, the same small chip the
  // company's name carries, and the way to start again. It is said on
  // every screen, so it must not read as something gone wrong — an
  // alarm that never stops is an alarm nobody hears.
  return (
    <div
      role="note"
      aria-label="Demo"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-etyme-rule bg-etyme-surface px-4 py-1.5 md:px-6"
    >
      <p className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-etyme-muted">
        <DemoChip />
        <span className="min-w-0">
          Every number here is made up — {demo.companyName} does not exist. Break it however you like.
          {demo.daysLeft !== null && (
            <span className="text-etyme-faint">
              {' '}
              This copy is deleted in {demo.daysLeft} day{demo.daysLeft === 1 ? '' : 's'}.
            </span>
          )}
        </span>
      </p>
      <button
        type="button"
        onClick={startAgain}
        disabled={busy}
        className="shrink-0 rounded-nav px-1.5 py-0.5 text-[12px] font-medium text-etyme-action-press hover:bg-etyme-action-wash disabled:opacity-50"
      >
        {busy ? 'Building a fresh one…' : 'Start again with clean data'}
      </button>
    </div>
  )
}
