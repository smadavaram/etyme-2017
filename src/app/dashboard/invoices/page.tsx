'use client'

import { useEffect, useState, useCallback } from 'react'
import { AGE_BANDS, segmentStyle } from '@/lib/chart-colors'
import { compact as fmtMinor, amount as fmtMinorExact, fromUnits } from '@/lib/money-display'
import { minorPerUnit } from '@/lib/money'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListSurface, type Column } from '@/components/list-surface'
import { useSession } from '@/components/session-provider'
import { pageFraming } from '@/lib/page-framing'
import { openingSide, counterpartyOf, counterpartyHeading, sidesOffered, openCountSays } from '@/lib/money/invoice-parties'
import { booksFrom, booksHref, otherBooks, switchLabel, BOOKS_PARAM, OWN, type Books } from '@/lib/money/books-view'

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

/**
 * The other firm on this row, named from the reader's own side.
 *
 * This said `clientCompany` on every row, so a client reading its own
 * payables saw its own name eleven times under a column headed CLIENT —
 * the invoice is TO the client, and on a client's screen that is
 * itself. `lib/order-naming`'s rule, one layer along: the reader's side
 * decides the words. Ours to collect names the client; ours to pay
 * names the supplier that billed us.
 *
 * An invoice with no agreement, no order and no line behind it cannot
 * name either firm, and a blank in a column is read as a loading state,
 * so it says what is missing instead.
 */
function counterpartyName(inv: Invoice): string {
  return counterpartyOf(inv.direction, {
    vendor: inv.engagement.vendorCompany ?? null,
    client: inv.engagement.clientCompany ?? null,
    basis: null,
    says: inv.engagement.between ?? '',
  }).firm?.name ?? 'Not yet attributed'
}

interface Invoice {
  id: string
  number: string
  engagement: {
    id: string
    title: string
    /**
     * The two firms, from whichever document says — the agreement, the
     * order, or a line billed on it. Null where nothing behind the
     * invoice could say, and `between` is the sentence for that.
     */
    vendorCompany: { id: string; name?: string | null } | null
    clientCompany: { id: string; name?: string | null } | null
    /** "Veritan Talent bills Northbend Athletic, from order PO-4471." */
    between?: string
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
  /**
   * What the payer needs to decide, on an invoice this firm is asked to
   * pay (lib/money/receipt-read). Null on the side that collects.
   */
  receipt?: {
    people: string[]
    jobs: string[]
    weeks: number
    hoursBilled: number
    hoursSigned: number | null
    matches: boolean
    row: string
    verdict: string
    requirementId: string | null
    supplierId: string | null
    po: { number: string; leftMinor: number | null } | null
  } | null
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
  /** What we owe in all, bills and keyed-in invoice receipts, one book per currency. */
  owedInAll?: { books: { currency: string; owedMinor: number; overdueMinor: number; openCount: number; fromBills: number; fromReceipts: number }[]; says: string } | null
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

// ── Aging color ────────────────────────────────────

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
  /** Who the bill would go to. Null where nothing on the paper says. */
  clientName: string | null
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
  /** Why there is nothing to bill, where there is nothing to bill. */
  const [nothingToBill, setNothingToBill] = useState<string | null>(null)
  const [engagementId, setEngagementId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // What this firm may bill — asked of the route that will refuse it.
  //
  // This was built out of `/api/contracts?side=sell`, which answers
  // "what may this seat read". A program office sitting at a client's
  // desk may read the client's whole book, so the picker offered it
  // every one of that client's suppliers' engagements and the button
  // answered 403: "This engagement is Arcadia Tech Group's to bill, not
  // Aptiva Workforce's." The sentence was right; offering the row was
  // the bug. Reading is not billing, and a picker is a row of buttons.
  useEffect(() => {
    setLoadingEngagements(true)
    fetch('/api/invoices/generate')
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) {
          setNothingToBill(body.error?.message ?? 'This desk cannot raise a bill.')
          return
        }
        const list: EngagementOption[] = body.data?.engagements ?? []
        setEngagements(list)
        setNothingToBill(list.length === 0 ? body.data?.says ?? null : null)
        if (list.length === 1) setEngagementId(list[0].id)
      })
      .catch(() => setNothingToBill('The list of engagements could not be read. Try again.'))
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
        setError(body.error?.message ?? 'Failed to generate the bill')
        return
      }

      const body = await res.json()
      // What the run left off is part of the answer: undecided overtime,
      // and weeks the firm above has not accepted. A short bill read
      // without those sentences reads as a short month.
      const msg = [
        body.data?.message ?? 'Bill generated',
        body.data?.overtime?.says,
        body.data?.heldBack?.says,
      ].filter(Boolean).join(' ')
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
          <h2 className="text-lg font-semibold">Generate bill</h2>
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
                    {eng.clientName ? `${eng.title} — ${eng.clientName}` : eng.title}
                  </option>
                ))}
              </select>
            ) : (
              // Nothing to bill is an answer, and it is a sentence.
              //
              // This used to be a text box asking a human to type an
              // engagement id — a database identifier, offered to
              // somebody who has never seen one, as the way out of an
              // empty list. Nobody types an id, and the one thing they
              // could have typed was the id of a deal the route would
              // have refused anyway.
              <p className="text-[13px] text-etyme-muted">
                {nothingToBill ??
                  'There is no engagement here to bill. A bill is raised by the firm that ' +
                    'supplied the people, against its own live placements.'}
              </p>
            )}
          </div>

          {/* Dates and a description of what the button does, only where
              there is a button. A dialog that says there is nothing to
              bill and then asks for a period reads as a bug. */}
          {(engagements.length > 0 || loadingEngagements) && (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            Generates a bill from all approved timesheets under the selected engagement that are not yet billed.
            {periodStart || periodEnd ? ' Filtered to the specified period.' : ' Covers all available periods.'}
          </div>
          </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              {engagements.length === 0 && !loadingEngagements ? 'Close' : 'Cancel'}
            </button>
            {/* No button where there is nothing it could do. */}
            {(engagements.length > 0 || loadingEngagements) && (
              <button
                type="submit"
                disabled={submitting || !engagementId}
                className="btn-primary disabled:opacity-50"
              >
                {submitting ? 'Generating…' : 'Generate bill'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

/** The status as a payer says it. */
function payableStatusWords(status: string): string {
  switch (status) {
    case 'ISSUED': return 'not submitted yet'
    case 'SUBMITTED': return 'submitted'
    case 'PARTIALLY_PAID': return 'part paid'
    case 'PAID': return 'paid'
    case 'CANCELLED': return 'cancelled'
    default: return status.toLowerCase().replace('_', ' ')
  }
}

/**
 * The one thing a payer may do with the row next.
 *
 * Pay — only where it passed the check and was submitted, and it opens
 * the invoice's own page, where the check and the form sit together.
 * Ask the supplier — on the thread about the job, with the question
 * written first, because a hold nobody explains is a phone call.
 */
function PayerAction({ row, onToast }: { row: Invoice; onToast: (m: string, t?: 'success' | 'error') => void }) {
  const r = row.receipt
  if (!r || row.outstandingMinor <= 0 || row.status === 'CANCELLED') return null
  const payable = r.matches && (row.status === 'SUBMITTED' || row.status === 'PARTIALLY_PAID')

  async function ask(e: React.MouseEvent) {
    e.stopPropagation()
    if (!r?.requirementId || !r.supplierId) return
    const question = window.prompt(`What do you want to ask ${counterpartyName(row)} about invoice ${row.number}?`)
    if (!question?.trim()) return
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'REQUIREMENT',
        topicId: r.requirementId,
        withCompanyId: r.supplierId,
        initialMessage: `About invoice ${row.number}: ${question.trim()}`,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      onToast(body.error?.message ?? 'The question was not sent.', 'error')
      return
    }
    window.location.href = `/dashboard/conversations?open=${body.data.conversation.id}`
  }

  return (
    <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
      {payable && (
        <a href={`/dashboard/invoices/${row.id}#pay`} className="btn-primary text-[11px] px-3 py-1">
          Pay
        </a>
      )}
      {r.requirementId && r.supplierId && (
        <button onClick={ask} className="text-[11px] text-etyme-action hover:underline whitespace-nowrap">
          Ask the supplier
        </button>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function InvoicesPage() {
  const { company } = useSession()
  const isClient = company?.kind === 'CLIENT'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<AgingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showGenerate, setShowGenerate] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  /**
   * Which side of the ledger the totals describe. Never both at once.
   *
   * Null until somebody chooses, and then it is the reader's own side:
   * a client opened on "Owed to us" — $0, always, for a company that
   * never sells — above a table of six invoices it owed, and the cards
   * and the rows disagreed until somebody pressed the other chip.
   */
  const [sideChosen, setSideChosen] = useState<'RECEIVABLE' | 'PAYABLE' | null>(null)
  // With no switch offered, the reader is on the one side that holds
  // something — a firm whose book is all payables is not left looking
  // at an empty "to collect" with no way across.
  const side =
    sideChosen ??
    (summary && summary.receivable.length === 0 && summary.payable.length > 0
      ? 'PAYABLE'
      : summary && summary.payable.length === 0 && summary.receivable.length > 0
        ? 'RECEIVABLE'
        : openingSide(company?.kind))
  const setSide = setSideChosen

  /**
   * The rows under the chip that says "Showing".
   *
   * The chip used to move the stat cards and leave the table alone, so
   * a client read $0 owed to it above six invoices it owed. A row
   * nothing can attribute stays on both sides: it is in no total and
   * somebody still has to finish it, and dropping it off the list is
   * how it stays unfinished.
   */
  const shown = invoices.filter((i) => i.direction === side || i.direction === 'NEITHER')

  /** "Client" for a firm that sells, "Supplier" for one that buys. */
  const counterpartyLabel = counterpartyHeading(shown.map((i) => i.direction), side)

  const [bookCurrency, setBookCurrency] = useState<string | null>(null)
  const [submittingBulk, setSubmittingBulk] = useState(false)
  // Whose invoice book is on screen, and the way back to the reader's
  // own where a program office is sitting at a client's desk.
  const [reading, setReading] = useState<
    { company: string; inASeat: boolean; says: string | null } | null
  >(null)
  // The words over the rows, from the same block that decided the rows.
  //
  // Declared below `reading` on purpose: it reads that state, and a
  // `const` read above its own declaration is a temporal-dead-zone
  // throw, not a stale value. A program office at Cavanaugh Glassworks'
  // desk was reading Aptiva Workforce's own headings over Cavanaugh's
  // book — "Sell · What you bill clients" over seven buy-side lines at
  // a firm that bills nobody.
  const framing = pageFraming(company?.kind ?? 'VENDOR', 'invoices', reading)
  // Whose book, read out of the URL and written back into it.
  //
  // It was React state only: `?books=own` did nothing on load, a
  // refresh put the reader back on the client's book without saying so,
  // and nobody could link a colleague to what they were reading. These
  // are two companies' money, so a view that does not survive a reload
  // is a total somebody will read as the wrong firm's.
  const whoseBooks = booksFrom(searchParams.get(BOOKS_PARAM))
  const ownBooks = whoseBooks === 'own'
  const readInstead = useCallback(
    (next: Books) => router.replace(booksHref('/dashboard/invoices', next) as any, { scroll: false }),
    [router]
  )

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
      if (ownBooks) params.set(BOOKS_PARAM, OWN)

      const res = await fetch(`/api/invoices?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setInvoices(body.data?.invoices ?? [])
      setSummary(body.data?.summary ?? null)
      setReading(body.data?.reading ?? null)
    } catch (err: any) {
      setError(err.message)
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, ownBooks])

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
        showToast(body.error?.message ?? 'Failed to submit bills', 'error')
        return
      }

      const body = await res.json()
      const { submitted, skipped } = body.data ?? {}

      if (submitted > 0) {
        const parts = [`${submitted} bill${submitted !== 1 ? 's' : ''} submitted`]
        if (skipped > 0) parts.push(`${skipped} skipped (not in ISSUED status)`)
        showToast(parts.join('. '))
      } else {
        showToast(`No bills were submitted — ${skipped ?? 0} skipped (not in ISSUED status)`, 'error')
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
      side === 'RECEIVABLE' ? 'Bill Number' : 'Invoice Receipt Number', counterpartyLabel, 'Engagement', 'Period Start', 'Period End',
      'Total', 'Paid', 'Outstanding', 'Status', 'Due Date',
    ]

    const csvRows = rows.map((inv) => {
      const periodStart = new Date(inv.periodStart).toLocaleDateString('en-US')
      const periodEnd = new Date(inv.periodEnd).toLocaleDateString('en-US')
      const dueDate = new Date(inv.dueAt).toLocaleDateString('en-US')
      return [
        inv.number,
        counterpartyName(inv),
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

    showToast(`Exported ${rows.length} ${side === 'RECEIVABLE' ? 'bill' : 'invoice receipt'}${rows.length !== 1 ? 's' : ''}`)
  }, [invoices, showToast, side])

  // ── Computed stats ────────────────────────────────
  //
  // One book at a time. There is no total across currencies and no total
  // across the two sides of the ledger, because neither would mean
  // anything — a firm that both sells and buys used to see its own
  // supplier bills raise the bar labeled outstanding.
  const books = summary
    ? (side === 'RECEIVABLE' ? summary.receivable : summary.payable)
    : []
  const book =
    books.find((b) => b.currency === bookCurrency) ?? books[0] ?? null

  const bookCcy = book?.currency ?? 'USD'
  // On the paying side the headline is what we owe in all, from the door
  // Accounts payable reads too, so the two pages say one figure.
  const inAll = side === 'PAYABLE' ? summary?.owedInAll?.books.find((b) => b.currency === bookCcy) ?? null : null
  const outstandingMinor = inAll ? inAll.owedMinor : book?.outstandingMinor ?? 0
  const overdueMinor = inAll ? inAll.overdueMinor : book?.overdueMinor ?? 0
  const paidCount = shown.filter((i) => i.status === 'PAID').length
  const issuedCount = shown.filter((i) => ['ISSUED', 'SUBMITTED'].includes(i.status)).length

  // ── Aging bar segments (visual proportion) ────────
  // The same five bands the AR page draws, in the same colors — one
  // hue darkening behind a green "current". They used to be four
  // unrelated Tailwind reds here and something else over there.
  const agingBuckets: { key: AgingKey; label: string; color: string; minor: number }[] = [
    { key: 'current', label: 'Current', color: AGE_BANDS[0], minor: book?.buckets.current.minor ?? 0 },
    { key: '1-30', label: '1–30 days', color: AGE_BANDS[1], minor: book?.buckets['1-30'].minor ?? 0 },
    { key: '31-60', label: '31–60 days', color: AGE_BANDS[2], minor: book?.buckets['31-60'].minor ?? 0 },
    { key: '61-90', label: '61–90 days', color: AGE_BANDS[3], minor: book?.buckets['61-90'].minor ?? 0 },
    { key: '90+', label: '90+ days', color: AGE_BANDS[4], minor: book?.buckets['90+'].minor ?? 0 },
  ]
  const agingTotal = agingBuckets.reduce((s, b) => s + b.minor, 0)

  // ── Column definitions ────────────────────────────
  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      label: side === 'RECEIVABLE' ? 'Bill #' : 'Invoice receipt #',
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
      label: counterpartyLabel,
      render: (row) => (
        <span className={row.engagement.clientCompany ? 'text-etyme-ink' : 'text-etyme-faint'}>
          {counterpartyName(row)}
        </span>
      ),
      sortValue: (row) => counterpartyName(row),
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

  // ── What a payer reads on the row ─────────────────
  //
  // "I can't see anything about the job except the title — how can
  // anyone approve such content." The founder, on this list. So a row
  // this firm is asked to pay says who worked, on what, the hours
  // billed against the hours signed, whether the check passed in words,
  // the order and what is left on it, and the one thing to do next.
  const payableColumns: Column<Invoice>[] = [
    {
      key: 'number',
      label: 'Invoice receipt',
      render: (row) => (
        <div>
          <a href={`/dashboard/invoices/${row.id}`}
            className="font-medium text-etyme-ink font-mono text-[12px] hover:text-etyme-action">
            {row.number}
          </a>
          <p className="text-[11px] text-etyme-muted truncate max-w-[180px]">from {counterpartyName(row)}</p>
        </div>
      ),
      sortValue: (row) => row.number,
      width: 'min-w-[160px]',
    },
    {
      key: 'who',
      label: 'Who and what',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-[13px] text-etyme-ink truncate max-w-[220px]">
            {row.receipt?.people.join(', ') || 'Nobody named on it'}
          </p>
          <p className="text-[11px] text-etyme-muted truncate max-w-[220px]">
            {(row.receipt?.jobs.join(', ') || row.engagement.title)} · {row.receipt?.row ?? ''}
          </p>
          <p className="text-[11px] text-etyme-faint tabular-nums">
            {new Date(row.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            {' – '}
            {new Date(row.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
          </p>
        </div>
      ),
      sortValue: (row) => row.receipt?.people.join(', ') ?? '',
    },
    {
      key: 'hours',
      label: 'Hours signed / billed',
      render: (row) => (
        <span className={`tabular-nums text-[12px] ${
          row.receipt && row.receipt.hoursSigned !== row.receipt.hoursBilled ? 'text-etyme-attention' : 'text-etyme-ink'
        }`}>
          {row.receipt ? `${row.receipt.hoursSigned ?? 'none'} / ${row.receipt.hoursBilled} h` : '—'}
        </span>
      ),
      sortValue: (row) => row.receipt?.hoursBilled ?? 0,
      align: 'right' as const,
      hideOnMobile: true,
    },
    {
      key: 'check',
      label: 'Check',
      render: (row) => (
        <div className="max-w-[260px]">
          <p className={`text-[12px] ${row.receipt?.matches ? 'text-etyme-verified' : 'text-etyme-attention'}`}>
            {row.receipt?.verdict ?? 'Not checked'}
          </p>
          {row.receipt?.po && (
            <p className="text-[11px] text-etyme-faint tabular-nums">
              {row.receipt.po.number}
              {row.receipt.po.leftMinor != null && ` · ${fmtMinor(row.receipt.po.leftMinor, row.currency)} left`}
            </p>
          )}
        </div>
      ),
      sortValue: (row) => (row.receipt?.matches ? 1 : 0),
    },
    {
      key: 'outstanding',
      label: 'To pay',
      render: (row) => (
        <div className="text-right">
          <span className="tabular-nums font-medium">
            {row.outstandingMinor > 0 ? fmtMinor(row.outstandingMinor, row.currency) : 'Paid'}
          </span>
          <p className="text-[10px] text-etyme-faint tabular-nums">of {fmtMinor(row.totalMinor, row.currency)}</p>
        </div>
      ),
      sortValue: (row) => row.outstandingMinor,
      align: 'right' as const,
    },
    {
      key: 'dueAt',
      label: 'Due',
      render: (row) => (
        <div className="text-right">
          <span className="text-[12px] tabular-nums">
            {new Date(row.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
          </span>
          <p className="text-[10px] text-etyme-faint">{payableStatusWords(row.status)}</p>
        </div>
      ),
      sortValue: (row) => new Date(row.dueAt).getTime(),
      align: 'right' as const,
    },
    {
      key: 'act',
      label: '',
      render: (row) => <PayerAction row={row} onToast={showToast} />,
    },
  ]

  // ── Search filter ─────────────────────────────────
  const searchFilter = (row: Invoice, q: string) =>
    row.number.toLowerCase().includes(q) ||
    row.engagement.title.toLowerCase().includes(q) ||
    counterpartyName(row).toLowerCase().includes(q) ||
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
        {/* A client raises no invoices. The button was here for them too,
            and pressing it offered a list of engagements to bill — their
            suppliers' engagements, to bill themselves.

            Read off the framing rather than off the company kind, so a
            program office sitting at a client's desk loses it for the
            same reason the client does: it is reading a book it does
            not bill from. `create` is null there, and the label on it
            is the reader's own word for the act. */}
        {framing.create && (
          <button onClick={() => setShowGenerate(true)} className="btn-primary mt-3 shrink-0">
            + {framing.create}
          </button>
        )}
      </div>

      {/* Whose book. Silent for a firm reading its own, which is
          everybody but a program office in a client's seat. */}
      {(reading?.inASeat || ownBooks) && (
        <div className="panel mb-4">
          <p className="text-[13px] text-etyme-ink">
            {reading?.inASeat
              ? reading.says
              : 'Your own bills and invoice receipts. The program you run is on this same page.'}
          </p>
          <button
            type="button"
            onClick={() => readInstead(otherBooks(whoseBooks))}
            className="mt-2 text-[13px] text-etyme-action underline"
          >
            {switchLabel(whoseBooks, 'books')}
          </button>
        </div>
      )}

      {/* Which side of the ledger, and which currency. Never summed. */}
      {/* The two sides are offered only to a reader who has both. A
          client never sells, so it was shown "Owed to us" beside "We
          owe" over a book in which nobody owes it anything. */}
      {summary && (sidesOffered({ receivable: summary.receivable.length, payable: summary.payable.length }).length > 0 || books.length > 1) && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="stat-label">Showing</span>
          {sidesOffered({ receivable: summary.receivable.length, payable: summary.payable.length }).map((s) => (
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
          {inAll && inAll.fromReceipts > 0 && (
            <p className="text-[11px] text-etyme-faint mt-0.5">
              includes {inAll.fromReceipts} keyed in on{' '}
              <a href="/dashboard/ap" className="text-etyme-action hover:underline">Accounts payable</a>
            </p>
          )}
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Overdue</p>
          <p className={`stat-value ${overdueMinor > 0 ? 'text-red-600' : 'text-etyme-ink'}`}>
            {fmtMinor(overdueMinor, bookCcy)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{overdueMinor > 0 ? 'past due date' : 'none overdue'}</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">{side === 'RECEIVABLE' ? 'Open bills' : 'Open invoice receipts'}</p>
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
            {(() => {
              const shown = agingBuckets.filter((b) => b.minor > 0)
              return shown.map((bucket, i) => (
                <div
                  key={bucket.key}
                  className="transition-all"
                  style={segmentStyle(bucket.minor / agingTotal, bucket.color, i === shown.length - 1)}
                  title={`${bucket.label}: ${fmtMinorExact(bucket.minor, bookCcy)}`}
                />
              ))
            })()}
          </div>
          <div className="flex gap-4 mt-2 flex-wrap">
            {agingBuckets.map((bucket) => (
              <div key={bucket.key} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full" style={{ background: bucket.color }} />
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
      <ListSurface<Invoice>
        columns={side === 'PAYABLE' ? payableColumns : columns}
        data={shown}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder={`Search by ${side === 'RECEIVABLE' ? 'bill' : 'invoice receipt'} number, engagement, or ${counterpartyLabel.toLowerCase()}…`}
        emptyMessage={
          statusFilter !== 'ALL'
            ? `No ${statusFilter.toLowerCase()} ${side === 'PAYABLE' ? 'invoice receipts to pay' : 'bills to collect'}.`
            : side === 'PAYABLE' ? 'Nothing to pay.' : 'No bills yet.'
        }
        emptyDetail={isClient
          ? 'Your suppliers send their invoices from the hours you approve. Each appears here as an invoice receipt once submitted, checked against the timesheets and the purchase order.'
          : 'A bill is made from the weeks your client has approved. Press Generate to bill them.'}
        exportName="invoices"
        selectable
        // One detail for an invoice: the page with the check, the money
        // and the pay form together. The row used to open a side panel
        // with Pay and no check, and the number a page with the check
        // and no Pay — two doors, each missing half.
        onRowClick={(row) => router.push(`/dashboard/invoices/${row.id}`)}
        bulkActions={(selected, clearSelection) => (
          <>
            {!isClient && (
            <button
              onClick={() => handleBulkSubmit(selected, clearSelection)}
              disabled={submittingBulk}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
                               bg-etyme-action text-white hover:bg-etyme-action/90
                               transition-colors disabled:opacity-50">
              {submittingBulk ? 'Submitting…' : `Submit (${selected.size})`}
            </button>
            )}
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
      {/* What is still open, not how many rows there are: "4 invoice
          receipts to pay" under three paid ones was a count of the list
          wearing a sentence about money. */}
      {!loading && shown.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {openCountSays(shown, side)}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase().replace('_', ' ')}`}
        </p>
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
            : 'bg-etyme-danger text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </>
  )
}
