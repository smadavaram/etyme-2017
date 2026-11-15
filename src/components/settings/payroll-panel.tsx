'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { DEFAULT_CYCLE_SHIFT, SHIFT_WORDS } from '@/lib/cycle-shift'
import {
  PAY_PERIODS, PAY_PERIOD_WORDS, STATE_PAY_NOTE, SUGGESTED_DAYS_OF_MONTH,
  checkPaySettings, dayOfMonthWords, offsetWords, payrollBody,
  checkFirstPeriodStart, firstPeriodSays, firstDayChangeWarning, asksBeforeFirstDayChange,
  payPeriodHolding, payrollLineSays,
  FIRST_PERIOD_LABEL, FIRST_PERIOD_HELP, FIRST_PERIOD_UNSET, FIRST_PERIOD_WHO,
  FIRST_DAY_CONFIRM_TITLE, FIRST_DAY_CONFIRM_BUTTON,
  type PayPeriod, type PayRhythm, type PayPeriodOn, type DayOffRule,
} from '@/lib/pay-dates'
import { Empty, Lbl, Panel, setLine, NOTHING_CHANGED, CHOOSE_A_SUNDAY } from './panel-bits'
import { Field, Input, Select, SubmitButton, FormMessage } from '@/components/ui/form'

// ── Payroll ──────────────────────────────────────────
//
// Founder, 2026-10-07: "Give choice to businesses when they want to
// configure payroll." The pack's rhythm is the default; the arithmetic
// and the refusals are lib/pay-dates, through /api/settings/payroll. The
// preview is computed here with the same payDatesFor money's generator
// calls, so what the screen promises is what the dates will be.
//
// The first pay period's Sunday (2026-11-14, Tapin pays every two weeks):
// asked of a weekly or two-week company only. Once saved, the line under
// it says the first period and its pay day as the route works them out
// (`firstPeriod`, from payPeriodAt). While a Sunday is typed and not yet
// saved, the same sentence is worked out here by the same arithmetic
// (payPeriodHolding) with the company's own day-off rule from the route,
// and says it is not saved yet (the Tapin walk, 2026-11-14). The line
// under the choices says the company's own current period once its Sunday
// is set, and the example only where it is not (payrollLineSays). Where
// the holiday calendar is empty, money's sentence is said beside the pay day.
//
// Where the company has run payroll (`payrollRun`, from the same route),
// moving the first day asks first, in a box with its own heading, its
// second press focused and named for what it does, and Cancel.

/**
 * The first-pay-day box's own id. Every sentence blocked on the Sunday
 * links to /dashboard/settings?tab=cycles#first-pay-day (FIRST_DAY_HREF in
 * lib/money/pay-periods), and arriving there opens the Cycles tab,
 * scrolls to this box and focuses it (fix list of 2026-11-14, E5).
 */
export const FIRST_PAY_DAY_ID = 'first-pay-day'

/** Bring the first-pay-day box into view and put the cursor in it. True where the box is on the page. */
export function goToFirstPayDay(): boolean {
  const box = typeof document === 'undefined' ? null : document.getElementById(FIRST_PAY_DAY_ID)
  if (!box) return false
  box.scrollIntoView?.({ block: 'center' })
  ;(box as HTMLInputElement).focus?.({ preventScroll: true })
  return true
}

interface PayAnswers extends PayRhythm {
  setAt: string | null
  setByName: string | null
  /** The saved first period, worked out by the route. Null until a Sunday is saved. */
  firstPeriod: PayPeriodOn | null
  /** Whether this company has run payroll, so a moved first day is asked about first. */
  payrollRun?: boolean
  /** The company's own day-off rule, so a typed Sunday is said before Save. */
  dayOffRule?: DayOffRule
  /** Money's sentence where the company's holiday calendar is empty (noHolidaysSays); null where it is not. */
  noHolidays?: string | null
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
  const [asking, setAsking] = useState(false)
  // The second press is focused and brought into view, so it cannot be missed.
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!asking) return
    confirmRef.current?.focus()
    confirmRef.current?.scrollIntoView?.({ block: 'center' })
  }, [asking])

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

  // Arriving at #first-pay-day, or the hash set on this page, brings the
  // box into view with the cursor in it, once the box is drawn.
  const drawn = draft != null
  useEffect(() => {
    if (!drawn) return
    const go = () => { if (window.location.hash === `#${FIRST_PAY_DAY_ID}`) goToFirstPayDay() }
    go()
    window.addEventListener('hashchange', go)
    return () => window.removeEventListener('hashchange', go)
  }, [drawn])

  async function save(confirmed = false) {
    if (!draft) return
    if (!confirmed && asksBeforeFirstDayChange(saved?.payFirstPeriodStart ?? null, draft.payFirstPeriodStart ?? null, !!saved?.payrollRun)) {
      setAsking(true)
      return
    }
    setAsking(false)
    setBusy(true)
    setErr(null)
    setNote(null)
    try {
      const body = await readJson(await fetch('/api/settings/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payrollBody(draft)),
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
  // Said under the box while it is typed in, by the door's own check.
  const firstCheck = checkFirstPeriodStart(draft.payFirstPeriodStart ?? null)
  const firstSaved = saved?.firstPeriod && saved.payFirstPeriodStart === draft.payFirstPeriodStart ? saved.firstPeriod : null
  // While a Sunday is typed and not saved yet, its first period and pay day,
  // by the arithmetic the route uses and the company's own day-off rule.
  const rule = saved?.dayOffRule ?? {}
  const firstTyped = !firstSaved && firstCheck.ok && firstCheck.day ? payPeriodHolding(firstCheck.day, draft, rule) : null
  const firstShown = firstSaved ?? firstTyped
  // Why Save is greyed, in words: never a greyed button without them (E5).
  // A week-based company with no Sunday chosen is asked for one; otherwise
  // nothing has changed. No Sunday is suggested: which one is the firm's.
  // Defaults never saved may be saved as they stand: saving "every other
  // week" with nothing else changed answers the setup checklist (the press
  // walk l2a, 2026-11-15). The route takes every answer the panel sends.
  const neverSaved = !saved?.setAt
  const mayPress = (changed || neverSaved) && firstCheck.ok
  const saveWhy = !firstCheck.ok || (!changed && !neverSaved && byWeek && !draft.payFirstPeriodStart)
    ? CHOOSE_A_SUNDAY
    : !mayPress ? NOTHING_CHANGED : null

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
            // The chosen period is never greyed: it reads as chosen whether
            // or not this reader may change it (fix list G6). Pressing it
            // again changes nothing.
            disabled={draft.payPeriod !== p && (!canEdit || busy)}
            aria-disabled={draft.payPeriod === p && (!canEdit || busy) ? true : undefined}
            onClick={() => { if (draft.payPeriod !== p) choose(p) }}
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
          <Field
            id={FIRST_PAY_DAY_ID}
            label={FIRST_PERIOD_LABEL}
            className="sm:col-span-2"
            help={
              <>
                {FIRST_PERIOD_HELP} {FIRST_PERIOD_WHO}{' '}
                {firstShown ? firstPeriodSays(firstShown) : !draft.payFirstPeriodStart ? FIRST_PERIOD_UNSET : null}
                {firstTyped ? ' Not saved yet.' : null}
                {firstShown && saved?.noHolidays ? ` ${saved.noHolidays}` : null}
              </>
            }
            error={firstCheck.ok ? undefined : firstCheck.message}
          >
            <Input
              type="date"
              name="payFirstPeriodStart"
              value={draft.payFirstPeriodStart ?? ''}
              disabled={!canEdit || busy}
              onChange={(e) => setDraft({ ...draft, payFirstPeriodStart: e.target.value || null })}
            />
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
        {/* The company's own current period where its Sunday is set; the example only where it is not. */}
        {check.ok ? payrollLineSays({ ...check.rhythm, payFirstPeriodStart: firstCheck.ok ? firstCheck.day : null }, new Date(), rule) : <span className="text-etyme-attention">{check.message}</span>}
        {check.ok && saved?.noHolidays && !(byWeek && firstShown) ? ` ${saved.noHolidays}` : null}
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
      {canEdit && asking && draft.payFirstPeriodStart && (
        <div role="alertdialog" aria-labelledby="first-day-confirm" className="mb-3 rounded-md border-2 border-etyme-attention bg-etyme-raised p-4">
          <p id="first-day-confirm" className="text-[15px] font-semibold text-etyme-ink mb-1">{FIRST_DAY_CONFIRM_TITLE}</p>
          <p className="text-[13px] text-etyme-ink mb-3">{firstDayChangeWarning(draft.payFirstPeriodStart)}</p>
          <div className="flex gap-2">
            <button ref={confirmRef} type="button" onClick={() => save(true)} disabled={busy} aria-busy={busy || undefined} className="btn-primary">
              {busy ? 'Saving…' : FIRST_DAY_CONFIRM_BUTTON}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="px-3 py-1.5 rounded-pill text-[13px] border border-etyme-rule bg-etyme-surface text-etyme-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {canEdit && !asking && (
        <>
          <SubmitButton type="button" onClick={() => save()} pending={busy} pendingLabel="Saving…" disabled={!mayPress} whyDisabled={saveWhy}>
            Save payroll
          </SubmitButton>
        </>
      )}
      <p className="text-[12px] text-etyme-muted border-t border-etyme-rule pt-3 mt-4">{setLine(saved?.setAt ?? null, saved?.setByName ?? null)}</p>
    </Panel>
  )
}

