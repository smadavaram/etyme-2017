'use client'

import { useState } from 'react'

import { rate as showRate } from '@/lib/money-display'
import { readJson } from '@/lib/read-response'
import { reasonAsked, unanswered, type ReasonAsked } from '@/lib/award/reason-asked'
import { awardBody } from './award-body'
import { Field, Input, Textarea, Check, SubmitButton } from '@/components/ui/form'
import { centsTyped, typedFromCents } from '@/app/dashboard/requisitions/facts'
import { refusalSays } from './words'

/**
 * Placing somebody: the award, `POST /api/submissions/:id/award`, and
 * nothing else. It writes the contract, the order and the billing dates
 * in one step and closes the seat, so there is one button and one road.
 * What the supplier pays its person is the supplier's business and is
 * not asked here.
 *
 * One dialog for every place a buyer places somebody from — the
 * Submissions row and the job request's candidate list — so the two
 * cannot ask different things or hear the route differently. The job
 * page asked for the rate in a browser prompt and showed the answer in
 * a browser alert, so a refusal was gone the moment it was read and a
 * question could not be answered at all.
 *
 * The second Tapin walk, 2026-10-30: the award asks for a reason where
 * the line runs past the client's time limit and the client's rule warns
 * rather than blocks, and the screen showed "Give a reason to go ahead."
 * as a toast with no box. Now, the shape the Extend dialog got on
 * 2026-10-26:
 *
 *   - where the route asks for a reason, its sentence is shown here with
 *     a box for the answer, and the answer is sent only after the
 *     sentence was shown (`reasonAsked`, `answersFor`);
 *   - where the route refuses, its sentence stays in the dialog, each
 *     reason once (`refusalSays`), so the person can change the rate or
 *     the day and press again.
 */
export function AwardDialog({
  submissionId,
  candidate,
  role,
  via,
  askedCents,
  says,
  neededBy,
  onDone,
  onCancel,
}: {
  submissionId: string
  candidate: string
  role: string
  /** "their own employer", or the firm that put them forward. */
  via: string
  /** What the supplier asked, in cents: the rate the box opens on. */
  askedCents: number | null
  /** The award rule's own sentence for this reader, where the list carries one. */
  says?: string | null
  /**
   * The day the job asked for, where the screen knows it: the box opens on
   * it while it is still ahead, the same default the route gives a press
   * that names no day (`startOf`), and on today otherwise.
   */
  neededBy?: string | null
  /** Called with the award's own paragraph once the person is placed. */
  onDone: (said: string, contractId: string | null) => void
  onCancel: () => void
}) {
  // Dollars in the box, as a person types them, and cents to the route
  // through the one reader (`centsTyped`). Seeded from cents by hand, one
  // click once turned a $130/hr submission into a $13,000/hr contract.
  const [rate, setRate] = useState(() => typedFromCents(askedCents))
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(() => opensOn(neededBy, today))
  // A start before today is refused unless the work is already under
  // way, and why is kept with the placement (audit, 2026-10-05).
  const before = !!startDate && startDate < today
  const [underWay, setUnderWay] = useState(false)
  const [why, setWhy] = useState('')
  // What the route asked for, by the field the answer goes in, and what
  // the person typed under each question.
  const [asked, setAsked] = useState<Record<string, ReasonAsked>>({})
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [refusal, setRefusal] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)

  const cents = centsTyped(rate)

  // A warning was about the day it was asked for. A new day is a new
  // question, so what the route said about the old one is cleared.
  function pickDay(next: string) {
    setStartDate(next)
    setAsked({})
    setTyped({})
    setRefusal(null)
  }

  async function place() {
    if (cents == null || cents <= 0) {
      setRefusal('That is not a rate. Type the bill rate in dollars an hour.')
      return
    }
    setPlacing(true)
    setRefusal(null)
    try {
      const res = await fetch(`/api/submissions/${submissionId}/award`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Exactly what the dialog draws (`awardBody`), the answers only to
        // questions the route has asked and the person has read.
        body: JSON.stringify(awardBody({ cents, startDate, before, underWay, why }, asked, typed)),
      })
      // Read here rather than with readJson: a blocked award lists the
      // checks that failed, and those are the sentence.
      const copy = res.clone()
      const body = await res.json().catch(() => ({}) as any)
      if (res.ok && body?.data) {
        // One paragraph, each thing once: the notes are already inside
        // the award's own sentence (`awardSaid`).
        onDone(body.data.message ?? `${candidate} is placed.`, body.data.contractId ?? null)
        return
      }
      const err = body?.error
      const question = reasonAsked(err)
      if (question) {
        setAsked((a) => ({ ...a, [question.field]: question }))
        return
      }
      if (err?.message) {
        // Each reason once: one already in the message is not said again.
        setRefusal(refusalSays(err.message, (err.checks ?? []).map((x: any) => String(x?.reason ?? ''))))
        return
      }
      // No sentence of its own: readJson says what the status means.
      await readJson(copy)
      setRefusal(`${candidate} was not placed.`)
    } catch (e: any) {
      setRefusal(e?.message ?? 'Network error. Please try again.')
    } finally {
      setPlacing(false)
    }
  }

  const blocked =
    placing || cents == null || cents <= 0 || !startDate ||
    (before && (!underWay || why.trim().length === 0)) ||
    unanswered(asked, typed)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="headline-serif text-[18px] text-etyme-ink mb-1">Place {candidate}</h3>
        <p className="text-[12px] text-etyme-muted mb-4">
          {says ?? 'This writes the contract, the order and the billing dates in one step.'}
        </p>

        <div className="mb-4 px-3 py-2 bg-etyme-canvas rounded-lg">
          <p className="text-[12px] text-etyme-muted">
            <span className="font-medium text-etyme-ink">{role}</span>
            {' · via '}
            {via}
            {askedCents != null ? <>{' · asked '}{showRate(askedCents)}</> : null}
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (!blocked) void place() }}
        >
          <Field label="Bill rate ($/hr)">
            <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>

          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => pickDay(e.target.value)} />
          </Field>

          {before && (
            <div className="rounded-md bg-etyme-canvas px-3 py-2">
              <Check
                label="The work is already under way"
                checked={underWay}
                onChange={(e) => setUnderWay(e.target.checked)}
              />
              {underWay ? (
                <Field label="Why it started before the award" className="mt-2">
                  <Input value={why} onChange={(e) => setWhy(e.target.value)} />
                </Field>
              ) : (
                <p className="mt-1 text-[12px] text-etyme-muted">
                  That date is before today. Pick today or later, or tick this and say why.
                </p>
              )}
            </div>
          )}

          {/* The route's own questions: its sentence, word for word, and
              a box for the answer. Your name and the answer go on the
              award's record. */}
          {Object.values(asked).map((q) => (
            <div
              key={q.field}
              className="px-4 py-3 rounded-lg bg-etyme-attention-wash border border-etyme-attention-line"
              role="alert"
            >
              <Field label={q.says}>
                <Textarea
                  rows={2}
                  placeholder="Your reason. Your name and this go on the record."
                  value={typed[q.field] ?? ''}
                  onChange={(e) => setTyped((t) => ({ ...t, [q.field]: e.target.value }))}
                />
              </Field>
            </div>
          ))}

          {refusal && (
            <div className="px-4 py-3 rounded-lg bg-etyme-danger-wash border border-etyme-danger-line" role="alert">
              <p className="text-sm text-etyme-ink">{refusal}</p>
            </div>
          )}

          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onCancel} disabled={placing} className="btn-secondary flex-1 disabled:opacity-50">
              Cancel
            </button>
            <SubmitButton pending={placing} pendingLabel="Placing…" disabled={blocked} className="flex-1">
              {Object.keys(asked).length > 0 ? 'Place with this reason' : 'Place'}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  )
}

/** "YYYY-MM-DD": the job's own day while it is still ahead, else today. Never a day already gone. */
export function opensOn(neededBy: string | null | undefined, today: string): string {
  const day = (neededBy ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= today ? day : today
}
