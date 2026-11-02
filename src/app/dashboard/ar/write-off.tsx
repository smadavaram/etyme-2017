'use client'

import { useState } from 'react'
import { afterSend, type SaidState } from '../invoices/said-field'

/**
 * Writing a customer's overdue bills off, asked on the page.
 *
 * It was two browser prompts: the first asked the person to type a code
 * from a list read out in the prompt ("One of: CUSTOMER_INSOLVENT, …"),
 * the second for a sentence, and a refusal was said far from either. The
 * reason is now picked from the route's own list, in its words; the
 * sentence is typed beside it; a refusal is said under both and keeps
 * what was chosen and typed (the screen walk, 2026-11-02).
 */

/** What the form posts beside the step: the reason's code, the sentence, the amount. */
export function writeOffBody(t: { reason: string; note: string; amountCents: number }): Record<string, unknown> {
  return { reason: t.reason, note: t.note.trim() || null, amountCents: t.amountCents }
}

export function WriteOffForm({
  customerName,
  reasons,
  onSend,
  onCancel,
}: {
  customerName: string
  /** The route's own list (`writeOffReasons`): the code it reads and the words a person reads. */
  reasons: readonly { code: string; label: string }[]
  /** Null on success, else the route's own sentence. */
  onSend: (reason: string, note: string) => Promise<string | null>
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const [state, setState] = useState<SaidState>({ text: '', refused: null, open: true })
  const [busy, setBusy] = useState(false)
  // The reason is what the route requires; the sentence it asks for only
  // where the reason needs one ("Costs more to chase than it is worth"),
  // and then it says so under the field.
  const ready = reason !== ''
  return (
    <form
      className="mt-3 max-w-[520px] space-y-1.5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ready || busy) return
        setBusy(true)
        try {
          const refusal = await onSend(reason, state.text)
          setState((s) => afterSend(s, refusal))
          if (!refusal) onCancel()
        } finally {
          setBusy(false)
        }
      }}
    >
      <label className="block text-[12px] font-semibold text-etyme-muted" htmlFor={`write-off-reason-${customerName}`}>
        Why {customerName}’s overdue bills are written off
      </label>
      <select
        id={`write-off-reason-${customerName}`}
        className="input w-full text-[13px]"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      >
        <option value="">Pick the reason</option>
        {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
      </select>
      <label className="block text-[12px] font-semibold text-etyme-muted" htmlFor={`write-off-note-${customerName}`}>
        A sentence somebody can read in six months
      </label>
      <textarea
        id={`write-off-note-${customerName}`}
        className="input w-full text-[13px]"
        rows={2}
        value={state.text}
        onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
        placeholder="Their administrator confirmed nothing will be paid to unsecured creditors."
      />
      {state.refused && <p className="text-[12px] leading-snug text-etyme-danger" role="alert">{state.refused}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1 text-[12px]">Cancel</button>
        <button type="submit" disabled={!ready || busy} className="btn-primary px-3 py-1 text-[12px] disabled:opacity-50">
          {busy ? 'Saving…' : 'Write it off'}
        </button>
      </div>
    </form>
  )
}
