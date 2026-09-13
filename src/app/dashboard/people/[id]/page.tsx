'use client'

import { readJson } from '@/lib/read-response'
import { Star } from '@/components/network-view'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

/**
 * One person, as this client knows them.
 *
 * The register row, opened up: where they are today, their time here
 * across every supplier against the cap, every submission and what
 * each firm asked, the interviews, the paperwork, and who can put them
 * forward. And the one thing a hiring manager wants to do with somebody
 * they starred: ask for them. The ask goes to the supplier, never the
 * consultant — Etyme places nobody.
 */

interface Person {
  person: { id: string; name: string; headline: string | null; skills: string[]; location: string | null; workAuth: string | null }
  favorite: boolean
  blocked: { reason: string; at: string } | null
  onSite: boolean
  says: string
  tenure: { months: number; capMonths: number | null; headroomMonths: number | null; status: string; eligibleDate: string | null }
  engagements: { contractId: string; supplier: { id: string; name: string }; state: string; startDate: string; endDate: string | null; rateCents: number | null }[]
  submissions: {
    id: string; supplier: { id: string; name: string }; role: string; requirementId: string; rateCents: number | null; at: string; status: string; cleared: boolean | null
    interviews: { id: string; round: number; state: string; at: string | null }[]
  }[]
  spread: { lowCents: number; highCents: number } | null
  paperwork: { type: string; status: string; expiresAt: string | null; verifiedAt: string | null }[]
  representedBy: { id: string; name: string; how: 'bench' | 'submitted' }[]
  openRequirements: { id: string; title: string }[]
  alreadyOn: string[]
}

const TENURE_WORD: Record<string, string> = {
  OK: 'Inside the cap', WARNING: 'Near the cap', BREAK_REQUIRED: 'Past the cap', IN_BREAK: 'In a break', ELIGIBLE: 'Can come back',
}
const PAPER_WORD: Record<string, string> = {
  I9_EVERIFY: 'I-9 and E-Verify', BACKGROUND_CHECK: 'Background check', EDUCATION_EVALUATION: 'Education evaluation',
  DRUG_SCREENING: 'Drug screening', REFERENCE_CHECK: 'References', BUSINESS_PARTNER: 'Business partner check',
}
const STATE_WORD: Record<string, string> = {
  IN_PROGRESS: 'On site', ENDED: 'Ended', PAUSED: 'Paused', DRAFT: 'Not started', VERIFIED: 'Starting', PENDING_VERIFICATION: 'Starting',
}

const money = (c: number | null) => (c == null ? '—' : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}/hr`)
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

export default function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Person | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requirementId, setRequirementId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch(`/api/people/${id}`))
      setData(body.data)
      setRequirementId((cur) => cur || body.data.openRequirements[0]?.id || '')
    } catch (err: any) {
      setError(err.message)
    }
  }, [id])
  useEffect(() => { load() }, [load])

  async function star() {
    if (!data) return
    const on = !data.favorite
    setData({ ...data, favorite: on })
    try {
      await readJson(await fetch('/api/favorites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetType: 'PERSON', targetId: id, on }) }))
    } catch (err: any) {
      setData({ ...data, favorite: !on }); setSaid({ text: err.message, tone: 'error' })
    }
  }

  async function ask() {
    setBusy(true); setSaid(null)
    try {
      const body = await readJson(await fetch(`/api/people/${id}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirementId, note }) }))
      setSaid({ text: body.data.says, tone: 'ok' }); setNote('')
    } catch (err: any) {
      setSaid({ text: err.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="mx-auto max-w-[900px] px-4 py-6"><div className="panel"><p className="text-[13px] text-etyme-attention">{error}</p></div></div>
  if (!data) return <div className="mx-auto max-w-[900px] px-4 py-6 text-[13px] text-etyme-muted">Reading…</div>
  const { person, tenure } = data

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <p className="text-[12px]"><Link href={{ pathname: '/dashboard/people' }} className="text-etyme-action hover:underline">← Contractors</Link></p>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Network · Contractor</p>
          <h1 className="headline-serif text-[30px] leading-tight flex items-center gap-3">
            {person.name}
            <Star on={data.favorite} onClick={star} name={person.name} />
          </h1>
          <p className="mt-1 text-[13px] text-etyme-muted">
            {[person.headline, person.location, person.workAuth ? `work authorization ${person.workAuth}` : null].filter(Boolean).join(' · ') || 'No profile on file yet.'}
          </p>
          {person.skills.length > 0 && <p className="mt-1 text-[12px] text-etyme-faint">{person.skills.join(' · ')}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {data.onSite && <span className="chip chip--verified">On site</span>}
          {data.blocked && <span className="chip chip--attention">Blocked</span>}
          {data.favorite && <span className="chip chip--action">Take again</span>}
        </div>
      </header>

      <p className={`border-b border-etyme-rule pb-4 text-[14px] ${data.blocked || tenure.status === 'BREAK_REQUIRED' ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{data.says}</p>

      {/* ── Ask for this person ─────────────────────────────────────── */}
      <section className="panel space-y-3">
        <p className="stat-label">Ask for this person</p>
        {data.blocked ? (
          <p className="text-[13px] text-etyme-muted">{person.name} is blocked here — {data.blocked.reason}. Lift the block on the Blocked list first.</p>
        ) : data.representedBy.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">No supplier can put {person.name} forward yet. When one lists them on its bench, the ask goes to that firm.</p>
        ) : data.openRequirements.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">
            {data.alreadyOn.length > 0
              ? `${person.name.split(' ')[0]} is already submitted to ${data.alreadyOn.join(' and ')} — read them in Submissions. `
              : 'Nothing is published to ask for them on. '}
            <Link href={{ pathname: '/dashboard/requisitions' }} className="text-etyme-action hover:underline">Post a requirement</Link>, and it will be here.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-etyme-muted">
              The ask goes to {data.representedBy.map((r) => r.name).join(' and ')}, who {data.representedBy.length === 1 ? 'represents' : 'represent'} {person.name.split(' ')[0]}; they submit, and it lands in Submissions like any other.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Requirement" value={requirementId} onChange={(e) => setRequirementId(e.target.value)} className="rounded border border-etyme-rule bg-etyme-raised px-3 py-2 text-[13px]">
                {data.openRequirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A line for the supplier (optional)" className="flex-1 min-w-[200px] rounded border border-etyme-rule px-3 py-2 text-[13px]" />
              <button onClick={ask} disabled={busy || !requirementId} className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                {busy ? 'Asking…' : 'Ask for them'}
              </button>
            </div>
          </>
        )}
        {said && <p className={`text-[13px] ${said.tone === 'ok' ? 'text-etyme-verified' : 'text-etyme-attention'}`}>{said.text}</p>}
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* ── Tenure ── */}
        <section className="panel">
          <p className="stat-label">Time here, across every supplier</p>
          <p className="mt-1 font-serif text-[28px] leading-none text-etyme-ink tabular-nums">{tenure.months}<span className="ml-1 text-[13px] font-sans text-etyme-muted">months{tenure.capMonths ? ` of ${tenure.capMonths}` : ''}</span></p>
          <p className={`mt-2 text-[13px] ${tenure.status === 'BREAK_REQUIRED' || tenure.status === 'WARNING' ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
            {TENURE_WORD[tenure.status] ?? tenure.status}
            {tenure.headroomMonths != null && tenure.status !== 'BREAK_REQUIRED' && ` · ${tenure.headroomMonths} months of headroom`}
            {tenure.eligibleDate && ` · can come back ${tenure.eligibleDate}`}
          </p>
          <Link href={{ pathname: '/dashboard/tenure' }} className="mt-2 inline-block text-[12px] text-etyme-action hover:underline">Everybody’s tenure</Link>
        </section>

        {/* ── Represented by ── */}
        <section className="panel">
          <p className="stat-label">Who can put them forward</p>
          {data.representedBy.length === 0 && <p className="mt-1 text-[13px] text-etyme-muted">Nobody yet.</p>}
          <ul className="mt-1 space-y-1">
            {data.representedBy.map((r) => (
              <li key={r.id} className="text-[13px] text-etyme-ink">{r.name} <span className="text-etyme-faint">· {r.how === 'bench' ? 'on their bench, with consent' : 'submitted them here'}</span></li>
            ))}
          </ul>
          {data.spread && <p className="mt-2 text-[12px] text-etyme-muted">Asked between {money(data.spread.lowCents)} and {money(data.spread.highCents)} across suppliers.</p>}
        </section>
      </div>

      {/* ── Engagements here ── */}
      <section className="panel">
        <p className="stat-label">Engagements here</p>
        {data.engagements.length === 0 && <p className="mt-1 text-[13px] text-etyme-muted">Never on site here.</p>}
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-[13px]">
            <tbody>
              {data.engagements.map((e) => (
                <tr key={e.contractId} className="border-b border-etyme-rule last:border-0">
                  <td className="py-1.5 pr-3 text-etyme-ink">{e.supplier.name}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-etyme-muted">{when(e.startDate)} – {e.endDate ? when(e.endDate) : 'open'}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-etyme-muted">{money(e.rateCents)}</td>
                  <td className="py-1.5 text-right"><span className={`chip ${e.state === 'IN_PROGRESS' ? 'chip--verified' : 'chip--passive'}`}>{STATE_WORD[e.state] ?? e.state.toLowerCase()}</span></td>
                  <td className="py-1.5 pl-3 text-right"><Link href={{ pathname: `/dashboard/placements/${e.contractId}` }} className="text-[12px] text-etyme-action hover:underline">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Submissions ── */}
      <section className="panel">
        <p className="stat-label">Every submission</p>
        {data.submissions.length === 0 && <p className="mt-1 text-[13px] text-etyme-muted">Never submitted here.</p>}
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-[13px]">
            <tbody>
              {data.submissions.map((s) => (
                <tr key={s.id} className="border-b border-etyme-rule last:border-0 align-top">
                  <td className="py-1.5 pr-3 text-etyme-ink">{s.supplier.name}</td>
                  <td className="py-1.5 pr-3 text-etyme-muted"><Link href={{ pathname: `/dashboard/requisitions/${s.requirementId}` }} className="hover:underline">{s.role}</Link></td>
                  <td className="py-1.5 pr-3 tabular-nums text-etyme-muted">{money(s.rateCents)}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-etyme-faint">{when(s.at)}</td>
                  <td className="py-1.5 text-right text-etyme-faint">
                    {s.status.toLowerCase().replace(/_/g, ' ')}
                    {s.cleared === false && ' · held back'}
                    {s.interviews.length > 0 && ` · ${s.interviews.length} interview${s.interviews.length === 1 ? '' : 's'}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Paperwork ── */}
      <section className="panel">
        <p className="stat-label">Paperwork</p>
        {data.paperwork.length === 0 && <p className="mt-1 text-[13px] text-etyme-muted">Nothing on file yet. The supplier collects it before a start.</p>}
        <ul className="mt-2 space-y-1">
          {data.paperwork.map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
              <span className="text-etyme-ink">{PAPER_WORD[p.type] ?? p.type.toLowerCase().replace(/_/g, ' ')}</span>
              <span className={`text-[12px] ${p.status === 'CLEAR' ? 'text-etyme-verified' : p.status === 'EXPIRED' || p.status === 'FAILED' ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
                {p.status.toLowerCase().replace(/_/g, ' ')}{p.expiresAt ? ` · runs out ${when(p.expiresAt)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
