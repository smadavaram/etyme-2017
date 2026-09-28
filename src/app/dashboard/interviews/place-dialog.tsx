'use client'

import { useState } from 'react'

import { rate as showRate } from '@/lib/money-display'
import { readJson } from '@/lib/read-response'

/**
 * Placing somebody, from the round that ended in an offer.
 *
 * This is the award — `POST /api/submissions/:id/award` — and nothing
 * else, the same road the Submissions row takes. It asks the same two
 * things the Submissions page's dialog asks, the bill rate and the start
 * date, because those are what the award needs and nothing more.
 *
 * It is a copy of that dialog rather than the dialog itself: the
 * Submissions one is private to demand's page, and a shared one would
 * live under `components/`, which is the architect's. Two dialogs that
 * ask two fields and post to one route is the smaller cost; the route is
 * what must not be duplicated, and it is not.
 */
export function PlaceDialog({
  submissionId,
  candidate,
  role,
  supplier,
  askedCents,
  says,
  onDone,
  onCancel,
}: {
  submissionId: string
  candidate: string
  role: string
  supplier: string
  /** What the supplier asked, in cents — the rate the offer was made on. */
  askedCents: number
  /** The award rule's own sentence for this reader. */
  says: string
  onDone: (said: string, contractId: string | null) => void
  onCancel: () => void
}) {
  // Dollars in the field, cents to the route. Seeded from cents, one
  // click once turned a $130/hr submission into a $13,000/hr contract.
  const [rate, setRate] = useState(askedCents / 100)
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function place() {
    setPlacing(true)
    setError(null)
    try {
      // The one road to a placement: the award.
      const res = await fetch(`/api/submissions/${submissionId}/award`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: Math.round(rate * 100), startDate }),
      })
      // A blocked award lists the checks that failed, and those are the
      // sentence. Anything without a message goes through readJson.
      const copy = res.clone()
      const body = await res.json().catch(() => ({}) as any)
      if (!res.ok || !body?.data) {
        const checks = (body.error?.checks ?? []).map((x: any) => x.reason).join(' · ')
        if (body.error?.message) throw new Error(`${body.error.message}${checks ? ` — ${checks}` : ''}`)
        await readJson(copy)
      }
      const notes: string[] = body.data?.notes ?? []
      onDone(
        [body.data?.message ?? `${candidate} is placed.`, ...notes].filter(Boolean).join(' '),
        body.data?.contractId ?? null
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="headline-serif mb-1 text-[18px] text-etyme-ink">Place {candidate}</h3>
        <p className="mb-4 text-[12px] text-etyme-muted">{says}</p>

        <div className="mb-4 rounded-lg bg-etyme-canvas px-3 py-2">
          <p className="text-[12px] text-etyme-muted">
            <span className="font-medium text-etyme-ink">{role}</span>
            {' · via '}
            {supplier}
            {' · asked '}
            {showRate(askedCents)}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="eyebrow mb-1 block" htmlFor="place-rate">Bill rate ($/hr) *</label>
            <input
              id="place-rate"
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full rounded-md border border-etyme-rule px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block" htmlFor="place-start">Start date *</label>
            <input
              id="place-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-etyme-rule px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[12px] text-etyme-attention" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <button onClick={onCancel} disabled={placing} className="btn-secondary flex-1 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={place}
            disabled={placing || !(rate > 0) || !startDate}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {placing ? 'Placing…' : 'Place'}
          </button>
        </div>
      </div>
    </div>
  )
}
