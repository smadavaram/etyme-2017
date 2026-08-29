'use client'

import { useEffect, useState, useCallback } from 'react'
import { compact as fmtMinor, amount as fmtMinorExact } from '@/lib/money-display'
import { minorPerUnit } from '@/lib/money'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'
import { useSession } from '@/components/session-provider'
import { pageFraming } from '@/lib/page-framing'

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
  /** Minor units — cents, pence. The route converts at the edge. */
  amountMinor: number
  currency: string
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
  /** RECEIVABLE — ours to collect. PAYABLE — ours to pay. Never summed. */
  direction: 'RECEIVABLE' | 'PAYABLE' | 'NEITHER'
  periodStart: string
  periodEnd: string
  /** The day it was actually billed. Null on rows raised before it was held. */
  issuedAt: string | null
  currency: string
  /** Minor units throughout. `units: 'MINOR'` on the summary says so. */
  totalMinor: number
  paidMinor: number
  outstandingMinor: number
  dueAt: string
  status: string
  aging: string
  daysOverdue: number
  payments: InvoicePayment[]
}

type AgingKey = 'current' | '1-30' | '31-60' | '61-90' | '90+'

/**
 * One currency's book, on one side of the ledger.
 *
 * The summary used to be a single flat object with one `totalOutstanding`
 * on it, and that one number was wrong three ways: it added a firm's own
 * supplier bills to what it was owed, it added dollars to rupees, and it
 * was in whole currency while every row beside it was in cents. There is
 * no arrangement of those that produces one honest figure, so there is
 * no longer one figure.
 */
interface CurrencySummary {
  currency: string
  outstandingMinor: number
  overdueMinor: number
  buckets: Record<AgingKey, { count: number; minor: number }>
  invoiceCount: number
}

interface AgingSummary {
  units: 'MINOR'
  /** Ours to collect. */
  receivable: CurrencySummary[]
  /** Ours to pay. Never added to the line above. */
  payable: CurrencySummary[]
  unattributedCount: number
  gaps: string[]
  says: string
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

// ── Invoice Detail Drawer ────────────────────────────

const PAYMENT_METHODS = ['Wire', 'ACH', 'Check', 'Credit Card', 'Other'] as const

interface CodingRow {
  personName: string
  costCenterCode: string | null
  costCenterName: string | null
  glAccount: string | null
  share: string
  amount: number
  codingOwner: string
  codingIsPayers: boolean
}

interface InvoiceCoding {
  purchaseOrder: string | null
  purchaseOrderBalance: {
    number: string
    amountCents: number
    invoicedCents: number
    remainingCents: number
    consumedPercent: number
    overdrawn: boolean
    canInvoice: boolean
    reason: string
  } | null
  remitTo: {
    legalName: string
    addressLines: string[]
    taxId: string | null
    paymentMethod: string
    bankName: string | null
    accountLast4: string | null
  } | null
  billTo: { id: string; name: string }
  rows: CodingRow[]
  reconciliation: {
    invoiceTotal: number
    codedTotal: number
    balanced: boolean
    uncodedLines: number
    codedForEndClient: boolean
  }
}

function InvoiceDetailDrawer({
  invoice,
  onClose,
  onPaymentRecorded,
  onToast,
}: {
  invoice: Invoice
  onClose: () => void
  onPaymentRecorded: () => void
  onToast: (message: string, type?: 'success' | 'error') => void
}) {
  const [coding, setCoding] = useState<InvoiceCoding | null>(null)
  const [codingLoading, setCodingLoading] = useState(true)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<string>('Wire')
  const [payReference, setPayReference] = useState('')

  // AP coding — the PO, remit-to and cost-centre split their finance team
  // needs to post this. Hidden rather than errored if the caller is not a
  // party to the invoice.
  useEffect(() => {
    let cancelled = false
    async function loadCoding() {
      setCodingLoading(true)
      try {
        const res = await fetch(`/api/invoices/${invoice.id}/coding`)
        if (!res.ok) throw new Error('not available')
        const body = await res.json()
        if (!cancelled) setCoding(body.data)
      } catch {
        if (!cancelled) setCoding(null)
      } finally {
        if (!cancelled) setCodingLoading(false)
      }
    }
    loadCoding()
    return () => { cancelled = true }
  }, [invoice.id])
  const [submitting, setSubmitting] = useState(false)
  const [payments, setPayments] = useState<InvoicePayment[]>(invoice.payments ?? [])
  // Minor units, like everything else on this screen. The payments route
  // still speaks whole currency, so the conversion happens where the two
  // meet and nowhere else.
  const per = minorPerUnit(invoice.currency)
  const [localPaid, setLocalPaid] = useState(invoice.paidMinor)
  const [localOutstanding, setLocalOutstanding] = useState(invoice.outstandingMinor)
  const [localStatus, setLocalStatus] = useState(invoice.status)

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()

    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) {
      onToast('Enter a valid payment amount', 'error')
      return
    }

    if (Math.round(amount * per) > localOutstanding) {
      onToast('Payment amount exceeds outstanding balance', 'error')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          method: payMethod,
          reference: payReference || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        onToast(body.error?.message ?? 'Failed to record payment', 'error')
        return
      }

      const body = await res.json()
      const payment = body.data?.payment
      const updatedInvoice = body.data?.invoice

      // Update local state with the response data
      if (payment) {
        setPayments((prev) => [...prev, payment])
      }
      if (updatedInvoice) {
        setLocalPaid(
          updatedInvoice.paid != null
            ? Math.round(updatedInvoice.paid * per)
            : localPaid + Math.round(amount * per)
        )
        setLocalOutstanding(
          updatedInvoice.outstanding != null
            ? Math.round(updatedInvoice.outstanding * per)
            : localOutstanding - Math.round(amount * per)
        )
        setLocalStatus(updatedInvoice.status ?? localStatus)
      } else {
        // Fallback: compute locally
        setLocalPaid((prev) => prev + Math.round(amount * per))
        setLocalOutstanding((prev) => prev - Math.round(amount * per))
        if (localOutstanding - Math.round(amount * per) <= 0) {
          setLocalStatus('PAID')
        } else {
          setLocalStatus('PARTIALLY_PAID')
        }
      }

      // Reset form
      setPayAmount('')
      setPayReference('')

      onToast(`Payment of ${fmtMinorExact(Math.round(amount * per), invoice.currency)} recorded`)
      onPaymentRecorded()
    } catch {
      onToast('Network error. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const periodOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const periodStart = new Date(invoice.periodStart).toLocaleDateString('en-US', periodOpts)
  const periodEnd = new Date(invoice.periodEnd).toLocaleDateString('en-US', periodOpts)
  const dueDate = new Date(invoice.dueAt).toLocaleDateString('en-US', periodOpts)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-etyme-rule flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold font-mono">{invoice.number}</h2>
            <p className="text-[13px] text-etyme-muted mt-0.5">
              {invoice.engagement.clientCompany.name}
            </p>
          </div>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status + aging */}
          <div className="flex items-center gap-3">
            <span className={`chip ${statusChipClass(localStatus)}`}>
              {localStatus === 'PARTIALLY_PAID' ? 'Partially paid' : localStatus.charAt(0) + localStatus.slice(1).toLowerCase()}
            </span>
            {invoice.daysOverdue > 0 && localStatus !== 'PAID' && (
              <span className={`text-[12px] font-medium tabular-nums ${agingColor(invoice.aging)}`}>
                {invoice.daysOverdue}d overdue
              </span>
            )}
          </div>

          {/* Engagement */}
          <div>
            <p className="eyebrow mb-1">Engagement</p>
            <p className="text-sm">{invoice.engagement.title}</p>
          </div>

          {/* AP references — PO and remit-to. Without both, AP has no basis to pay. */}
          {!codingLoading && coding && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="eyebrow mb-1">Purchase order</p>
                  {coding.purchaseOrder ? (
                    <>
                      <p className="text-sm font-mono">{coding.purchaseOrder}</p>
                      {coding.purchaseOrderBalance && (
                        <p className={`text-[11px] tabular-nums mt-0.5 ${
                          coding.purchaseOrderBalance.overdrawn ? 'text-etyme-attention' : 'text-etyme-muted'
                        }`}>
                          ${(coding.purchaseOrderBalance.remainingCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} left
                          {' · '}{coding.purchaseOrderBalance.consumedPercent}% drawn
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-etyme-attention">Not referenced</p>
                  )}
                </div>
                <div>
                  <p className="eyebrow mb-1">Remit to</p>
                  {coding.remitTo ? (
                    <p className="text-sm">{coding.remitTo.legalName}</p>
                  ) : (
                    <p className="text-sm text-etyme-attention">Not set</p>
                  )}
                </div>
              </div>

              {coding.remitTo && (
                <div className="bg-etyme-canvas rounded-lg px-3 py-2.5 -mt-2">
                  <p className="text-[11px] text-etyme-muted">
                    {coding.remitTo.paymentMethod}
                    {coding.remitTo.bankName && ` · ${coding.remitTo.bankName}`}
                    {coding.remitTo.accountLast4 && ` ····${coding.remitTo.accountLast4}`}
                  </p>
                  {coding.remitTo.taxId && (
                    <p className="text-[11px] text-etyme-faint mt-0.5">Tax ID {coding.remitTo.taxId}</p>
                  )}
                </div>
              )}

              {/* Cost coding */}
              {coding.rows.length > 0 && (
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="eyebrow">Cost coding</p>
                    <a
                      href={`/api/invoices/${invoice.id}/coding?format=csv`}
                      className="text-[11px] text-etyme-action hover:underline"
                    >
                      Export CSV
                    </a>
                  </div>

                  <div className="space-y-1.5">
                    {coding.rows.map((r, i) => (
                      <div key={i} className="bg-etyme-canvas rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] text-etyme-ink truncate">{r.personName}</span>
                          <span className="text-[13px] tabular-nums font-medium shrink-0">
                            ${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-etyme-muted">
                          {r.costCenterCode ? (
                            <>
                              <span className="font-mono">{r.costCenterCode}</span>
                              <span className="truncate">{r.costCenterName}</span>
                              {r.glAccount && <span className="text-etyme-faint">GL {r.glAccount}</span>}
                              {r.share !== '100%' && <span className="chip chip--passive text-[10px]">{r.share}</span>}
                            </>
                          ) : (
                            <span className="text-etyme-attention">Not coded — AP must code by hand</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reconciliation — the coded rows must total the invoice */}
                  <div className="flex items-center justify-between mt-2 text-[11px]">
                    <span className={coding.reconciliation.balanced ? 'text-etyme-verified' : 'text-etyme-attention'}>
                      {coding.reconciliation.balanced
                        ? '✓ Coded total matches the invoice'
                        : `Coded total is $${coding.reconciliation.codedTotal.toFixed(2)} against $${coding.reconciliation.invoiceTotal.toFixed(2)}`}
                    </span>
                  </div>

                  {coding.reconciliation.codedForEndClient && (
                    <p className="text-[11px] text-etyme-muted mt-1.5 italic">
                      These are the end client&rsquo;s cost centres. {coding.billTo.name} codes
                      its own onward invoice separately.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Period + due date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="eyebrow mb-1">Period</p>
              <p className="text-sm tabular-nums">{periodStart} &ndash; {periodEnd}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Due date</p>
              <p className={`text-sm tabular-nums ${invoice.daysOverdue > 0 && localStatus !== 'PAID' ? agingColor(invoice.aging) : ''}`}>
                {dueDate}
              </p>
            </div>
          </div>

          {/* Amounts */}
          <div className="rounded-lg bg-etyme-canvas p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-etyme-muted">Total</p>
              <p className="text-sm font-medium tabular-nums">{fmtMinorExact(invoice.totalMinor, invoice.currency)}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-etyme-muted">Paid</p>
              <p className="text-sm font-medium tabular-nums text-etyme-verified">{fmtMinorExact(localPaid, invoice.currency)}</p>
            </div>
            <div className="border-t border-etyme-rule pt-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-etyme-muted">Outstanding</p>
              <p className={`text-sm font-semibold tabular-nums ${localOutstanding > 0 ? agingColor(invoice.aging) : 'text-etyme-muted'}`}>
                {localOutstanding > 0 ? fmtMinorExact(localOutstanding, invoice.currency) : 'Paid in full'}
              </p>
            </div>
            {invoice.totalMinor > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden bg-etyme-rule/30">
                <div
                  className="bg-etyme-verified transition-all rounded-full"
                  style={{ width: `${Math.min(100, (localPaid / invoice.totalMinor) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Payment history */}
          <div>
            <p className="eyebrow mb-2">Payments ({payments.length})</p>
            {payments.length > 0 ? (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-etyme-rule last:border-0">
                    <div>
                      <p className="text-sm tabular-nums font-medium text-etyme-verified">
                        {fmtMinorExact(p.amountMinor, p.currency)}
                      </p>
                      <p className="text-[11px] text-etyme-faint">
                        {new Date(p.receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-etyme-faint">No payments recorded</p>
            )}
          </div>

          {/* Record payment form — only show if there is outstanding balance */}
          {localOutstanding > 0 && (
            <div className="border-t border-etyme-rule pt-6">
              <p className="eyebrow mb-3">Record payment</p>
              <form onSubmit={handleRecordPayment} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-etyme-muted mb-1">Amount *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-etyme-muted text-sm">$</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      max={localOutstanding / per}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder={`Up to ${fmtMinorExact(localOutstanding, invoice.currency)}`}
                      className="w-full pl-7 pr-3 py-2 text-sm border border-etyme-rule rounded-lg
                                 focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                                 tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-etyme-muted mb-1">Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                               focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-etyme-muted mb-1">Reference</label>
                  <input
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="Check number, wire reference, etc."
                    className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {submitting ? 'Recording…' : 'Record payment'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function InvoicesPage() {
  const { company } = useSession()
  const isClient = company?.kind === 'CLIENT'
  const framing = pageFraming(company?.kind ?? 'VENDOR', 'invoices')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<AgingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showGenerate, setShowGenerate] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  /** Which side of the ledger the totals describe. Never both at once. */
  const [side, setSide] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE')
  const [bookCurrency, setBookCurrency] = useState<string | null>(null)
  const [submittingBulk, setSubmittingBulk] = useState(false)

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

  // ── Bulk actions ──────────────────────────────────

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleBulkSubmit = useCallback(async (selected: Set<string>, clearSelection: () => void) => {
    const count = selected.size
    if (count === 0) return

    setSubmittingBulk(true)
    try {
      const res = await fetch('/api/invoices/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: Array.from(selected) }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        showToast(body.error?.message ?? 'Failed to submit invoices', 'error')
        return
      }

      const body = await res.json()
      const { submitted, skipped } = body.data ?? {}

      if (submitted > 0) {
        const parts = [`${submitted} invoice${submitted !== 1 ? 's' : ''} submitted`]
        if (skipped > 0) parts.push(`${skipped} skipped (not in ISSUED status)`)
        showToast(parts.join('. '))
      } else {
        showToast(`No invoices were submitted — ${skipped ?? 0} skipped (not in ISSUED status)`, 'error')
      }

      clearSelection()
      fetchInvoices()
    } catch {
      showToast('Network error. Please try again.', 'error')
    } finally {
      setSubmittingBulk(false)
    }
  }, [showToast, fetchInvoices])

  const handleExportSelected = useCallback((selected: Set<string>) => {
    const rows = invoices.filter((inv) => selected.has(inv.id))
    if (rows.length === 0) return

    const headers = [
      'Invoice Number', 'Client', 'Engagement', 'Period Start', 'Period End',
      'Total', 'Paid', 'Outstanding', 'Status', 'Due Date',
    ]

    const csvRows = rows.map((inv) => {
      const periodStart = new Date(inv.periodStart).toLocaleDateString('en-US')
      const periodEnd = new Date(inv.periodEnd).toLocaleDateString('en-US')
      const dueDate = new Date(inv.dueAt).toLocaleDateString('en-US')
      return [
        inv.number,
        inv.engagement.clientCompany.name,
        inv.engagement.title,
        periodStart,
        periodEnd,
        (inv.totalMinor / minorPerUnit(inv.currency)).toFixed(2),
        (inv.paidMinor / minorPerUnit(inv.currency)).toFixed(2),
        (inv.outstandingMinor / minorPerUnit(inv.currency)).toFixed(2),
        inv.status,
        dueDate,
      ]
    })

    const csv = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)

    showToast(`Exported ${rows.length} invoice${rows.length !== 1 ? 's' : ''}`)
  }, [invoices, showToast])

  // ── Computed stats ────────────────────────────────
  //
  // One book at a time. There is no total across currencies and no total
  // across the two sides of the ledger, because neither would mean
  // anything — a firm that both sells and buys used to see its own
  // supplier bills raise the bar labelled outstanding.
  const books = summary
    ? (side === 'RECEIVABLE' ? summary.receivable : summary.payable)
    : []
  const book =
    books.find((b) => b.currency === bookCurrency) ?? books[0] ?? null

  const outstandingMinor = book?.outstandingMinor ?? 0
  const overdueMinor = book?.overdueMinor ?? 0
  const bookCcy = book?.currency ?? 'USD'
  const paidCount = invoices.filter((i) => i.status === 'PAID').length
  const issuedCount = invoices.filter((i) => ['ISSUED', 'SUBMITTED'].includes(i.status)).length

  // ── Aging bar segments (visual proportion) ────────
  const agingBuckets: { key: AgingKey; label: string; color: string; minor: number }[] = [
    { key: 'current', label: 'Current', color: 'bg-etyme-verified', minor: book?.buckets.current.minor ?? 0 },
    { key: '1-30', label: '1–30 days', color: 'bg-amber-400', minor: book?.buckets['1-30'].minor ?? 0 },
    { key: '31-60', label: '31–60 days', color: 'bg-orange-500', minor: book?.buckets['31-60'].minor ?? 0 },
    { key: '61-90', label: '61–90 days', color: 'bg-red-500', minor: book?.buckets['61-90'].minor ?? 0 },
    { key: '90+', label: '90+ days', color: 'bg-red-700', minor: book?.buckets['90+'].minor ?? 0 },
  ]
  const agingTotal = agingBuckets.reduce((s, b) => s + b.minor, 0)

  // ── Column definitions ────────────────────────────
  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      label: 'Invoice',
      render: (row) => (
        <div>
          <a href={`/dashboard/invoices/${row.id}`}
            className="font-medium text-etyme-ink font-mono text-[12px] hover:text-etyme-action">
            {row.number}
          </a>
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
        <span className="tabular-nums font-medium">{fmtMinor(row.totalMinor, row.currency)}</span>
      ),
      sortValue: (row) => row.totalMinor,
      align: 'right' as const,
    },
    {
      key: 'paid',
      label: 'Paid',
      render: (row) => (
        <span className="tabular-nums text-etyme-verified">{fmtMinor(row.paidMinor, row.currency)}</span>
      ),
      sortValue: (row) => row.paidMinor,
      align: 'right' as const,
      hideOnMobile: true,
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      render: (row) => (
        <span className={`tabular-nums font-medium ${row.outstandingMinor > 0 ? agingColor(row.aging) : 'text-etyme-muted'}`}>
          {row.outstandingMinor > 0 ? fmtMinor(row.outstandingMinor, row.currency) : '—'}
        </span>
      ),
      sortValue: (row) => row.outstandingMinor,
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
          <p className="eyebrow">{framing.eyebrow}</p>
          <h1>{framing.title}</h1>
          <p>{framing.subtitle}</p>
        </div>
        <button onClick={() => setShowGenerate(true)} className="btn-primary mt-3 shrink-0">
          + Generate
        </button>
      </div>

      {/* Which side of the ledger, and which currency. Never summed. */}
      {summary && (summary.payable.length > 0 || summary.receivable.length + summary.payable.length > 1) && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="stat-label">Showing</span>
          {(['RECEIVABLE', 'PAYABLE'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSide(s); setBookCurrency(null) }}
              className={`chip ${side === s ? 'chip--action' : 'chip--passive'}`}
            >
              {s === 'RECEIVABLE' ? 'Owed to us' : 'We owe'}
            </button>
          ))}
          {books.length > 1 && books.map((b) => (
            <button
              key={b.currency}
              onClick={() => setBookCurrency(b.currency)}
              className={`chip ${b.currency === bookCcy ? 'chip--action' : 'chip--passive'}`}
            >
              {b.currency}
            </button>
          ))}
          <span className="text-[11px] text-etyme-faint">
            What we are owed and what we owe are never added, and neither are two currencies.
          </span>
        </div>
      )}

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Outstanding</p>
          <p className={`stat-value ${outstandingMinor > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {fmtMinor(outstandingMinor, bookCcy)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {side === 'RECEIVABLE' ? 'owed to us' : 'we owe'} · {bookCcy}
          </p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Overdue</p>
          <p className={`stat-value ${overdueMinor > 0 ? 'text-red-600' : 'text-etyme-ink'}`}>
            {fmtMinor(overdueMinor, bookCcy)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{overdueMinor > 0 ? 'past due date' : 'none overdue'}</p>
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
          <p className="stat-label mb-2">
            Aging breakdown — {side === 'RECEIVABLE' ? 'owed to us' : 'we owe'}, {bookCcy}
          </p>
          <div className="flex h-3 rounded-full overflow-hidden bg-etyme-canvas">
            {agingBuckets.map((bucket) =>
              bucket.minor > 0 ? (
                <div
                  key={bucket.key}
                  className={`${bucket.color} transition-all`}
                  style={{ width: `${(bucket.minor / agingTotal) * 100}%` }}
                  title={`${bucket.label}: ${fmtMinorExact(bucket.minor, bookCcy)}`}
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
                  {fmtMinor(bucket.minor, bookCcy)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What the totals could not honestly include */}
      {summary && summary.gaps.length > 0 && (
        <div className="panel mb-6" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="stat-label">What these totals leave out</p>
          <ul className="mt-2 space-y-1">
            {summary.gaps.map((g, i) => (
              <li key={i} className="text-[13px] text-etyme-muted">— {g}</li>
            ))}
          </ul>
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
        onRowClick={(row) => setSelectedInvoice(row)}
        bulkActions={(selected, clearSelection) => (
          <>
            <button
              onClick={() => handleBulkSubmit(selected, clearSelection)}
              disabled={submittingBulk}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
                               bg-etyme-action text-white hover:bg-etyme-action/90
                               transition-colors disabled:opacity-50">
              {submittingBulk ? 'Submitting…' : `Submit (${selected.size})`}
            </button>
            <button
              onClick={() => handleExportSelected(selected)}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
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

      {/* Invoice detail drawer */}
      {selectedInvoice && (
        <InvoiceDetailDrawer
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onPaymentRecorded={() => {
            fetchInvoices()
            // Refresh the drawer's invoice data from the updated list
          }}
          onToast={showToast}
        />
      )}

      {/* Generate Invoice modal */}
      {showGenerate && (
        <GenerateInvoiceModal
          onClose={() => setShowGenerate(false)}
          onGenerated={(msg) => {
            showToast(msg)
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
