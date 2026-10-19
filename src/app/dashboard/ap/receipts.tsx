'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { ListSurface, type Column } from '@/components/list-surface'
import { ErrorState, Field, FormMessage, Input, LoadingState, Lbl, Select, Textarea } from '@/components/ui'
import { amount } from '@/lib/money-display'
import { withBooks, type Books } from '@/lib/money/books-view'
import { PAYMENT_METHODS } from '@/lib/money/pay-method'
import { CHECK_NAME, type MatchCode } from '@/lib/three-way-match'
import { formatDay } from '@/lib/format-date'
import type { ReceiptRow } from '@/lib/money/receipts-read'
import type { ReaderRole } from '@/lib/money/receipt-screen'
import { ReceiptForm } from './receipt-form'

/**
 * Invoice receipts — what suppliers sent, typed in by the firm that pays
 * them, each checked against the order, the weeks this firm accepted and
 * every other receipt from the same supplier.
 *
 * Every door here is one a route already guards: record (with its lines),
 * waive a difference with a reason, cancel with a reason, pay. The screen
 * draws a button only where the route would let this reader through, and
 * where it would not, says the route's own sentence instead.
 */

const STATUS: Record<string, { word: string; chip: string }> = {
  RECEIVED: { word: 'Received', chip: 'chip--passive' },
  DISPUTED: { word: 'On hold', chip: 'chip--attention' },
  // Approved to pay, and so able to go into a run; part paid once a
  // payment was recorded against it (the status stays APPROVED).
  APPROVED: { word: 'Approved to pay', chip: 'chip--action' },
  PAID: { word: 'Paid', chip: 'chip--verified' },
  CANCELLED: { word: 'Cancelled', chip: 'chip--passive' },
}

function statusOf(r: { status: string; paidMinor: number }) {
  if (r.status === 'APPROVED' && r.paidMinor > 0) return { word: 'Part paid', chip: 'chip--action' }
  return STATUS[r.status] ?? { word: r.status.toLowerCase(), chip: 'chip--passive' }
}

const short = (iso: string | null) => (iso ? formatDay(new Date(iso)) : '—')

export function Receipts({ books, focus }: { books: Books; focus?: string | null }) {
  const [data, setData] = useState<{ role: ReaderRole; receipts: ReceiptRow[] } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(focus ?? null)
  const [recording, setRecording] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(null)
    try {
      const r = await fetch(withBooks('/api/ap/receipts', books))
      setData((await readJson(r)).data)
    } catch (e: any) {
      setFailed(e.message)
    }
  }, [books])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (focus) setSelected(focus) }, [focus])

  if (failed) return <ErrorState says={failed} />
  if (!data) return <LoadingState says="Checking every invoice receipt again…" />

  const { role, receipts } = data
  const chosen = receipts.find((r) => r.id === selected) ?? null

  const columns: Column<ReceiptRow>[] = [
    {
      key: 'number',
      label: 'Invoice receipt #',
      render: (r) => <span className="font-mono text-[12px] text-etyme-action">{r.number}</span>,
      sortValue: (r) => r.number,
    },
    { key: 'supplier', label: 'Supplier', render: (r) => r.supplier, sortValue: (r) => r.supplier },
    {
      key: 'status',
      label: 'Status',
      render: (r) => {
        const s = statusOf(r)
        return <span className={`chip ${s.chip}`}>{s.word}</span>
      },
      sortValue: (r) => r.status,
    },
    {
      key: 'totalMinor',
      label: 'Amount',
      align: 'right',
      render: (r) => <span className="tabular-nums">{amount(r.totalMinor, r.currency)}</span>,
      sortValue: (r) => r.totalMinor,
    },
    {
      key: 'dueAt',
      label: 'Due',
      align: 'right',
      hideOnMobile: true,
      render: (r) => <span className="tabular-nums text-[12px]">{short(r.dueAt)}</span>,
      sortValue: (r) => (r.dueAt ? new Date(r.dueAt).getTime() : 0),
    },
  ]

  return (
    <section className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-[13px] text-etyme-muted">
          What your suppliers sent, typed in here. Each is checked against the order, the hours you accepted
          and every other invoice receipt from the same supplier, again every time it is opened.
        </p>
        {role.mayRecord
          ? !recording && (
              <button type="button" className="btn-primary" onClick={() => { setRecording(true); setSaid(null) }}>
                Record an invoice receipt
              </button>
            )
          : <p className="max-w-[48ch] text-[12px] text-etyme-muted">{role.recordSays}</p>}
      </div>

      {said && (
        <div className="panel" style={{ borderColor: 'var(--color-verified)' }}>
          <p className="text-[13px] text-etyme-ink">{said}</p>
        </div>
      )}

      {recording && (
        <ReceiptForm
          books={books}
          onClose={() => setRecording(false)}
          onSaved={async (note, id) => {
            setRecording(false)
            setSaid(note)
            setSelected(id)
            await load()
          }}
        />
      )}

      {chosen && (
        <ReceiptPanel
          key={chosen.id}
          receipt={chosen}
          books={books}
          onClose={() => setSelected(null)}
          onMoved={async (note) => { setSaid(note); await load() }}
        />
      )}

      <ListSurface<ReceiptRow>
        columns={columns}
        data={receipts}
        rowKey={(r) => r.id}
        onRowClick={(r) => { setSelected(r.id); setSaid(null) }}
        searchFilter={(r, q) => r.number.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q)}
        searchPlaceholder="Search by invoice receipt number or supplier…"
        emptyMessage="No invoice receipt has been typed in here yet."
        exportName="invoice-receipts"
        defaultPageSize={20}
      />
    </section>
  )
}

// ── One invoice receipt ──────────────────────────────────────────────

function ReceiptPanel({ receipt: r, books, onClose, onMoved }: {
  receipt: ReceiptRow
  books: Books
  onClose: () => void
  onMoved: (note: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waiving, setWaiving] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [paying, setPaying] = useState(false)
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const status = statusOf(r)
  const owing = r.totalMinor - r.paidMinor

  async function act(url: string, init: RequestInit, done: (b: any) => string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(withBooks(url, books), { headers: { 'Content-Type': 'application/json' }, ...init })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setError(b.error?.message ?? `Refused (${res.status}).`); return }
      setWaiving(null); setWhy(''); setCancelling(false); setPaying(false)
      await onMoved(done(b))
    } finally {
      setBusy(false)
    }
  }

  const waive = (code: string) =>
    act(`/api/ap/bills/${r.id}/match/override`, { method: 'POST', body: JSON.stringify({ code, reason: why }) }, (b) => b.data.message)
  const cancel = () =>
    act(`/api/ap/bills/${r.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: why }) }, (b) => b.data.note)
  const pay = () =>
    act('/api/ap/bills', {
      method: 'PATCH',
      body: JSON.stringify({
        id: r.id,
        paidAt: new Date(`${paidOn}T12:00:00Z`).toISOString(),
        method: method || null,
        reference: reference.trim() || null,
      }),
    }, (b) => b.data.note)

  return (
    <article className="panel space-y-4" aria-label={`Invoice receipt ${r.number}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-etyme-ink">{r.supplier} · invoice {r.number}</p>
          <p className="mt-1 text-[12px] text-etyme-muted tabular-nums">
            Received {short(r.receivedAt)} · due {short(r.dueAt)}
            {r.periodStart && r.periodEnd ? ` · covers ${short(r.periodStart)} to ${short(r.periodEnd)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${status.chip}`}>{status.word}</span>
          <span className="chip chip--passive tabular-nums">{amount(r.totalMinor, r.currency)}</span>
          <button type="button" className="text-[12px] text-etyme-muted underline" onClick={onClose}>Close</button>
        </div>
      </div>

      {r.lines.length > 0 ? (
        <div>
          <Lbl>Its lines</Lbl>
          <ul className="mt-2 space-y-1">
            {r.lines.map((l, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-3 text-[13px]">
                <span className="text-etyme-ink">{l.says}</span>
                <span className="tabular-nums text-etyme-muted">
                  {l.hours != null && l.rateMinor != null ? `${l.hours} h × ${amount(l.rateMinor, r.currency)} = ` : ''}
                  {amount(l.amountMinor, r.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12px] text-etyme-muted">Typed in as a total, so it is checked on its amount: the hours accepted in its period at the agreed rate, exactly.</p>
      )}

      {r.cancelled && <p className="text-[13px] text-etyme-muted">{r.cancelled}</p>}

      {(r.notAccepted || r.hard) && (
        <p className="text-[13px] text-etyme-attention">{r.notAccepted ?? r.hard}</p>
      )}

      {r.checks.length > 0 && (
        <div>
          <Lbl>The three-way check, as it stands now</Lbl>
          <ul className="mt-2 space-y-2">
            {r.checks.map((c) => {
              const failing = r.doors.failing.find((f) => f.code === c.code)
              return (
                <li key={c.code} className="text-[13px]">
                  <span className={`chip ${c.outcome === 'FAIL' ? 'chip--attention' : c.outcome === 'OVERRIDDEN' ? 'chip--action' : 'chip--verified'}`}>
                    {c.outcome === 'FAIL' ? 'fails' : c.outcome === 'OVERRIDDEN' ? 'waived' : 'passes'}
                  </span>{' '}
                  <span className="text-etyme-ink">{c.name ?? CHECK_NAME[c.code as MatchCode] ?? c.code}</span>
                  <span className="text-etyme-muted"> — {c.reason}</span>
                  {failing && (
                    <div className="mt-1 pl-1">
                      {failing.waive.offered ? (
                        waiving === c.code ? (
                          <div className="space-y-2">
                            <Field label="Why this difference should be paid" help="It stays with the invoice receipt for good.">
                              <Textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
                            </Field>
                            <div className="flex flex-wrap gap-3">
                              <button type="button" className="btn-primary" disabled={busy || why.trim().length < 5} onClick={() => waive(c.code)}>
                                Waive with this reason
                              </button>
                              <button type="button" className="text-[13px] text-etyme-muted underline" onClick={() => setWaiving(null)}>Not now</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" className="text-[13px] text-etyme-action underline" onClick={() => { setWaiving(c.code); setWhy(''); setCancelling(false) }}>
                            Waive with a reason
                          </button>
                        )
                      ) : (
                        failing.waive.says && <p className="text-[12px] text-etyme-muted">{failing.waive.says}</p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(r.doors.waivers.length > 0 || r.doors.voidedWaiver) && (
        <div>
          <Lbl>Differences waived</Lbl>
          <ul className="mt-2 space-y-1">
            {r.doors.waivers.map((w) => (
              <li key={w.code} className={`text-[13px] ${w.live ? 'text-etyme-ink' : 'text-etyme-attention'}`}>
                <span className="font-medium">{w.name}.</span> {w.says}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.payments.length > 0 && (
        <div>
          <Lbl>Paid</Lbl>
          <ul className="mt-2 space-y-1">
            {r.payments.map((p, i) => <li key={i} className="text-[13px] text-etyme-ink">{p}</li>)}
          </ul>
        </div>
      )}

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="space-y-3 border-t border-etyme-rule pt-3">
        {r.doors.pay.offered ? (
          paying ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Paid on">
                  <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                </Field>
                <Field label="How it was paid">
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="">Choose how it was paid</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
                <Field label="Reference">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="The bank’s reference" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-primary" disabled={busy || !method} onClick={pay}>
                  Pay {amount(owing, r.currency)} to {r.supplier}
                </button>
                <button type="button" className="text-[13px] text-etyme-muted underline" onClick={() => setPaying(false)}>Not now</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={() => { setPaying(true); setCancelling(false); setWaiving(null) }}>
              Pay
            </button>
          )
        ) : (
          r.doors.pay.says && <p className="text-[13px] text-etyme-muted"><span className="font-medium text-etyme-ink">Not payable now.</span> {r.doors.pay.says}</p>
        )}

        {r.doors.cancel.offered ? (
          cancelling ? (
            <div className="space-y-2">
              <Field label="Why it is cancelled" help="Keyed twice, the wrong order, withdrawn by the supplier. It stays on the record with the reason.">
                <Textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-secondary" disabled={busy || why.trim().length < 5} onClick={cancel}>
                  Cancel this invoice receipt
                </button>
                <button type="button" className="text-[13px] text-etyme-muted underline" onClick={() => setCancelling(false)}>Not now</button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-[13px] text-etyme-muted underline" onClick={() => { setCancelling(true); setWhy(''); setWaiving(null); setPaying(false) }}>
              Cancel with a reason
            </button>
          )
        ) : (
          r.doors.cancel.says && <p className="text-[12px] text-etyme-muted">{r.doors.cancel.says}</p>
        )}
      </div>
    </article>
  )
}
