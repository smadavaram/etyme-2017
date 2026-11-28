'use client'

import { useEffect, useState } from 'react'
import { Lbl } from '@/components/ui'

/**
 * What the client's own system said about each line of a bill the reader
 * sent (Layer 9). Drawn on the supplier's own bill page, and only where
 * `/api/ap/receipts-file/state` answers for that reader: a refusal or a
 * failed read draws nothing at all. It carries the client's reason and its
 * payment reference, and never one of the client's codes.
 */
type Line = { lineId: string; person: string | null; says: string; next: string | null }

export function BillLineStates({ invoiceId }: { invoiceId: string }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [whole, setWhole] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/ap/receipts-file/state?invoice=${encodeURIComponent(invoiceId)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return null
        return (await r.json()).data as { lines: Line[]; says?: string }
      })
      .then((d) => {
        if (!live || !d) return
        setLines(d.lines)
        setWhole(d.says ?? null)
      })
      .catch(() => {})
    return () => { live = false }
  }, [invoiceId])

  if (!lines) return null
  if (lines.length === 0) {
    return whole ? (
      <div className="mb-6 rounded-lg border border-etyme-rule bg-etyme-surface p-4">
        <Lbl>In your customer’s system</Lbl>
        <p className="mt-1 text-sm text-etyme-ink">{whole}</p>
      </div>
    ) : null
  }
  return (
    <div className="mb-6 rounded-lg border border-etyme-rule bg-etyme-surface p-4">
      <Lbl>In your customer’s system</Lbl>
      <ul className="mt-1 space-y-2">
        {lines.map((l) => (
          <li key={l.lineId} className="text-sm text-etyme-ink">
            {l.person && <span className="text-etyme-muted">{l.person}: </span>}
            {l.says}
            {l.next && <p className="mt-0.5 text-[13px] text-etyme-attention">{l.next}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
