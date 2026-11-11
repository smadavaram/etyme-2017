'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { PageHead, Panel, LoadingState, RefusedState, ErrorState } from '@/components/ui'
import { Field, Input, SubmitButton, FormMessage } from '@/components/ui/form'

/**
 * The Superadmin screen (founder, 2026-11-11: "I should be able to
 * configure that in the Superadmin screen"). Etyme's own staff, the
 * addresses on ETYME_STAFF_EMAILS, and nobody else: the route refuses
 * everybody else, an Owner or Admin of any company included, and logs the
 * refusal before it is sent. What anybody else sees here is that one
 * sentence; the numbers are never sent to them.
 *
 * Platform tools only. Today one: Ask Etyme's two limits, in tokens, with
 * an estimate in short questions said as an estimate, and each person's
 * free trial in days. No company name, no
 * usage by company and no spending figure is on this screen; a company's
 * own usage stays on its Settings, under Ask Etyme.
 */

interface LimitView {
  key: string
  field: 'personDailyTokens' | 'companyMonthlyTokens' | 'trialDays'
  name: string
  unit: 'tokens' | 'days'
  floor: number
  ceiling: number
  value: number | null
  /** The number set on this screen, else empty. */
  typed: string
  says: string
  setBy: string | null
  setAt: string | null
}

interface Screen {
  limits: LimitView[]
  note: string
  history: { says: string; at: string }[]
  says?: string
}

const n = (x: number) => x.toLocaleString('en-US')

export default function SuperadminPage() {
  const [data, setData] = useState<Screen | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [fieldErr, setFieldErr] = useState<{ field?: string; says: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    const res = await fetch('/api/superadmin/ask-etyme')
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}))
      setRefused(body.error?.message ?? "This screen is for Etyme's Superadmin only.")
      return
    }
    try {
      const body = await readJson(res)
      setData(body.data)
      setTyped(Object.fromEntries((body.data.limits as LimitView[]).map((l) => [l.field, l.typed])))
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setSaving(true)
    setFieldErr(null)
    setNote(null)
    const res = await fetch('/api/superadmin/ask-etyme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(data.limits.map((l) => [l.field, typed[l.field]?.trim() ? typed[l.field] : null]))),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setFieldErr({ field: body.error?.field, says: body.error?.message ?? 'The limits were not saved. Try again.' })
      return
    }
    setData(body.data)
    setNote(body.data?.says ?? 'Saved.')
  }

  if (refused) return <RefusedState says={refused} />
  if (err) return <ErrorState says={err} action={{ label: 'Try again', onClick: load }} />
  if (!data) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Superadmin"
        title="Ask Etyme limits"
        subtitle="How much free-text answers may use, and how long each person's free trial lasts. Set for every company on this deployment. A company cannot change them."
      />

      <Panel title="The limits now" subtitle={data.note}>
        <ul className="space-y-3">
          {data.limits.map((l) => (
            <li key={l.key} className="text-[14px] text-etyme-ink">
              <span className="font-medium">{l.name}:</span> {l.says}
              {l.setBy && l.setAt && (
                <span className="block text-[12px] text-etyme-muted">Last changed by {l.setBy}, {l.setAt}.</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Change the limits" subtitle="Whole numbers. Leave a box empty to use the deployment's own setting, or for the trial its default.">
        <form onSubmit={save} className="space-y-4 max-w-md">
          {data.limits.map((l) => (
            <Field
              key={l.field}
              label={`${l.name}, in ${l.unit}`}
              help={`From ${n(l.floor)} to ${n(l.ceiling)}.`}
              error={fieldErr?.field === l.field ? fieldErr.says : undefined}
            >
              <Input
                inputMode="numeric"
                value={typed[l.field] ?? ''}
                onChange={(e) => setTyped({ ...typed, [l.field]: e.target.value })}
                className="tabular-nums"
              />
            </Field>
          ))}
          {fieldErr && !fieldErr.field && <FormMessage tone="error">{fieldErr.says}</FormMessage>}
          {note && <FormMessage tone="ok">{note}</FormMessage>}
          <SubmitButton pending={saving} pendingLabel="Saving…">Save</SubmitButton>
        </form>
      </Panel>

      <Panel title="The last ten changes">
        {data.history.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">Nobody has changed the limits on this screen yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.history.map((h, i) => (
              <li key={i} className="text-[13px] text-etyme-ink">
                {h.says} <span className="text-etyme-muted">{h.at}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
