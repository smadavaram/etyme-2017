'use client'

import { readJson, statusMeans } from '@/lib/read-response'
import { Chip, Lbl, SubmitButton, FormMessage, RefusedState, LoadingState, ErrorState } from '@/components/ui'
import { DetailHead } from '@/components/ui/detail-head'
import { usePageSection } from '@/components/page-section'
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
  tenure: { months: number; capMonths: number | null; headroomMonths: number | null; status: string; eligibleDate: string | null; runsPast?: string[] }
  engagements: { contractId: string; supplier: { id: string; name: string }; state: string; startDate: string; endDate: string | null; rateCents: number | null }[]
  /** Every firm they have been here through, on one line. */
  firms?: { parts: string[]; says: string; withheld: number }
  submissions: {
    id: string; supplier: { id: string; name: string }; role: string; requirementId: string; rateCents: number | null; at: string; status: string; cleared: boolean | null
    interviews: { id: string; round: number; state: string; at: string | null }[]
  }[]
  spread: { lowCents: number; highCents: number } | null
  paperwork: { type: string; status: string; expiresAt: string | null; verifiedAt: string | null }[]
  representedBy: { id: string; name: string; how: 'bench' | 'submitted' }[]
  askGoesTo: { firms: { id: string; name: string }[]; throughAPrime: boolean; says: string }
  openRequirements: { id: string; title: string }[]
  alreadyOn: string[]
  asks: { id: string; at: string; by: string; supplier: string; role: string; requirementId: string | null; conversationId: string }[]
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
  const section = usePageSection('/dashboard/people')
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Person | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The route's sentence when this person was never put in front of this
  // company, or the seat may not read them. Drawn alone.
  const [refused, setRefused] = useState<string | null>(null)
  const [requirementId, setRequirementId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/people/${id}`)
      if (res.status === 403 || res.status === 404) {
        const said = await res.json().catch(() => ({}))
        setRefused(said?.error?.message ?? statusMeans(res.status))
        return
      }
      const body = await readJson(res)
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
      load()
    } catch (err: any) {
      setSaid({ text: err.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (refused) return <RefusedState says={refused} />
  if (error) return <ErrorState says={error} action={{ label: 'Try again', onClick: () => { setError(null); load() } }} />
  if (!data) return <LoadingState says="Opening their page…" />
  const { person, tenure } = data

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      {/* The eyebrow is the section Contractors sits under on the reader's
          own menu; the way back is offered only where that menu has it. */}
      <DetailHead
        from="/dashboard/people"
        back={section ? { href: '/dashboard/people', label: 'Contractors' } : undefined}
        title={<span className="inline-flex items-center gap-3">
          {person.name}
          <Star on={data.favorite} onClick={star} name={person.name} />
        </span>}
        subtitle={<>
          {['Contractor', ...([person.headline, person.location, person.workAuth ? `work authorization ${person.workAuth}` : null].filter(Boolean) as string[])].join(' · ')}{!person.headline && !person.location && !person.workAuth ? ' · No profile on file yet.' : ''}
        </>}
        meta={(data.onSite || data.blocked || data.favorite) ? <>
          {data.onSite && <Chip tone="verified">On site</Chip>}
          {data.blocked && <Chip tone="attention">Blocked</Chip>}
          {data.favorite && <Chip tone="action">Take again</Chip>}
        </> : undefined}
      >
        {person.skills.length > 0 && <p className="mt-1 text-[12px] text-etyme-faint">{person.skills.join(' · ')}</p>}
      </DetailHead>

      <p className={`border-b border-etyme-rule pb-4 text-[14px] ${data.blocked || tenure.status === 'BREAK_REQUIRED' ? 'text-etyme-attention' : 'text-etyme-ink'}`}>{data.says}</p>

      {/* ── Ask for this person ─────────────────────────────────────── */}
      <section className="panel space-y-3">
        <Lbl>Ask for this person</Lbl>
        {data.blocked ? (
          <p className="text-[13px] text-etyme-muted">{person.name} is blocked here — {data.blocked.reason}. Lift the block on the Blocked list first.</p>
        ) : data.askGoesTo.firms.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">{data.askGoesTo.says}</p>
        ) : data.openRequirements.length === 0 ? (
          <p className="text-[13px] text-etyme-muted">
            {data.alreadyOn.length > 0
              ? `${person.name.split(' ')[0]} is already submitted to ${data.alreadyOn.join(' and ')} — read them in Submissions. `
              : 'Nothing is published to ask for them on. '}
            <Link href={{ pathname: '/dashboard/requisitions' }} className="text-etyme-action hover:underline">Post a job request</Link>, and it will be here.
          </p>
        ) : (
          <>
            {/* Where the ask actually goes — the rung this client pays,
                decided server-side by the same rule the route uses. A
                firm below it is reached by its own prime, never from
                here, so this sentence never names one. */}
            <p className="text-[13px] text-etyme-muted">{data.askGoesTo.says}</p>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Job request" value={requirementId} onChange={(e) => setRequirementId(e.target.value)} className="input w-auto">
                {data.openRequirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
              <input aria-label="A line for the supplier (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="A line for the supplier (optional)" className="input flex-1 min-w-[200px]" />
              <SubmitButton type="button" onClick={ask} pending={busy} pendingLabel="Asking…" disabled={!requirementId}>
                Ask for them
              </SubmitButton>
            </div>
          </>
        )}
        {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}
        {data.asks.length > 0 && (
          <ul className="border-t border-etyme-rule pt-3 space-y-1">
            {data.asks.map((a) => (
              <li key={a.id} className="text-[12.5px] text-etyme-muted">
                {when(a.at)} — {a.by} asked {a.supplier} for {person.name.split(' ')[0]} on {a.role}.{' '}
                <Link href={{ pathname: '/dashboard/conversations', query: { open: a.conversationId } }} className="text-etyme-action hover:underline">The thread</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* ── Tenure ── */}
        <section className="panel">
          <Lbl>Time here, across every supplier</Lbl>
          <p className="mt-1 font-serif text-[28px] leading-none text-etyme-ink tabular-nums">{tenure.months}<span className="ml-1 text-[13px] font-sans text-etyme-muted">months{tenure.capMonths ? ` of ${tenure.capMonths}` : ''}</span></p>
          <p className={`mt-2 text-[13px] ${tenure.status === 'BREAK_REQUIRED' || tenure.status === 'WARNING' ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
            {TENURE_WORD[tenure.status] ?? tenure.status}
            {tenure.headroomMonths != null && tenure.status !== 'BREAK_REQUIRED' && (tenure.headroomMonths === 0 && tenure.status === 'WARNING' ? ' · less than a month of headroom' : ` · ${tenure.headroomMonths} months of headroom`)}
            {tenure.eligibleDate && ` · can come back ${tenure.eligibleDate}`}
          </p>
          {/* A live contract booked past the day the limit is reached, in
              the tenure page's own sentence (`runsPastSentence`). */}
          {(tenure.runsPast ?? []).map((line) => (
            <p key={line} className="mt-2 text-[13px] text-etyme-attention">{line}</p>
          ))}
          <Link href={{ pathname: '/dashboard/tenure' }} className="mt-2 inline-block text-[12px] text-etyme-action hover:underline">Everybody’s tenure</Link>
        </section>

        {/* ── Represented by ── */}
        <section className="panel">
          <Lbl>Who can put them forward</Lbl>
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
        <Lbl>Engagements here</Lbl>
        {data.engagements.length === 0 && <p className="mt-1 text-[13px] text-etyme-muted">Never on site here.</p>}
        {/* One line for the firms, above the rows. A prime is named once
            here rather than once by name and once as "Supplied through"
            itself, and the firms below it are counted without being
            named — that name is the prime's to keep. */}
        {data.firms && data.firms.parts.length > 0 && (
          <p className="mt-1 text-[13px] text-etyme-muted">
            Here through {data.firms.says}.
          </p>
        )}
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
        <Lbl>Every submission</Lbl>
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
        <Lbl>Paperwork</Lbl>
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
