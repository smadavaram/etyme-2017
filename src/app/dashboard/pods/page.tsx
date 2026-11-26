'use client'

import { useCallback, useEffect, useState } from 'react'
import { pickerLabels } from '@/lib/training'
import { amount } from '@/lib/money-display'
import { usePageSection } from '@/components/page-section'
import { RefusedState, LoadingState } from '@/components/ui'

/**
 * Project teams (record 120): the firm's named teams, their roles and who
 * is on each. A plugin. While it is off the page draws the route's own
 * sentence and nothing else. Every button is drawn only where its route
 * will take it: the route says so in `mayWrite`. "Pod" is a machine name
 * and never appears here.
 */

interface Member { memberId: string; personId: string; name: string; email: string | null }
interface Role { id: string; title: string; headcount: number; rateCents: number | null; members: Member[] }
interface Team {
  id: string; name: string; description: string | null; pricing: string
  sprintPriceCents: number | null; sprintWeeks: number | null; currency: string
  archivedAt: string | null; headcount: number; filled: number; roles: Role[]
}
interface Project { id: string; podId: string; name: string; clientName: string | null; open: boolean }
interface MarginRead { marginCents: number | null; earnedRevenueCents: number; unknownSays: string[]; currency: string }
interface Person { personId: string; name: string; email: string | null; kind: 'EMPLOYEE' | 'BENCH' }

const field = 'rounded-md border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-sm text-etyme-ink w-full sm:w-auto'
const label = 'block text-[11px] text-etyme-muted mb-1'

const priceSays = (t: Team) =>
  t.pricing === 'SPRINT_PRICE'
    ? t.sprintPriceCents != null && t.sprintWeeks != null
      ? `${amount(t.sprintPriceCents, t.currency)} for ${t.sprintWeeks} ${t.sprintWeeks === 1 ? 'week' : 'weeks'}`
      : 'No price yet'
    : 'Rate card: each role has its own rate'

export default function ProjectTeamsPage() {
  const section = usePageSection('/dashboard/pods')
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  // Filled only for a project whose margin route said yes: a seat it refuses draws no margin at all.
  const [margins, setMargins] = useState<Record<string, MarginRead>>({})
  const [mayWrite, setMayWrite] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', pricing: 'SPRINT_PRICE', price: '', weeks: '' })
  const [roleForm, setRoleForm] = useState<Record<string, { title: string; headcount: string; rate: string }>>({})
  const [pick, setPick] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/pods')
    const body = await res.json().catch(() => ({}))
    if (res.status === 403) { setRefused(body.error?.message ?? 'This page is not part of your seat.'); return }
    if (!res.ok) { setErr(body.error?.message ?? 'The teams could not be read.'); return }
    setRefused(null)
    setTeams(body.data.teams)
    setPeople(body.data.people)
    setMayWrite(Boolean(body.data.mayWrite))
    const sold: Project[] = body.data.projects ?? []
    setProjects(sold)
    const got: Record<string, MarginRead> = {}
    await Promise.all(sold.map(async (p) => {
      const r = await fetch(`/api/pods/projects/${p.id}/margin`)
      if (r.ok) { const d = (await r.json().catch(() => ({}))).data; if (d?.margin) got[p.id] = { ...d.margin, unknownSays: d.unknownSays ?? [] } }
    }))
    setMargins(got)
  }, [])
  useEffect(() => { load() }, [load])

  async function send(method: string, url: string, payload?: unknown): Promise<boolean> {
    setSaid(null); setErr(null)
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(body.error?.message ?? 'That did not save.'); return false }
    setSaid(body.data?.says ?? 'Saved.')
    await load()
    return true
  }

  if (refused) return <RefusedState says={refused} />
  if (!teams) return err ? <RefusedState says={err} /> : <LoadingState says="Reading the teams…" />

  const labels = pickerLabels(people)
  const dollarsToCents = (v: string) => Math.round(Number(v) * 100)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const sprint = form.pricing === 'SPRINT_PRICE'
    const ok = await send('POST', '/api/pods', {
      name: form.name, pricing: form.pricing,
      ...(sprint ? { sprintPriceCents: dollarsToCents(form.price), sprintWeeks: Number(form.weeks) } : {}),
    })
    if (ok) setForm({ name: '', pricing: 'SPRINT_PRICE', price: '', weeks: '' })
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head mb-6">
        {section && <p className="eyebrow">{section}</p>}
        <h1>Project teams</h1>
        <p>Named teams you can sell as a project: the roles, who fills each one, and the price. Only your own employees and people on your bench, with their yes, can be on a team.</p>
      </div>

      {said && <p role="status" className="mb-3 text-sm text-etyme-verified">{said}</p>}
      {err && <p role="alert" className="mb-3 text-sm text-etyme-attention">{err}</p>}

      {mayWrite && (
        <form onSubmit={create} className="panel mb-6 flex flex-wrap items-end gap-3">
          <label className="w-full sm:w-56"><span className={label}>Team name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={`${field} w-full`} /></label>
          <label><span className={label}>Price</span>
            <select value={form.pricing} onChange={(e) => setForm({ ...form, pricing: e.target.value })} className={field}>
              <option value="SPRINT_PRICE">One price for a sprint</option>
              <option value="RATE_CARD">Rate card</option>
            </select></label>
          {form.pricing === 'SPRINT_PRICE' && (
            <>
              <label><span className={label}>Price, in dollars</span>
                <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required inputMode="decimal" className={`${field} w-28`} /></label>
              <label><span className={label}>Weeks</span>
                <input value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })} required inputMode="numeric" className={`${field} w-20`} /></label>
            </>
          )}
          <button type="submit" className="btn-primary">Create team</button>
        </form>
      )}

      {teams.length === 0 && <p className="text-sm text-etyme-muted">No teams yet.{mayWrite ? ' Create one above, then give it roles.' : ''}</p>}

      <div className="space-y-4">
        {teams.map((t) => {
          const rf = roleForm[t.id] ?? { title: '', headcount: '1', rate: '' }
          return (
            <section key={t.id} className="panel" aria-label={t.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-medium text-etyme-ink">{t.name}{t.archivedAt && <span className="ml-2 text-xs text-etyme-faint">Archived</span>}</h2>
                <span className="text-[11px] text-etyme-faint tabular-nums">{t.filled} of {t.headcount} filled</span>
              </div>
              <p className="text-sm text-etyme-muted mb-3">{priceSays(t)}</p>

              {projects.filter((p) => p.podId === t.id).map((p) => {
                const m = margins[p.id]
                return (
                  <div key={p.id} className="mb-3 rounded-md border border-etyme-rule px-3 py-2 text-sm" aria-label={`Project ${p.name}`}>
                    <p className="text-etyme-ink">Sold to {p.clientName ?? 'a client'} <span className="text-etyme-muted">· {p.open ? 'in progress' : 'fulfilled'}</span></p>
                    {m && (m.marginCents !== null
                      ? <p className="text-etyme-muted tabular-nums">Earned margin {amount(m.marginCents, m.currency)} on {amount(m.earnedRevenueCents, m.currency)} accepted</p>
                      : m.unknownSays.map((u) => <p key={u} className="text-etyme-muted">{u}</p>))}
                  </div>
                )
              })}

              {t.roles.length === 0 && <p className="text-sm text-etyme-muted mb-3">No roles yet.</p>}
              <div className="divide-y divide-etyme-rule mb-3">
                {t.roles.map((r) => (
                  <div key={r.id} className="py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm text-etyme-ink">{r.title} <span className="text-etyme-muted">· {r.members.length} of {r.headcount}{r.rateCents != null ? ` · ${amount(r.rateCents, t.currency)} an hour` : ''}</span></p>
                      {mayWrite && r.members.length === 0 && (
                        <button onClick={() => send('DELETE', `/api/pods/${t.id}?roleId=${r.id}`)} className="text-xs text-etyme-action hover:underline">Remove role</button>
                      )}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {r.members.map((m) => (
                        <li key={m.memberId} className="flex items-center justify-between gap-2 text-sm text-etyme-ink">
                          <span>{m.name}</span>
                          {mayWrite && <button onClick={() => send('DELETE', `/api/pods/${t.id}?memberId=${m.memberId}`)} className="text-xs text-etyme-action hover:underline">Take off</button>}
                        </li>
                      ))}
                    </ul>
                    {mayWrite && !t.archivedAt && r.members.length < r.headcount && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select aria-label={`Add to ${r.title}`} value={pick[r.id] ?? ''} onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })} className={field}>
                          <option value="">Choose a person</option>
                          {people.filter((p) => !r.members.some((m) => m.personId === p.personId)).map((p) => (
                            <option key={p.personId} value={p.personId}>{labels.get(p.personId) ?? p.name}</option>
                          ))}
                        </select>
                        <button
                          disabled={!pick[r.id]}
                          onClick={async () => { if (await send('POST', `/api/pods/${t.id}`, { kind: 'member', roleId: r.id, personId: pick[r.id] })) setPick({ ...pick, [r.id]: '' }) }}
                          className="btn-secondary"
                        >Add member</button>
                        {!pick[r.id] && <span className="text-xs text-etyme-muted">Choose a person to add.</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {mayWrite && (
                <div className="flex flex-wrap items-end gap-2 border-t border-etyme-rule pt-3">
                  <label><span className={label}>New role</span>
                    <input value={rf.title} onChange={(e) => setRoleForm({ ...roleForm, [t.id]: { ...rf, title: e.target.value } })} className={`${field} w-40`} /></label>
                  <label><span className={label}>People</span>
                    <input value={rf.headcount} onChange={(e) => setRoleForm({ ...roleForm, [t.id]: { ...rf, headcount: e.target.value } })} inputMode="numeric" className={`${field} w-16`} /></label>
                  {t.pricing === 'RATE_CARD' && (
                    <label><span className={label}>Rate an hour, in dollars</span>
                      <input value={rf.rate} onChange={(e) => setRoleForm({ ...roleForm, [t.id]: { ...rf, rate: e.target.value } })} inputMode="decimal" className={`${field} w-24`} /></label>
                  )}
                  <button
                    onClick={async () => {
                      const ok = await send('POST', `/api/pods/${t.id}`, { kind: 'role', title: rf.title, headcount: Number(rf.headcount), ...(t.pricing === 'RATE_CARD' ? { rateCents: dollarsToCents(rf.rate) } : {}) })
                      if (ok) setRoleForm({ ...roleForm, [t.id]: { title: '', headcount: '1', rate: '' } })
                    }}
                    className="btn-secondary"
                  >Add role</button>
                  <button onClick={() => send('PATCH', `/api/pods/${t.id}`, { archived: !t.archivedAt })} className="ml-auto text-xs text-etyme-action hover:underline">
                    {t.archivedAt ? 'Restore team' : 'Archive team'}
                  </button>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
