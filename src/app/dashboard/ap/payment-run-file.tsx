'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { confirmBody } from '@/lib/money/run-confirm'

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

/**
 * The confirmation, back from the payer's own system: the file it wrote,
 * or one reference and the day the money left, for the whole run. What was
 * marked paid and every row refused are said on the page, in the route's
 * own sentences.
 */
export function ConfirmRunPaid({ runId, onDone }: { runId: string; onDone?: () => void }) {
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refused, setRefused] = useState<{ line: number; reference: string; says: string }[]>([])
  const [failed, setFailed] = useState<string | null>(null)

  async function pick(file: File | null) {
    setCsv(file ? await file.text() : null)
    setFileName(file?.name ?? null)
  }

  async function send() {
    setBusy(true)
    setFailed(null)
    setSaid(null)
    setRefused([])
    try {
      const r = await fetch('/api/ap/payment-runs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmBody({ runId, csv, reference, paidOn })),
      })
      const b = await readJson(r)
      setSaid(b.data.says)
      setRefused(b.data.refused ?? [])
      onDone?.()
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 w-full space-y-2 border-t border-etyme-rule pt-3">
      <p className="stat-label">Paid from your system? Bring back the confirmation</p>
      <label className="block text-[13px] text-etyme-ink">
        The confirmation file (CSV with etyme_payment_reference, amount, paid_date, payer_reference)
        <input
          type="file"
          name="csv"
          accept=".csv,text/csv"
          className="mt-1 block text-[13px]"
          onChange={(e) => void pick(e.target.files?.[0] ?? null)}
        />
      </label>
      {fileName && <p className="text-[11px] text-etyme-faint">{fileName}</p>}
      <p className="text-[11px] text-etyme-faint">Or one reference for the whole run:</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[13px] text-etyme-ink">
          Your payment reference
          <input
            type="text"
            name="reference"
            className="mt-1 block rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="text-[13px] text-etyme-ink">
          Paid on
          <input
            type="date"
            name="paidOn"
            className="mt-1 block rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </label>
        <button type="button" className="btn-primary" disabled={busy} onClick={send}>
          {busy ? 'Working…' : 'Mark what it names as paid'}
        </button>
      </div>
      {said && <p className="text-[13px] text-etyme-ink">{said}</p>}
      {refused.length > 0 && (
        <ul className="space-y-1">
          {refused.map((x) => (
            <li key={`${x.line}-${x.reference}`} className="text-[13px] text-etyme-attention">{x.says}</li>
          ))}
        </ul>
      )}
      {failed && <p className="text-[13px] text-etyme-attention">{failed}</p>}
    </div>
  )
}
