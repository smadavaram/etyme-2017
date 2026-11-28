'use client'

import { useState } from 'react'
import { draftRefusal, earliestNewEnd, extendBody, askedBy, type ExtendField } from './extend-ask'

/**
 * Extend, from the client dashboard's Ending soon: the new last day the
 * person picks and why, and the extend route's own refusal said under
 * the box — which, where it asks a question, the same box answers on the
 * next press (`./extend-ask`).
 */
export function ExtendForm({ contractId, personName, currentEnd, onDone, onCancel }: {
  contractId: string
  personName: string
  /** The current last day, ISO, where there is one. */
  currentEnd: string | null
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const [today] = useState(() => new Date())
  const [newEndDate, setNewEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [asked, setAsked] = useState<ExtendField[]>([])
  const [says, setSays] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const draft = { newEndDate, reason, asked }
    const wrong = draftRefusal(draft, currentEnd, today)
    if (wrong) { setSays(wrong); return }
    setBusy(true); setSays(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/extend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extendBody(draft)),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        // The route's own sentence, whole. Where it asks a question the
        // reason can answer, the next press sends the reason as that answer.
        const field = askedBy(body?.error)
        if (field && !asked.includes(field)) setAsked([...asked, field])
        setSays(body?.error?.message ?? 'The extension could not be made. Try again.')
        return
      }
      onDone(body?.data?.message ?? `${personName}'s contract is extended.`)
    } catch {
      setSays('The extension could not be sent. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full space-y-2 pt-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-etyme-muted">
          New last day
          <input
            type="date"
            required
            min={earliestNewEnd(currentEnd, today)}
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            aria-label={`New last day for ${personName}`}
            className="rounded border border-etyme-rule px-2 py-1 text-[12px] text-etyme-ink"
          />
        </label>
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[12px] text-etyme-muted">
          Why it is extended
          <textarea
            required
            rows={2}
            minLength={10}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The project moved its go-live to March."
            aria-label={`Why ${personName}'s contract is extended`}
            className="resize-y rounded border border-etyme-rule px-2 py-1 text-[12px] text-etyme-ink"
          />
        </label>
      </div>
      {says && <p className="text-[12.5px] text-etyme-attention" role="alert">{says}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded bg-etyme-action px-3 py-1.5 text-xs text-white disabled:opacity-40">
          {asked.length > 0 ? 'Extend with this reason' : 'Extend'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-etyme-muted">Not now</button>
      </div>
    </form>
  )
}
