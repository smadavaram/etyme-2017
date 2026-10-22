'use client'

import { useState } from 'react'
import { formatDay } from '@/lib/format-date'

/**
 * Extend a placement to a day somebody picks.
 *
 * Screen walk, 2026-10-22 ("Papers at every stage, walked on screens"):
 * this button offered three months and nothing else, gave no box for the
 * reason the route asks for, and showed the route's refusal as a toast
 * that was gone before it was read. The route already checked the papers
 * that must last to the new end. Now the screen reaches it:
 *
 *   - any new last day, from a calendar;
 *   - a reason, kept with the extension (`note`);
 *   - where the route asks for a reason of its own — a paper ending
 *     before the new end, or the client's time limit warning — its
 *     sentence is shown here, with a box for the answer, and that answer
 *     is sent only after the sentence has been shown (`asked.reason`,
 *     `asked.limitReason`). One reason typed up front never silently
 *     answers a warning the person did not read;
 *   - where the route refuses — a paper that lets the person work at all
 *     ends first (PAPERS_BLOCK), the time limit (TIME_LIMIT), or the
 *     client's rules (GOVERNANCE_BLOCK) — its sentence stays in the
 *     dialog, so the person can pick an earlier day.
 */

/** "YYYY-MM-DD" for a stored day, read in UTC because a stored day is midnight UTC. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "Feb 17, 2027", through the one formatter. */
function plain(iso: string): string {
  return formatDay(iso.slice(0, 10))
}

/** Three months on from the current end, as the starting suggestion and nothing more. */
function suggested(endDate: string | null): string {
  const base = endDate ? new Date(`${endDate.slice(0, 10)}T00:00:00Z`) : new Date()
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth() + 3
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return isoDay(new Date(Date.UTC(y, m, Math.min(base.getUTCDate(), last))))
}

function dayAfter(endDate: string | null): string {
  const base = endDate ? new Date(`${endDate.slice(0, 10)}T00:00:00Z`) : new Date()
  return isoDay(new Date(base.getTime() + 86_400_000))
}

/** The two warnings the route asks a reason for, by the field it names. */
interface Asked {
  reason?: string
  limitReason?: string
}

export function ExtendDialog({
  contractId,
  personName,
  endDate,
  onClose,
  onDone,
}: {
  contractId: string
  personName: string
  endDate: string | null
  onClose: () => void
  /** Called with the route's own sentence once the extension stands. */
  onDone: (says: string) => void
}) {
  const [day, setDay] = useState(() => suggested(endDate))
  const [note, setNote] = useState('')
  const [asked, setAsked] = useState<Asked>({})
  const [answers, setAnswers] = useState<{ reason: string; limitReason: string }>({ reason: '', limitReason: '' })
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A warning was about the day it was asked for. A new day is a new
  // question, so what the route said about the old one is cleared.
  function pick(next: string) {
    setDay(next)
    setAsked({})
    setAnswers({ reason: '', limitReason: '' })
    setRefusal(null)
  }

  const unanswered =
    (asked.reason !== undefined && !answers.reason.trim()) ||
    (asked.limitReason !== undefined && !answers.limitReason.trim())

  async function submit() {
    setBusy(true)
    setRefusal(null)
    try {
      const res = await fetch(`/api/contracts/${contractId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newEndDate: day,
          ...(note.trim() ? { note: note.trim() } : {}),
          // Only once the route has said what the reason is for.
          ...(asked.reason !== undefined ? { reason: answers.reason.trim() } : {}),
          ...(asked.limitReason !== undefined ? { limitReason: answers.limitReason.trim() } : {}),
        }),
      })
      const body = await res.json().catch(() => ({}) as any)
      if (res.ok) {
        const d = body?.data ?? {}
        onDone([d.message ?? `Extended to ${plain(day)}.`, d.pastTheOrder].filter(Boolean).join(' '))
        return
      }
      const err = body?.error ?? {}
      const says: string = err.message ?? 'The placement was not extended.'
      if (err.code === 'PAPERS_NEED_A_REASON' || err.field === 'reason') {
        setAsked((a) => ({ ...a, reason: says }))
      } else if (err.code === 'TIME_LIMIT_REASON' || err.field === 'limitReason') {
        setAsked((a) => ({ ...a, limitReason: says }))
      } else {
        // PAPERS_BLOCK, TIME_LIMIT, GOVERNANCE_BLOCK, a day the route
        // would not take, or a seat that may not extend: the sentence,
        // kept where it can be read.
        setRefusal(says)
      }
    } catch {
      setRefusal('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const box = `w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
               focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action`

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-md mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">Extend {personName}’s placement</h3>
        <p className="text-[12px] text-etyme-muted mb-4 tabular-nums">
          {endDate ? `Now ends ${plain(endDate)}.` : 'No last day is set yet.'}
        </p>

        <label className="block mb-3">
          <span className="stat-label">New last day</span>
          <input
            type="date"
            className={`${box} mt-1 tabular-nums`}
            value={day}
            min={dayAfter(endDate)}
            onChange={(e) => pick(e.target.value)}
          />
        </label>

        <label className="block mb-3">
          <span className="stat-label">Why it is extended</span>
          <textarea
            className={`${box} mt-1`}
            rows={2}
            placeholder="In your own words. It is kept with the extension."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {asked.limitReason !== undefined && (
          <div className="px-4 py-3 rounded-lg bg-etyme-attention-wash border border-etyme-attention-line mb-3" role="alert">
            <p className="text-sm text-etyme-ink">{asked.limitReason}</p>
            <textarea
              className={`${box} mt-2`}
              rows={2}
              aria-label="Your reason to go past the time limit warning"
              placeholder="Your reason. Your name and this go on the record."
              value={answers.limitReason}
              onChange={(e) => setAnswers({ ...answers, limitReason: e.target.value })}
            />
          </div>
        )}

        {asked.reason !== undefined && (
          <div className="px-4 py-3 rounded-lg bg-etyme-attention-wash border border-etyme-attention-line mb-3" role="alert">
            <p className="text-sm text-etyme-ink">{asked.reason}</p>
            <textarea
              className={`${box} mt-2`}
              rows={2}
              aria-label="Your reason to go ahead with a paper ending first"
              placeholder="Your reason. Your name and this go on the record."
              value={answers.reason}
              onChange={(e) => setAnswers({ ...answers, reason: e.target.value })}
            />
          </div>
        )}

        {refusal && (
          <div className="px-4 py-3 rounded-lg bg-etyme-danger-wash border border-etyme-danger-line mb-3" role="alert">
            <p className="text-sm text-etyme-ink">{refusal}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || !day || unanswered}
            className="btn-primary disabled:opacity-50"
          >
            {busy ? 'Extending…' : `Extend to ${day ? plain(day) : '…'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
