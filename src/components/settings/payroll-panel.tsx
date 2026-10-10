'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { DEFAULT_CYCLE_SHIFT, SHIFT_WORDS } from '@/lib/cycle-shift'
import {
  PAY_PERIODS, PAY_PERIOD_WORDS, STATE_PAY_NOTE, SUGGESTED_DAYS_OF_MONTH,
  checkPaySettings, dayOfMonthWords, offsetWords, payPreview,
  type PayPeriod, type PayRhythm,
} from '@/lib/pay-dates'
import { Empty, Lbl, Panel, setLine } from './panel-bits'
import { Field, Select, SubmitButton, FormMessage } from '@/components/ui/form'

// ── Payroll ──────────────────────────────────────────
//
// Founder, 2026-10-07: "Give choice to businesses when they want to
// configure payroll." The pack's rhythm is the default; the arithmetic
// and the refusals are lib/pay-dates, through /api/settings/payroll. The
// preview is computed here with the same payDatesFor money's generator
// calls, so what the screen promises is what the dates will be.

interface PayAnswers extends PayRhythm {
  setAt: string | null
  setByName: string | null
}

/**
 * `shiftSection` says whether the weekend-and-holiday section is drawn
 * below this panel. Settings draws it; setup does not, so setup says the
 * default in words rather than pointing at a section that is not there.
 */
export function PayrollPanel({ canEdit, shiftSection = true }: { canEdit: boolean; shiftSection?: boolean }) {
  const [saved, setSaved] = useState<PayAnswers | null>(null)
  const [draft, setDraft] = useState<PayAnswers | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/settings/payroll'))
      setSaved(body.data)
      setDraft(body.data)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!draft) return
    setBusy(true)
    setErr(null)
    setNote(null)
    try {
      const body = await readJson(await fetch('/api/settings/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payPeriod: draft.payPeriod,
          payCalcOffsetDays: draft.payCalcOffsetDays,
          payDayOffsetDays: draft.payDayOffsetDays,
          payDaysOfMonth: draft.payDaysOfMonth,
          payCalcDaysBefore: draft.payCalcDaysBefore,
        }),
      }))
      setNote(body.data?.message ?? 'Saved.')
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!draft) {
    return <Panel title="Payroll">{err ? <FormMessage tone="error">{err}</FormMessage> : <Empty>Loading payroll…</Empty>}</Panel>
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  const byWeek = draft.payPeriod === 'WEEKLY' || draft.payPeriod === 'BIWEEKLY'
  const choose = (p: PayPeriod) => {
    if (p === 'SEMIMONTHLY' || p === 'MONTHLY') {
      const want = p === 'SEMIMONTHLY' ? 2 : 1
      const days = draft.payDaysOfMonth.length === want ? draft.payDaysOfMonth : SUGGESTED_DAYS_OF_MONTH[p]
      setDraft({ ...draft, payPeriod: p, payDaysOfMonth: [...days] })
    } else {
      setDraft({ ...draft, payPeriod: p })
    }
  }
  // Two weeks of choices, and the stored answer where it is further out:
  // the door takes up to thirty days.
  const upTo = (current: number) => Array.from({ length: Math.max(14, current + 1) }, (_, i) => i)
  const days = Array.from({ length: 28 }, (_, i) => i + 1)
  const check = checkPaySettings({}, draft)

  return (
    <Panel
      title="Payroll"
      subtitle="How often you pay, the day pay is worked out, and the day it is paid. The default is every other week."
    >
      <Lbl>Pay period</Lbl>
      <div role="group" aria-label="Pay period" className="flex flex-wrap gap-1.5 mt-2">
        {PAY_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={draft.payPeriod === p}
            disabled={!canEdit || busy}
            onClick={() => choose(p)}
            className={`px-3 py-1.5 rounded-pill text-[13px] border transition-colors ${
              draft.payPeriod === p
                ? 'bg-etyme-ink text-etyme-canvas border-etyme-ink font-medium'
                : 'bg-etyme-surface border-etyme-rule text-etyme-muted hover:text-etyme-ink disabled:opacity-50'
            }`}
          >
            {PAY_PERIOD_WORDS[p]}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-etyme-faint mt-2 mb-4">{STATE_PAY_NOTE}</p>

      {byWeek ? (
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <Field label="Worked out on">
            <Select value={draft.payCalcOffsetDays} disabled={!canEdit || busy}
              onChange={(e) => setDraft({ ...draft, payCalcOffsetDays: Number(e.target.value) })}>
              {upTo(draft.payCalcOffsetDays).map((n) => <option key={n} value={n}>{offsetWords(n)}</option>)}
            </Select>
          </Field>
          <Field label="Paid on">
            <Select value={draft.payDayOffsetDays} disabled={!canEdit || busy}
              onChange={(e) => setDraft({ ...draft, payDayOffsetDays: Number(e.target.value) })}>
              {upTo(draft.payDayOffsetDays).map((n) => <option key={n} value={n}>{offsetWords(n)}</option>)}
            </Select>
          </Field>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          {draft.payDaysOfMonth.map((d, i) => (
            <Field key={i} label={draft.payDaysOfMonth.length > 1 ? `Pay day ${i + 1}` : 'Pay day'}>
              <Select value={d} disabled={!canEdit || busy}
                onChange={(e) => {
                  const next = [...draft.payDaysOfMonth]
                  next[i] = Number(e.target.value)
                  setDraft({ ...draft, payDaysOfMonth: next })
                }}>
                {days.map((n) => <option key={n} value={n}>{dayOfMonthWords(n)}</option>)}
              </Select>
            </Field>
          ))}
          <Field label="Worked out">
            <Select value={draft.payCalcDaysBefore} disabled={!canEdit || busy}
              onChange={(e) => setDraft({ ...draft, payCalcDaysBefore: Number(e.target.value) })}>
              {upTo(draft.payCalcDaysBefore).map((n) => <option key={n} value={n}>{n === 0 ? 'On the pay day' : `${n} ${n === 1 ? 'day' : 'days'} before`}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <p className="text-[13px] text-etyme-ink mb-3">
        {check.ok ? payPreview(check.rhythm, new Date()) : <span className="text-etyme-attention">{check.message}</span>}
      </p>
      <p className="text-[12px] text-etyme-faint mb-4">
        {shiftSection
          ? 'A date on a day off or a holiday moves the way the section below says.'
          : `A pay day on a day off or a holiday moves to ${SHIFT_WORDS[DEFAULT_CYCLE_SHIFT.pay].label.toLowerCase()}. You can change this later in Settings.`}
      </p>
      {(err || note) && (
        <div className="mb-3">
          {err && <FormMessage tone="error">{err}</FormMessage>}
          {note && <FormMessage tone="ok">{note}</FormMessage>}
        </div>
      )}
      {canEdit && (
        <SubmitButton type="button" onClick={save} pending={busy} pendingLabel="Saving…" disabled={!changed}>
          Save payroll
        </SubmitButton>
      )}
      <p className="text-[12px] text-etyme-muted border-t border-etyme-rule pt-3 mt-4">{setLine(saved?.setAt ?? null, saved?.setByName ?? null)}</p>
    </Panel>
  )
}

