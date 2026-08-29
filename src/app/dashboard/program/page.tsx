'use client'

import { useEffect, useState } from 'react'
import { compact } from '@/lib/money-display'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Client Program Overview
 *
 * BRD §17.1 — the enterprise/demand perspective.
 * What a hiring manager at Terumo BCT sees: their contractors,
 * pending approvals, vendor performance, and upcoming endings.
 *
 * This is the demand-side demo centerpiece — the contingent
 * staffing layer for enterprise.
 */

// ── Types ──────────────────────────────────────────────────

interface ProgramData {
  client: { id: string; name: string }
  summary: {
    activeContractors: number
    vendors: number
    monthlySpend: number
    pendingApprovals: number
    openRoles: number
    endingSoon: number
  }
  contractors: {
    contractId: string
    person: { id: string; name: string; headline?: string }
    vendor: { id: string; name: string }
    engagement: { id: string; title: string } | null
    role: string | null
    billRate: number | null
    state: string
    startDate: string | null
    endDate: string | null
    daysRemaining: number | null
    pendingTimesheets: number
  }[]
  vendors: {
    id: string
    name: string
    headcount: number
    avgRate: number
    totalMonthlySpend: number
  }[]
  approvalQueue: {
    id: string
    kind: 'timesheet' | 'expense'
    person: string
    vendor: string
    detail: string
    amount: number | null
    submittedAt: string | null
    daysWaiting: number
  }[]
  openRoles: {
    id: string
    title: string
    status: string
    submissions: number
    shortlisted: number
  }[]
  endingSoon: {
    contractId: string
    person: { id: string; name: string }
    vendor: { id: string; name: string }
    endDate: string | null
    daysRemaining: number | null
    billRate: number | null
  }[]
}

type ViewScope = 'mine' | 'org'
type Tab = 'overview' | 'contractors' | 'approvals' | 'vendors' | 'roles'

// ── Page ───────────────────────────────────────────────────

/**
 * The number.
 *
 * How long from opening a role to the first submission worth reading.
 * Not the first CV — a supplier can flood an inbox in an hour, and a
 * number that cannot tell flooding from a shortlist is a number that
 * rewards flooding.
 *
 * It sits above everything else because it is the one figure a client
 * already knows for their current process, and the only one on this page
 * they can compare against how things work today.
 */
function TheNumber() {
  const [n, setN] = useState<any>(null)

  useEffect(() => {
    fetch('/api/first-good')
      .then(r => r.json())
      .then(b => { if (b.data) setN(b.data) })
      // A dashboard strip that cannot load should be absent, not a red
      // box above somebody's actual work.
      .catch(() => {})
  }, [])

  if (!n) return null

  return (
    <div className="border border-etyme-rule rounded-lg p-5 mt-6 bg-etyme-surface">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <div>
          <div className="eyebrow mb-1">First one worth reading</div>
          <div className="font-serif text-[34px] leading-none tabular-nums text-etyme-ink">
            {n.hours == null ? (
              <span className="text-etyme-faint text-[22px]">not yet</span>
            ) : (
              <>
                {n.hours}
                <span className="text-[16px] text-etyme-faint ml-1">hours</span>
              </>
            )}
          </div>
        </div>

        <div className="text-sm">
          <div className="text-etyme-muted">{n.trend.says}</div>
          <div className="text-etyme-faint text-xs mt-0.5">
            Bar is {n.target.says}. {n.reading.says}
          </div>
        </div>

        {n.hit && (
          <span className="chip chip--verified ml-auto">Inside the bar</span>
        )}
      </div>

      <p className="text-sm text-etyme-ink mt-3">{n.says}</p>

      {/* Where the work is. A role with forty CVs and nothing worth
          reading is somebody's whole afternoon. */}
      {n.stuck.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-etyme-rule space-y-1">
          {n.stuck.slice(0, 3).map((r: any) => (
            <li key={r.requirementId} className="text-xs text-etyme-muted">
              {r.says}
            </li>
          ))}
          {n.stuckTotal > 3 && (
            <li className="text-xs text-etyme-faint">
              and {n.stuckTotal - 3} more waiting
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default function ProgramPage() {
  const [data, setData] = useState<ProgramData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [scope, setScope] = useState<ViewScope>('mine')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  async function loadData() {
    try {
      const res = await fetch('/api/program')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      setData(body.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleApproveItem(item: ProgramData['approvalQueue'][number]) {
    try {
      if (item.kind === 'timesheet') {
        const res = await fetch(`/api/timesheets/${item.id}/approve`, { method: 'POST' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error?.message ?? 'Approval failed')
        }
      } else {
        const res = await fetch('/api/expenses/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve', expenseIds: [item.id] }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error?.message ?? 'Approval failed')
        }
      }
      setToast({ message: `${item.kind === 'timesheet' ? 'Timesheet' : 'Expense'} approved — ${item.person}`, type: 'success' })
      setTimeout(() => setToast(null), 3000)
      // Remove from local queue immediately
      if (data) {
        setData({
          ...data,
          approvalQueue: data.approvalQueue.filter(a => a.id !== item.id),
          summary: { ...data.summary, pendingApprovals: data.summary.pendingApprovals - 1 },
        })
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
      setTimeout(() => setToast(null), 4000)
    }
  }

  async function handleExtend(contractId: string) {
    try {
      const res = await fetch(`/api/contracts/${contractId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months: 3 }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Extension failed')
      setToast({ message: body.data.message, type: 'success' })
      loadData()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    }
    setTimeout(() => setToast(null), 3500)
  }

  async function handleRolloff(contractId: string) {
    try {
      const res = await fetch(`/api/contracts/${contractId}/rolloff`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Rolloff failed')
      setToast({ message: body.data.message, type: 'success' })
      loadData()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    }
    setTimeout(() => setToast(null), 3500)
  }

  if (loading) {
    return (
      <div className="card text-center py-16">
        <p className="text-sm text-etyme-muted">Loading program overview...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card text-center py-16">
        <p className="text-sm text-red-600">Could not load program data: {error}</p>
      </div>
    )
  }

  const s = data.summary
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Program' },
    { key: 'approvals', label: 'Approvals', count: s.pendingApprovals || undefined },
    { key: 'contractors', label: 'Contractors' },
    { key: 'vendors', label: 'Vendors' },
    { key: 'roles', label: 'Open roles', count: s.openRoles || undefined },
  ]

  return (
    <>
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="eyebrow mb-1">Program</div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] font-serif">
            {data.client.name}
          </h1>
          <p className="text-sm text-etyme-muted mt-1">
            Contingent workforce program — {s.activeContractors} active contractors across {s.vendors} vendor{s.vendors !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {/* The paper behind the programme. An order carries a ceiling, a
              contract carries a rate, and an agreement carries permission —
              three different questions, so three different places. */}
          <Link
            href={{ pathname: '/dashboard/program/agreements' }}
            className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted
                       hover:text-etyme-ink hover:border-etyme-muted transition-colors"
          >
            Agreements
          </Link>
          <Link
            href={{ pathname: '/dashboard/program/milestones' }}
            className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted
                       hover:text-etyme-ink hover:border-etyme-muted transition-colors"
          >
            Milestones
          </Link>
          <button
            onClick={() => setScope(scope === 'mine' ? 'org' : 'mine')}
            className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted
                       hover:text-etyme-ink hover:border-etyme-muted transition-colors"
          >
            {scope === 'mine' ? 'View all IT' : 'View my team'}
          </button>
        </div>
      </div>

      <TheNumber />

      {/* ── Summary cards ──────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 mb-6">
        <StatCard
          label="Contractors"
          value={s.activeContractors}
        />
        <StatCard
          label="Monthly spend"
          value={`$${Math.round(s.monthlySpend / 1000)}K`}
          sub="estimated"
        />
        <StatCard
          label="Pending"
          value={s.pendingApprovals}
          tone={s.pendingApprovals > 0 ? 'attention' : undefined}
          sub="needs you"
        />
        <StatCard
          label="Vendors"
          value={s.vendors}
        />
        <StatCard
          label="Open roles"
          value={s.openRoles}
          tone={s.openRoles > 0 ? 'action' : undefined}
        />
        <StatCard
          label="Ending soon"
          value={s.endingSoon}
          tone={s.endingSoon > 0 ? 'attention' : undefined}
          sub="within 60 days"
        />
      </div>

      {/* ── Tab bar ────────────────────────────── */}
      <div className="flex gap-1 mb-6 border-b border-etyme-rule">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`
              px-4 py-2.5 text-[13px] -mb-px flex items-center gap-2 transition-colors
              border-b-2
              ${tab === t.key
                ? 'text-etyme-ink font-semibold border-etyme-ink'
                : 'text-etyme-muted border-transparent hover:text-etyme-ink'
              }
            `}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`
                text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums
                ${tab === t.key
                  ? 'bg-etyme-ink text-white'
                  : 'bg-etyme-canvas text-etyme-muted'
                }
              `}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────── */}
      {tab === 'overview' && <OverviewTab data={data} onExtend={handleExtend} onRolloff={handleRolloff} />}
      {tab === 'approvals' && <ApprovalsTab items={data.approvalQueue} onApprove={handleApproveItem} />}
      {tab === 'contractors' && <ContractorsTab contractors={data.contractors} />}
      {tab === 'vendors' && <VendorsTab vendors={data.vendors} />}
      {tab === 'roles' && <RolesTab roles={data.openRoles} />}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
                         ${toast.type === 'success'
                           ? 'bg-etyme-verified text-white'
                           : 'bg-red-600 text-white'
                         } animate-slide-up`}>
          {toast.message}
        </div>
      )}
    </>
  )
}

// ── Stat card ─────────────────────────────────────────────

function StatCard({
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
  const toneColors = {
    attention: 'text-etyme-attention',
    action: 'text-etyme-action',
    verified: 'text-etyme-verified',
  }
  return (
    <div className="card py-3 px-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-1">
        {label}
      </p>
      <p className={`text-2xl font-semibold tabular-nums font-serif ${
        tone ? toneColors[tone] : 'text-etyme-ink'
      }`}>
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-etyme-faint mt-0.5">{sub}</p>
      )}
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────

function OverviewTab({ data, onExtend, onRolloff }: {
  data: ProgramData
  onExtend: (contractId: string) => void
  onRolloff: (contractId: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left column — main content */}
      <div className="lg:col-span-3 space-y-6">
        {/* Approval queue preview */}
        {data.approvalQueue.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Needs your attention</h2>
              <span className="text-[10px] font-semibold text-etyme-attention bg-etyme-attention/10 px-2 py-0.5 rounded-full tabular-nums">
                {data.approvalQueue.length} pending
              </span>
            </div>
            <div className="space-y-2">
              {data.approvalQueue.slice(0, 5).map(item => (
                <div
                  key={item.id}
                  className="flex items-start gap-4 py-2.5 border-b border-etyme-rule last:border-0"
                >
                  <span className={`
                    text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded
                    ${item.kind === 'timesheet'
                      ? 'bg-etyme-action/10 text-etyme-action'
                      : 'bg-etyme-attention/10 text-etyme-attention'
                    }
                  `}>
                    {item.kind}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-etyme-ink">{item.person}</p>
                    <p className="text-xs text-etyme-muted mt-0.5">
                      {item.detail}
                      {item.amount != null && ` · $${item.amount.toFixed(2)}`}
                      {' · '}{item.vendor}
                    </p>
                  </div>
                  <span className="text-[11px] text-etyme-muted tabular-nums whitespace-nowrap">
                    {item.daysWaiting > 0 ? `${item.daysWaiting}d ago` : 'today'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ending soon */}
        {data.endingSoon.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Contracts ending soon</h2>
              <span className="pill text-[10px] bg-amber-50 text-etyme-attention border border-amber-200">
                {data.endingSoon.length} within 60 days
              </span>
            </div>
            <div className="space-y-2">
              {data.endingSoon.map(c => (
                <div
                  key={c.contractId}
                  className={`flex items-center gap-4 py-3 px-4 rounded-lg border
                    ${c.daysRemaining != null && c.daysRemaining <= 14
                      ? 'border-red-200 bg-red-50/50'
                      : c.daysRemaining != null && c.daysRemaining <= 30
                        ? 'border-amber-200 bg-amber-50/50'
                        : 'border-etyme-rule'
                    }
                  `}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.person.name}</p>
                    <p className="text-xs text-etyme-muted">{c.vendor.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium tabular-nums ${
                      c.daysRemaining != null && c.daysRemaining <= 14 ? 'text-red-600' :
                      c.daysRemaining != null && c.daysRemaining <= 30 ? 'text-etyme-attention' :
                      'text-etyme-ink'
                    }`}>
                      {c.daysRemaining ?? '—'}d
                    </p>
                    <p className="text-[10px] text-etyme-muted">remaining</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onExtend(c.contractId)}
                      className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-ink
                                       hover:bg-etyme-canvas transition-colors"
                    >
                      Extend
                    </button>
                    <button
                      onClick={() => onRolloff(c.contractId)}
                      className="text-xs px-3 py-1.5 bg-etyme-attention text-white rounded
                                       hover:bg-etyme-attention/90 transition-colors"
                    >
                      Roll off
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right column — sidebar */}
      <div className="lg:col-span-2 space-y-6">
        {/* Vendor distribution */}
        <div className="card">
          <h2 className="text-sm font-semibold mb-4">Vendor distribution</h2>
          <div className="space-y-3">
            {data.vendors.map(v => {
              const pct = data.summary.activeContractors > 0
                ? Math.round((v.headcount / data.summary.activeContractors) * 100)
                : 0
              return (
                <div key={v.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-etyme-ink">{v.name}</span>
                    <span className="text-[10px] tabular-nums text-etyme-muted">
                      {v.headcount} · ${Math.round(v.totalMonthlySpend / 1000)}K/mo
                    </span>
                  </div>
                  <div className="w-full h-2 bg-etyme-canvas rounded-full">
                    <div
                      className="h-2 bg-etyme-action rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Open roles */}
        {data.openRoles.length > 0 && (
          <div className="card">
            <h2 className="text-sm font-semibold mb-3">Open roles</h2>
            <div className="space-y-2">
              {data.openRoles.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-etyme-rule last:border-0">
                  <div>
                    <p className="text-xs font-medium text-etyme-ink">{r.title}</p>
                    <p className="text-[10px] text-etyme-muted">
                      {r.submissions} submission{r.submissions !== 1 ? 's' : ''}
                      {r.shortlisted > 0 && ` · ${r.shortlisted} shortlisted`}
                    </p>
                  </div>
                  <span className={`pill text-[10px] ${
                    r.status === 'OPEN' ? 'bg-emerald-50 text-etyme-verified' : 'bg-etyme-canvas text-etyme-muted'
                  }`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Program health */}
        <div className="card">
          <h2 className="text-sm font-semibold mb-3">Program health</h2>
          <div className="space-y-3">
            <HealthItem
              label="Timesheets"
              status={data.approvalQueue.filter(a => a.kind === 'timesheet').length === 0 ? 'ok' : 'warn'}
              detail={
                data.approvalQueue.filter(a => a.kind === 'timesheet').length === 0
                  ? 'All current'
                  : `${data.approvalQueue.filter(a => a.kind === 'timesheet').length} awaiting approval`
              }
            />
            <HealthItem
              label="Expenses"
              status={data.approvalQueue.filter(a => a.kind === 'expense').length === 0 ? 'ok' : 'warn'}
              detail={
                data.approvalQueue.filter(a => a.kind === 'expense').length === 0
                  ? 'All reviewed'
                  : `${data.approvalQueue.filter(a => a.kind === 'expense').length} pending review`
              }
            />
            <HealthItem
              label="Contract endings"
              status={data.endingSoon.length === 0 ? 'ok' : 'warn'}
              detail={
                data.endingSoon.length === 0
                  ? 'Nothing within 60 days'
                  : `${data.endingSoon.length} ending within 60 days`
              }
            />
            <HealthItem
              label="Vendor count"
              status={data.vendors.length <= 4 ? 'ok' : 'flag'}
              detail={`${data.vendors.length} active vendor${data.vendors.length !== 1 ? 's' : ''}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Approvals tab ─────────────────────────────────────────

function ApprovalsTab({ items, onApprove }: { items: ProgramData['approvalQueue']; onApprove?: (item: ProgramData['approvalQueue'][number]) => void }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-lg font-serif text-etyme-ink mb-1">Queue clear</p>
        <p className="text-sm text-etyme-muted">No pending approvals across any vendor.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-serif font-semibold mb-1">
        {items.length} thing{items.length !== 1 ? 's' : ''} need you.
      </h2>
      <p className="text-sm text-etyme-muted mb-6">
        Timesheets, expenses, and signatures across every vendor in one queue
        instead of four inboxes.
      </p>
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.id}
            className={`card flex flex-wrap items-start gap-x-5 gap-y-3 ${
              item.daysWaiting >= 3 ? 'border-amber-200' : ''
            }`}
          >
            <div className="w-[80px] shrink-0 pt-0.5">
              <span className={`
                text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded border
                ${item.kind === 'timesheet'
                  ? 'bg-etyme-action/5 text-etyme-action border-etyme-action/20'
                  : 'bg-etyme-attention/5 text-etyme-attention border-etyme-attention/20'
                }
              `}>
                {item.kind}
              </span>
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-etyme-ink">{item.person}</p>
              <p className="text-xs text-etyme-muted mt-0.5">
                {item.detail}
                {item.amount != null && ` · $${item.amount.toFixed(2)}`}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">{item.vendor}</p>
            </div>
            <div className="text-xs text-etyme-muted tabular-nums pt-1">
              {item.daysWaiting > 0 ? `${item.daysWaiting}d waiting` : 'today'}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onApprove?.(item)}
                className="text-xs px-3.5 py-2 bg-etyme-verified text-white rounded
                                 hover:bg-etyme-verified/90 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => router.push(`/dashboard/conversations?new=1`)}
                className="text-xs px-3 py-2 border border-etyme-rule rounded text-etyme-muted
                                 hover:text-etyme-ink transition-colors"
              >
                Query
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Contractors tab ───────────────────────────────────────

type Contractor = ProgramData['contractors'][number]

const CONTRACTOR_COLUMNS: Column<Contractor>[] = [
  {
    key: 'person',
    label: 'Contractor',
    render: (row) => (
      <div>
        <div className="font-medium text-etyme-ink">{row.person.name}</div>
        {row.person.headline && (
          <div className="text-[11px] text-etyme-muted mt-0.5">{row.person.headline}</div>
        )}
      </div>
    ),
    sortValue: (row) => row.person.name,
  },
  {
    key: 'vendor',
    label: 'Vendor',
    render: (row) => <span className="text-etyme-muted">{row.vendor.name}</span>,
    sortValue: (row) => row.vendor.name,
  },
  {
    key: 'role',
    label: 'Role / Engagement',
    render: (row) => (
      <span className="text-etyme-muted">{row.engagement?.title ?? row.role ?? '—'}</span>
    ),
    sortValue: (row) => row.engagement?.title ?? row.role ?? '',
    hideOnMobile: true,
  },
  {
    key: 'billRate',
    label: 'Rate',
    align: 'right',
    render: (row) => (
      <span className="tabular-nums">
        {row.billRate != null ? `${compact(row.billRate)}/hr` : '—'}
      </span>
    ),
    sortValue: (row) => row.billRate ?? 0,
  },
  {
    key: 'daysRemaining',
    label: 'Days left',
    align: 'right',
    render: (row) => (
      <span className={`tabular-nums font-medium ${
        row.daysRemaining != null && row.daysRemaining <= 14 ? 'text-red-600' :
        row.daysRemaining != null && row.daysRemaining <= 30 ? 'text-etyme-attention' :
        'text-etyme-muted'
      }`}>
        {row.daysRemaining ?? '—'}
      </span>
    ),
    sortValue: (row) => row.daysRemaining ?? 9999,
  },
  {
    key: 'state',
    label: 'Status',
    render: (row) => (
      <span className={`chip ${
        row.state === 'IN_PROGRESS' ? 'chip--verified' :
        row.state === 'DRAFT' ? 'chip--passive' :
        'chip--action'
      }`}>
        {row.state === 'IN_PROGRESS' ? 'Active' : row.state}
      </span>
    ),
    sortValue: (row) => row.state,
  },
  {
    key: 'timesheets',
    label: 'Timesheets',
    align: 'right',
    render: (row) => row.pendingTimesheets > 0 ? (
      <span className="chip chip--attention">{row.pendingTimesheets} pending</span>
    ) : (
      <span className="text-xs text-etyme-muted">current</span>
    ),
    sortValue: (row) => row.pendingTimesheets,
    hideOnMobile: true,
  },
]

function ContractorsTab({ contractors }: { contractors: ProgramData['contractors'] }) {
  return (
    <div>
      <h2 className="text-lg font-serif font-semibold mb-1">
        {contractors.length} active contractor{contractors.length !== 1 ? 's' : ''}
      </h2>
      <p className="text-sm text-etyme-muted mb-6">
        Everyone placed here, their vendor, rate, and contract status.
      </p>
      <DataTable
        columns={CONTRACTOR_COLUMNS}
        data={contractors}
        rowKey={(row) => row.contractId}
        searchPlaceholder="Search by name, vendor, role…"
        searchFilter={(row, q) =>
          row.person.name.toLowerCase().includes(q) ||
          row.vendor.name.toLowerCase().includes(q) ||
          (row.engagement?.title?.toLowerCase().includes(q) ?? false) ||
          (row.role?.toLowerCase().includes(q) ?? false)
        }
        emptyMessage="No active contractors."
        exportName={`contractors-program`}
        rowClassName={(row) =>
          row.daysRemaining != null && row.daysRemaining <= 30 ? '!bg-amber-50/30' : ''
        }
      />
    </div>
  )
}

// ── Vendors tab ───────────────────────────────────────────

function VendorsTab({ vendors }: { vendors: ProgramData['vendors'] }) {
  const totalHeadcount = vendors.reduce((s, v) => s + v.headcount, 0)

  return (
    <div>
      <h2 className="text-lg font-serif font-semibold mb-1">
        {vendors.length} active vendor{vendors.length !== 1 ? 's' : ''}
      </h2>
      <p className="text-sm text-etyme-muted mb-6">
        Who is placing contractors here, how many, and at what rates.
      </p>

      <div className="space-y-4">
        {vendors.map(v => {
          const pct = totalHeadcount > 0
            ? Math.round((v.headcount / totalHeadcount) * 100)
            : 0

          return (
            <div key={v.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-etyme-ink">{v.name}</h3>
                  <p className="text-xs text-etyme-muted mt-0.5">
                    {v.headcount} contractor{v.headcount !== 1 ? 's' : ''} · {pct}% of program
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums font-serif">
                    ${Math.round(v.totalMonthlySpend / 1000)}K
                  </p>
                  <p className="text-[10px] text-etyme-muted">monthly spend</p>
                </div>
              </div>

              {/* Share bar */}
              <div className="w-full h-2.5 bg-etyme-canvas rounded-full mb-3">
                <div
                  className="h-2.5 bg-etyme-action rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-etyme-muted mb-0.5">
                    Avg rate
                  </p>
                  <p className="text-sm tabular-nums font-medium">
                    {compact(v.avgRate)}/hr
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-etyme-muted mb-0.5">
                    Headcount
                  </p>
                  <p className="text-sm tabular-nums font-medium">{v.headcount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-etyme-muted mb-0.5">
                    Share
                  </p>
                  <p className="text-sm tabular-nums font-medium">{pct}%</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Open roles tab ────────────────────────────────────────

function RolesTab({ roles }: { roles: ProgramData['openRoles'] }) {
  const router = useRouter()

  if (roles.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-sm text-etyme-muted">No open roles.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-serif font-semibold mb-1">
        {roles.length} open role{roles.length !== 1 ? 's' : ''}
      </h2>
      <p className="text-sm text-etyme-muted mb-6">
        Requirements distributed to your vendor panel.
      </p>

      <div className="space-y-3">
        {roles.map(r => (
          <div key={r.id} className="card flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-etyme-ink">{r.title}</h3>
              <p className="text-xs text-etyme-muted mt-1">
                {r.submissions} submission{r.submissions !== 1 ? 's' : ''}
                {r.shortlisted > 0 && ` · ${r.shortlisted} shortlisted`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`pill text-[10px] ${
                r.status === 'OPEN' ? 'bg-emerald-50 text-etyme-verified' : 'bg-etyme-canvas text-etyme-muted'
              }`}>
                {r.status}
              </span>
              <button
                onClick={() => router.push(`/dashboard/submissions?requirementId=${r.id}`)}
                className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted
                                 hover:text-etyme-ink transition-colors"
              >
                View candidates
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Health status indicator ───────────────────────────────

function HealthItem({
  label,
  status,
  detail,
}: {
  label: string
  status: 'ok' | 'warn' | 'flag'
  detail: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`
        w-2 h-2 rounded-full flex-shrink-0
        ${status === 'ok' ? 'bg-etyme-verified' :
          status === 'warn' ? 'bg-etyme-attention' :
          'bg-red-500'
        }
      `} />
      <div className="flex-1">
        <p className="text-xs font-medium text-etyme-ink">{label}</p>
        <p className="text-[10px] text-etyme-muted">{detail}</p>
      </div>
    </div>
  )
}
