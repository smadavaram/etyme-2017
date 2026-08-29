'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'
import { useSession } from '@/components/session-provider'
import { pageFraming } from '@/lib/page-framing'

/**
 * Expenses working surface — reimbursable and company expenses.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * BUILD.md §6.3: "Client-billable expenses appear on invoices."
 *
 * LEGACY_RULES.md §4.4:
 *   Three bill types → two kinds: CLIENT_BILLABLE and COMPANY (internal).
 *   Lifecycle: DRAFT → SUBMITTED → APPROVED → INVOICED → PAID or → REJECTED
 *   Amount = sum(unitPrice × quantity) from line items.
 *
 * Categories: TRAVEL · EQUIPMENT · TRAINING · RELOCATION · MEALS · OTHER
 */

// ── Types ────────────────────────────────────────────

interface Expense {
  id: string
  person: { id: string; name: string }
  client: { id: string; name: string }
  sellContractId: string
  category: string
  billable: boolean
  description: string
  periodStart: string
  periodEnd: string
  items: { description: string; quantity: number; unitPrice: number; expenseType?: string }[]
  total: number
  receiptUrl: string | null
  status: string
  submittedAt: string | null
  approvedAt: string | null
  rejectedReason: string | null
  createdAt: string
}

type StatusFilter = 'ALL' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'INVOICED' | 'PAID' | 'REJECTED'
type KindFilter = 'all' | 'billable' | 'internal'

// ── Status styling ───────────────────────────────────

function statusChipClass(status: string): string {
  const map: Record<string, string> = {
    DRAFT:    'chip--passive',
    SUBMITTED:'chip--attention',
    APPROVED: 'chip--verified',
    INVOICED: 'chip--action',
    PAID:     'chip--verified',
    REJECTED: 'chip--danger',
  }
  return map[status] ?? 'chip--passive'
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    TRAVEL:     '✈ Travel',
    EQUIPMENT:  '🖥 Equipment',
    TRAINING:   '📚 Training',
    RELOCATION: '🏠 Relocation',
    MEALS:      '🍽 Meals',
    OTHER:      '📋 Other',
  }
  return map[cat] ?? cat
}

// ── Currency formatting ──────────────────────────────

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents)
}

// ── Date helpers ─────────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

// ── Contract option for the consultant dropdown ─────

interface ContractOption {
  id: string
  personId: string
  personName: string
  clientName: string
}

// ── Line item shape ─────────────────────────────────

interface LineItem {
  description: string
  quantity: number
  unitPrice: string // dollars as string for input; converted to cents on POST
}

const CATEGORIES = ['TRAVEL', 'EQUIPMENT', 'TRAINING', 'RELOCATION', 'MEALS', 'OTHER'] as const

function emptyItem(): LineItem {
  return { description: '', quantity: 1, unitPrice: '' }
}

// ── Add Expense Modal ───────────────────────────────

function AddExpenseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [contracts, setContracts] = useState<ContractOption[]>([])
  const [loadingContracts, setLoadingContracts] = useState(true)

  const [sellContractId, setSellContractId] = useState('')
  const [personId, setPersonId] = useState('')
  const [category, setCategory] = useState('')
  const [billable, setBillable] = useState(true)
  const [description, setDescription] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [receiptUrl, setReceiptUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch active sell contracts on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/contracts?side=sell&state=IN_PROGRESS&limit=100')
        if (res.ok) {
          const body = await res.json()
          const raw = body.data?.contracts ?? []
          setContracts(
            raw.map((c: any) => ({
              id: c.id,
              personId: c.person?.id ?? c.personId,
              personName: c.person?.name ?? 'Unknown',
              clientName: c.clientCompany?.name ?? c.clientName ?? 'Unknown',
            }))
          )
        }
      } catch {
        // Non-fatal — the dropdown will just be empty
      } finally {
        setLoadingContracts(false)
      }
    }
    load()
  }, [])

  function handleContractChange(contractId: string) {
    setSellContractId(contractId)
    const match = contracts.find((c) => c.id === contractId)
    setPersonId(match?.personId ?? '')
  }

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  // Compute running total in dollars
  const runningTotal = items.reduce((sum, item) => {
    const price = parseFloat(item.unitPrice) || 0
    return sum + item.quantity * price
  }, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const payload = {
        sellContractId,
        personId,
        category,
        billable,
        description,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        items: items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round((parseFloat(item.unitPrice) || 0) * 100),
        })),
        receiptUrl: receiptUrl || undefined,
      }

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error?.message ?? 'Failed to create expense')
        return
      }

      onCreated()
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action'
  const labelClass = 'block text-xs font-semibold text-etyme-muted mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="card w-full max-w-2xl mx-4 animate-slide-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add expense</h2>
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
          {/* Consultant (sell contract) */}
          <div>
            <label className={labelClass}>Consultant *</label>
            <select
              required
              value={sellContractId}
              onChange={(e) => handleContractChange(e.target.value)}
              className={`${inputClass} bg-white`}
            >
              <option value="">
                {loadingContracts ? 'Loading contracts…' : 'Select consultant…'}
              </option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.personName} — {c.clientName}
                </option>
              ))}
            </select>
          </div>

          {/* Category + Billable */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Category *</label>
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`${inputClass} bg-white`}
              >
                <option value="">Select category…</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0) + cat.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={billable}
                  onChange={(e) => setBillable(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-etyme-rule text-etyme-action focus:ring-etyme-action/20"
                />
                <span>
                  <span className="text-sm font-medium text-etyme-ink">Client-billable</span>
                  <span className="block text-[11px] text-etyme-faint">(appears on invoices)</span>
                </span>
              </label>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description *</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              placeholder="Travel to client site for Q3 onboarding"
            />
          </div>

          {/* Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start date *</label>
              <input
                type="date"
                required
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>End date *</label>
              <input
                type="date"
                required
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <label className={labelClass}>Line items *</label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <input
                    type="text"
                    required
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    className={`${inputClass} flex-[3]`}
                    placeholder="Description"
                  />
                  <input
                    type="number"
                    required
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                    className={`${inputClass} flex-[1] tabular-nums`}
                    placeholder="Qty"
                  />
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                    className={`${inputClass} flex-[1.5] tabular-nums`}
                    placeholder="$ Price"
                  />
                  <span className="flex-[1] text-sm tabular-nums text-etyme-muted pt-2 text-right whitespace-nowrap">
                    {formatUSD(item.quantity * (parseFloat(item.unitPrice) || 0))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length <= 1}
                    className="text-etyme-faint hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed pt-2"
                    title="Remove item"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <button
                type="button"
                onClick={addItem}
                className="text-sm text-etyme-action hover:underline font-medium"
              >
                + Add item
              </button>
              <span className="text-sm font-semibold tabular-nums text-etyme-ink">
                Total: {formatUSD(runningTotal)}
              </span>
            </div>
          </div>

          {/* Receipt URL */}
          <div>
            <label className={labelClass}>Receipt URL</label>
            <input
              type="url"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              className={inputClass}
              placeholder="https://…"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
              {submitting ? 'Creating…' : 'Add expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function ExpensesPage() {
  const { company } = useSession()
  const isClient = company?.kind === 'CLIENT'
  const framing = pageFraming(company?.kind ?? 'VENDOR', 'expenses')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [totals, setTotals] = useState({ grand: 0, billable: 0, billableCount: 0, internal: 0, internalCount: 0 })
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Open the add modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowModal(true)
      router.replace('/dashboard/expenses', { scroll: false })
    }
  }, [searchParams, router])

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (kindFilter !== 'all') params.set('billable', kindFilter === 'billable' ? 'true' : 'false')

      const res = await fetch(`/api/expenses?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setExpenses(body.data?.expenses ?? [])
      setTotals(body.data?.totals ?? { grand: 0, billable: 0, billableCount: 0, internal: 0, internalCount: 0 })
    } catch (err: any) {
      setError(err.message)
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, kindFilter])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  // ── Batch actions ──────────────────────────────────

  async function handleBatchAction(action: string, ids?: string[]) {
    const targetIds = ids ?? expenses.filter((e) => {
      if (action === 'submit') return e.status === 'DRAFT'
      if (action === 'approve') return e.status === 'SUBMITTED'
      return false
    }).map((e) => e.id)

    if (targetIds.length === 0) return

    setActionLoading(true)
    try {
      const res = await fetch('/api/expenses/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expenseIds: targetIds }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `Action failed`)
      }

      const body = await res.json()
      const processed = body.data?.processed ?? targetIds.length
      const errors = body.data?.errors ?? 0
      const label = action === 'submit' ? 'Submitted' : action === 'approve' ? 'Approved' : action.charAt(0).toUpperCase() + action.slice(1)
      const msg = errors > 0
        ? `${label} ${processed}, ${errors} failed`
        : `${label} ${processed} expense${processed !== 1 ? 's' : ''}`
      setToast({ message: msg, type: errors > 0 ? 'error' : 'success' })
      setTimeout(() => setToast(null), 3500)

      await fetchExpenses()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setActionLoading(false)
    }
  }

  // ── Stats ──────────────────────────────────────────
  const stats = {
    total: expenses.length,
    pending: expenses.filter((e) => e.status === 'SUBMITTED').length,
    approved: expenses.filter((e) => e.status === 'APPROVED').length,
    totalAmount: expenses.reduce((sum, e) => sum + e.total, 0),
  }

  // ── Filter by status ──────────────────────────────
  const filtered = statusFilter === 'ALL'
    ? expenses
    : expenses.filter((e) => e.status === statusFilter)

  // ── Column definitions ─────────────────────────────
  const columns: Column<Expense>[] = [
    {
      key: 'person',
      label: 'Consultant',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.person.name}</p>
          <p className="text-[11px] text-etyme-faint truncate max-w-[180px]">{row.description}</p>
        </div>
      ),
      sortValue: (row) => row.person.name,
      width: 'min-w-[200px]',
    },
    {
      key: 'client',
      label: 'Client',
      render: (row) => (
        <span className="text-etyme-ink">{row.client.name}</span>
      ),
      sortValue: (row) => row.client.name,
      hideOnMobile: true,
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (
        <span className="text-[13px]">{categoryLabel(row.category)}</span>
      ),
      sortValue: (row) => row.category,
    },
    {
      key: 'kind',
      label: 'Kind',
      render: (row) => (
        <span className={`chip ${row.billable ? 'chip--action' : 'chip--passive'}`}>
          {row.billable ? 'Billable' : 'Internal'}
        </span>
      ),
      sortValue: (row) => row.billable ? 'Billable' : 'Internal',
      hideOnMobile: true,
    },
    {
      key: 'items',
      label: 'Items',
      render: (row) => (
        <span className="tabular-nums text-etyme-muted">
          {row.items.length} item{row.items.length !== 1 ? 's' : ''}
        </span>
      ),
      sortValue: (row) => row.items.length,
      align: 'right' as const,
      hideOnMobile: true,
    },
    {
      key: 'total',
      label: 'Amount',
      render: (row) => (
        <span className="tabular-nums font-medium">
          {formatUSD(row.total)}
        </span>
      ),
      sortValue: (row) => row.total,
      align: 'right' as const,
    },
    {
      key: 'period',
      label: 'Period',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] tabular-nums">
          {formatPeriod(row.periodStart, row.periodEnd)}
        </span>
      ),
      sortValue: (row) => new Date(row.periodStart).getTime(),
      hideOnMobile: true,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`chip ${statusChipClass(row.status)}`}>{row.status}</span>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (row) => (
        <span className="text-etyme-muted text-[12px] tabular-nums" title={new Date(row.createdAt).toLocaleString()}>
          {timeAgo(row.createdAt)}
        </span>
      ),
      sortValue: (row) => new Date(row.createdAt).getTime(),
      align: 'right' as const,
      hideOnMobile: true,
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Expense, q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.client.name.toLowerCase().includes(q) ||
    row.category.toLowerCase().includes(q) ||
    row.description.toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q) ||
    (row.billable ? 'billable' : 'internal').includes(q)

  // ── Status filter options ──────────────────────────
  const statusOptions: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'DRAFT', label: 'Draft', count: expenses.filter((e) => e.status === 'DRAFT').length },
    { key: 'SUBMITTED', label: 'Submitted', count: expenses.filter((e) => e.status === 'SUBMITTED').length },
    { key: 'APPROVED', label: 'Approved', count: expenses.filter((e) => e.status === 'APPROVED').length },
    { key: 'INVOICED', label: 'Invoiced' },
    { key: 'PAID', label: 'Paid' },
    { key: 'REJECTED', label: 'Rejected' },
  ]

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + kind toggle */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">{framing.eyebrow}</p>
          <h1>{framing.title}</h1>
          <p>{framing.subtitle}</p>
        </div>

        {/* Kind toggle + New button */}
        <div className="flex items-center gap-3 mt-3 shrink-0">
          <div className="flex bg-etyme-canvas rounded-md p-0.5">
            {(['all', 'billable', 'internal'] as KindFilter[]).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={`px-4 py-2 text-[13px] font-medium rounded transition-colors capitalize ${
                  kindFilter === k
                    ? 'bg-white shadow-sm text-etyme-ink'
                    : 'text-etyme-muted hover:text-etyme-ink'
                }`}
              >
                {k === 'all' ? 'All' : k === 'billable' ? 'Billable' : 'Internal'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            + New
          </button>
        </div>
      </div>

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total expenses</p>
          <p className="stat-value text-etyme-ink">{formatUSD(totals.grand)}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{stats.total} reports</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Client-billable</p>
          <p className={`stat-value ${totals.billable > 0 ? 'text-etyme-action' : 'text-etyme-ink'}`}>
            {formatUSD(totals.billable)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{totals.billableCount} reports</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Internal</p>
          <p className="stat-value text-etyme-ink">{formatUSD(totals.internal)}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{totals.internalCount} reports</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Pending approval</p>
          <p className={`stat-value ${stats.pending > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {stats.pending}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">awaiting review</p>
        </div>
      </div>

      {/* Action bar */}
      {(stats.pending > 0 || expenses.some((e) => e.status === 'DRAFT')) && (
        <div className="flex gap-2 mb-4">
          {expenses.some((e) => e.status === 'DRAFT') && (
            <button
              onClick={() => handleBatchAction('submit')}
              disabled={actionLoading}
              className="btn-secondary text-[13px] disabled:opacity-50"
            >
              {actionLoading ? 'Processing…' : `Submit all drafts (${expenses.filter((e) => e.status === 'DRAFT').length})`}
            </button>
          )}
          {stats.pending > 0 && (
            <button
              onClick={() => handleBatchAction('approve')}
              disabled={actionLoading}
              className="btn-primary text-[13px] disabled:opacity-50"
            >
              {actionLoading ? 'Processing…' : `Approve all submitted (${stats.pending})`}
            </button>
          )}
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
            {opt.count !== undefined && opt.count > 0 && (
              <span className="ml-1 text-[10px] opacity-60">({opt.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Data table */}
      <DataTable<Expense>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by consultant, client, category, or status…"
        emptyMessage={statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} expenses.` : 'No expenses yet.'}
        emptyDetail="Expenses are created when consultants submit reimbursable costs against their sell contracts."
        exportName={`expenses-${kindFilter}`}
        defaultPageSize={20}
      />

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase()}`}
          {kindFilter !== 'all' && ` · ${kindFilter}`}
          {` · ${formatUSD(filtered.reduce((sum, e) => sum + e.total, 0))}`}
        </p>
      )}

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

      {/* Add Expense Modal */}
      {showModal && (
        <AddExpenseModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setToast({ message: 'Expense created', type: 'success' })
            setTimeout(() => setToast(null), 3500)
            fetchExpenses()
          }}
        />
      )}
    </>
  )
}
