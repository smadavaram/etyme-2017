'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { profileEditBody } from '@/lib/bench-filter'

/**
 * Edit what matching reads about a person: their skills, the day they are
 * free, and — for a desk that reads pay — the lowest rate they take. The
 * route (`PATCH /api/consultants/:id`) is the one door and keeps its own
 * rules; this form only never offers what it would refuse.
 */
export function ProfileEditor({ consultantId, skills, availableFrom, rateFloor, mayRate, onSaved }: {
  consultantId: string
  skills: string[]
  availableFrom: string | null
  /** Cents an hour, where this desk may read it. */
  rateFloor: number | null
  mayRate: boolean
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    skills: skills.join(', '),
    availableFrom: availableFrom ? availableFrom.slice(0, 10) : '',
    rateFloor: rateFloor != null ? String(Math.round(rateFloor / 100)) : '',
  })
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; ok: boolean } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const out = profileEditBody(form, mayRate)
    if (!out.ok) { setSaid({ text: out.says, ok: false }); return }
    setBusy(true)
    try {
      await readJson(await fetch(`/api/consultants/${consultantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(out.body),
      }))
      setSaid({ text: 'Saved. Matching reads it the next time it runs.', ok: true })
      onSaved()
    } catch (err: any) {
      setSaid({ text: err.message, ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="eyebrow">What matching reads</p>
      <label className="block text-[12px] text-etyme-muted">Skills, separated by commas
        <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })}
          className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
      </label>
      <label className="block text-[12px] text-etyme-muted">Free from
        <input type="date" value={form.availableFrom} onChange={(e) => setForm({ ...form, availableFrom: e.target.value })}
          className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
      </label>
      {mayRate ? (
        <label className="block text-[12px] text-etyme-muted">Lowest hourly rate they take ($)
          <input type="number" min="1" step="1" inputMode="numeric" value={form.rateFloor}
            onChange={(e) => setForm({ ...form, rateFloor: e.target.value })}
            className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm tabular-nums text-etyme-ink" />
        </label>
      ) : (
        <p className="text-[12px] text-etyme-muted">The lowest rate they take is pay, set by the desks that read pay or by the person.</p>
      )}
      {said && <p className={`text-[12px] ${said.ok ? 'text-etyme-verified' : 'text-etyme-attention'}`}>{said.text}</p>}
      <button disabled={busy} className="btn-primary text-[12px] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
