'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Invoices working surface — the Operate section.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * BUILD.md §3: GET /api/invoices returns aging buckets.
 *
 * LEGACY_RULES.md §4: Invoice states:
 *   DRAFT → ISSUED → SUBMITTED → PAID / PARTIALLY_PAID / CANCELLED
 *
 * Aging buckets: Current, 1–30, 31–60, 61–90, 90+
 * The aging bar at top gives an instant AR health read.
 */

// ── Types ────────────────────────────────────────────

interface InvoicePayment {
  id: string
  amount: number
  receivedAt: string
}

interface Invoice {
  id: string
  number: string
  engagement: {
    id: string
    title: string
    vendorCompany: { id: string; name: string }
    clientCompany: { id: string; name: string }
  }
  periodStart: string
  periodEnd: string
  currency: string
  total: number
  paid: number
  outstanding: number
  dueAt: string
  status: string
  aging: string
  daysOverdue: number
  payments: InvoicePayment[]
}

interface AgingSummary {
  totalOutstanding: number
  current: number
  '1-30': number
  '31-60': number
  '61-90': number
  '90+': number
  invoiceCount: number
}

type StatusFilter = 'ALL' | 'ISSUED' | 'SUBMITTED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'

// ── Status chip class ───────────────────────────────

function statusChipClass(status: string): string {
  const map: Record<string, string> = {
    DRAFT:          'chip--passive',
    ISSUED:         'chip--action',
    SUBMITTED:      'chip--action',
    PARTIALLY_PAID: 'chip--attention',
    PAID:           'chip--verified',
    CANCELLED:      'chip--danger',
  }
  return map[status] ?? 'chip--passive'
}

// ── Aging colour ────────────────────────────────────

function agingColor(bucket: string): string {
  const map: Record<string, string> = {
    'current': 'text-etyme-verified',
    '1-30':    'text-etyme-attention',
    '31-60':   'text-etyme-attention',
    '61-90':   'text-red-600',
    '90+':     'text-red-700',
  }
  return map[bucket] ?? 'text-etyme-muted'
}

// ── Format currency ─────────────────────────────────

function fmtCurrency(amount: number): string {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── Generate Invoice Modal ───────────────────────────

interface EngagementOption {
  id: string
  title: string
  clientName: string
}

function GenerateInvoiceModal({
  onClose,
  onGenerated,
}: {
  onClose: () => void
  onGenerated: (msg: string) => void
}) {
  const [engagements, setEngagements] = useState<EngagementOption[]>([])
  const [loadingEngagements, setLoadingEngagements] = useState(true)
  const [engagementId, setEngagementId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch active sell contracts to extract engagement options
  useEffect(() => {
    setLoadingEngagements(true)
    fetch('/api/contracts?side=sell&state=IN_PROGRESS&limit=100')
      .then((r) => r.json())
      .then((body) => {
        const contracts = body.data?.contracts ?? []
        // Extract unique engagements from contracts
        const seen = new Map<string, EngagementOption>()
        for (const c of contracts) {
          if (c.engagement?.id && !seen.has(c.engagement.id)) {
            seen.set(c.engagement.id, {
              id: c.engagement.id,
              title: c.engagement.title,
              clientName: c.endClientCompany?.name ?? c.clientCompany?.name ?? 'Unknown',
            })
          }
        }
        const list = Array.from(seen.values())
        setEngagements(list)
        if (list.length === 1) setEngagementId(list[0].id)
      })
      .catch(() => {})
      .finally(() => setLoadingEngagements(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!engagementId) {
      setError('Select an engagement')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload: Record<string, string> = { engagementId }
      if (periodStart) payload.periodStart = periodStart
      if (periodEnd) payload.periodEnd = periodEnd

      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to generate invoice')
        return
      }

      const body = await res.json()
      const msg = body.data?.message ?? 'Invoice generated'
      onGenerated(msg)
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Generate invoice</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Engagement *</label>
            {loadingEngagements ? (
              <p className="text-sm text-etyme-faint animate-pulse py-2">Loading engagements…</p>
            ) : engagements.length > 0 ? (
              <select
                required
                value={engagementId}
                onChange={(e) => setEngagementId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="">Select engagement…</option>
                {engagements.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.title} — {eng.clientName}
                  </option>
                ))}
              </select>
            ) : (
              <div>
                <p className="text-[11px] text-etyme-faint mb-1">
                  No active engagements found. Enter an engagement ID directly.
                </p>
                <input
                  type="text"
                  required
                  value={engagementId}
                  onChange={(e) => setEngagementId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                  placeholder="Engagement ID"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Period start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              />
              <p className="text-[10px] text-etyme-faint mt-1">Optional — filters timesheets</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Period end</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              />
              <p className="text-[10px] text-etyme-faint mt-1">Optional — filters timesheets</p>
            </div>
          </div>

          <div className="rounded-lg bg-etyme-canvas px-4 py-3 text-[12px] text-etyme-muted">
            Generates an invoice from all approved, uninvoiced timesheets under the selected engagement.
            {periodStart || periodEnd ? ' Filtered to the specified period.' : ' Covers all available periods.'}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? 'Generating…' : 'Generate invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function InvoicesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<AgingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showGenerate, setShowGenerate] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Open the generate modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowGenerate(true)
      router.replace('/dashboard/invoices', { scroll: false })
    }
  }, [searchParams, router])

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/invoices?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setInvoices(body.data?.invoices ?? [])
      setSummary(body.data?.summary ?? null)
    } catch (err: any) {
      setError(err.message)
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // ── Computed stats ────────────────────────────────
  const totalOutstanding = summary?.totalOutstanding ?? 0
  const overdueAmount = (summary?.['1-30'] ?? 0) + (summary?.['31-60'] ?? 0) + (summary?.['61-90'] ?? 0) + (summary?.['90+'] ?? 0)
  const paidCount = invoices.filter((i) => i.status === 'PAID').length
  const issuedCount = invoices.filter((i) => ['ISSUED', 'SUBMITTED'].includes(i.status)).length

  // ── Aging bar segments (visual proportion) ────────
  const agingBuckets = [
    { key: 'current', label: 'Current', color: 'bg-etyme-verified', amount: summary?.current ?? 0 },
    { key: '1-30', label: '1–30 days', color: 'bg-amber-400', amount: summary?.['1-30'] ?? 0 },
    { key: '31-60', label: '31–60 days', color: 'bg-orange-500', amount: summary?.['31-60'] ?? 0 },
    { key: '61-90', label: '61–90 days', color: 'bg-red-500', amount: summary?.['61-90'] ?? 0 },
    { key: '90+', label: '90+ days', color: 'bg-red-700', amount: summary?.['90+'] ?? 0 },
  ]
  const agingTotal = agingBuckets.reduce((s, b) => s + b.amount, 0)

  // ── Column definitions ────────────────────────────
  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      label: 'Invoice',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink font-mono text-[12px]">{row.number}</p>
          <p className="text-[11px] text-etyme-faint truncate max-w-[140px]">
            {row.engagement.title}
          </p>
        </div>
      ),
      sortValue: (row) => row.number,
      width: 'min-w-[160px]',
    },
    {
      key: 'client',
      label: 'Client',
      render: (row) => (
        <span className="text-etyme-ink">{row.engagement.clientCompany.name}</span>
      ),
      sortValue: (row) => row.engagement.clientCompany.name,
      hideOnMobile: true,
    },
    {
      key: 'period',
      label: 'Period',
      render: (row) => {
        const s = new Date(row.periodStart)
        const e = new Date(row.periodEnd)
        const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
        return (
          <span className="text-[12px] tabular-nums">
            {s.toLocaleDateString('en-US', opts)} – {e.toLocaleDateString('en-US', opts)}
          </span>
        )
      },
      sortValue: (row) => new Date(row.periodStart).getTime(),
      hideOnMobile: true,
    },
    {
      key: 'total',
      label: 'Total',
      render: (row) => (
        <span className="tabular-nums font-medium">{fmtCurrency(row.total)}</span>
      ),
      sortValue: (row) => row.total,
      align: 'right' as const,
    },
    {
      key: 'paid',
      label: 'Paid',
      render: (row) => (
        <span className="tabular-nums text-etyme-verified">{fmtCurrency(row.paid)}</span>
      ),
      sortValue: (row) => row.paid,
      align: 'right' as const,
      hideOnMobile: true,
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      render: (row) => (
        <span className={`tabular-nums font-medium ${row.outstanding > 0 ? agingColor(row.aging) : 'text-etyme-muted'}`}>
          {row.outstanding > 0 ? fmtCurrency(row.outstanding) : '—'}
        </span>
      ),
      sortValue: (row) => row.outstanding,
      align: 'right' as const,
    },
    {
      key: 'dueAt',
      label: 'Due',
      render: (row) => {
        const due = new Date(row.dueAt)
        return (
          <div className="text-right">
            <span className="text-[12px] tabular-nums">
              {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {row.daysOverdue > 0 && row.status !== 'PAID' && (
              <p className={`text-[10px] tabular-nums ${agingColor(row.aging)}`}>
                {row.daysOverdue}d overdue
              </p>
            )}
          </div>
        )
      },
      sortValue: (row) => new Date(row.dueAt).getTime(),
      align: 'right' as const,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`chip ${statusChipClass(row.status)}`}>
          {row.status === 'PARTIALLY_PAID' ? 'Partial' : row.status.charAt(0) + row.status.slice(1).toLowerCase()}
        </span>
      ),
      sortValue: (row) => row.status,
    },
  ]

  // ── Search filter ─────────────────────────────────
  const searchFilter = (row: Invoice, q: string) =>
    row.number.toLowerCase().includes(q) ||
    row.engagement.title.toLowerCase().includes(q) ||
    row.engagement.clientCompany.name.toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  // ── Status filter options ─────────────────────────
  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'ISSUED', label: 'Issued' },
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'PARTIALLY_PAID', label: 'Partial' },
    { key: 'PAID', label: 'Paid' },
    { key: 'CANCELLED', label: 'Cancelled' },
  ]

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + actions */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Operate</p>
          <h1>Invoices</h1>
          <p>Accounts receivable against sell contracts. Generate from approved timesheets, track payments, and monitor aging.</p>
        </div>
        <button onClick={() => setShowGenerate(true)} className="btn-primary mt-3 shrink-0">
          + Generate
        </button>
      </div>

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Outstanding</p>
          <p className={`stat-value ${totalOutstanding > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {fmtCurrency(totalOutstanding)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">accounts receivable</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Overdue</p>
          <p className={`stat-value ${overdueAmount > 0 ? 'text-red-600' : 'text-etyme-ink'}`}>
            {fmtCurrency(overdueAmount)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{overdueAmount > 0 ? 'past due date' : 'none overdue'}</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Open invoices</p>
          <p className="stat-value text-etyme-ink">{issuedCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">awaiting payment</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Paid</p>
          <p className="stat-value text-etyme-verified">{paidCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">this period</p>
        </div>
      </div>

      {/* Aging bar — visual AR health indicator */}
      {summary && agingTotal > 0 && (
        <div className="panel mb-6">
          <p className="stat-label mb-2">Aging breakdown</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-etyme-canvas">
            {agingBuckets.map((bucket) =>
              bucket.amount > 0 ? (
                <div
                  key={bucket.key}
                  className={`${bucket.color} transition-all`}
                  style={{ width: `${(bucket.amount / agingTotal) * 100}%` }}
                  title={`${bucket.label}: ${fmtCurrency(bucket.amount)}`}
                />
              ) : null
            )}
          </div>
          <div className="flex gap-4 mt-2 flex-wrap">
            {agingBuckets.map((bucket) => (
              <div key={bucket.key} className="flex items-center gap-1.5 text-[11px]">
                <span className={`w-2 h-2 rounded-full ${bucket.color}`} />
                <span className="text-etyme-muted">{bucket.label}</span>
                <span className="tabular-nums font-medium text-etyme-ink">
                  {fmtCurrency(bucket.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status filters — prototype filter-tab pattern */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {statusOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            className={`filter-tab ${
              statusFilter === opt.key ? 'filter-tab--active' : 'filter-tab--inactive'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Data table */}
      <DataTable<Invoice>
        columns={columns}
        data={invoices}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by invoice number, engagement, or client…"
        emptyMessage={statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} invoices.` : 'No invoices yet.'}
        emptyDetail="Invoices are generated from approved timesheets. Approve timesheets first, then generate invoices here."
        exportName="invoices"
        selectable
        bulkActions={(selected) => (
          <>
            <button className="px-3 py-1.5 text-[11px] font-medium rounded-md
                               bg-etyme-action text-white hover:bg-etyme-action/90
                               transition-colors">
              Submit ({selected.size})
            </button>
            <button className="px-3 py-1.5 text-[11px] font-medium rounded-md
                               border border-etyme-rule text-etyme-muted
                               hover:bg-etyme-canvas transition-colors">
              Export selected
            </button>
          </>
        )}
        rowClassName={(row) =>
          row.aging === '90+' ? 'bg-red-50/30' :
          row.aging === '61-90' ? 'bg-red-50/20' :
          ''
        }
        defaultPageSize={20}
      />

      {/* Footer */}
      {!loading && invoices.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase().replace('_', ' ')}`}
        </p>
      )}

      {/* Generate Invoice modal */}
      {showGenerate && (
        <GenerateInvoiceModal
          onClose={() => setShowGenerate(false)}
          onGenerated={(msg) => {
            setToast({ message: msg, type: 'success' })
            setTimeout(() => setToast(null), 4000)
            fetchInvoices()
          }}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
          toast.type === 'success'
            ? 'bg-etyme-verified text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </>
  )
}
