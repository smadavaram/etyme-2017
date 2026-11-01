'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { profileEditBody } from '@/lib/bench-filter'
import { firmViewEditBody, keptOnListingSays, SAVED_ON_RECORD_SAYS } from '@/lib/consultant-portfolio/firm-view'

/**
 * Edit a consultant from the firm's side, in one of two ways, and never
 * offer what the route would refuse (`PATCH /api/consultants/:id`, which
 * asks `profileEditPlan` and keeps its own rules).
 *
 *  - The record is this firm's to keep (no account of their own, and no
 *    other firm lists them): what matching reads — their skills, the day
 *    they are free, and for a role that reads pay the lowest rate they
 *    take — written on their record, and on this firm's listing too.
 *  - The record is theirs (the second Tapin walk, 2026-10-30): how this
 *    firm sells them — a title, skills, a place and a note — kept on its
 *    own bench listing. Their profile, free date and lowest rate are
 *    theirs to change, and the form says so rather than offering them.
 */
export function ProfileEditor({ consultantId, name, keptBy, listed, skills, availableFrom, rateFloor, firmView, mayRate, onSaved }: {
  consultantId: string
  name: string
  /** Whose record this is to change (`recordKeptBy`). */
  keptBy: 'FIRM' | 'THEM'
  /** Whether this firm has a listing for them, where its own words are kept. */
  listed: boolean
  skills: string[]
  availableFrom: string | null
  /** Cents an hour, where this seat may read it. */
  rateFloor: number | null
  /** What this firm reads about them now: its own view first, theirs where it said nothing. */
  firmView: { headline: string | null; skills: string[]; location: string | null; notes: string | null }
  mayRate: boolean
  onSaved: () => void
}) {
  if (keptBy === 'THEM') {
    return <FirmViewEditor consultantId={consultantId} name={name} listed={listed} view={firmView} onSaved={onSaved} />
  }
  return <RecordEditor consultantId={consultantId} skills={skills} availableFrom={availableFrom} rateFloor={rateFloor} mayRate={mayRate} onSaved={onSaved} />
}

async function patch(consultantId: string, body: unknown): Promise<string | null> {
  const out = await readJson(await fetch(`/api/consultants/${consultantId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return (out as { data?: { message?: string } } | null)?.data?.message ?? null
}

function RecordEditor({ consultantId, skills, availableFrom, rateFloor, mayRate, onSaved }: {
  consultantId: string
  skills: string[]
  availableFrom: string | null
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
      const says = await patch(consultantId, out.body)
      setSaid({ text: says ?? SAVED_ON_RECORD_SAYS, ok: true })
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
        <p className="text-[12px] text-etyme-muted">The lowest rate they take is pay, set by payroll, finance or the person.</p>
      )}
      {said && <p className={`text-[12px] ${said.ok ? 'text-etyme-verified' : 'text-etyme-attention'}`}>{said.text}</p>}
      <button disabled={busy} className="btn-primary text-[12px] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
    </form>
  )
}

function FirmViewEditor({ consultantId, name, listed, view, onSaved }: {
  consultantId: string
  name: string
  listed: boolean
  view: { headline: string | null; skills: string[]; location: string | null; notes: string | null }
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    headline: view.headline ?? '',
    skills: view.skills.join(', '),
    location: view.location ?? '',
    notes: view.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; ok: boolean } | null>(null)

  // With no listing there is nowhere to keep the firm's words: said, not offered.
  if (!listed) {
    return (
      <div>
        <p className="eyebrow mb-2">How you sell them</p>
        <p className="text-[12px] text-etyme-muted">{name}’s own profile is theirs to change.</p>
      </div>
    )
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const says = await patch(consultantId, firmViewEditBody(form))
      setSaid({ text: says ?? 'Saved on your bench listing.', ok: true })
      onSaved()
    } catch (err: any) {
      setSaid({ text: err.message, ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="eyebrow">How you sell them</p>
      <p className="text-[12px] text-etyme-muted">{keptOnListingSays(name)}</p>
      <label className="block text-[12px] text-etyme-muted">Title
        <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })}
          className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
      </label>
      <label className="block text-[12px] text-etyme-muted">Skills, separated by commas
        <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })}
          className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
      </label>
      <label className="block text-[12px] text-etyme-muted">Where they work
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
      </label>
      <label className="block text-[12px] text-etyme-muted">Your note
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
          className="mt-1 w-full border border-etyme-rule rounded px-2 py-1.5 text-sm text-etyme-ink" />
      </label>
      {said && <p className={`text-[12px] ${said.ok ? 'text-etyme-verified' : 'text-etyme-attention'}`}>{said.text}</p>}
      <button disabled={busy} className="btn-primary text-[12px] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
