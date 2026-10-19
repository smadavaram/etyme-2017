'use client'

import { useState } from 'react'

/**
 * Where an expense stands, on its row, and the two things the firm whose
 * turn it is may do: accept it, or send it back with a reason.
 *
 * The line is the route's (`rowFor` in lib/money/expense-acceptance) —
 * "Approved by Techpeple · accepted by Northbend Athletic $412.50 ·
 * waiting on you" — and names nobody below the reader's own supplier.
 * Both buttons go through the one route that records a firm's decision,
 * `POST /api/expenses/:id/accept`, the same one the decisions queue uses,
 * and the page says the route's own sentence back.
 *
 * Not an action column: it is the row's reading, so the card on a phone
 * carries it too, buttons and all.
 */

export interface StandsView {
  state: 'OWN' | 'YOURS' | 'WAITING' | 'ACCEPTED' | 'SENT_BACK' | 'NOT_BILLABLE'
  line: string | null
  upToCents: number | null
  notBillableSays: string | null
}

const TONE: Record<StandsView['state'], string> = {
  OWN: 'chip--passive',
  YOURS: 'chip--attention',
  WAITING: 'chip--passive',
  ACCEPTED: 'chip--verified',
  SENT_BACK: 'chip--danger',
  NOT_BILLABLE: 'chip--passive',
}

const WORD: Record<StandsView['state'], string> = {
  OWN: '',
  YOURS: 'Waiting on you',
  WAITING: 'Waiting',
  ACCEPTED: 'Accepted',
  SENT_BACK: 'Sent back',
  NOT_BILLABLE: 'Not billable',
}

export function WhereItStands({
  view,
  money,
  busy,
  onDecide,
}: {
  view: StandsView | null
  /** Cents to the row's own currency. */
  money: (cents: number) => string
  busy: boolean
  onDecide: (d: { decision: 'accept' } | { decision: 'send_back'; reason: string }) => Promise<boolean>
}) {
  const [sending, setSending] = useState(false)
  const [reason, setReason] = useState('')
  if (!view) return <span className="text-etyme-faint">—</span>
  const canDecide = view.upToCents != null

  return (
    <div className="min-w-0 max-w-[340px] space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {WORD[view.state] && <span className={`chip ${TONE[view.state]}`}>{WORD[view.state]}</span>}
      {view.line && <p className="text-[12px] leading-snug text-etyme-muted">{view.line}</p>}
      {view.notBillableSays && <p className="text-[12px] leading-snug text-etyme-faint">{view.notBillableSays}</p>}
      {canDecide && !sending && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide({ decision: 'accept' })}
            className="btn-primary px-3 py-1 text-[12px] disabled:opacity-50"
          >
            {busy ? 'Saving…' : `Accept ${money(view.upToCents!)}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSending(true)}
            className="btn-secondary px-3 py-1 text-[12px] disabled:opacity-50"
          >
            Send back
          </button>
        </div>
      )}
      {canDecide && sending && (
        <form
          className="space-y-1.5 pt-0.5"
          onSubmit={async (e) => {
            e.preventDefault()
            const done = await onDecide({ decision: 'send_back', reason: reason.trim() })
            if (done) { setSending(false); setReason('') }
          }}
        >
          <label className="block text-[11px] font-semibold text-etyme-muted" htmlFor="send-back-reason">
            Why it goes back
          </label>
          <input
            id="send-back-reason"
            className="input w-full text-[12px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The fare is above the travel policy."
            minLength={5}
            required
            autoFocus
          />
          {/* The route refuses a reason under five characters; the page says so first. */}
          {reason.trim().length < 5 && (
            <p className="text-[11px] text-etyme-faint">Say why in a few words, at least five characters. Somebody has already spent this money.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || reason.trim().length < 5} className="btn-primary px-3 py-1 text-[12px] disabled:opacity-50">
              {busy ? 'Saving…' : 'Send back'}
            </button>
            <button type="button" onClick={() => { setSending(false); setReason('') }} className="btn-secondary px-3 py-1 text-[12px]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
