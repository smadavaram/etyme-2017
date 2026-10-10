'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { holidaySwitchView, type HolidayAnswerRow } from '@/lib/bench-profit'

/**
 * The holiday switch on a person's row (CLAUDE.md, the bench section:
 * "Holidays on the bench are a company setting, off by default",
 * 2026-10-03).
 *
 * Drawn only for the owner, the admin and the finance desk
 * (`mayChangeBenchPay` in lib/bench-holiday-switch); the route refuses
 * everybody else in a sentence anyway. The words are the rule's own
 * (`holidayPayFor(...).says`), and the button turns the person's own
 * switch through POST /api/settings/bench/people, which names who turned
 * it and when.
 */

type Answers = Map<string, HolidayAnswerRow>

/** Every listed person's answer, read in one request. */
export function useHolidaySwitches(personIds: string[], enabled: boolean) {
  const [answers, setAnswers] = useState<Answers>(new Map())
  const key = enabled ? [...personIds].sort().join(',') : ''

  const load = useCallback(async () => {
    if (!key) { setAnswers(new Map()); return }
    try {
      const j = await readJson<{ data: { people: (HolidayAnswerRow & { personId: string })[] } }>(
        await fetch(`/api/settings/bench/people?personId=${encodeURIComponent(key)}`)
      )
      setAnswers(new Map(j.data.people.map((p) => [p.personId, p])))
    } catch {
      // A refusal or a failure leaves the column blank rather than guessing.
      setAnswers(new Map())
    }
  }, [key])
  useEffect(() => { load() }, [load])

  return { answers, reload: load }
}

/** Turn one person's switch. Returns the route's sentence, or its refusal. */
export async function turnHolidaySwitch(personId: string, paid: boolean): Promise<{ ok: boolean; text: string }> {
  try {
    const j = await readJson<{ data: { message: string } }>(
      await fetch('/api/settings/bench/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId, paid }),
      })
    )
    return { ok: true, text: j.data.message }
  } catch (e: any) {
    return { ok: false, text: e.message }
  }
}

const TONE = { verified: 'chip--verified', passive: 'chip--passive', attention: 'chip--attention' } as const

export function HolidaySwitchCell({
  personId,
  answer,
  onTurned,
}: {
  personId: string
  answer: HolidayAnswerRow | undefined
  onTurned: (said: { ok: boolean; text: string }) => void
}) {
  const [busy, setBusy] = useState(false)
  // Nobody answered for this row: somebody whose listing is not granted,
  // who is not on this firm's bench for holiday pay.
  if (!answer) return <span className="text-[11px] text-etyme-faint">—</span>
  const v = holidaySwitchView(answer)
  return (
    <div className="min-w-[150px]">
      <div className="flex items-center gap-2">
        <span className={`chip ${TONE[v.tone]} text-[9px]`} title={v.says}>{v.label}</span>
        <button
          disabled={busy}
          onClick={async (e) => {
            e.stopPropagation()
            setBusy(true)
            const said = await turnHolidaySwitch(personId, v.turnTo)
            setBusy(false)
            onTurned(said)
          }}
          className="text-[11px] text-etyme-action hover:underline disabled:opacity-40 whitespace-nowrap"
        >
          {busy ? 'Saving…' : v.button}
        </button>
      </div>
      <p className="text-[10px] text-etyme-muted mt-1">{v.says}</p>
    </div>
  )
}
