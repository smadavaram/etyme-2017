'use client'

import { readJson } from '@/lib/read-response'
import { DataTable, type Column } from '@/components/data-table'
import { ViewToggle, FilterBar, Star, emptyWord, type View } from '@/components/network-view'
import { applyFilter, locationsOf, isRecent, type NetworkFilter } from '@/lib/network-filters'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * One person, however many suppliers are selling them.
 *
 * A client with twelve vendors does not have twelve consultants called
 * Rohan Menon. They have one, and twelve different stories about him.
 * This is the merged record — and the rate spread on it is the line no
 * client has ever been able to see.
 *
 * Two ways to read it. The feed: ordered by what needs a person looking
 * at it — barred first, then past the tenure cap, then the ones several
 * suppliers are competing over — with the sentence and every submission
 * under it. The table: the same people as rows, sortable, for the day
 * the register is two hundred long. Both answer the same five questions
 * from the filter bar: here now, here lately, would take again, barred,
 * and where.
 */

interface Offer {
  vendorName: string
  rateCents: number | null
  submittedAt: string
  roleTitle: string
  cleared: boolean | null
  state: string
}

/**
 * Somebody this client asked for itself, who no supplier has put
 * forward yet. A different kind of row: no rate, no tenure, no
 * supplier — a step, and whatever the client has to do next.
 */
interface Pending {
  inviteId: string
  name: string
  skills: string[]
  state: string
  stateWord: string
  steps: { label: string; status: string }[]
  says: string
  next: string | null
  supplierName: string | null
  firmNamed: string | null
  askedAt: string
}

interface Supplier {
  companyId: string
  name: string
  tier: string | null
}

interface Row {
  personId: string
  name: string
  vendors: number
  vendorNames: string[]
  spread: { lowCents: number; highCents: number; gapCents: number; says: string | null } | null
  monthsHere: number
  headroomMonths: number | null
  barred: boolean
  state: string
  roles: string[]
  offers: Offer[]
  stints: { months: number; endedAt: string | null; vendorName: string }[]
  says: string
  unknowns: string[]
  possibleDuplicate?: { personId: string; name: string; confidence: string; says: string } | null
  // The Network questions
  onSite: boolean
  lastEngagement: string | null
  favorite: boolean
  blocked: boolean
  location: string | null
}

function money(cents: number | null): string {
  if (cents == null) return '—'
  const d = cents / 100
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TONE: Record<string, string> = {
  BARRED: 'chip--attention',
  PLACED: 'chip--verified',
  OFFERED: 'chip--verified',
  INTERVIEWING: 'chip--action',
  SUBMITTED: 'chip--passive',
  REJECTED: 'chip--passive',
}

export default function PeoplePage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [summary, setSummary] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('feed')
  const [filter, setFilter] = useState<NetworkFilter>('ALL')
  const [place, setPlace] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/people')
      const body = await readJson(res)
      setRows(body.data.people)
      setPending(body.data.pending ?? [])
      setSummary(body.data.summary)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // The star. Marked here, read by the Favorites filter, and by nobody
  // outside this company.
  async function star(r: Row) {
    const on = !r.favorite
    setRows((cur) => cur.map((x) => (x.personId === r.personId ? { ...x, favorite: on } : x)))
    try {
      await readJson(await fetch('/api/favorites', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'PERSON', targetId: r.personId, on }),
      }))
    } catch (err: any) {
      setRows((cur) => cur.map((x) => (x.personId === r.personId ? { ...x, favorite: !on } : x)))
      setError(err.message)
    }
  }

  /** Ask somebody we already know. */
  async function ask(form: { name: string; email: string; skills: string; reason: string }) {
    setBusy(true)
    try {
      const body = await readJson(await fetch('/api/contractor-invites', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      }))
      setSaid(body.data.says)
      setAsking(false)
      setFilter('PENDING')
      await load()
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  /** The client's side of an answer: pick a firm, sponsor theirs, or stop. */
  async function act(inviteId: string, payload: Record<string, unknown>) {
    setBusy(true)
    try {
      const body = await readJson(await fetch(`/api/contractor-invites/${inviteId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      }))
      setSaid(body.data.says)
      setPicking(null)
      await load()
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  /** Only fetched when somebody actually has to pick one. */
  const loadSuppliers = useCallback(async () => {
    if (suppliers.length > 0) return
    try {
      const body = await readJson(await fetch('/api/suppliers'))
      setSuppliers((body.data.suppliers ?? []).filter((x: Supplier) => x.tier === 'APPROVED' || x.tier === 'PREFERRED'))
    } catch { /* the picker says so below */ }
  }, [suppliers.length])

  const places = useMemo(() => locationsOf(rows), [rows])
  const shown = useMemo(() => applyFilter(rows, filter, place, now), [rows, filter, place, now])
  const counts = useMemo(() => ({
    ALL: rows.filter((r) => !r.blocked).length,
    ON_SITE: rows.filter((r) => r.onSite && !r.blocked).length,
    RECENT: rows.filter((r) => isRecent(r.lastEngagement, now) && !r.blocked).length,
    FAVORITES: rows.filter((r) => r.favorite && !r.blocked).length,
    // Offered only once there is something behind it, the rule every
    // Network filter follows.
    ...(pending.length > 0 ? { PENDING: pending.length } : {}),
    BLOCKED: rows.filter((r) => r.blocked).length,
  }), [rows, pending, now])

  const columns: Column<Row>[] = [
    {
      key: 'name', label: 'Person',
      render: (r) => (
        <div>
          <p className="text-etyme-ink">{r.name}</p>
          <p className="text-[11px] text-etyme-faint">{r.roles.slice(0, 2).join(', ')}</p>
        </div>
      ),
      sortValue: (r) => r.name,
    },
    { key: 'vendorNames', label: 'Through', render: (r) => <span className="text-etyme-muted">{r.vendorNames.join(', ')}</span>, sortValue: (r) => r.vendorNames.join(', ') },
    { key: 'state', label: 'Status', render: (r) => <span className={`chip ${TONE[r.state] ?? 'chip--passive'}`}>{r.state.toLowerCase()}</span> },
    { key: 'location', label: 'Location', render: (r) => <span className="text-etyme-muted">{r.location ?? '—'}</span>, hideOnMobile: true },
    { key: 'monthsHere', label: 'Months here', align: 'right', render: (r) => <span className="tabular-nums">{r.monthsHere}</span> },
    { key: 'lastEngagement', label: 'Last engagement', render: (r) => <span className="tabular-nums text-etyme-muted">{when(r.lastEngagement)}</span>, sortValue: (r) => r.lastEngagement ?? '', hideOnMobile: true },
    {
      key: 'favorite', label: 'Take again', align: 'center', sortValue: (r) => (r.favorite ? 1 : 0),
      render: (r) => <Star on={r.favorite} onClick={(e) => { e.stopPropagation(); star(r) }} name={r.name} />,
    },
  ]

  const pendingColumns: Column<Pending>[] = [
    { key: 'name', label: 'Person', render: (p) => <span className="text-etyme-ink">{p.name}</span>, sortValue: (p) => p.name },
    { key: 'skills', label: 'What they do', render: (p) => <span className="text-etyme-muted">{p.skills.join(', ') || '—'}</span> },
    { key: 'stateWord', label: 'Step', render: (p) => <span className="chip chip--passive">{p.stateWord}</span>, sortValue: (p) => p.stateWord },
    { key: 'supplierName', label: 'Through', render: (p) => <span className="text-etyme-muted">{p.supplierName ?? p.firmNamed ?? '—'}</span> },
    { key: 'askedAt', label: 'Asked', render: (p) => <span className="tabular-nums text-etyme-muted">{when(p.askedAt)}</span>, sortValue: (p) => p.askedAt, hideOnMobile: true },
  ]

  return (
    <div className="mx-auto max-w-[980px] space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Network</p>
          <h1 className="headline-serif text-[30px] leading-tight">Contractors</h1>
          <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
            Everyone who has been put in front of you, one entry each, merged across suppliers.
            Every fact here sits in a different vendor&rsquo;s system and none of them can see the others.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setAsking((v) => !v); setSaid(null) }}
            className="rounded-lg border border-etyme-rule bg-etyme-surface px-3 py-2 text-[13px] text-etyme-ink hover:border-etyme-ink"
          >
            {asking ? 'Not now' : 'Ask somebody you know'}
          </button>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </header>

      {asking && <AskForm busy={busy} onSubmit={ask} />}

      {said && (
        <div className="panel">
          <p className="text-[13px] text-etyme-ink">{said}</p>
        </div>
      )}

      <p className="border-b border-etyme-rule pb-4 text-[14px] text-etyme-ink">{summary}</p>

      <FilterBar filter={filter} onFilter={setFilter} counts={counts} places={places} place={place} onPlace={setPlace} />

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && rows.length === 0 && pending.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nobody yet. This fills in as suppliers put people forward — and if there is
            somebody you already want, ask them yourself.
          </p>
        </div>
      )}

      {/* ── Pending: asked by you, not yet put forward by anybody ── */}
      {!loading && filter === 'PENDING' && (
        view === 'table' ? (
          <DataTable<Pending>
            columns={pendingColumns}
            data={pending}
            rowKey={(p) => p.inviteId}
            searchPlaceholder="Search by name or skill…"
            searchFilter={(p, q) => `${p.name} ${p.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase())}
            exportName="asked"
            defaultPageSize={50}
            emptyMessage={emptyWord('PENDING', place, 'people')}
          />
        ) : (
          pending.map((p) => (
            <article key={p.inviteId} className="panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-etyme-ink">{p.name}</p>
                  <p className="text-[12px] text-etyme-faint">
                    {p.skills.join(', ') || 'What they do was not recorded'} · asked {when(p.askedAt)}
                  </p>
                </div>
                <span className="chip chip--passive shrink-0">{p.stateWord}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.steps.map((st) => (
                  <span
                    key={st.label}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      st.status === 'done' ? 'bg-etyme-verified/10 text-etyme-verified'
                      : st.status === 'now' ? 'bg-etyme-ink text-white'
                      : 'bg-etyme-canvas text-etyme-faint'
                    }`}
                  >
                    {st.label}
                  </span>
                ))}
              </div>

              <p className="mt-3 text-[13px] text-etyme-muted">{p.says}</p>
              {p.next && <p className="mt-1 text-[13px] text-etyme-attention">{p.next}</p>}

              {p.next && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {p.firmNamed && (
                    <button
                      disabled={busy}
                      onClick={() => act(p.inviteId, { action: 'sponsor' })}
                      className="rounded-lg bg-etyme-action px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                      Recommend {p.firmNamed}
                    </button>
                  )}
                  {picking === p.inviteId ? (
                    <select
                      autoFocus
                      aria-label={`A supplier to take ${p.name} on`}
                      disabled={busy}
                      defaultValue=""
                      onChange={(e) => e.target.value && act(p.inviteId, { action: 'pick', supplierCompanyId: e.target.value })}
                      className="rounded-lg border border-etyme-rule bg-etyme-surface px-2 py-1.5 text-[12px]"
                    >
                      <option value="" disabled>Which of your suppliers?</option>
                      {suppliers.map((sup) => <option key={sup.companyId} value={sup.companyId}>{sup.name}</option>)}
                      {suppliers.length === 0 && <option value="" disabled>No approved suppliers yet</option>}
                    </select>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => { setPicking(p.inviteId); void loadSuppliers() }}
                      className="rounded-lg border border-etyme-rule px-3 py-1.5 text-[12px] text-etyme-ink hover:border-etyme-ink disabled:opacity-40"
                    >
                      Pick one of your suppliers
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => act(p.inviteId, { action: 'withdraw' })}
                    className="text-[12px] text-etyme-muted hover:text-etyme-ink disabled:opacity-40"
                  >
                    Stop asking
                  </button>
                </div>
              )}
            </article>
          ))
        )
      )}

      {/* Pending draws its own rows below, so the register's empty panel
          must stand down — it fired anyway and showed the suppliers
          sentence under a perfectly full Pending list. */}
      {!loading && filter !== 'PENDING' && rows.length > 0 && shown.length === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">{emptyWord(filter, place, 'people')}</p>
        </div>
      )}

      {!loading && filter === 'PENDING' && pending.length === 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">{emptyWord('PENDING', place, 'people')}</p>
        </div>
      )}

      {view === 'table' && filter !== 'PENDING' && rows.length > 0 && (
        <DataTable<Row>
          columns={columns}
          data={shown}
          rowKey={(r) => r.personId}
          searchPlaceholder="Search by name, supplier or role…"
          searchFilter={(r, q) => `${r.name} ${r.vendorNames.join(' ')} ${r.roles.join(' ')} ${r.location ?? ''}`.toLowerCase().includes(q.toLowerCase())}
          onRowClick={(r) => router.push(`/dashboard/people/${r.personId}` as any)}
          exportName="contractors"
          defaultPageSize={50}
          emptyMessage={emptyWord(filter, place, 'people')}
          rowClassName={(r) => (r.blocked ? 'opacity-70' : '')}
        />
      )}

      {view === 'feed' && filter !== 'PENDING' && shown.map((r) => (
        <article key={r.personId} className="panel">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-etyme-ink">
                <Link href={{ pathname: `/dashboard/people/${r.personId}` }} className="hover:underline">{r.name}</Link>
                {r.location && <span className="ml-2 text-[12px] font-normal text-etyme-faint">{r.location}</span>}
              </p>
              <p className="text-[12px] text-etyme-faint">
                {r.vendorNames.join(' · ')}
                {r.roles.length > 0 && ` — ${r.roles.join(', ')}`}
                {r.lastEngagement && ` · last ${when(r.lastEngagement)}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Star on={r.favorite} onClick={() => star(r)} name={r.name} />
              <span className={`chip ${TONE[r.state] ?? 'chip--passive'}`}>
                {r.state.toLowerCase()}
              </span>
            </div>
          </div>

          <p
            className={`mt-2 text-[13px] ${
              r.barred || (r.headroomMonths != null && r.headroomMonths <= 0)
                ? 'text-etyme-attention'
                : 'text-etyme-muted'
            }`}
          >
            {r.says}
          </p>

          {/* The duplication merge() can't catch: this row and another
              one below are different Person records, and might be one
              human two suppliers each know a piece of. Never merged —
              a link to confirm it, same as CLAUDE.md requires. */}
          {r.possibleDuplicate && (
            <a
              href="/dashboard/identity"
              className="mt-2 flex items-start gap-2 rounded-md p-2 text-[12.5px] leading-snug
                         hover:opacity-90"
              style={{ background: '#F7EDE6', color: 'var(--color-attention)' }}
            >
              <span aria-hidden>⧉</span>
              <span>
                Might be the same person as <strong>{r.possibleDuplicate.name}</strong>, also on
                this list. {r.possibleDuplicate.says} Check →
              </span>
            </a>
          )}

          <button
            onClick={() => setOpen(open === r.personId ? null : r.personId)}
            className="mt-3 text-[12px] text-etyme-muted underline"
          >
            {open === r.personId ? 'Less' : `Every submission (${r.offers.length})`}
          </button>

          {open === r.personId && (
            <div className="mt-3 space-y-3 border-t border-etyme-rule pt-3">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {r.offers.map((o, i) => (
                      <tr key={i} className="border-b border-etyme-rule last:border-0">
                        <td className="py-1.5 pr-3 text-etyme-ink">{o.vendorName}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-etyme-ink">
                          {money(o.rateCents)}
                        </td>
                        <td className="py-1.5 pr-3 text-etyme-muted">{o.roleTitle}</td>
                        <td className="py-1.5 pr-3 text-etyme-faint">
                          {new Date(o.submittedAt).toLocaleDateString('en-US', {
                            day: 'numeric', month: 'short',
                          })}
                        </td>
                        <td className="py-1.5 text-right text-etyme-faint">
                          {o.cleared === null ? 'not screened' : o.cleared ? 'cleared' : 'held back'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Time here, through whoever. The only place it exists. */}
              {r.stints.length > 0 && (
                <div>
                  <p className="stat-label">Past engagements here</p>
                  <ul className="mt-1.5 space-y-1">
                    {r.stints.map((s, i) => (
                      <li key={i} className="text-[12px] text-etyme-muted">
                        {s.months} months through {s.vendorName}
                        {s.endedAt &&
                          `, finishing ${new Date(s.endedAt).toLocaleDateString('en-US', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {r.unknowns.length > 0 && (
                <ul className="space-y-1">
                  {r.unknowns.map((u, i) => (
                    <li key={i} className="text-[11px] text-etyme-faint">{u}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

/**
 * Asking somebody you already know.
 *
 * Four fields, and the one that matters is the last: the reason is read
 * by the person themselves and by the supplier asked to represent them,
 * so it is not paperwork. The note under the form says plainly that
 * this does not hire anybody, because a hiring manager who thinks it
 * does will be surprised later, and surprise is the thing a product
 * nobody is trained on cannot afford.
 */
function AskForm({ busy, onSubmit }: {
  busy: boolean
  onSubmit: (form: { name: string; email: string; skills: string; reason: string }) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [skills, setSkills] = useState('')
  const [reason, setReason] = useState('')
  const ready = name.trim().length > 1 && email.trim().length > 3 && reason.trim().length >= 10

  return (
    <form
      className="panel space-y-3"
      onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit({ name, email, skills, reason }) }}
    >
      <p className="text-[13px] text-etyme-ink">
        Somebody you have worked with, or been referred. They hear from you by email.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="lbl">Their name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lucía Fernández"
            className="mt-1 w-full rounded border border-etyme-rule px-2 py-1.5 text-[13px]" />
        </label>
        <label className="block">
          <span className="lbl">Their email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="lucia@example.com"
            className="mt-1 w-full rounded border border-etyme-rule px-2 py-1.5 text-[13px]" />
        </label>
      </div>
      <label className="block">
        <span className="lbl">What they do</span>
        <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Demand planning, S&amp;OP"
          className="mt-1 w-full rounded border border-etyme-rule px-2 py-1.5 text-[13px]" />
      </label>
      <label className="block">
        <span className="lbl">Why you want them</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
          placeholder="Finished a twelve-month stint on our planning team last year and we would take her back."
          className="mt-1 w-full rounded border border-etyme-rule px-2 py-1.5 text-[13px]" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!ready || busy}
          className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
          Ask them
        </button>
        <p className="text-[12px] text-etyme-muted">
          This does not hire them. You contract through suppliers, so they will be asked who
          represents them — and if nobody does, you pick one of your own firms to take them on.
        </p>
      </div>
    </form>
  )
}
