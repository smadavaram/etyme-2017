'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Empty, Lbl, Panel, setLine } from './panel-bits'
import { Field, Select, Check, SubmitButton, FormMessage } from '@/components/ui/form'

// ── Your week ────────────────────────────────────────
//
// Founder, 2026-09-30: days off are the company's to set, Saturday and
// Sunday by default; hours are due the Monday after a week ends and
// approved by the Wednesday; approvers may have one extra week, never
// more. The rules and the refusals are lib/days-off, through
// /api/settings/week; this only asks the questions.

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface WeekAnswers {
  daysOff: number[]
  hoursDueWeekday: number
  approveByWeekday: number
  approvalExtraWeeks: number
  setAt: string | null
  setByName: string | null
}

export function WeekPanel({ canEdit }: { canEdit: boolean }) {
  const [saved, setSaved] = useState<WeekAnswers | null>(null)
  const [draft, setDraft] = useState<WeekAnswers | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/settings/week'))
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
      const body = await readJson(await fetch('/api/settings/week', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daysOff: draft.daysOff,
          hoursDueWeekday: draft.hoursDueWeekday,
          approveByWeekday: draft.approveByWeekday,
          approvalExtraWeeks: draft.approvalExtraWeeks,
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
    return <Panel title="Your week">{err ? <FormMessage tone="error">{err}</FormMessage> : <Empty>Loading your week…</Empty>}</Panel>
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  const toggle = (d: number) =>
    setDraft({ ...draft, daysOff: draft.daysOff.includes(d) ? draft.daysOff.filter((x) => x !== d) : [...draft.daysOff, d].sort() })
  // The week runs Sunday to Saturday; these are days in the week after.
  const weekdays = [1, 2, 3, 4, 5, 6, 0]

  return (
    <Panel
      title="Your week"
      subtitle="A week runs Sunday to Saturday. Pick the days nobody is expected to work. A worker may still file hours on a day off."
    >
      <fieldset>
        <legend><Lbl>Days off</Lbl></legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 mb-5">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <Check
              key={d}
              label={WEEKDAY_NAMES[d].slice(0, 3)}
              checked={draft.daysOff.includes(d)}
              disabled={!canEdit || busy}
              onChange={() => toggle(d)}
            />
          ))}
        </div>
      </fieldset>
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Field label="Hours due">
          <Select
            value={draft.hoursDueWeekday}
            disabled={!canEdit || busy}
            onChange={(e) => setDraft({ ...draft, hoursDueWeekday: Number(e.target.value) })}
          >
            {weekdays.map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]} after the week ends</option>)}
          </Select>
        </Field>
        <Field label="Approved by">
          <Select
            value={draft.approveByWeekday}
            disabled={!canEdit || busy}
            onChange={(e) => setDraft({ ...draft, approveByWeekday: Number(e.target.value) })}
          >
            {weekdays.map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]} after the week ends</option>)}
          </Select>
        </Field>
      </div>
      <Check
        className="mb-5"
        label="Give approvers one extra week"
        checked={draft.approvalExtraWeeks === 1}
        disabled={!canEdit || busy}
        onChange={(e) => setDraft({ ...draft, approvalExtraWeeks: e.target.checked ? 1 : 0 })}
      />
      {(err || note) && (
        <div className="mb-3">
          {err && <FormMessage tone="error">{err}</FormMessage>}
          {note && <FormMessage tone="ok">{note}</FormMessage>}
        </div>
      )}
      {canEdit && (
        <SubmitButton type="button" onClick={save} pending={busy} pendingLabel="Saving…" disabled={!changed}>
          Save your week
        </SubmitButton>
      )}
      <p className="text-[12px] text-etyme-muted border-t border-etyme-rule pt-3 mt-4">{setLine(saved?.setAt ?? null, saved?.setByName ?? null)}</p>
    </Panel>
  )
}

