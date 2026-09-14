'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Re-seed the demo world, from the page that says it is stale.
 *
 * ── Why this is a button ─────────────────────────────────────────────
 *
 * Re-seeding took pasting a bearer token into a browser console. The
 * person who needs to do it does not write code, and the seed goes
 * stale every time a demo account gains a desk — which is often. A fix
 * whose instructions run to twenty steps is a fix nobody applies, and
 * the row stays amber.
 *
 * Only drawn for Etyme's own staff, and the server decides that, not
 * this file: `GET /api/seed-world` answers whether the person looking
 * may press it. A control that refuses on click is worse than no
 * control, so with no right to it there is nothing here at all.
 *
 * It stays on the row even when the row reads green. The seed is
 * idempotent, so pressing it then costs nothing — and hiding it would
 * mean that the one case where this page's own assessment is wrong is
 * also the one case where staff have no way to fix it.
 *
 * The work takes most of a minute — twenty firms, their placements and
 * three client programs — so the button says so rather than looking
 * hung. It is idempotent by slug, which is why it can be pressed again
 * after a timeout without making a second copy of anything, and why
 * saying so on the screen is true rather than reassuring.
 */
export function ReseedButton({ proven = false }: { proven?: boolean }) {
  const router = useRouter()
  const [may, setMay] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/seed-world')
      .then((r) => r.json())
      .then((b) => { if (live) setMay(Boolean(b?.data?.mayReseed)) })
      .catch(() => { /* not staff, or not signed in: nothing to draw */ })
    return () => { live = false }
  }, [])

  const run = useCallback(async () => {
    setBusy(true)
    setSaid(null)
    setFailed(false)
    try {
      const res = await fetch('/api/seed-world', { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setFailed(true)
        setSaid(body?.error?.message ?? 'That did not finish. It is safe to press again.')
        return
      }
      setSaid(body?.data?.says ?? 'The world is seeded.')
      router.refresh()
    } catch {
      // A timeout at the edge does not mean it failed — the work may
      // have finished after the connection was cut.
      setFailed(true)
      setSaid('The connection dropped before it answered. It may have finished anyway — reload this page, and press again if the row still says it is stale.')
    } finally {
      setBusy(false)
    }
  }, [router])

  if (!may) return null

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg bg-etyme-action px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Building the world…' : proven ? 'Re-seed it anyway' : 'Re-seed the demo world'}
      </button>
      <p className="mt-1.5 text-xs text-etyme-faint">
        {busy
          ? 'Up to a minute — twenty firms and three client programs. Leave this page open.'
          : 'Adds what is missing and renames what moved. It never makes a second copy, so pressing it twice is safe.'}
      </p>
      {said && (
        <p className={`mt-2 text-sm ${failed ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{said}</p>
      )}
    </div>
  )
}
