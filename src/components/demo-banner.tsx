'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Says demo, on every screen, without apologising for it.
 *
 * Every number below this line is invented. A visitor who takes a seeded
 * rate benchmark for a reading of their own market has been misled by us,
 * and "it looked like demo data" is exactly the judgement nobody should
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-etyme-rule bg-etyme-attention/10 px-4 py-2">
      <p className="text-[12px] text-etyme-ink">
        <span className="font-semibold">Demo.</span> Every number here is made up —{' '}
        {demo.companyName} does not exist. Break it however you like.
        {demo.daysLeft !== null && (
          <span className="text-etyme-muted">
            {' '}
            This copy is deleted in {demo.daysLeft} day{demo.daysLeft === 1 ? '' : 's'}.
          </span>
        )}
      </p>
      <button
        onClick={startAgain}
        disabled={busy}
        className="shrink-0 text-[12px] font-medium text-etyme-action hover:underline disabled:opacity-50"
      >
        {busy ? 'Building a fresh one…' : 'Start again with clean data'}
      </button>
    </div>
  )
}
