'use client'

import { useCallback, useEffect, useState } from 'react'
import { pickerLabels } from '@/lib/training'
import { peopleToAdd } from '@/lib/pods'
import { amount } from '@/lib/money-display'
import { useParams } from 'next/navigation'
import { otherFirmSiteSays } from '@/lib/plugin-site-says'
import { RefusedState, LoadingState } from '@/components/ui'

/**
 * Project teams (record 120), on its own micro-site (records 133, 134, moved
 * from the dashboard): the firm's named teams, their roles and who
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
interface Project { id: string; podId: string; name: string; clientName: string | null; open: boolean; deliverables: { id: string; name: string; state: string | null }[] }
interface MarginRead { marginCents: number | null; earnedRevenueCents: number; unknownSays: string[]; currency: string }
interface Offer { client: string; acceptor: string; decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERTAKEN'; says: string | null }
interface Client { id: string; name: string }
interface Row { name: string; amount: string; due: string }
interface OfferForm { clientCompanyId: string; email: string; kind: string; projectName: string; price: string; onSite: boolean; rows: Row[] }
interface Variance {
  currency: string
  schedule: { pvCents: number | null; evCents: number | null; svCents: number | null; spi: number | null; unknowns: string[] }
  cost: { acCents: number | null; cvCents: number | null; cpi: number | null; unknowns: string[] } | null
  deliverables: { name: string; plannedOn: string | null; actualOn: string | null; daysVariance: number | null; basis: 'ACCEPTED' | 'OVERDUE' | null }[]
}

/** A figure, or a dash with the reason on hover. */
const fig = (v: number | null, cur: string, why: string | undefined) => <span title={v === null ? why : undefined}>{v === null ? '—' : amount(v, cur)}</span>
const idx = (v: number | null, why: string | undefined) => <span title={v === null ? why : undefined}>{v === null ? '—' : v.toFixed(2)}</span>
const dayWord = (n: number) => `${n > 0 ? '+' : ''}${n} ${Math.abs(n) === 1 ? 'day' : 'days'}`
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
  const tenant = String(useParams<{ tenant: string }>().tenant)
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  // Filled only for a project whose margin route said yes: a seat it refuses draws no margin at all.
  const [margins, setMargins] = useState<Record<string, MarginRead>>({})
  const [variances, setVariances] = useState<Record<string, Variance>>({})
  // Finance reads margin and not jobs: the route answers with the projects alone.
  const [projectsOnly, setProjectsOnly] = useState(false)
  const [offers, setOffers] = useState<Record<string, Offer>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [offerForm, setOfferForm] = useState<Record<string, OfferForm>>({})
  const [known, setKnown] = useState<{ name: string; email: string }[]>([])
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
    if (typeof body.data.sitePath === 'string' && body.data.sitePath !== `/pods/${tenant}`) { setRefused(otherFirmSiteSays('PODS')); return }
    setRefused(null)
    setProjectsOnly(body.data.view === 'PROJECTS')
    setTeams(body.data.teams ?? [])
    setPeople(body.data.people ?? [])
    setOffers(body.data.offers ?? {})
    setClients(body.data.clients ?? [])
    setMayWrite(Boolean(body.data.mayWrite))
    const sold: Project[] = body.data.projects ?? []
    setProjects(sold)
    const got: Record<string, MarginRead> = {}
    const planned: Record<string, Variance> = {}
    await Promise.all(sold.map(async (p) => {
      const [r, v] = await Promise.all([fetch(`/api/pods/projects/${p.id}/margin`), fetch(`/api/pods/projects/${p.id}/variance`)])
      if (r.ok) { const d = (await r.json().catch(() => ({}))).data; if (d?.margin) got[p.id] = { ...d.margin, unknownSays: d.unknownSays ?? [] } }
      if (v.ok) { const d = (await v.json().catch(() => ({}))).data; if (d?.variance) planned[p.id] = d.variance }
    }))
    setMargins(got)
    setVariances(planned)
  }, [tenant])
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

  const blank: OfferForm = { clientCompanyId: '', email: '', kind: 'MILESTONE', projectName: '', price: '', onSite: false, rows: [{ name: '', amount: '', due: '' }] }

  // The people the supplier already knows at that client, by name; she may type any other work address.
  async function knowAt(clientId: string) {
    setKnown([])
    if (!clientId) return
    const r = await fetch(`/api/contacts?at=${encodeURIComponent(clientId)}`)
    if (!r.ok) return
    const list: { name: string; email: string | null }[] = (await r.json().catch(() => ({}))).data?.contacts ?? []
    setKnown(list.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email as string })))
  }

  async function offer(teamId: string, f: OfferForm) {
    const tm = f.kind === 'TIME_AND_MATERIALS'
    const ok = await send('POST', `/api/pods/${teamId}/offer`, {
      clientCompanyId: f.clientCompanyId, acceptorEmail: f.email, kind: f.kind, projectName: f.projectName, onSite: f.onSite,
      priceCents: dollarsToCents(f.price), currency: teams!.find((t) => t.id === teamId)!.currency,
      deliverables: tm ? [] : f.rows.filter((r) => r.name.trim() || r.amount).map((r) => ({ name: r.name, amountCents: dollarsToCents(r.amount), ...(r.due ? { dueOn: r.due } : {}) })),
    })
    if (ok) setOfferForm({ ...offerForm, [teamId]: blank })
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const sprint = form.pricing === 'SPRINT_PRICE'
    const ok = await send('POST', '/api/pods', {
      name: form.name, pricing: form.pricing,
      ...(sprint ? { sprintPriceCents: dollarsToCents(form.price), sprintWeeks: Number(form.weeks) } : {}),
    })
    if (ok) setForm({ name: '', pricing: 'SPRINT_PRICE', price: '', weeks: '' })
  }

  // Planned against actual: figures and short labels only. Cost shows only where the route sent it.
  const plan = (p: Project) => {
    const v = variances[p.id]
    if (!v) return null
    const s = v.schedule, c = v.cost, why = s.unknowns[0]
    return (
      <div className="mt-2 text-xs text-etyme-muted tabular-nums" aria-label={`Plan against actual for ${p.name}`}>
        <p className="flex flex-wrap gap-x-4">
          <span>PV {fig(s.pvCents, v.currency, why)}</span><span>EV {fig(s.evCents, v.currency, why)}</span>
          <span>SV {fig(s.svCents, v.currency, why)}</span><span>SPI {idx(s.spi, why)}</span>
          {c && <><span>AC {fig(c.acCents, v.currency, c.unknowns[0])}</span><span>CV {fig(c.cvCents, v.currency, c.unknowns[0] ?? why)}</span><span>CPI {idx(c.cpi, c.unknowns[0] ?? why)}</span></>}
        </p>
        <ul className="mt-1 space-y-0.5">
          {v.deliverables.map((d) => (
            <li key={d.name}>{d.name} · Planned {d.plannedOn ?? '—'} · {d.actualOn ? `Accepted ${d.actualOn}` : 'Not accepted'}{d.daysVariance !== null ? ` · ${dayWord(d.daysVariance)}${d.basis === 'OVERDUE' ? ' so far' : ''}` : ''}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="page-head mb-6">
        <h1>Project teams</h1>
        {projectsOnly ? <p>The projects your firm has sold, what each has earned, and how it stands against its plan.</p> : <p>Named teams you can sell as a project: the roles, who fills each one, and the price. Only your own employees and people on your bench, with their yes, can be on a team.</p>}
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

      {projectsOnly && (
        <div className="space-y-3">
          {projects.length === 0 && <p className="text-sm text-etyme-muted">No sold projects in the part of the book you read.</p>}
          {projects.map((p) => {
            const m = margins[p.id]
            return (
              <section key={p.id} className="panel text-sm" aria-label={`Project ${p.name}`}>
                <h2 className="text-base font-medium text-etyme-ink">{p.name} <span className="text-xs text-etyme-muted">· {p.open ? 'in progress' : 'fulfilled'}</span></h2>
                <ul className="mt-1 space-y-1">{p.deliverables.map((d) => <li key={d.id} className="text-etyme-ink">{d.name} <span className="text-etyme-muted">· {d.state ?? 'unknown'}</span></li>)}</ul>
                {m && (m.marginCents !== null
                  ? <p className="text-etyme-muted tabular-nums">Earned margin {amount(m.marginCents, m.currency)} on {amount(m.earnedRevenueCents, m.currency)} accepted</p>
                  : m.unknownSays.map((u) => <p key={u} className="text-etyme-muted">{u}</p>))}
                {plan(p)}
              </section>
            )
          })}
        </div>
      )}

      {!projectsOnly && teams.length === 0 && <p className="text-sm text-etyme-muted">No teams yet.{mayWrite ? ' Create one above, then give it roles.' : ''}</p>}

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

              {offers[t.id]?.says && offers[t.id].decision !== 'APPROVED' && (
                <p className="mb-3 text-sm text-etyme-ink" aria-label={`Offer on ${t.name}`}>{offers[t.id].says}</p>
              )}

              {projects.filter((p) => p.podId === t.id).map((p) => {
                const m = margins[p.id]
                return (
                  <div key={p.id} className="mb-3 rounded-md border border-etyme-rule px-3 py-2 text-sm" aria-label={`Project ${p.name}`}>
                    <p className="text-etyme-ink">Sold to {p.clientName ?? 'a client'} <span className="text-etyme-muted">· {p.open ? 'in progress' : 'fulfilled'}</span></p>
                    {p.deliverables.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {p.deliverables.map((d) => (
                          <li key={d.id} className="flex items-center justify-between gap-2 text-etyme-ink">
                            <span>{d.name} <span className="text-etyme-muted">· {d.state ?? 'unknown'}</span></span>
                            {mayWrite && d.state === 'planned' && <button onClick={() => send('POST', `/api/pods/projects/${p.id}/deliverables/${d.id}/start`)} className="text-xs text-etyme-action hover:underline">Mark started</button>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m && (m.marginCents !== null
                      ? <p className="text-etyme-muted tabular-nums">Earned margin {amount(m.marginCents, m.currency)} on {amount(m.earnedRevenueCents, m.currency)} accepted</p>
                      : m.unknownSays.map((u) => <p key={u} className="text-etyme-muted">{u}</p>))}
                    {plan(p)}
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
                          {peopleToAdd(people, t.roles).map((p) => (
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

              {mayWrite && !t.archivedAt && t.filled > 0 && clients.length > 0 && offers[t.id]?.decision !== 'PENDING'
                && !projects.some((p) => p.podId === t.id && p.open) && (() => {
                const f = offerForm[t.id] ?? blank
                const set = (patch: Partial<OfferForm>) => setOfferForm({ ...offerForm, [t.id]: { ...f, ...patch } })
                const tm = f.kind === 'TIME_AND_MATERIALS'
                return (
                  <details className="mb-3 rounded-md border border-etyme-rule px-3 py-2">
                    <summary className="cursor-pointer text-sm text-etyme-action">Offer to a client</summary>
                    <form onSubmit={(e) => { e.preventDefault(); offer(t.id, f) }} className="mt-3 flex flex-wrap items-end gap-3">
                      <label><span className={label}>Client</span>
                        <select value={f.clientCompanyId} required onChange={(e) => { set({ clientCompanyId: e.target.value, email: '' }); knowAt(e.target.value) }} className={field}>
                          <option value="">Choose a client</option>
                          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select></label>
                      <label><span className={label}>Who at the client accepts the work</span>
                        <input type="email" list={`known-${t.id}`} value={f.email} required onChange={(e) => set({ email: e.target.value })} placeholder="Work address" className={`${field} w-64`} />
                        <datalist id={`known-${t.id}`}>{known.map((k) => <option key={k.email} value={k.email}>{k.name}</option>)}</datalist></label>
                      <label><span className={label}>Sold as</span>
                        <select value={f.kind} onChange={(e) => set({ kind: e.target.value })} className={field}>
                          <option value="MILESTONE">Milestones</option>
                          <option value="FIXED_PRICE">A fixed price</option>
                          <option value="TIME_AND_MATERIALS">Time and materials</option>
                        </select></label>
                      <label><span className={label}>Project name</span>
                        <input value={f.projectName} required onChange={(e) => set({ projectName: e.target.value })} className={`${field} w-56`} /></label>
                      <label><span className={label}>Price, in dollars</span>
                        <input value={f.price} required inputMode="decimal" onChange={(e) => set({ price: e.target.value })} className={`${field} w-28`} /></label>
                      {tm
                        ? <p className="w-full text-xs text-etyme-muted">Hours are billed as they are worked and signed. There are no deliverables.</p>
                        : (
                          <div className="w-full space-y-2">
                            {f.rows.map((r, i) => (
                              <div key={i} className="flex flex-wrap items-end gap-2">
                                <label><span className={label}>Deliverable</span>
                                  <input value={r.name} onChange={(e) => set({ rows: f.rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className={`${field} w-48`} /></label>
                                <label><span className={label}>Amount, in dollars</span>
                                  <input value={r.amount} inputMode="decimal" onChange={(e) => set({ rows: f.rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} className={`${field} w-28`} /></label>
                                <label><span className={label}>Due</span>
                                  <input type="date" value={r.due} onChange={(e) => set({ rows: f.rows.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)) })} className={field} /></label>
                                {f.rows.length > 1 && <button type="button" onClick={() => set({ rows: f.rows.filter((_, j) => j !== i) })} className="text-xs text-etyme-action hover:underline">Remove</button>}
                              </div>
                            ))}
                            <button type="button" onClick={() => set({ rows: [...f.rows, { name: '', amount: '', due: '' }] })} className="text-xs text-etyme-action hover:underline">Add a deliverable</button>
                            <p className="text-xs text-etyme-muted">The deliverables must add up to the price exactly.</p>
                          </div>
                        )}
                      <label className="flex w-full items-center gap-2 text-sm text-etyme-ink">
                        <input type="checkbox" checked={f.onSite} onChange={(e) => set({ onSite: e.target.checked })} />
                        The team works on your site</label>
                      <button type="submit" className="btn-primary">Send offer</button>
                      <p className="w-full text-xs text-etyme-muted">{f.onSite
                        ? 'The client sees the people on it by name and standing, and counts their time on site. Never their rates.'
                        : 'The client sees the project, its price and deliverables, and the roles. Never the people on it.'}</p>
                    </form>
                  </details>
                )
              })()}

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
