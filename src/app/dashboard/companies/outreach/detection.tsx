'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { EmptyState, Field, FormMessage, Input, Panel, Select, SubmitButton } from '@/components/ui'

/**
 * Advanced outreach, detection (record 135), on Companies, Outreach until its
 * own site is built. Save a segment, propose a pack, look for what fired, and
 * read the Owner's results. Nothing here sends: a pack's letters go only after
 * one person's yes on the pack's card, and a push no approved pack covers waits
 * as a card.
 */

interface Segment { id: string; name: string; says: string }
interface Pack { id: string; name: string; state: string; contentKinds: string[]; pushes: number; letters: number; sent: number }
interface Firing { id: string; words: string; reason: string; state: string; pushes: { id: string; contentLabel: string; subject: string; state: string }[] }
interface Figure { value: number | null; missing: string | null }
interface Results { qualifiedResumes: number; claimedAfterLetter: number; perQualifiedResume: Figure; perActivatedTenant: Figure }

const PACK_STATE: Record<string, string> = { DRAFT: 'Draft', PROPOSED: 'Waiting for a yes', APPROVED: 'Approved', CLOSED: 'Closed' }
const PUSH_STATE: Record<string, string> = { DRAFTED: 'Drafted', QUEUED: 'In an approved pack', WAITING: 'Waiting for you', SENT: 'Sent', DROPPED: 'Not sent' }
const KINDS = [['COURSE', 'A course'], ['POD_OFFER', 'A team offer'], ['OUTCOME_PROOF', 'Outcome proof']] as const
const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`

export function DetectionPanel() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [firings, setFirings] = useState<Firing[]>([])
  const [results, setResults] = useState<Results | null>(null)
  const [error, setError] = useState<{ field?: string; says: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [seg, setSeg] = useState({ name: '', role: 'CLIENT', skills: '', location: '', stage: '', quietForDays: '' })
  const [pack, setPack] = useState({ name: '', segmentId: '', kinds: ['COURSE'] as string[] })

  const load = useCallback(async () => {
    try {
      const [s, p, d] = await Promise.all([readJson(await fetch('/api/outreach/segments')), readJson(await fetch('/api/outreach/packs')), readJson(await fetch('/api/outreach/detection'))])
      setSegments(s.data.segments); setPacks(p.data.packs); setFirings(d.data.firings); setResults(d.data.results)
    } catch (err: any) { setError({ says: err.message }) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function post(url: string, body: unknown, key: string, done: (d: any) => string) {
    setBusy(key); setError(null); setNote(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const out = await res.json().catch(() => null)
      if (!res.ok) { setError({ field: out?.error?.field, says: out?.error?.message ?? 'That did not go through.' }); return }
      setNote(done(out.data)); await load()
    } catch (err: any) { setError({ says: err.message }) } finally { setBusy(null) }
  }
  const mine = (f: string) => (error?.field === f ? error.says : undefined)

  return (
    <div className="mt-10 border-t border-etyme-rule pt-6">
      <h2 className="headline-serif text-[24px]">Advanced outreach: detection</h2>
      <p className="mt-1 text-[13px] text-etyme-muted">
        Etyme watches your own record for a reason to write, drafts the letter, and holds it. A letter leaves only inside a pack that one person approved. Its own site is not built yet, so this is where it lives.
      </p>
      {error && !error.field && <div className="mt-3"><FormMessage tone="error">{error.says}</FormMessage></div>}
      {note && <div className="mt-3"><FormMessage tone="ok">{note}</FormMessage></div>}

      <Panel className="mt-4">
        <h3 className="headline-serif text-[18px]">Segments</h3>
        <p className="mt-1 text-[12px] text-etyme-muted">A saved question, not a list. Only people who agreed to hear from you are ever in one.</p>
        {segments.length === 0 ? <p className="mt-2 text-[13px] text-etyme-muted">No segment yet. Save one below.</p> : (
          <ul className="mt-2 divide-y divide-etyme-rule text-[13px]">{segments.map((s) => <li key={s.id} className="py-2"><span className="text-etyme-ink">{s.name}</span> <span className="text-etyme-muted">{s.says}</span></li>)}</ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name" error={mine('name')}><Input value={seg.name} onChange={(e) => setSeg({ ...seg, name: e.target.value })} /></Field>
          <Field label="Who">
            <Select value={seg.role} onChange={(e) => setSeg({ ...seg, role: e.target.value })}>
              <option value="CLIENT">Clients</option><option value="PARTNER">Partners</option><option value="CANDIDATE">Candidates</option>
            </Select>
          </Field>
          {seg.role === 'CANDIDATE' && <Field label="Skills" help="Any one of these, separated by commas." error={mine('skills')}><Input value={seg.skills} onChange={(e) => setSeg({ ...seg, skills: e.target.value })} /></Field>}
          <Field label="Place" help="Part of the place name." error={mine('location')}><Input value={seg.location} onChange={(e) => setSeg({ ...seg, location: e.target.value })} /></Field>
          <Field label="Stage" error={mine('stage')}>
            <Select value={seg.stage} onChange={(e) => setSeg({ ...seg, stage: e.target.value })}>
              <option value="">Any</option>
              {seg.role === 'CANDIDATE'
                ? <><option value="KEPT">On your list</option><option value="TRAINING">In a course of yours</option><option value="FINISHED">Finished a course of yours</option></>
                : <><option value="ACTIVE">Working with you now</option><option value="DORMANT">Gone quiet</option></>}
            </Select>
          </Field>
          <Field label="Quiet for at least (days)" error={mine('quietForDays')}><Input inputMode="numeric" value={seg.quietForDays} onChange={(e) => setSeg({ ...seg, quietForDays: e.target.value })} /></Field>
        </div>
        <div className="mt-3">
          <SubmitButton type="button" tone="secondary" pending={busy === 'segment'} onClick={() => post('/api/outreach/segments', {
            name: seg.name, role: seg.role, skills: seg.skills.split(',').map((s) => s.trim()).filter(Boolean), location: seg.location || null, stage: seg.stage || null,
            quietForDays: seg.quietForDays ? Number(seg.quietForDays) : null,
          }, 'segment', () => `Saved the segment ${seg.name}.`)}>Save the segment</SubmitButton>
        </div>
      </Panel>

      <Panel className="mt-4">
        <h3 className="headline-serif text-[18px]">Packs</h3>
        <p className="mt-1 text-[12px] text-etyme-muted">One yes releases one pack. It writes to one segment and carries the kinds you choose.</p>
        {packs.length === 0 ? <p className="mt-2 text-[13px] text-etyme-muted">No pack yet.</p> : (
          <ul className="mt-2 divide-y divide-etyme-rule text-[13px]">
            {packs.map((p) => <li key={p.id} className="flex justify-between gap-3 py-2"><span className="text-etyme-ink">{p.name}</span><span className="text-etyme-muted">{PACK_STATE[p.state] ?? p.state} · {p.letters} queued · {p.sent} sent</span></li>)}
          </ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name" error={mine('name')}><Input value={pack.name} onChange={(e) => setPack({ ...pack, name: e.target.value })} /></Field>
          <Field label="Segment" error={mine('segmentId')}>
            <Select value={pack.segmentId} onChange={(e) => setPack({ ...pack, segmentId: e.target.value })}>
              <option value="">Choose</option>{segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        <fieldset className="mt-3 text-[13px]">
          <legend className="text-etyme-ink">It may carry</legend>
          {KINDS.map(([k, label]) => (
            <label key={k} className="mr-4 inline-flex items-center gap-1">
              <input type="checkbox" checked={pack.kinds.includes(k)} onChange={(e) => setPack({ ...pack, kinds: e.target.checked ? [...pack.kinds, k] : pack.kinds.filter((x) => x !== k) })} /> {label}
            </label>
          ))}
          {mine('contentKinds') && <p className="text-[12px] text-etyme-danger">{mine('contentKinds')}</p>}
        </fieldset>
        <div className="mt-3">
          <SubmitButton type="button" tone="secondary" pending={busy === 'pack'} onClick={() => post('/api/outreach/packs', { name: pack.name, segmentId: pack.segmentId, contentKinds: pack.kinds }, 'pack', () => `Asked for a yes on the pack ${pack.name}. Nothing is sent until it is given.`)}>Ask for a yes on this pack</SubmitButton>
        </div>
      </Panel>

      <Panel className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="headline-serif text-[18px]">What fired</h3>
          <SubmitButton type="button" tone="secondary" pending={busy === 'scan'} onClick={() => post('/api/outreach/detection', {}, 'scan', (d) => d.fired.length ? `${d.fired.length} new. ${d.queued} in an approved pack, ${d.waiting} waiting for you.` : 'Nothing new on your record.')}>Look now</SubmitButton>
        </div>
        {firings.length === 0 ? <EmptyState compact says="Nothing has fired yet." detail="Etyme looks at your teams, courses, open jobs, bench and contracts. A reason appears here when one matters." /> : (
          <ul className="mt-2 divide-y divide-etyme-rule text-[13px]">
            {firings.map((f) => (
              <li key={f.id} className="py-2">
                <div><span className="text-etyme-ink">{f.words}.</span> <span className="text-etyme-muted">{f.reason}</span></div>
                {f.pushes.length === 0 && <div className="text-etyme-muted">No letter drafted: no saved segment or nothing of yours fits.</div>}
                {f.pushes.map((p) => <div key={p.id} className="text-etyme-muted">{p.contentLabel}: “{p.subject}” · {PUSH_STATE[p.state] ?? p.state}</div>)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {results && (
        <Panel className="mt-4">
          <h3 className="headline-serif text-[18px]">Results</h3>
          <dl className="mt-2 space-y-3 text-[13px]">
            <div><dt className="text-etyme-ink">Cost per qualified, consented resume</dt><dd className="text-etyme-muted">{results.perQualifiedResume.value !== null ? dollars(results.perQualifiedResume.value) : results.perQualifiedResume.missing} ({results.qualifiedResumes} so far)</dd></div>
            <div><dt className="text-etyme-ink">Cost per activated tenant</dt><dd className="text-etyme-muted">{results.perActivatedTenant.value !== null ? dollars(results.perActivatedTenant.value) : results.perActivatedTenant.missing} ({results.claimedAfterLetter} companies written to later claimed an account)</dd></div>
          </dl>
        </Panel>
      )}
    </div>
  )
}
