'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { addSkillTags, listingRates } from '@/lib/bench-filter'
import { formatDay } from '@/lib/format-date'

/**
 * "What we need" — what this firm asks its partners to offer, at the top
 * of Partner bench, and what the firms it trades with are asking for, at
 * the top of Our bench (CLAUDE.md, "The bench is the difference",
 * 2026-09-30). One request, `GET /api/bench/wants`, feeds both.
 *
 * Every sentence on a row is the route's own (`wantSays`), so the firm
 * that wrote an ask and the partner reading it read the same words.
 */

interface Want {
  id: string
  firm: string
  says: string
  writtenBy: string
  createdAt: string
}

interface Answer {
  ours: Want[]
  partners: Want[]
  desks: { roles: { id: string; name: string }[]; people: { id: string; name: string }[] }
  mayWrite: boolean
  writeSays: string | null
}

function useWants() {
  const [data, setData] = useState<Answer | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const j = await readJson<{ data: Answer }>(await fetch('/api/bench/wants'))
      setData(j.data)
      setWhy(null)
    } catch (e: any) {
      setData(null)
      setWhy(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])
  return { data, why, reload: load }
}

const box = 'w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action'
const label = 'block text-xs font-semibold text-etyme-muted mb-1'

/** At the top of Partner bench: what we ask our partners for, and the form to ask. */
export function WhatWeNeed({ onSaid }: { onSaid: (said: { ok: boolean; text: string }) => void }) {
  const { data, why, reload } = useWants()
  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState('')
  const [places, setPlaces] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [desk, setDesk] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const rates = listingRates({ min, max }, null)
    if (!rates.ok) { setError(rates.says); return }
    const [kind, id] = desk.split(':')
    setBusy(true)
    setError(null)
    try {
      const j = await readJson<{ data: { message: string } }>(
        await fetch('/api/bench/wants', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            skills: addSkillTags([], skills),
            places: places.split(';').map((x) => x.trim()).filter(Boolean),
            rateMinCents: rates.rateMin,
            rateMaxCents: rates.rateMax,
            receivingRoleId: kind === 'role' ? id : null,
            receivingPersonId: kind === 'person' ? id : null,
          }),
        })
      )
      onSaid({ ok: true, text: j.data.message })
      setSkills(''); setPlaces(''); setMin(''); setMax(''); setDesk(''); setOpen(false)
      await reload()
    } catch (err: any) {
      // The typed values stay in the boxes, so nothing is typed twice.
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function close(id: string) {
    try {
      const j = await readJson<{ data: { message: string } }>(
        await fetch(`/api/bench/wants/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ close: true }) })
      )
      onSaid({ ok: true, text: j.data.message })
      await reload()
    } catch (err: any) {
      onSaid({ ok: false, text: err.message })
    }
  }

  if (why) return <p role="status" className="panel text-body-sm text-etyme-ink mb-6">{why}</p>
  if (!data) return null

  return (
    <section className="panel mb-6" aria-labelledby="what-we-need">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 id="what-we-need" className="headline-serif text-lg text-etyme-ink">What we need</h2>
          <p className="text-[12px] text-etyme-muted">
            What you ask partner firms to offer you. Only firms you already trade with read it.
          </p>
        </div>
        {data.mayWrite && !open && (
          <button onClick={() => setOpen(true)} className="btn-secondary shrink-0">Ask partners</button>
        )}
      </div>

      {data.ours.length === 0 ? (
        <p className="text-[13px] text-etyme-muted">You are not asking partners for anybody yet.</p>
      ) : (
        <ul className="divide-y divide-etyme-rule">
          {data.ours.map((w) => (
            <li key={w.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] text-etyme-ink">
                {w.says}
                <span className="block text-[11px] text-etyme-faint">Asked by {w.writtenBy} on {formatDay(w.createdAt)}</span>
              </span>
              {data.mayWrite && (
                <button onClick={() => close(w.id)} className="text-[12px] text-etyme-action hover:underline">Stop asking</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!data.mayWrite && data.writeSays && <p className="text-[12px] text-etyme-muted mt-2">{data.writeSays}</p>}

      {open && (
        <form onSubmit={save} className="mt-4 space-y-3 border-t border-etyme-rule pt-4">
          {error && <p role="alert" className="text-sm text-etyme-danger">{error}</p>}
          <div>
            <label htmlFor="want-skills" className={label}>Skills you need *</label>
            <input id="want-skills" className={box} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Separate skills with commas" />
          </div>
          <div>
            <label htmlFor="want-places" className={label}>Places</label>
            <input id="want-places" className={box} value={places} onChange={(e) => setPlaces(e.target.value)} placeholder="Wichita, KS; Remote — a semicolon between places. Blank means any place." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="want-min" className={label}>Lowest rate you pay ($ an hour)</label>
              <input id="want-min" type="number" min="0" step="0.01" className={`${box} tabular-nums`} value={min} onChange={(e) => setMin(e.target.value)} />
            </div>
            <div>
              <label htmlFor="want-max" className={label}>Highest rate you pay ($ an hour)</label>
              <input id="want-max" type="number" min="0" step="0.01" className={`${box} tabular-nums`} value={max} onChange={(e) => setMax(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="want-desk" className={label}>Who receives offers</label>
            <select id="want-desk" className={`${box} bg-white`} value={desk} onChange={(e) => setDesk(e.target.value)}>
              <option value="">Whoever reads Partner bench</option>
              <optgroup label="A desk">
                {data.desks.roles.map((r) => <option key={r.id} value={`role:${r.id}`}>{r.name}</option>)}
              </optgroup>
              <optgroup label="A person">
                {data.desks.people.map((p) => <option key={p.id} value={`person:${p.id}`}>{p.name}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setOpen(false); setError(null) }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Saving…' : 'Ask partners'}</button>
          </div>
        </form>
      )}
    </section>
  )
}

/** At the top of Our bench: what the firms we trade with are asking for. */
export function WhatPartnersNeed() {
  const { data } = useWants()
  if (!data || data.partners.length === 0) return null
  return (
    <section className="panel mb-6" aria-labelledby="what-partners-need">
      <h2 id="what-partners-need" className="headline-serif text-lg text-etyme-ink">What partners need</h2>
      <p className="text-[12px] text-etyme-muted mb-2">Asked by firms you trade with. People you show to partners reach them on their Partner bench.</p>
      <ul className="divide-y divide-etyme-rule">
        {data.partners.map((w) => (
          <li key={w.id} className="py-2 text-[13px] text-etyme-ink">
            <span className="font-medium">{w.firm}</span> · {w.says}
          </li>
        ))}
      </ul>
    </section>
  )
}
