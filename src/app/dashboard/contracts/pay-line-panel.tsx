'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * A placement with no buy line says so, and offers the contract manager
 * the terms page that writes one (`payLineView` in lib/money/pay-line-repair).
 * Draws nothing where a buy line stands or the reader is not the supplier.
 */
export function PayLinePanel({ contractId }: { contractId: string }) {
  const [view, setView] = useState<{ says: string | null; door: { href: string; label: string } | null } | null>(null)
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch(`/api/contracts/${contractId}/pay-line`)
        const body = await res.json().catch(() => ({}))
        if (live && res.ok) setView(body.data)
      } catch { /* nothing drawn: the page still says what it knows */ }
    })()
    return () => { live = false }
  }, [contractId])
  if (!view?.says) return null
  return (
    <div className="card mt-3">
      <p className="text-[13px] leading-relaxed text-etyme-attention">{view.says}</p>
      {view.door && (
        <Link href={view.door.href} className="btn-primary mt-3 inline-flex">{view.door.label}</Link>
      )}
    </div>
  )
}
