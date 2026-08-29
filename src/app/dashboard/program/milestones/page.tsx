'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Milestones — what has been handed over, and what is waiting on somebody.
 *
 * ── The split that matters ───────────────────────────────────────────
 *
 * Unbilled money looks like one number on every report. It is two
 * completely different problems: work we have not finished, and work the
 * client has not looked at. The first is a delivery problem and the
 * second is a governance problem, and putting them in one total means
 * nobody chases either.
 *
 * ── The number nobody else can compute ───────────────────────────────
 *
 * How long a client sits on a deliverable before agreeing it arrived. It
 * happens entirely before an invoice exists, so no ageing report has ever
 * shown it. It is shown here as "not measurable yet" rather than
 * estimated, because the delivery date has nowhere to be stored — see the
 * note in the API. A plausible wrong number is worse than a blank.
 */

interface Milestone {
  id: string
  name: string
  amountCents: number
  dueOn: string | null
  status: string
  acceptedAt: string | null
  acceptedById: string | null
  note: string | null
  rejectionReason: string | null
  billable: { ok: boolean; says: string }
  waited: { days: number | null; unknowns: string[]; says: string }
  late: { onUs: boolean; days: number | null; says: string } | null
}

interface Standing {
  awaitingAcceptanceCents: number
  awaitingCount: number
  notDeliveredCents: number
  notDeliveredCount: number
  billableCents: number
  billableCount: number
  rejectedCents: number
  rejectedCount: number
  averageWaitDays: number | null
  says: string
}

interface Order {
  id: string
  number: string
  title: string
  status: string
  billingBasis: string
  currency: string
  ceilingCents: number | null
  seller: { id: string; name: string }
  client: { id: string; name: string }
  yourRole: 'SELLER' | 'CLIENT'
  may: { deliver: boolean; decide: boolean }
  standing: Standing
  milestones: Milestone[]
}

interface Payload {
  orders: Order[]
  overall: Standing
  unknowns: string[]
}

const REASONS = [
  { code: 'SCOPE_INCOMPLETE', label: 'Scope incomplete' },
  { code: 'QUALITY', label: 'Quality' },
  { code: 'EVIDENCE_MISSING', label: 'No evidence' },
  { code: 'LATE', label: 'Late' },
  { code: 'DISPUTED_AMOUNT', label: 'Amount disputed' },
  { code: 'SUPERSEDED', label: 'Superseded' },
]

export default function MilestonesPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; bad?: boolean } | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/program/milestones')
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
    setTimeout(() => setToast(null), 4200)
  }

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const parsed = await res.json()
    if (!res.ok) throw new Error(parsed.error?.message ?? 'That did not work')
    return parsed.data
  }

  async function deliver(m: Milestone) {
    try {
      const d = await post(`/api/program/milestones/${m.id}/deliver`)
      say(d.says)
      load()
    } catch (e: any) {
      say(e.message, true)
    }
  }

  async function decide(m: Milestone, accept: boolean, reason?: string) {
    try {
      const d = await post(`/api/program/milestones/${m.id}/decide`, { accept, reason })
      say(d.says)
      setRejecting(null)
      load()
    } catch (e: any) {
      say(e.message, true)
    }
  }

  if (loading) {
    return (
      <div className="card text-center py-16">
        <p className="text-sm text-etyme-muted">Loading milestones…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card text-center py-16">
        <p className="text-sm text-red-600">Could not load milestones: {error}</p>
      </div>
    )
  }

  const orders = data?.orders ?? []

  return (
    <>
      <div className="mb-1">
        <div className="eyebrow mb-1">Operate</div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] font-serif">Milestones</h1>
        <p className="text-sm text-etyme-muted mt-1 max-w-2xl">
          A milestone bills because somebody accepted it, never because a date passed. What
          is waiting here is money that cannot be invoiced yet, split by whose move it is.
        </p>
      </div>

      {data && orders.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-6 mb-4">
            <Stat
              label="Ready to invoice"
              value={money(data.overall.billableCents)}
              sub={`${data.overall.billableCount} accepted`}
              tone="verified"
            />
            <Stat
              label="With the client"
              value={money(data.overall.awaitingAcceptanceCents)}
              sub={`${data.overall.awaitingCount} handed over`}
              tone={data.overall.awaitingCount > 0 ? 'attention' : undefined}
            />
            <Stat
              label="Not handed over"
              value={money(data.overall.notDeliveredCents)}
              sub={`${data.overall.notDeliveredCount} on us`}
            />
            <Stat
              label="Rejected"
              value={money(data.overall.rejectedCents)}
              sub={`${data.overall.rejectedCount} to redo`}
              tone={data.overall.rejectedCount > 0 ? 'attention' : undefined}
            />
          </div>

          <p className="text-sm text-etyme-ink mb-2">{data.overall.says}</p>

          {data.unknowns.length > 0 && (
            <div className="border border-etyme-rule rounded-lg p-3 mb-6 bg-etyme-canvas/50">
              <p className="eyebrow mb-1">Not measurable yet</p>
              {data.unknowns.map((u) => (
                <p key={u} className="text-xs text-etyme-muted">
                  {u}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {orders.length === 0 && (
        <div className="card text-center py-14 mt-6">
          <p className="text-lg font-serif text-etyme-ink mb-1">No orders with deliverables.</p>
          <p className="text-sm text-etyme-muted max-w-lg mx-auto">
            Milestones sit on a sales order — the document that carries a ceiling and says how
            much may be spent. Nothing in the product raises one yet, so this stays empty
            until one exists. An order carries a ceiling; a contract carries a rate; a
            milestone is a payment that falls due on delivery rather than on a date.
          </p>
          <p className="text-xs text-etyme-faint mt-4">
            The{' '}
            <Link href={{ pathname: '/dashboard/program/agreements' }} className="text-etyme-action underline">
              agreements
            </Link>{' '}
            behind them are already here.
          </p>
        </div>
      )}

      <div className="space-y-6 mt-6">
        {orders.map((o) => (
          <div key={o.id} className="card">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="eyebrow">{o.number}</p>
                <h2 className="text-base font-semibold text-etyme-ink">{o.title}</h2>
                <p className="text-xs text-etyme-muted mt-0.5">
                  {o.yourRole === 'SELLER' ? `To ${o.client.name}` : `From ${o.seller.name}`} ·{' '}
                  {o.billingBasis.toLowerCase()} basis
                  {o.ceilingCents != null && ` · ceiling ${money(o.ceilingCents)}`}
                </p>
              </div>
              <span className="chip chip--passive">{o.status}</span>
            </div>

            <p className="text-sm text-etyme-muted mb-4">{o.standing.says}</p>

            {o.milestones.length === 0 && (
              <p className="text-sm text-etyme-faint">No deliverables on this order.</p>
            )}

            <div className="space-y-2">
              {o.milestones.map((m) => (
                <div
                  key={m.id}
                  className={`border rounded-lg p-4 ${
                    m.late ? 'border-amber-200 bg-amber-50/40' : 'border-etyme-rule'
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm font-medium text-etyme-ink">{m.name}</p>
                      <p className="text-xs text-etyme-muted mt-0.5">
                        {money(m.amountCents)}
                        {m.dueOn && ` · due ${m.dueOn.slice(0, 10)}`}
                      </p>
                      <p className="text-xs text-etyme-muted mt-1">{m.billable.says}</p>
                      {m.late && (
                        <p className="text-xs text-etyme-attention mt-1">{m.late.says}</p>
                      )}
                      {m.rejectionReason && (
                        <p className="text-xs mt-1">
                          <span className="chip chip--attention">
                            {REASONS.find((r) => r.code === m.rejectionReason)?.label ??
                              m.rejectionReason}
                          </span>
                          {m.note && <span className="text-etyme-muted ml-2">{m.note}</span>}
                        </p>
                      )}
                      {m.waited.unknowns.length > 0 && (
                        <p className="text-[11px] text-etyme-faint mt-1">
                          {m.waited.unknowns[0]}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      <StatusChip status={m.status} />
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      {o.may.deliver && (m.status === 'PENDING' || m.status === 'REJECTED') && (
                        <button
                          onClick={() => deliver(m)}
                          className="text-xs px-3.5 py-2 bg-etyme-action text-white rounded"
                        >
                          Submit for acceptance
                        </button>
                      )}
                      {o.may.decide && m.status === 'DELIVERED' && (
                        <>
                          <button
                            onClick={() => decide(m, true)}
                            className="text-xs px-3.5 py-2 bg-etyme-verified text-white rounded"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => setRejecting(rejecting === m.id ? null : m.id)}
                            className="text-xs px-3 py-2 border border-etyme-rule rounded text-etyme-muted hover:text-etyme-ink"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {rejecting === m.id && (
                    <div className="mt-4 pt-4 border-t border-etyme-rule">
                      <p className="eyebrow mb-2">Why</p>
                      <div className="flex flex-wrap gap-2">
                        {REASONS.map((r) => (
                          <button
                            key={r.code}
                            onClick={() => decide(m, false, r.code)}
                            className="text-xs px-3 py-1.5 border border-etyme-rule rounded hover:border-etyme-attention hover:text-etyme-attention"
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-etyme-faint mt-2">
                        One of these, not a sentence. A reason nobody can count is a reason
                        nobody keeps.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

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

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACCEPTED: 'chip--verified',
    DELIVERED: 'chip--action',
    REJECTED: 'chip--attention',
    INVOICED: 'chip--passive',
    CANCELLED: 'chip--passive',
    PENDING: 'chip--passive',
  }
  return <span className={`chip ${map[status] ?? 'chip--passive'}`}>{status.toLowerCase()}</span>
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
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
