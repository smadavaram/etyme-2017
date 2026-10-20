'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { EXPENSE_KINDS, NOTE_LONGEST, expenseBody } from './own-expense'

/**
 * Their own expense, filed by them, beside their week.
 *
 * Money opened `POST /api/expenses` to a worker filing their own on their
 * own placement (2026-10-20), and this page had no form for it, so the
 * door was there and nobody could reach it. The worker holding the
 * receipt is the one who files it; it lands waiting on their employer's
 * approval, and each firm above accepts it before it pays it.
 *
 * It is filed on the placement their hours go on — their employer's line
 * (`filing` from `/api/me/work`) — because an expense on a rung above
 * never reaches the employer who approves it. The route checks that
 * again, and whatever it refuses is shown in its own words.
 */
export interface ExpenseOn {
  contractId: string
  site: string
  payer: string
}

/** Today on the reader's own device, YYYY-MM-DD: a day spent is a local day. */
function localToday(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function YourExpense({ on, currency }: { on: ExpenseOn[]; currency?: string | null }) {
  const [contractId, setContractId] = useState(on[0]?.contractId ?? '')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  if (on.length === 0) return null
  const current = on.find((o) => o.contractId === contractId) ?? on[0]
  const today = localToday()

  async function send() {
    setError(null); setFlash(null)
    const verdict = expenseBody({ contractId: current.contractId, date, kind, amount, note, receiptUrl, today })
    if (!verdict.ok) { setError(verdict.says); return }
    setBusy(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verdict.body),
      })
      // The route's own sentence, refusal or not: "Filed. Techpeple
      // approves it before it is paid back to you."
      const j = await readJson(res)
      setFlash(j.data?.message ?? 'Filed.')
      setDate(''); setKind(''); setAmount(''); setNote(''); setReceiptUrl('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full px-2 py-1.5 text-sm border border-etyme-rule rounded bg-white text-etyme-ink'

  return (
    <section className="mb-8" aria-labelledby="file-an-expense">
      <h2 id="file-an-expense" className="font-serif text-lg text-etyme-ink mb-1">File an expense</h2>
      <p className="text-xs text-etyme-muted mb-3">
        Only you can file your expenses. {current.payer} approves it before it is paid back to you.
      </p>
      <div className="bg-etyme-surface border border-etyme-rule rounded-lg p-4 space-y-4">
        {on.length > 1 && (
          <label className="block text-xs text-etyme-muted">
            <span className="block mb-1">Placement</span>
            <select value={current.contractId} onChange={(e) => setContractId(e.target.value)} className={field}>
              {on.map((o) => (
                <option key={o.contractId} value={o.contractId}>{o.site} · through {o.payer}</option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block text-xs text-etyme-muted">
            <span className="block mb-1">Day you spent it</span>
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={`${field} tabular-nums`} />
          </label>
          <label className="block text-xs text-etyme-muted">
            <span className="block mb-1">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
              <option value="">Choose…</option>
              {EXPENSE_KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-etyme-muted">
            <span className="block mb-1">Amount{currency ? ` (${currency})` : ''}</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${field} tabular-nums`}
              placeholder="0.00"
            />
          </label>
        </div>

        <label className="block text-xs text-etyme-muted">
          <span className="block mb-1">What it was for</span>
          <input
            type="text"
            maxLength={NOTE_LONGEST}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={field}
            placeholder="Flight to the client site"
          />
        </label>

        <label className="block text-xs text-etyme-muted">
          <span className="block mb-1">Link to the receipt, if you have one</span>
          <input
            type="url"
            inputMode="url"
            value={receiptUrl}
            onChange={(e) => setReceiptUrl(e.target.value)}
            className={field}
            placeholder="https://"
          />
        </label>

        <div className="flex justify-end">
          <button
            onClick={send}
            disabled={busy}
            className="w-full sm:w-auto px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            Send for approval
          </button>
        </div>
        {error && <p className="text-sm text-etyme-attention">{error}</p>}
        {flash && <p className="text-sm text-etyme-verified">{flash}</p>}
      </div>
    </section>
  )
}
