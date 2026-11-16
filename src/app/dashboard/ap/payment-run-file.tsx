'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { confirmBody, confirmSummary, markPaidBody, type ConfirmSummary } from '@/lib/money/run-confirm'
import { RECEIPT_COLUMNS, DEFAULT_RECEIPT_COLUMNS } from '@/lib/money/receipt-file'
import { ANSWER_FIELD_LABELS, type AnswerField } from '@/lib/money/feed-answer'

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

/** Told to every part of the page that shows a line's state, after a file leaves or an answer comes in. */
const LINES_CHANGED = 'etyme-lines-changed'

/**
 * The invoice lines of an approved run, one row per line in the client's
 * own cost centers, for the client's own system (Layer 9, slice 1). The
 * client picks and orders the columns; the choice is sent with the
 * request, and may be saved once for every file. The route's own
 * sentence says what was left out and why before the file is saved.
 */
export function DownloadReceiptLines({ runId, disabled, onOpenReceipts }: { runId: string; disabled?: boolean; onOpenReceipts?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string[]>([...DEFAULT_RECEIPT_COLUMNS])
  const [said, setSaid] = useState<string | null>(null)
  const [sentBefore, setSentBefore] = useState<{ lineId: string; says: string }[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  const [savedSays, setSavedSays] = useState<string | null>(null)
  const label = (id: string) => RECEIPT_COLUMNS.find((c) => c.id === id)?.label ?? id

  // The company's own saved choice, where it saved one.
  useEffect(() => {
    let live = true
    fetch('/api/ap/receipts-file/columns')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live && b?.data?.saved && Array.isArray(b.data.columns)) setChosen(b.data.columns) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  async function saveColumns() {
    setFailed(null)
    setSavedSays(null)
    try {
      const r = await fetch('/api/ap/receipts-file/columns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: chosen }),
      })
      const b = await readJson(r)
      void b
      setSavedSays('Saved. These columns are used for your next file.')
    } catch (e: any) {
      setFailed(e.message)
    }
  }

  function toggle(id: string) {
    setSavedSays(null)
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
      const d = b.data as { csv: string; filename: string; says: string; rows: number; alreadySent?: { lineId: string; says: string }[] }
      setSaid(d.says)
      setSentBefore(d.alreadySent ?? [])
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
      window.dispatchEvent(new Event(LINES_CHANGED))
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
        {open && chosen.length > 0 && (
          <button type="button" className="text-[13px] underline text-etyme-muted" onClick={saveColumns}>
            Save these columns for every file
          </button>
        )}
        {savedSays && <span role="status" className="text-[13px] text-etyme-ink">{savedSays}</span>}
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
      {sentBefore.length > 0 && (
        <ul className="space-y-1">
          {sentBefore.map((l) => (
            <li key={l.lineId} className="text-[13px] text-etyme-muted">{l.says}</li>
          ))}
        </ul>
      )}
      {said && said.includes('no lines') && (
        <p className="text-[13px] text-etyme-ink">
          Lines cannot be added to an invoice receipt recorded as a total. Ask the supplier to send the bill from Etyme with its lines, or code that invoice in your own system.
          {onOpenReceipts && (
            <>
              {' '}
              <button type="button" className="underline" style={{ color: 'var(--color-action)' }} onClick={onOpenReceipts}>
                Open Invoice receipts
              </button>
            </>
          )}
        </p>
      )}
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

interface LineState { billId: string; number: string; vendorName: string; lineId: string; person: string | null; says: string; state: string; canSendAgain: boolean }

/**
 * What each line of an approved run says, in the client's own words:
 * Sent, Accepted by your system, Rejected with the reason, Paid with the
 * day and reference, or why it is not sent yet. "Send again" is drawn only
 * on a line your system rejected that has been fixed since, which is where
 * the route will send it (Layer 9, slice 2).
 */
export function ReceiptLineStates({ runId }: { runId: string }) {
  const [lines, setLines] = useState<LineState[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const r = await fetch(`/api/ap/receipts-file?run=${encodeURIComponent(runId)}&state=1`)
      const b = await readJson(r)
      setLines((b.data as { lines: LineState[] }).lines)
    } catch (e: any) {
      setFailed(e.message)
    }
  }
  useEffect(() => {
    void load()
    const again = () => void load()
    window.addEventListener(LINES_CHANGED, again)
    return () => window.removeEventListener(LINES_CHANGED, again)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  async function sendAgain(lineId: string | null) {
    setBusy(true)
    setFailed(null)
    try {
      const r = await fetch(`/api/ap/receipts-file?run=${encodeURIComponent(runId)}&again=1${lineId ? `&line=${encodeURIComponent(lineId)}` : ''}`)
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
      window.dispatchEvent(new Event(LINES_CHANGED))
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!lines) return failed ? <p className="text-[13px] text-etyme-attention">{failed}</p> : null
  if (lines.length === 0) return null
  const any = lines.some((l) => l.canSendAgain)
  return (
    <div className="w-full space-y-1">
      <p className="stat-label">Where each invoice line stands</p>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.lineId} className="flex flex-wrap items-baseline gap-x-3 text-[13px] text-etyme-ink">
            <span>{l.vendorName}, invoice {l.number}{l.person ? `, ${l.person}` : ''}</span>
            <span className={l.state === 'REJECTED' || l.state === 'FAILED' ? 'text-etyme-attention' : ''}>{l.says}</span>
            {l.canSendAgain && (
              <button type="button" className="underline" style={{ color: 'var(--color-action)' }} disabled={busy} onClick={() => sendAgain(l.lineId)}>
                Send again
              </button>
            )}
          </li>
        ))}
      </ul>
      {any && (
        <button type="button" className="text-[13px] underline" style={{ color: 'var(--color-action)' }} disabled={busy} onClick={() => sendAgain(null)}>
          Send again every fixed line
        </button>
      )}
      {said && <p className="text-[13px] text-etyme-ink">{said}</p>}
      {failed && <p className="text-[13px] text-etyme-attention">{failed}</p>}
    </div>
  )
}

/**
 * The answer back from your own system about the lines it was sent: paste
 * or upload it, choose which column holds each thing if your file names
 * them differently, or type one line for a small system (the invoice, the
 * day it was paid, your reference). Paid goes through the same
 * confirmation as "Mark it paid"; nothing is paid twice.
 */
export function AnswerFromYourSystem({ runId, onDone }: { runId: string; onDone?: () => void }) {
  const [csv, setCsv] = useState('')
  const [open, setOpen] = useState(false)
  const [map, setMap] = useState<Partial<Record<AnswerField, string>>>({})
  const [receipt, setReceipt] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refused, setRefused] = useState<{ says: string }[]>([])
  const [failed, setFailed] = useState<string | null>(null)

  async function pick(file: File | null) {
    if (file) setCsv(await file.text())
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true)
    setFailed(null)
    setSaid(null)
    setRefused([])
    try {
      const r = await fetch('/api/ap/receipts-file/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, ...body }),
      })
      const b = await readJson(r)
      const d = b.data as { says: string; refused: { says: string }[] }
      setSaid(d.says)
      setRefused(d.refused)
      window.dispatchEvent(new Event(LINES_CHANGED))
      onDone?.()
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  const chosenMap = Object.fromEntries(Object.entries(map).filter(([, v]) => v && v.trim()))
  return (
    <div className="mt-3 w-full space-y-2 border-t border-etyme-rule pt-3">
      <p className="stat-label">Your system answered? Bring back its answer for each line</p>
      <label className="block text-[13px] text-etyme-ink">
        The answer file (CSV with etyme_row_id or etyme_line_id, status, reason, reference, paid_on)
        <input type="file" name="answerCsv" accept=".csv,text/csv" className="mt-1 block text-[13px]" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
      </label>
      <label className="block text-[13px] text-etyme-ink">
        Or paste it here
        <textarea
          name="answerText"
          rows={3}
          className="mt-1 block w-full rounded border border-etyme-rule bg-etyme-surface px-2 py-1 font-mono text-[12px]"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy || !csv.trim()} onClick={() => send({ csv, map: chosenMap })}>
          {busy ? 'Working…' : 'Record the answer'}
        </button>
        <button type="button" className="text-[13px] underline text-etyme-muted" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide column choices' : 'My columns are named differently'}
        </button>
      </div>
      {!csv.trim() && <p className="text-[11px] text-etyme-faint">Paste or upload the answer to record it.</p>}
      {open && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ANSWER_FIELD_LABELS) as AnswerField[]).map((f) => (
            <label key={f} className="text-[13px] text-etyme-ink">
              {ANSWER_FIELD_LABELS[f]}: the header in your file
              <input
                type="text"
                className="mt-1 block w-full rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]"
                value={map[f] ?? ''}
                onChange={(e) => setMap((m) => ({ ...m, [f]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}
      <p className="text-[11px] text-etyme-faint">Or one line for a small system: the invoice, the day it was paid and your reference.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[13px] text-etyme-ink">
          Supplier’s invoice number
          <input type="text" name="answerReceipt" className="mt-1 block rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]" value={receipt} onChange={(e) => setReceipt(e.target.value)} />
        </label>
        <label className="text-[13px] text-etyme-ink">
          Paid on
          <input type="date" name="answerPaidOn" className="mt-1 block rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
        <label className="text-[13px] text-etyme-ink">
          Your reference
          <input type="text" name="answerReference" className="mt-1 block rounded border border-etyme-rule bg-etyme-surface px-2 py-1 text-[13px]" value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <button type="button" className="text-[13px] underline" style={{ color: 'var(--color-action)' }} disabled={busy || !receipt.trim()} onClick={() => send({ receipt, paidOn, reference })}>
          Mark this invoice paid
        </button>
      </div>
      {said && <p className="text-[13px] text-etyme-ink">{said}</p>}
      {refused.length > 0 && (
        <ul className="space-y-1">
          {refused.map((x, i) => (
            <li key={i} className="text-[13px] text-etyme-attention">{x.says}</li>
          ))}
        </ul>
      )}
      {failed && <p className="text-[13px] text-etyme-attention">{failed}</p>}
    </div>
  )
}
