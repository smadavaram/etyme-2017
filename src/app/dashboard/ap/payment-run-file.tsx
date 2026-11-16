'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { confirmBody, confirmSummary, markPaidBody, type ConfirmSummary } from '@/lib/money/run-confirm'
import { RECEIPT_COLUMNS, DEFAULT_RECEIPT_COLUMNS } from '@/lib/money/receipt-file'

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
 * The invoice lines of an approved run, one row per line in the client's
 * own cost centers, for the client's own system (Layer 9, slice 1). The
 * client picks and orders the columns; the choice is sent with the
 * request and is not kept as a company setting. The route's own
 * sentence says what was left out and why before the file is saved.
 */
export function DownloadReceiptLines({ runId, disabled }: { runId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string[]>([...DEFAULT_RECEIPT_COLUMNS])
  const [said, setSaid] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const label = (id: string) => RECEIPT_COLUMNS.find((c) => c.id === id)?.label ?? id

  function toggle(id: string) {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }
  function move(id: string, by: -1 | 1) {
    setChosen((c) => {
      const i = c.indexOf(id)
      const j = i + by
      if (i < 0 || j < 0 || j >= c.length) return c
      const next = [...c]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function download() {
    setBusy(true)
    setFailed(null)
    try {
      const r = await fetch(`/api/ap/receipts-file?run=${encodeURIComponent(runId)}&columns=${encodeURIComponent(chosen.join(','))}`)
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
    <div className="w-full space-y-1">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="text-[13px] underline"
          style={{ color: 'var(--color-action)' }}
          disabled={busy || disabled || chosen.length === 0}
          onClick={download}
        >
          {busy ? 'Working…' : 'Download for your system'}
        </button>
        <button type="button" className="text-[13px] underline text-etyme-muted" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide columns' : 'Choose columns'}
        </button>
      </div>
      <p className="text-[11px] text-etyme-faint">One row for each invoice line, in your own cost centers. No bank details.</p>
      {chosen.length === 0 && <p className="text-[13px] text-etyme-attention">Choose at least one column to download.</p>}
      {open && (
        <div className="space-y-2">
          <ul className="space-y-1">
            {chosen.map((id) => (
              <li key={id} className="flex items-center gap-2 text-[13px] text-etyme-ink">
                <span className="w-48">{label(id)}</span>
                <button type="button" className="underline" onClick={() => move(id, -1)}>Move up</button>
                <button type="button" className="underline" onClick={() => move(id, 1)}>Move down</button>
                <button type="button" className="underline" onClick={() => toggle(id)}>Remove</button>
              </li>
            ))}
          </ul>
          {chosen.length < RECEIPT_COLUMNS.length && (
            <p className="text-[13px] text-etyme-ink">
              Add:{' '}
              {RECEIPT_COLUMNS.filter((c) => !chosen.includes(c.id)).map((c) => (
                <button key={c.id} type="button" className="mr-2 underline" onClick={() => toggle(c.id)}>{c.label}</button>
              ))}
            </p>
          )}
        </div>
      )}
      {said && <p className="text-[13px] text-etyme-ink">{said}</p>}
      {failed && <p className="text-[13px] text-etyme-attention">{failed}</p>}
    </div>
  )
}

/**
 * What a confirmation did, in the route's own sentences: how many were
 * marked paid, how many suppliers were told, any supplier with nobody on
 * Etyme to tell, and every row refused. Drawn on the run's row, so it
 * stays there after the run turns paid, until the page is left.
 */
export function RunConfirmSummary({ summary }: { summary: ConfirmSummary }) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] text-etyme-ink">{summary.says}</p>
      {summary.told && <p className="text-[13px] text-etyme-ink">{summary.told}</p>}
      {summary.refused.length > 0 && (
        <ul className="space-y-1">
          {summary.refused.map((x) => (
            <li key={`${x.line}-${x.reference}`} className="text-[13px] text-etyme-attention">{x.says}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The confirmation, back from the payer's own system: the file it wrote,
 * or one reference and the day the money left, for the whole run. What it
 * did is handed to `onDone`, which keeps it on the run's row; with no
 * `onDone` the form says it itself.
 */
export function ConfirmRunPaid({ runId, onDone }: { runId: string; onDone?: (summary: ConfirmSummary) => void }) {
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ConfirmSummary | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function pick(file: File | null) {
    setCsv(file ? await file.text() : null)
    setFileName(file?.name ?? null)
  }

  async function send() {
    setBusy(true)
    setFailed(null)
    setSummary(null)
    try {
      const r = await fetch('/api/ap/payment-runs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmBody({ runId, csv, reference, paidOn })),
      })
      const b = await readJson(r)
      const said = confirmSummary(b.data)
      if (onDone) onDone(said)
      else setSummary(said)
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
      {summary && <RunConfirmSummary summary={summary} />}
      {failed && <p className="text-[13px] text-etyme-attention">{failed}</p>}
    </div>
  )
}

/**
 * "Mark it paid": the payer's reference and the day the money left, the
 * same two things a typed confirmation carries, for the whole run. The
 * route pays every line through the one write and tells each supplier
 * once; a press without either field is refused in the route's own
 * sentence, beside the fields.
 */
export function MarkRunPaid({ runId, disabled, onDone }: { runId: string; disabled?: boolean; onDone?: (summary: ConfirmSummary) => void }) {
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ConfirmSummary | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setFailed(null)
    setSummary(null)
    try {
      const r = await fetch('/api/ap/payment-runs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markPaidBody({ runId, reference, paidOn })),
      })
      const b = await readJson(r)
      const said = confirmSummary(b.data)
      if (onDone) onDone(said)
      else setSummary(said)
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 w-full space-y-2 border-t border-etyme-rule pt-3">
      <p className="stat-label">Paid already? Mark it paid</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[13px] text-etyme-ink">
          Your payment reference
          <input
            type="text"
            name="markReference"
            className="mt-1 block rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="text-[13px] text-etyme-ink">
          Paid on
          <input
            type="date"
            name="markPaidOn"
            className="mt-1 block rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </label>
        <button type="button" className="btn-primary" disabled={busy || disabled} onClick={send}>
          {busy ? 'Working…' : 'Mark it paid'}
        </button>
      </div>
      {summary && <RunConfirmSummary summary={summary} />}
      {failed && <p className="text-[13px] text-etyme-attention">{failed}</p>}
    </div>
  )
}
