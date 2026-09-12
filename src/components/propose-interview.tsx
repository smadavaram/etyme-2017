'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import {
  buildProposal, readyToSend, localMoment,
  EMPTY_FORM, MODES, STAGES, DURATIONS, MAX_TIMES,
  type ProposalForm, type Mode,
} from '@/lib/interview-proposal'

/**
 * Asking for a round.
 *
 * The model has had rounds since it existed — numbered, three-way
 * confirmed, with a panel and an outcome — and the route that creates
 * one was proven in the integration walk. What was missing was a form.
 * The interviews page's own empty state said "Interviews start from a
 * candidate on a role" and no page fulfilled it.
 *
 * One form, used from the candidate's row on Submissions (round one)
 * and from the interviews page after "next round" (round two onwards),
 * so the two cannot drift. The words are the trade's: a stage in the
 * client's own word, how, how long, where, up to three times, who is in
 * the room. Names for interviewers, not seats — plenty have no account
 * here. The rules live in lib/interview-proposal and are tested there.
 */
export function ProposeInterview({
  submissionId,
  candidate,
  round,
  onDone,
  onCancel,
}: {
  submissionId: string
  candidate: string
  /** The number this round will carry — the route decides, this says. */
  round: number
  onDone: (says: string) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ProposalForm>({ ...EMPTY_FORM, times: [{ date: '', time: '' }] })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { problems } = buildProposal(form)
  // A fresh form does not scold. The sentence about a missing time is
  // shown once they have started on the times, or tried to send.
  const [tried, setTried] = useState(false)
  const started = tried || form.times.some((t) => t.date || t.time)
  const problem = error ?? (started ? problems[0] : undefined)

  function setTime(i: number, patch: Partial<{ date: string; time: string }>) {
    setForm((f) => ({ ...f, times: f.times.map((t, k) => (k === i ? { ...t, ...patch } : t)) }))
  }

  function addName() {
    const n = name.trim()
    if (!n) return
    setForm((f) => ({ ...f, interviewers: f.interviewers.includes(n) ? f.interviewers : [...f.interviewers, n] }))
    setName('')
  }

  async function send() {
    const { body, problems } = buildProposal(form)
    setTried(true)
    if (!readyToSend(problems)) {
      setError(problems[0])
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/submissions/${submissionId}/interviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readJson(res)
      onDone(data?.data?.says ?? `Round ${round} proposed for ${candidate}.`)
    } catch (err: any) {
      setError(err?.message ?? 'That did not go through.')
      setBusy(false)
    }
  }

  const field = 'w-full h-9 rounded-md border border-etyme-rule bg-etyme-raised px-3 text-[13px] text-etyme-ink placeholder:text-etyme-faint focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action/40'
  const label = 'block text-[10px] font-semibold uppercase tracking-[0.14em] text-etyme-faint mb-1.5'

  return (
    <div className="panel !p-5" role="form" aria-label={`Propose round ${round} for ${candidate}`}>
      <p className="eyebrow">Interview</p>
      <h2 className="mt-1 font-serif text-[22px] tracking-[-0.02em] text-etyme-ink">
        Round {round} for {candidate}
      </h2>
      <p className="mt-1 text-[13px] text-etyme-muted">
        Offer a few times. {candidate.split(' ')[0]} and their supplier confirm one; nothing is booked until all three of you have said so.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="stage" className={label}>Stage</label>
          <input
            id="stage"
            list="interview-stages"
            className={field}
            placeholder="Technical"
            value={form.stage}
            onChange={(e) => setForm({ ...form, stage: e.target.value })}
          />
          <datalist id="interview-stages">
            {STAGES.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>

        <div>
          <span className={label}>How</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label="How">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                role="radio"
                aria-checked={form.mode === m.mode}
                onClick={() => setForm({ ...form, mode: m.mode as Mode })}
                className={`h-9 flex-1 rounded-md border text-[13px] transition-colors ${
                  form.mode === m.mode
                    ? 'border-etyme-ink bg-etyme-ink text-etyme-canvas font-medium'
                    : 'border-etyme-rule bg-etyme-raised text-etyme-muted hover:text-etyme-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="duration" className={label}>How long</label>
          <select
            id="duration"
            className={field}
            value={form.durationMins}
            onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
          >
            {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="location" className={label}>Where — a link or an address</label>
          <input
            id="location"
            className={field}
            placeholder={form.mode === 'ONSITE' ? 'Building 3, reception' : 'A meeting link'}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-5">
        <span className={label}>Offer up to three times</span>
        <div className="flex flex-col gap-2">
          {form.times.map((t, i) => {
            const past = (() => { const d = localMoment(t.date, t.time); return d ? d.getTime() < Date.now() : false })()
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label={`Date for time ${i + 1}`}
                  className={`${field} !w-auto min-w-[10rem] flex-1`}
                  value={t.date}
                  onChange={(e) => setTime(i, { date: e.target.value })}
                />
                <input
                  type="time"
                  aria-label={`Time for time ${i + 1}`}
                  className={`${field} !w-auto min-w-[7rem]`}
                  value={t.time}
                  onChange={(e) => setTime(i, { time: e.target.value })}
                />
                {past && <span className="text-[12px] text-etyme-attention">already passed</span>}
                {form.times.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove time ${i + 1}`}
                    onClick={() => setForm({ ...form, times: form.times.filter((_, k) => k !== i) })}
                    className="h-9 w-9 rounded-md text-etyme-muted hover:bg-etyme-canvas hover:text-etyme-ink"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {form.times.length < MAX_TIMES && (
          <button
            type="button"
            onClick={() => setForm({ ...form, times: [...form.times, { date: '', time: '' }] })}
            className="mt-2 text-[13px] font-medium text-etyme-action hover:underline"
          >
            + another time
          </button>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor="interviewer" className={label}>Who is interviewing</label>
        <div className="flex gap-2">
          <input
            id="interviewer"
            className={field}
            placeholder="Marcus Oyelaran, People Technology"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addName() } }}
          />
          <button type="button" onClick={addName} className="btn-secondary shrink-0 !py-0 h-9">
            Add
          </button>
        </div>
        {form.interviewers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {form.interviewers.map((n) => (
              <span key={n} className="chip chip--passive !text-[11px] !normal-case !tracking-normal !py-1">
                {n}
                <button
                  type="button"
                  aria-label={`Remove ${n}`}
                  onClick={() => setForm({ ...form, interviewers: form.interviewers.filter((x) => x !== n) })}
                  className="ml-1 text-etyme-faint hover:text-etyme-ink"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-etyme-faint">Names are fine — they need no account here.</p>
      </div>

      {problem && (
        <p className="mt-4 text-[13px] text-etyme-attention" role="alert">
          {problem}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? 'Proposing…' : `Propose round ${round}`}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Never mind
        </button>
      </div>
    </div>
  )
}

/**
 * The same form, over the page. Both screens open it this way, so the
 * overlay is written once.
 */
export function ProposeInterviewDialog(props: Parameters<typeof ProposeInterview>[0]) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-etyme-ink/30 p-4 md:p-8"
      onClick={props.onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={`Propose round ${props.round} for ${props.candidate}`}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <ProposeInterview {...props} />
      </div>
    </div>
  )
}
