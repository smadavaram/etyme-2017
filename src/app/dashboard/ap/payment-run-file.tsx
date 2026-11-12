'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'

/**
 * The file an approved run leaves as, for the payer's own payment system
 * (the founder, 2026-11-12: Etyme never moves money). The held lines are
 * said on the page in the route's own sentence before the file is saved.
 */
export function DownloadRunFile({ runId, disabled }: { runId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setFailed(null)
    try {
      const r = await fetch(`/api/ap/payment-runs?export=${encodeURIComponent(runId)}`)
      const b = await readJson(r)
      const d = b.data as { csv: string; filename: string; says: string; rows: number }
      setSaid(d.says)
      if (d.rows > 0) {
        const url = URL.createObjectURL(new Blob([d.csv], { type: 'text/csv;charset=utf-8' }))
        const a = document.createElement('a')
        a.href = url
        a.download = d.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="text-[13px] underline"
        style={{ color: 'var(--color-action)' }}
        disabled={busy || disabled}
        onClick={download}
      >
        {busy ? 'Working…' : 'Download for your payment system'}
      </button>
      {said && <p className="text-[13px] text-etyme-ink">{said}</p>}
      {failed && <p className="text-[13px] text-etyme-attention">{failed}</p>}
    </div>
  )
}
