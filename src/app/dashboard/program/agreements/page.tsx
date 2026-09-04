'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Agreements — are we allowed to trade at all, and on what terms.
 *
 * A working surface, not a decision surface: dense rows, search, sort,
 * export. Everything underneath an agreement inherits from it — payment
 * days cascade to the order and then the contract, the margin floor gates
 * pricing, the capacity caps headcount — and until now none of it was
 * visible to a human without opening the database.
 *
 * The reasoning is progressive. One line per row saying what is wrong,
 * expandable to the findings and the engagements under it.
 */

// ── Shapes ────────────────────────────────────────────────────────────

interface Finding {
  code: string
  severity: 'WARN' | 'NOTE'
  says: string
  subjectType: 'AGREEMENT' | 'ENGAGEMENT' | 'CONTRACT'
  subjectId: string
}

interface Engagement {
  id: string
  title: string
  invoiceCycle: string
  statementOfWork: string | null
  sowSignedAt: string | null
  liveContracts: number
}

interface Agreement {
  id: string
  role: 'VENDOR' | 'CLIENT'
  counterparty: { id: string; name: string }
  terms: {
    paymentTermsDays: number
    paymentTermsSays: string
    currency: string
    minMarginPct: number | null
    marginFloorSays: string | null
    capacity: number | null
    signedAt: string | null
  }
  headcount: number
  engagements: Engagement[]
  contracts: {
    id: string
    person: { id: string; name: string }
    billRateCents: number
    marginPct: number | null
    state: string
    live: boolean
    engagementId: string | null
  }[]
  findings: Finding[]
  says: string | null
  createdAt: string
}

interface Payload {
  agreements: Agreement[]
  summary: {
    total: number
    unsigned: number
    needAttention: number
    engagements: number
    sowMissing: number
  }
}

// ── Page ──────────────────────────────────────────────────────────────

export default function AgreementsPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; bad?: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/program/agreements')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setData(body.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function say(message: string, bad?: boolean) {
    setToast({ message, bad })
    setTimeout(() => setToast(null), 3800)
  }

  const rows = data?.agreements ?? []

  const columns = useMemo<Column<Agreement>[]>(
    () => [
      {
        key: 'counterparty',
        label: 'Counterparty',
        render: (r) => (
          <div>
            <div className="font-medium text-etyme-ink">{r.counterparty.name}</div>
            <div className="text-[11px] text-etyme-muted mt-0.5">
              {r.role === 'VENDOR' ? 'We supply them' : 'They supply us'}
            </div>
          </div>
        ),
        sortValue: (r) => r.counterparty.name,
      },
      {
        key: 'signed',
        label: 'Signed',
        render: (r) =>
          r.terms.signedAt ? (
            <span className="tabular-nums text-etyme-muted">
              {r.terms.signedAt.slice(0, 10)}
            </span>
          ) : (
            <span className="chip chip--attention">On a handshake</span>
          ),
        sortValue: (r) => r.terms.signedAt ?? '',
      },
      {
        key: 'terms',
        label: 'Pays in',
        align: 'right',
        render: (r) => (
          <span className="tabular-nums">
            {r.terms.paymentTermsDays === 0 ? 'On receipt' : `Net ${r.terms.paymentTermsDays}`}
          </span>
        ),
        sortValue: (r) => r.terms.paymentTermsDays,
      },
      {
        key: 'floor',
        label: 'Margin floor',
        align: 'right',
        render: (r) =>
          r.role !== 'VENDOR' ? (
            <span className="text-[11px] text-etyme-faint">theirs</span>
          ) : r.terms.minMarginPct == null ? (
            <span className="text-etyme-faint">—</span>
          ) : (
            <span className="tabular-nums">{r.terms.minMarginPct}%</span>
          ),
        sortValue: (r) => r.terms.minMarginPct ?? -1,
        hideOnMobile: true,
      },
      {
        key: 'headcount',
        label: 'On site',
        align: 'right',
        render: (r) => (
          <span className="tabular-nums">
            {r.headcount}
            {r.terms.capacity != null && (
              <span className="text-etyme-faint"> / {r.terms.capacity}</span>
            )}
          </span>
        ),
        sortValue: (r) => r.headcount,
      },
      {
        key: 'engagements',
        label: 'Engagements',
        align: 'right',
        render: (r) => <span className="tabular-nums">{r.engagements.length}</span>,
        sortValue: (r) => r.engagements.length,
        hideOnMobile: true,
      },
      {
        key: 'says',
        label: 'Standing',
        render: (r) => {
          const warns = r.findings.filter((f) => f.severity === 'WARN').length
          if (warns === 0) {
            return <span className="chip chip--verified">In order</span>
          }
          return (
            <span className="chip chip--attention">
              {warns} to sort out
            </span>
          )
        },
        sortValue: (r) => -r.findings.filter((f) => f.severity === 'WARN').length,
      },
    ],
    []
  )

  const s = data?.summary

  return (
    <>
      <div className="mb-1">
        <div className="eyebrow mb-1">Procure</div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] font-serif">Agreements</h1>
        <p className="text-sm text-etyme-muted mt-1 max-w-2xl">
          Whether we are allowed to trade with somebody, and on what terms. Everything
          below an agreement inherits from it — payment days, the margin floor, how many
          people it permits. An order carries a ceiling; a contract carries a rate; this
          carries permission.
        </p>
      </div>

      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mt-6 mb-6">
          <Stat label="Agreements" value={s.total} />
          <Stat
            label="Unsigned"
            value={s.unsigned}
            tone={s.unsigned > 0 ? 'attention' : undefined}
          />
          <Stat
            label="Need attention"
            value={s.needAttention}
            tone={s.needAttention > 0 ? 'attention' : undefined}
          />
          <Stat label="Engagements" value={s.engagements} />
          <Stat
            label="No scope written"
            value={s.sowMissing}
            tone={s.sowMissing > 0 ? 'attention' : undefined}
            sub="work running"
          />
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        searchPlaceholder="Search by counterparty or engagement…"
        searchFilter={(r, q) =>
          r.counterparty.name.toLowerCase().includes(q) ||
          r.engagements.some((e) => e.title.toLowerCase().includes(q))
        }
        emptyMessage="No agreements yet."
        emptyDetail="An agreement appears here the first time somebody is awarded a seat at a client, or when you record existing work."
        exportName="agreements"
        onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
        rowClassName={(r) =>
          r.findings.some((f) => f.severity === 'WARN') ? '!bg-amber-50/30' : ''
        }
      />

      {open && rows.find((r) => r.id === open) && (
        <Detail
          agreement={rows.find((r) => r.id === open)!}
          onClose={() => setOpen(null)}
          onChanged={(m) => {
            say(m)
            load()
          }}
          onFailed={(m) => say(m, true)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.bad ? 'bg-red-600 text-white' : 'bg-etyme-verified text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  )
}

// ── The open row ──────────────────────────────────────────────────────

function Detail({
  agreement,
  onClose,
  onChanged,
  onFailed,
}: {
  agreement: Agreement
  onClose: () => void
  onChanged: (says: string) => void
  onFailed: (says: string) => void
}) {
  const mine = agreement.role === 'VENDOR'

  return (
    <div className="card mt-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="eyebrow mb-1">Agreement</div>
          <h2 className="text-lg font-serif font-semibold">{agreement.counterparty.name}</h2>
          <p className="text-sm text-etyme-muted mt-1">{agreement.terms.paymentTermsSays}</p>
          {agreement.terms.marginFloorSays && (
            <p className="text-sm text-etyme-muted">{agreement.terms.marginFloorSays}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted hover:text-etyme-ink"
        >
          Close
        </button>
      </div>

      {agreement.findings.length > 0 && (
        <div className="mb-6">
          <p className="eyebrow mb-2">What is outstanding</p>
          <ul className="space-y-1.5">
            {agreement.findings.map((f, i) => (
              <li key={`${f.code}-${f.subjectId}-${i}`} className="flex items-start gap-3">
                <span
                  className={`chip shrink-0 ${
                    f.severity === 'WARN' ? 'chip--attention' : 'chip--passive'
                  }`}
                >
                  {f.code.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span className="text-sm text-etyme-ink">{f.says}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-etyme-faint mt-2">
            Every one of these carries a code rather than a note somebody typed. None of them
            stops anybody working — they are said, and counted.
          </p>
        </div>
      )}

      {mine && <Terms agreement={agreement} onChanged={onChanged} onFailed={onFailed} />}

      <Engagements agreement={agreement} onChanged={onChanged} onFailed={onFailed} editable={mine} />

      {agreement.contracts.length > 0 && (
        <div className="mt-6 pt-6 border-t border-etyme-rule">
          <p className="eyebrow mb-2">People under it</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-etyme-muted">
                <th className="pb-2">Person</th>
                <th className="pb-2 text-right">Bill rate</th>
                <th className="pb-2 text-right">Margin</th>
                <th className="pb-2">State</th>
              </tr>
            </thead>
            <tbody>
              {agreement.contracts.map((c) => (
                <tr key={c.id} className="border-t border-etyme-rule">
                  <td className="py-2">{c.person.name}</td>
                  <td className="py-2 text-right tabular-nums">
                    ${(c.billRateCents / 100).toFixed(2)}/hr
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {c.marginPct == null ? (
                      <span
                        className="text-etyme-faint"
                        title="No buy contract behind it, so no margin can be stated."
                      >
                        not knowable
                      </span>
                    ) : (
                      <span
                        className={
                          agreement.terms.minMarginPct != null &&
                          c.marginPct < agreement.terms.minMarginPct
                            ? 'text-etyme-attention'
                            : ''
                        }
                      >
                        {c.marginPct}%
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-etyme-muted text-xs">{c.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-etyme-faint mt-6">
        Deliverables and their acceptance live on{' '}
        <Link href={{ pathname: '/dashboard/program/milestones' }} className="text-etyme-action underline">
          milestones
        </Link>
        .
      </p>
    </div>
  )
}

// ── Terms ─────────────────────────────────────────────────────────────

function Terms({
  agreement,
  onChanged,
  onFailed,
}: {
  agreement: Agreement
  onChanged: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [days, setDays] = useState(String(agreement.terms.paymentTermsDays))
  const [floor, setFloor] = useState(
    agreement.terms.minMarginPct == null ? '' : String(agreement.terms.minMarginPct)
  )
  const [capacity, setCapacity] = useState(
    agreement.terms.capacity == null ? '' : String(agreement.terms.capacity)
  )
  const [signed, setSigned] = useState(agreement.terms.signedAt?.slice(0, 10) ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/program/agreements/${agreement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentTerms: Number(days),
          minMarginPct: floor.trim() === '' ? null : Number(floor),
          capacity: capacity.trim() === '' ? null : Number(capacity),
          signedAt: signed.trim() === '' ? null : signed,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not save')
      onChanged(body.data.says)
    } catch (e: any) {
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pt-6 border-t border-etyme-rule">
      <p className="eyebrow mb-3">Terms</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Payment days" value={days} onChange={setDays} placeholder="30" />
        <Field
          label="Margin floor %"
          value={floor}
          onChange={setFloor}
          placeholder="none"
          hint="Yours. The client never sees it."
        />
        <Field label="Capacity" value={capacity} onChange={setCapacity} placeholder="uncapped" />
        <Field label="Signed on" value={signed} onChange={setSigned} placeholder="yyyy-mm-dd" />
      </div>
      <button
        onClick={save}
        disabled={busy}
        className="mt-4 text-xs px-4 py-2 bg-etyme-action text-white rounded disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Record terms'}
      </button>
    </div>
  )
}

// ── Engagements and the statement of work ─────────────────────────────

function Engagements({
  agreement,
  onChanged,
  onFailed,
  editable,
}: {
  agreement: Agreement
  onChanged: (says: string) => void
  onFailed: (says: string) => void
  editable: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="mt-6 pt-6 border-t border-etyme-rule">
      <div className="flex items-center justify-between mb-3">
        <p className="eyebrow">Engagements and their scope</p>
        {editable && (
          <button
            onClick={() => setAdding(!adding)}
            className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted hover:text-etyme-ink"
          >
            {adding ? 'Cancel' : 'New engagement'}
          </button>
        )}
      </div>

      {adding && (
        <NewEngagement
          msaId={agreement.id}
          onDone={(m) => {
            setAdding(false)
            onChanged(m)
          }}
          onFailed={onFailed}
        />
      )}

      {agreement.engagements.length === 0 && !adding && (
        <p className="text-sm text-etyme-muted">
          Nothing under this agreement yet. An engagement is the project or statement of
          work several people and several contracts hang off.
        </p>
      )}

      <div className="space-y-3">
        {agreement.engagements.map((e) => (
          <div key={e.id} className="border border-etyme-rule rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-etyme-ink">{e.title}</p>
                <p className="text-[11px] text-etyme-muted mt-0.5">
                  {e.invoiceCycle.toLowerCase()} billing · {e.liveContracts}{' '}
                  {e.liveContracts === 1 ? 'person' : 'people'} working
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {e.sowSignedAt ? (
                  <span className="chip chip--verified">Signed {e.sowSignedAt.slice(0, 10)}</span>
                ) : e.statementOfWork ? (
                  <span className="chip chip--action">Written, unsigned</span>
                ) : (
                  <span className="chip chip--attention">No scope</span>
                )}
                {editable && (
                  <button
                    onClick={() => setEditing(editing === e.id ? null : e.id)}
                    className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted hover:text-etyme-ink"
                  >
                    {editing === e.id ? 'Close' : 'Scope'}
                  </button>
                )}
              </div>
            </div>

            {e.statementOfWork && editing !== e.id && (
              <p className="text-sm text-etyme-muted mt-3 whitespace-pre-wrap">
                {e.statementOfWork}
              </p>
            )}

            {editing === e.id && (
              <Sow
                engagement={e}
                onDone={(m) => {
                  setEditing(null)
                  onChanged(m)
                }}
                onFailed={onFailed}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Sow({
  engagement,
  onDone,
  onFailed,
}: {
  engagement: Engagement
  onDone: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [scope, setScope] = useState(engagement.statementOfWork ?? '')
  const [signed, setSigned] = useState(engagement.sowSignedAt?.slice(0, 10) ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/program/engagements/${engagement.id}/sow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statementOfWork: scope.trim() === '' ? null : scope,
          sowSignedAt: signed.trim() === '' ? null : signed,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not save')
      onDone(body.data.says)
    } catch (e: any) {
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-etyme-rule">
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
          Statement of work
        </span>
        <textarea
          value={scope}
          onChange={(ev) => setScope(ev.target.value)}
          rows={5}
          placeholder="What is being delivered, by whom, over what period, and what done looks like."
          className="mt-1 w-full text-sm border border-etyme-rule rounded p-3 bg-etyme-surface"
        />
      </label>
      <div className="flex items-end gap-4 mt-3">
        <Field label="Signed on" value={signed} onChange={setSigned} placeholder="yyyy-mm-dd" />
        <button
          onClick={save}
          disabled={busy}
          className="text-xs px-4 py-2 bg-etyme-action text-white rounded disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Record scope'}
        </button>
      </div>
      <p className="text-[11px] text-etyme-faint mt-2">
        A signature over an empty scope is refused. It is the one state worse than having
        nothing, because every check downstream reads it as done and nobody chases it.
      </p>
    </div>
  )
}

function NewEngagement({
  msaId,
  onDone,
  onFailed,
}: {
  msaId: string
  onDone: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    try {
      const res = await fetch('/api/program/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msaId, title, statementOfWork: scope || null }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not create')
      onDone(body.data.says)
    } catch (e: any) {
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-etyme-rule rounded-lg p-4 mb-4 bg-etyme-canvas/40">
      <Field label="Title" value={title} onChange={setTitle} placeholder="SAP Programme — phase two" />
      <label className="block mt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
          Scope (optional now, chased later)
        </span>
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={3}
          className="mt-1 w-full text-sm border border-etyme-rule rounded p-3 bg-etyme-surface"
        />
      </label>
      <button
        onClick={create}
        disabled={busy || title.trim().length < 2}
        className="mt-3 text-xs px-4 py-2 bg-etyme-action text-white rounded disabled:opacity-50"
      >
        {busy ? 'Opening…' : 'Open engagement'}
      </button>
    </div>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm border border-etyme-rule rounded px-2.5 py-1.5 bg-etyme-surface tabular-nums"
      />
      {hint && <span className="block text-[10px] text-etyme-faint mt-0.5">{hint}</span>}
    </label>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number | string
  sub?: string
  tone?: 'attention' | 'action' | 'verified'
}) {
  const tones = {
    attention: 'text-etyme-attention',
    action: 'text-etyme-action',
    verified: 'text-etyme-verified',
  }
  return (
    <div className="card py-3 px-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-1">
        {label}
      </p>
      <p className={`text-2xl font-semibold tabular-nums font-serif ${tone ? tones[tone] : 'text-etyme-ink'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-etyme-faint mt-0.5">{sub}</p>}
    </div>
  )
}
