'use client'

import { useState } from 'react'
import { FormMessage } from '@/components/ui'
import type { WeekAct } from '@/lib/notify/week-words'
import { ACCEPT_FEWER_FIELDS, acceptFewerBody, type AcceptFewerField } from '@/app/api/timesheets/accept-fewer'
import type { PendingWeek } from './decide-overtime'

/**
 * "Accept fewer hours": the hours a firm accepts of a week, and why.
 *
 * Walk 8, 9 November 2026: no screen could accept fewer hours than were
 * filed. The tick accepts every hour; this dialog sends the hours and the
 * reason through the same approve route, and says the route's refusal
 * under the field it names (`ACCEPT_FEWER_FIELDS`, the names the route
 * reads them under), so a question the route asks always has its field
 * here.
 *
 * A week over the overtime line is still asked about its overtime: the
 * route refuses with the weeks to decide, and the dialog hands them on
 * with the hours and the reason, so neither is lost on the way.
 */
export function AcceptFewer({
  timesheetId,
  personName,
  filedHours,
  act,
  onClose,
  onDone,
  onOvertime,
}: {
  timesheetId: string
  personName: string
  filedHours: number
  act?: WeekAct | null
  onClose: () => void
  onDone: (message: string) => void
  /** The week went over the line: ask the overtime, carrying what was typed here. */
  onOvertime: (asked: { weeks: PendingWeek[]; lead: string; note: string; acceptedHours: string }) => void
}) {
  const verb = act === 'ACCEPT' ? 'Accept' : 'Approve'
  const [hours, setHours] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  // The route's sentence, under the field it names; anything else above the button.
  const [said, setSaid] = useState<Partial<Record<AcceptFewerField | 'form', string>>>({})

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaid({})
    const sent = acceptFewerBody({ hours, reason })
    try {
      const res = await fetch(`/api/timesheets/${timesheetId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sent),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body.error?.code === 'OVERTIME_UNDECIDED') {
          onOvertime({ weeks: (body.error.weeks ?? []) as PendingWeek[], lead: body.error.message as string, note: sent.note, acceptedHours: sent.acceptedHours })
          return
        }
        const message: string = body.error?.message ?? 'That could not be saved.'
        const field = body.error?.field as AcceptFewerField | undefined
        setSaid(field === ACCEPT_FEWER_FIELDS.hours || field === ACCEPT_FEWER_FIELDS.reason ? { [field]: message } : { form: message })
        return
      }
      onDone([body.data?.message ?? 'Accepted.', body.data?.postingSays].filter(Boolean).join('. '))
    } catch {
      setSaid({ form: 'The network dropped that. Try again.' })
    } finally {
      setSaving(false)
    }
  }

  const typed = hours.trim() === '' ? null : Number(hours)
  const button = typed != null && Number.isFinite(typed) ? `${verb} ${typed} ${typed === 1 ? 'hour' : 'hours'}` : `${verb} these hours`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="accept-fewer-title"
        className="card w-full max-w-md mx-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3 id="accept-fewer-title" className="text-base font-semibold mb-1">
          {verb} fewer of {personName}’s {filedHours} hours
        </h3>
        <p className="text-sm text-etyme-muted mb-4">
          Say how many hours you accept and why. The reason goes on your signature, and the firm you pay bills on these hours.
        </p>

        <label className="block text-xs font-semibold text-etyme-muted mb-1" htmlFor={`fewer-${ACCEPT_FEWER_FIELDS.hours}`}>
          Hours you accept, of {filedHours} filed
        </label>
        <input
          id={`fewer-${ACCEPT_FEWER_FIELDS.hours}`}
          name={ACCEPT_FEWER_FIELDS.hours}
          type="number"
          inputMode="decimal"
          min="0"
          max={filedHours}
          step="0.25"
          autoFocus
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          aria-invalid={!!said.acceptedHours}
          className="w-full px-3 py-2 text-sm tabular-nums border border-etyme-rule rounded-lg mb-1
                     focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
        />
        {said.acceptedHours && <p className="text-[12px] text-etyme-danger mb-2">{said.acceptedHours}</p>}

        <label className="block text-xs font-semibold text-etyme-muted mt-3 mb-1" htmlFor={`fewer-${ACCEPT_FEWER_FIELDS.reason}`}>
          Why fewer
        </label>
        <textarea
          id={`fewer-${ACCEPT_FEWER_FIELDS.reason}`}
          name={ACCEPT_FEWER_FIELDS.reason}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={!!said.note}
          placeholder="Two hours on Friday were a training session we do not pay for."
          className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg mb-1 resize-none
                     focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
        />
        {said.note && <p className="text-[12px] text-etyme-danger mb-2">{said.note}</p>}

        {said.form && (
          <div className="mt-3">
            <FormMessage tone="error">{said.form}</FormMessage>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button type="button" onClick={onClose} className="btn-secondary">Not now</button>
          <button
            type="submit"
            disabled={saving || hours.trim() === ''}
            title={hours.trim() === '' ? 'Enter the hours you accept.' : undefined}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-etyme-verified text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : button}
          </button>
        </div>
      </form>
    </div>
  )
}
