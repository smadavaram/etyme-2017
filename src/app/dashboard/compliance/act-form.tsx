'use client'

import { useState } from 'react'
import { saveForm } from '@/lib/form-save'
import { Field, FormMessage, Input, Select, SubmitButton } from '@/components/ui'
import { firstMissing, type FieldSpec, type Values } from './act-spec'

/**
 * One small act on a row: a button that opens its form in place. The route's
 * own refusal is said under the form in its own words; the form closes only
 * when the route took it. Fields stack on a phone and sit two to a row above
 * it, so nothing is cut off at 390 pixels.
 */
export function Act({ label, doneLabel, fields, url, method = 'POST', body, onDone, tone = 'secondary' }: {
  label: string
  /** What the button says while the form is open. */
  doneLabel?: string
  /** Called with the values typed so far, so a field can depend on another (a reason asked only for an early removal). */
  fields: (v: Values) => FieldSpec[]
  url: string
  method?: 'POST' | 'PATCH'
  body: (v: Values) => Record<string, unknown>
  onDone: () => void
  tone?: 'primary' | 'secondary'
}) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState<Values>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drawn = fields(v)
  const set = (key: string, value: string) => setV((x) => ({ ...x, [key]: value }))

  if (!open) return <button type="button" className={tone === 'primary' ? 'btn-primary' : 'btn-secondary'} onClick={() => setOpen(true)}>{label}</button>

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const missing = firstMissing(drawn, v)
    if (missing) { setError(missing); return }
    const saved = await saveForm({
      send: () => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(v)) }),
      setBusy, setError, fallback: 'That could not be saved. Try again.',
    })
    if (saved) { setOpen(false); setV({}); onDone() }
  }

  return (
    <form onSubmit={send} className="mt-3 w-full max-w-full rounded-panel border border-etyme-rule bg-etyme-raised p-4" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {drawn.map((f) => (
          <Field key={f.key} label={f.label} help={f.help} className="min-w-0">
            {f.type === 'select' ? (
              <Select value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">Choose…</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : (
              <Input type={f.type} inputMode={f.type === 'number' ? 'decimal' : undefined} step={f.type === 'number' ? 'any' : undefined} value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </Field>
        ))}
      </div>
      {error && <div className="mt-3"><FormMessage tone="error">{error}</FormMessage></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <SubmitButton pending={busy} tone="primary">{doneLabel ?? label}</SubmitButton>
        <button type="button" className="btn-secondary" onClick={() => { setOpen(false); setError(null) }}>Cancel</button>
      </div>
    </form>
  )
}
