'use client'

import { readJson } from '@/lib/read-response'
import { ratesSay } from '@/lib/money/pay-words'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from '@/components/session-provider'
import { refusalOf, refusedRead } from '@/lib/money/refused-read'
import { compact as formatRate } from '@/lib/money-display'
import { ListSurface, type Column } from '@/components/list-surface'
import { plainDate } from '@/lib/plain-date'

/**
 * Payroll working surface — what the buy lines pay out.
 *
 * ── What a row here is ───────────────────────────────────────────────
 *
 * A **buy line** on an order, and payroll is how it is settled. The
 * founder, 2026-09-18: *"Buy contract will pay supplier or run payroll
 * for candidate."* Where a sub-vendor is below us the line is settled
 * against that firm's invoice, received and matched; where we employ the
 * person ourselves there is no order at all — nobody raises a
 * purchase order to their own employee — and payroll is the whole of it.
 *
 * This screen used to tell an empty-handed reader to *"create buy
 * contracts to set up payroll"*, which offers a line as a document of
 * its own and sends somebody to a form that does not exist. A buy line
 * is written beside the placement it funds, on the placement's own
 * document, and that is where the empty state points.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * LEGACY_RULES.md §2.5 salary pipeline:
 *   pending → open → calculated → approved → processed → cleared
 *
 * PR-01: "As an Accountant, I want to run payroll for a period —
 *   see all salaries due, approve the run, generate the export file
 *   so that I process payments in one batch instead of per-contract."
 */

// ── Types ────────────────────────────────────────────

interface PayItem {
  sellContractId: string | null
  buyContractId: string
  person: { id: string; name: string; primaryEmail: string }
  contractType: string
  state: string
  payRate: number
  /** Each rate and its hours, where the rate changed inside the period. */
  rates?: Array<{ rateCents: number; hours: number }> | null
  payCurrency: string
  vendorCompany: { id: string; name: string } | null
  /** The client the work is for — never the employer, never the supplier. */
  client: { id: string; name: string } | null
  entity: { id: string; name: string } | null
  startDate: string
  endDate: string | null
  timesheets: Array<{
    id: string
    totalHours: number
    periodStart: string
    periodEnd: string
    clientCompany: { id: string; name: string } | null
    engagement: { id: string; title: string } | null
    /** Only for a seat that reads margin; the payroll desks do not. */
    billRate?: number
  }>
  /**
   * The agreed spread on this person's placement, from the one margin
   * service (lib/money/margin). Null where the seat does not read margin
   * or no sell line is behind the pay line.
   */
  agreed?: { pct: number | null; says: string; refusedBecause: string | null } | null
  totalApprovedHours: number
  grossPay: number
  /** Hours over the weekly line in the period, and the premium on them — inside grossPay. */
  overtimeHours?: number
  premiumCents?: number
  /** How the overtime was priced, or why it could not be, in a sentence. */
  overtime?: string | null
  /** Which weekly line the period was judged on, where that needs saying. */
  payLine?: string | null
  /** Where fewer hours were accepted than filed, which hours are paid. */
  accepted?: string | null
  /**
   * Each week worked over the line and accepted at or under it, paid at
   * straight time — "38 of 45 hours accepted; paid at straight time
   * because the accepted week is not over 40."
   */
  straightTime?: string | null
  payStatus: string
  nextPayDate: string | null
  nextCalcDate: string | null
  /** Pay dates before today still open. */
  payDatesOverdue?: { count: number; earliest: string | null }
}

interface PayrollSummary {
  totalContracts: number
  totalGrossPay: number
  totalHours: number
  byContractType: Record<string, { count: number; grossPay: number; hours: number }>
  byStatus: Record<string, number>
}

type StatusFilter = 'ALL' | 'PENDING' | 'CALCULATED' | 'PROCESSED' | 'NO_HOURS'

// ── Status styling ───────────────────────────────────

function statusChipClass(status: string): string {
  const map: Record<string, string> = {
    PENDING:     'chip--attention',
    CALCULATED:  'chip--action',
    PROCESSED:   'chip--verified',
    NO_HOURS:    'chip--passive',
  }
  return map[status] ?? 'chip--passive'
}

function contractTypeLabel(type: string): string {
  const map: Record<string, string> = {
    W2:        'W-2',
    C2C:       'C2C',
    IND_1099:  '1099',
    C2H_W2:    'C2H',
    CDD:       'CDD',
    FIXED_TERM: 'Fixed',
  }
  return map[type] ?? type
}

function contractTypeChipClass(type: string): string {
  const map: Record<string, string> = {
    W2:       'chip--action',
    C2C:      'chip--attention',
    IND_1099: 'chip--passive',
  }
  return map[type] ?? 'chip--passive'
}

function stateLabel(state: string): string {
  const map: Record<string, string> = {
    IN_PROGRESS: 'Active',
    BENCH_PAID:  'Bench',
    INTERNAL:    'Internal',
    TRAINING:    'Training',
  }
  return map[state] ?? state
}

// ── Format helpers ───────────────────────────────────

/**
 * A cycle date as the day it is. Cycle dates are midnight UTC, and
 * `toLocaleDateString()` in a US browser showed each one a day early.
 */
function utcDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}


// ── Page ─────────────────────────────────────────────

/**
 * The carried balance on a contract — costs that could not come out of
 * one period and wait for the next. Loaded on demand: most rows carry
 * nothing, and fetching every contract's ledger to render dashes would
 * be the expensive way to show nothing.
 */
function CarryCell({ sellContractId }: { sellContractId: string | null }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [says, setSays] = useState<string | null>(null)
  const [cents, setCents] = useState<number | null>(null)

  if (!sellContractId) return <span className="text-etyme-faint">—</span>

  async function look() {
    setState('loading')
    try {
      const res = await fetch(`/api/payroll/off-cycle?sellContractId=${sellContractId}`)
      const body = await readJson(res)
      setCents(body.data?.carriedCents ?? body.data?.outstandingCents ?? 0)
      setSays(body.data?.says ?? null)
      setState('done')
    } catch (e: any) {
      setSays(e.message)
      setState('done')
    }
  }

  if (state === 'idle')
    return (
      <button onClick={look} className="text-[12px]" style={{ color: 'var(--color-action)' }}>
        Look
      </button>
    )
  if (state === 'loading') return <span className="text-[12px] text-etyme-faint">…</span>
  return (
    <span
      title={says ?? undefined}
      className="tabular-nums text-[12px]"
      style={{ color: (cents ?? 0) > 0 ? 'var(--color-attention)' : 'var(--color-muted)' }}
    >
      {cents == null ? '—' : cents === 0 ? 'none' : formatCents(cents)}
    </span>
  )
}

export default function PayrollPage() {
  const [payItems, setPayItems] = useState<PayItem[]>([])
  // The spread column's name from the route, and null where this seat
  // does not read margin — then there is no column at all.
  const [spreadLabel, setSpreadLabel] = useState<string | null>(null)
  // Workers paid on an invoice receipt, not by payroll: one plain line each.
  const [paidElsewhere, setPaidElsewhere] = useState<Array<{ buyContractId: string; person: { id: string; name: string }; says: string }>>([])
  const [summary, setSummary] = useState<PayrollSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** What the route said when it refused the read; null where it did not. */
  const [refusedSaid, setRefusedSaid] = useState<string | null>(null)
  const { company, loading: sessionLoading } = useSession()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  // Resolve the user's company from /api/me
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((body) => {
        const cid = body.data?.activeContext?.company?.id ?? body.data?.contexts?.[0]?.company?.id
        if (cid) setCompanyId(cid)
      })
      .catch(() => {})
  }, [])

  const fetchPayroll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ companyId })
      if (selectedPeriod) params.set('period', selectedPeriod)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/payroll?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // A refusal is not an empty run: the page draws the sentence
        // and no figure (sign-up walk, round four, #5).
        const refused = refusalOf(res.status, body)
        if (refused !== null) {
          setRefusedSaid(refused)
          setPayItems([])
          setSummary(null)
          return
        }
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setRefusedSaid(null)
      setPayItems(body.data?.payItems ?? [])
      setSpreadLabel(body.data?.spreadLabel ?? null)
      setPaidElsewhere(body.data?.paidElsewhere ?? [])
      setSummary(body.data?.summary ?? null)
    } catch (err: any) {
      setError(err.message)
      setPayItems([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [companyId, statusFilter, selectedPeriod])

  useEffect(() => {
    fetchPayroll()
  }, [fetchPayroll])

  // ── Run payroll action ────────────────────────────
  async function handleRunPayroll(action: 'calculate' | 'approve' | 'process') {
    const eligible = payItems.filter((p) => {
      if (action === 'calculate') return p.payStatus === 'PENDING'
      if (action === 'approve') return p.payStatus === 'CALCULATED'
      return p.payStatus === 'CALCULATED' // process
    })

    if (eligible.length === 0) return

    setProcessing(true)
    try {
      const res = await fetch('/api/payroll/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyContractIds: eligible.map((p) => p.buyContractId),
          period: selectedPeriod || undefined,
          action,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      // Refresh
      fetchPayroll()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  // ── Period options ────────────────────────────────
  const periodOptions = (() => {
    const months: string[] = []
    const now = new Date()
    for (let i = -2; i <= 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      months.push(
        d.toISOString().slice(0, 7)
      )
    }
    return months
  })()

  function periodLabel(ym: string): string {
    const [y, m] = ym.split('-')
    const d = new Date(parseInt(y), parseInt(m) - 1)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
  }

  // ── Stats ─────────────────────────────────────────
  const stats = {
    totalGross: summary?.totalGrossPay ?? 0,
    totalHours: summary?.totalHours ?? 0,
    w2Count: summary?.byContractType?.W2?.count ?? 0,
    w2Gross: summary?.byContractType?.W2?.grossPay ?? 0,
    pending: summary?.byStatus?.PENDING ?? 0,
    calculated: summary?.byStatus?.CALCULATED ?? 0,
    processed: summary?.byStatus?.PROCESSED ?? 0,
  }

  // ── Filtered items ────────────────────────────────
  const filtered = statusFilter === 'ALL'
    ? payItems
    : payItems.filter((p) => p.payStatus === statusFilter)

  // ── Column definitions ────────────────────────────
  const columns: Column<PayItem>[] = [
    {
      key: 'person',
      label: 'Consultant',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.person.name}</p>
          <p className="text-[11px] text-etyme-faint">
            {stateLabel(row.state)}
            {row.entity ? ` · ${row.entity.name}` : ''}
          </p>
        </div>
      ),
      sortValue: (row) => row.person.name,
      width: 'min-w-[180px]',
    },
    {
      key: 'contractType',
      label: 'Type',
      render: (row) => (
        <span className={`chip ${contractTypeChipClass(row.contractType)}`}>
          {contractTypeLabel(row.contractType)}
        </span>
      ),
      sortValue: (row) => row.contractType,
    },
    {
      key: 'client',
      label: 'Client',
      render: (row) => {
        const clients = [...new Set(
          row.timesheets
            .map((ts) => ts.clientCompany?.name)
            .filter(Boolean)
        )]
        return (
          <span className="text-etyme-ink">
            {clients.length > 0 ? clients.join(', ') : (row.client ? row.client.name : '—')}
          </span>
        )
      },
      sortValue: (row) => {
        const names = row.timesheets.map((ts) => ts.clientCompany?.name).filter(Boolean)
        return names[0] ?? row.client?.name ?? ''
      },
      hideOnMobile: true,
    },
    {
      key: 'payRate',
      label: 'Pay rate',
      render: (row) => (
        <span className="tabular-nums">
          {formatRate(row.payRate)}<span className="text-etyme-faint">/hr</span>
          {/* A period paid at two rates says both, the way the payroll
              file splits it — never one rate over the whole period. */}
          {ratesSay(row.rates, row.payCurrency) && (
            <span className="block text-[11px] text-etyme-muted">{ratesSay(row.rates, row.payCurrency)}</span>
          )}
        </span>
      ),
      sortValue: (row) => row.payRate,
      align: 'right' as const,
    },
    {
      key: 'hours',
      label: 'Hours',
      render: (row) => (
        <span className={`tabular-nums ${row.totalApprovedHours > 0 ? 'text-etyme-ink' : 'text-etyme-faint'}`}>
          {row.totalApprovedHours > 0 ? row.totalApprovedHours.toFixed(1) : '—'}
          {/* The hours accepted, not the hours filed — and why they differ. */}
          {row.accepted && (
            <span className="block text-[11px] text-etyme-muted" title={row.accepted}>
              Accepted hours, not the hours filed
            </span>
          )}
          {/* A week accepted at or under the line, said plainly: it is
              paid at straight time, and why. */}
          {row.straightTime && (
            <span className="block max-w-[260px] text-left text-[11px] text-etyme-muted ml-auto">
              {row.straightTime}
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.totalApprovedHours,
      align: 'right' as const,
    },
    {
      key: 'grossPay',
      label: 'Gross pay',
      render: (row) => (
        <span className={`tabular-nums font-medium ${
          row.grossPay > 0 ? 'text-etyme-ink' : 'text-etyme-faint'
        }`}>
          {row.grossPay > 0 ? formatCents(row.grossPay) : '—'}
          {row.overtime && (
            <span
              className={`block text-[11px] font-normal ${
                (row.premiumCents ?? 0) > 0 ? 'text-etyme-muted' : 'text-etyme-attention'
              }`}
              title={row.overtime}
            >
              {(row.premiumCents ?? 0) > 0
                ? `Includes ${formatCents(row.premiumCents ?? 0)} overtime premium on ${row.overtimeHours} hours`
                : 'Overtime premium not priced'}
            </span>
          )}
          {/* The law's forty where no contract drew a line, or why it
              does not reach this worker — the sentence is the product. */}
          {row.payLine && (
            <span className="block text-[11px] font-normal text-etyme-muted" title={row.payLine}>
              {row.payLine}
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.grossPay,
      align: 'right' as const,
    },
    {
      key: 'carry',
      label: 'Carry',
      render: (row) => <CarryCell sellContractId={row.sellContractId} />,
      align: 'right' as const,
    },
    ...(spreadLabel ? [{
      key: 'agreed',
      // "Agreed spread", from the same service Profitability reads, so the
      // two screens cannot disagree. Never the bare word margin: what the
      // hours earned, after burden, is on Profitability.
      label: spreadLabel,
      render: (row: PayItem) => {
        const pct = row.agreed?.pct ?? null
        if (pct == null) {
          return (
            <span className="text-[12px] text-etyme-faint" title={row.agreed?.refusedBecause ?? 'No sell line behind this pay line.'}>
              —
            </span>
          )
        }
        return (
          <span
            title={row.agreed?.says}
            className={`tabular-nums text-[12px] ${
              pct >= 30 ? 'text-etyme-verified' :
              pct >= 15 ? 'text-etyme-ink' :
              'text-etyme-attention'
            }`}
          >
            {pct.toFixed(1)}%
          </span>
        )
      },
      sortValue: (row: PayItem) => row.agreed?.pct ?? -1,
      align: 'right' as const,
      hideOnMobile: true,
    }] : []),
    {
      key: 'payStatus',
      label: 'Status',
      render: (row) => (
        <span className={`chip ${statusChipClass(row.payStatus)}`}>
          {row.payStatus.replace('_', ' ')}
        </span>
      ),
      sortValue: (row) => row.payStatus,
    },
    {
      key: 'nextPay',
      label: 'Next pay',
      render: (row) => (
        <span className="text-[12px] tabular-nums">
          {row.nextPayDate ? (
            <span className="text-etyme-muted">{utcDay(row.nextPayDate)}</span>
          ) : (
            <span className="text-etyme-faint">—</span>
          )}
          {(row.payDatesOverdue?.count ?? 0) > 0 && row.payDatesOverdue!.earliest && (
            <span className="block text-[11px] text-etyme-attention">
              {row.payDatesOverdue!.count} overdue, from {utcDay(row.payDatesOverdue!.earliest)}
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.nextPayDate ? new Date(row.nextPayDate).getTime() : 0,
      align: 'right' as const,
      hideOnMobile: true,
    },
  ]

  // ── Search filter ─────────────────────────────────
  const searchFilter = (row: PayItem, q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.contractType.toLowerCase().includes(q) ||
    row.payStatus.toLowerCase().includes(q) ||
    row.timesheets.some((ts) =>
      ts.clientCompany?.name.toLowerCase().includes(q) ||
      ts.engagement?.title.toLowerCase().includes(q)
    )

  // ── Status filter options ─────────────────────────
  const statusOptions: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'PENDING', label: 'Pending', count: stats.pending },
    { key: 'CALCULATED', label: 'Calculated', count: stats.calculated },
    { key: 'PROCESSED', label: 'Processed', count: stats.processed },
    { key: 'NO_HOURS', label: 'No hours' },
  ]

  // Money pages wait (sign-up walk, round three, #17): until the session
  // says whose company this is, no figure and no refusal naming a desk.
  if (!company) {
    return <p className="py-12 text-center text-[13px] text-etyme-muted">{sessionLoading ? 'Loading…' : 'These are a company\'s books, and you are not signed in at a company.'}</p>
  }
  // Refused: the sentence and nothing else — no tile, no zero, no table.
  const refused = refusedRead(refusedSaid, { what: 'Payroll', kind: company.kind, company: company.name })
  if (refused) {
    return <p role="alert" className="py-12 text-center text-[13px] text-etyme-muted">{refused}</p>
  }

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + period selector */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">Operate</p>
          <h1>Payroll</h1>
          <p>Buy-side payment processing. Calculate, approve, and process pay for everybody who worked in the period, including placements that have since ended.</p>
        </div>

        {/* Period selector + run action */}
        <div className="flex items-center gap-3 mt-3 shrink-0">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 text-[13px] border border-etyme-rule rounded-lg bg-white
                       text-etyme-ink focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
          >
            <option value="">All periods</option>
            {periodOptions.map((ym) => (
              <option key={ym} value={ym}>{periodLabel(ym)}</option>
            ))}
          </select>

          {stats.pending > 0 && (
            <button
              onClick={() => handleRunPayroll('calculate')}
              disabled={processing}
              className="btn-primary disabled:opacity-50"
            >
              {processing ? 'Running…' : `Calculate (${stats.pending})`}
            </button>
          )}
          {stats.calculated > 0 && (
            <button
              onClick={() => handleRunPayroll('process')}
              disabled={processing}
              className="btn-primary disabled:opacity-50"
            >
              {processing ? 'Running…' : `Process (${stats.calculated})`}
            </button>
          )}
        </div>
      </div>

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Gross payroll</p>
          <p className={`stat-value ${stats.totalGross > 0 ? 'text-etyme-ink' : 'text-etyme-faint'}`}>
            {formatCents(stats.totalGross)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {stats.totalHours.toFixed(0)} hours
          </p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">W-2 employees</p>
          <p className={`stat-value ${stats.w2Count > 0 ? 'text-etyme-action' : 'text-etyme-faint'}`}>
            {stats.w2Count}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {stats.w2Gross > 0 ? formatCents(stats.w2Gross) : '$0.00'}
          </p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Paid by invoice receipt</p>
          <p className={`stat-value ${paidElsewhere.length > 0 ? 'text-etyme-ink' : 'text-etyme-faint'}`}>
            {paidElsewhere.length}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            not on payroll
          </p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Pending</p>
          <p className={`stat-value ${stats.pending > 0 ? 'text-etyme-attention' : 'text-etyme-verified'}`}>
            {stats.pending}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {stats.pending > 0 ? 'awaiting calculation' : 'all clear'}
          </p>
        </div>
      </div>

      {/* Contract type breakdown bar */}
      {summary && stats.totalGross > 0 && (
        <div className="panel mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-etyme-muted uppercase tracking-wider">
              Payroll by contract type
            </p>
            <p className="text-xs text-etyme-faint tabular-nums">
              {formatCents(stats.totalGross)} total
            </p>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-etyme-canvas">
            {Object.entries(summary.byContractType)
              .filter(([, v]) => v.grossPay > 0)
              .map(([type, v]) => {
                const pct = (v.grossPay / stats.totalGross) * 100
                const colors: Record<string, string> = {
                  W2: 'bg-etyme-action',
                  C2C: 'bg-etyme-attention',
                  IND_1099: 'bg-etyme-faint',
                }
                return (
                  <div
                    key={type}
                    className={`${colors[type] ?? 'bg-etyme-muted'} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${contractTypeLabel(type)}: ${formatCents(v.grossPay)} (${pct.toFixed(0)}%)`}
                  />
                )
              })}
          </div>
          <div className="flex gap-4 mt-2">
            {Object.entries(summary.byContractType)
              .filter(([, v]) => v.count > 0)
              .map(([type, v]) => (
                <div key={type} className="flex items-center gap-1.5 text-[11px] text-etyme-muted">
                  <div className={`w-2 h-2 rounded-full ${
                    type === 'W2' ? 'bg-etyme-action' :
                    type === 'C2C' ? 'bg-etyme-attention' : 'bg-etyme-faint'
                  }`} />
                  <span>{contractTypeLabel(type)}</span>
                  <span className="tabular-nums text-etyme-faint">
                    {v.count} · {formatCents(v.grossPay)}
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
            {opt.count !== undefined && opt.count > 0 && (
              <span className="ml-1 text-[10px] opacity-60 tabular-nums">({opt.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Data table */}
      <ListSurface<PayItem>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.buyContractId}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by consultant, contract type, client, or status…"
        emptyMessage={
          statusFilter !== 'ALL'
            ? `No ${statusFilter.toLowerCase().replace('_', ' ')} pay items.`
            : 'Nobody is on payroll this period.'
        }
        emptyDetail={
          statusFilter !== 'ALL'
            ? 'Try "All" to see every pay item.'
            : 'A pay line is written beside the placement it funds — record one on Contracts, ' +
              'or award a submission, and whoever it pays appears here.'
        }
        exportName={`payroll${selectedPeriod ? `-${selectedPeriod}` : ''}`}
        defaultPageSize={20}
      />

      {/* Paid on an invoice receipt, never by payroll as well */}
      {!loading && paidElsewhere.length > 0 && (
        <ul className="mt-3 space-y-1">
          {paidElsewhere.map((p) => (
            <li key={`${p.buyContractId}-${p.person.id}`} className="text-[13px] text-etyme-muted">
              {p.says.replace(' — see Invoice receipts.', ' — see ')}
              <a className="text-etyme-action underline" href="/dashboard/ap">Invoice receipts</a>.
            </li>
          ))}
        </ul>
      )}

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} pay item{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase().replace('_', ' ')}`}
          {selectedPeriod && ` · ${periodLabel(selectedPeriod)}`}
          {stats.totalGross > 0 && ` · ${formatCents(stats.totalGross)} gross`}
        </p>
      )}

      <BenchReserves />
      <Statutory />
    </>
  )
}

// ── What the firm holds for people ───────────────────────────────────
//
// `bench-policy.ts` has known how to compute a hold-back since it was
// written and nothing ever wrote one, so a firm could run a
// reserve-funded bench for a year with no record of what it owed
// anybody. The balance here is the sum of the movements — never a stored
// total, because a stored total and the postings behind it disagree the
// first time a run is retried, and the number somebody argues with is the
// consultant's.

function BenchReserves() {
  const [data, setData] = useState<any>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/payroll/reserve')
      .then(async (r) => {
        const b = await readJson(r)
        setData(b.data)
      })
      .catch((e) => setFailed(e.message))
  }, [])

  if (failed || !data) return null
  const pots: any[] = data.pots ?? []

  return (
    <section className="mt-8">
      <p className="eyebrow">Operate</p>
      <h2 className="headline-serif text-[22px] leading-tight">Bench reserves</h2>
      <p className="mt-2 max-w-[64ch] text-[13px] text-etyme-muted">{data.note}</p>

      {pots.length === 0 && (
        <div className="panel mt-4">
          <p className="text-[13px] text-etyme-muted">
            Nothing has been held back for anybody. A reserve only fills where the house
            bench policy is to fund the bench from a slice of each share — on the other
            three policies a consultant never sees a deduction they were not told about.
          </p>
        </div>
      )}

      {pots.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-3">
            <div>
              <p className="stat-label">Held for people</p>
              <p className="stat-value tabular-nums">{formatCents(data.totalHeldCents)}</p>
              <p className="mt-0.5 text-[11px] text-etyme-faint">
                Their money on our balance sheet, not ours.
              </p>
            </div>
          </div>

          {data.overdrawn?.length > 0 && (
            <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
              <p className="stat-label">Overdrawn</p>
              <ul className="mt-2 space-y-1">
                {data.overdrawn.map((o: any) => (
                  <li key={o.personName} className="text-[13px] text-etyme-muted">
                    {o.personName} — {formatCents(o.balanceCents)}. More has come out than
                    ever went in, which is somebody&rsquo;s real money and is shown rather
                    than floored at zero.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pots.map((p: any) => (
            <article key={p.personId} className="panel">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold text-etyme-ink">{p.personName}</p>
                <span className="chip chip--passive tabular-nums">
                  {formatCents(p.balanceCents)}
                </span>
              </div>
              <p className="mt-2 text-[13px] text-etyme-ink">{p.says}</p>
              <p className="mt-2 text-[11px] text-etyme-faint tabular-nums">
                {p.movements} movement{p.movements === 1 ? '' : 's'}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Prepared for the bureau ──────────────────────────────────────────
//
// Etyme never files anything. What it has and the bureau does not is what
// was actually earned and by whom — from postings rather than a rate
// card, because those differ every time a timesheet is reversed or a rate
// amendment lands late. The notice is on the screen and in the file.

function Statutory() {
  const year = new Date().getUTCFullYear()
  const [data, setData] = useState<any>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/payroll/statutory?year=${year}`)
      .then(async (r) => {
        const b = await readJson(r)
        setData(b.data)
      })
      .catch((e) => setFailed(e.message))
  }, [year])

  if (failed || !data) return null

  const summaries: any[] = data.pack?.summaries ?? []

  return (
    <section className="mt-10">
      <p className="eyebrow">Operate</p>
      <h2 className="headline-serif text-[22px] leading-tight">
        Prepared for your bureau — {data.year}
      </h2>
      <p className="mt-2 max-w-[68ch] text-[13px] text-etyme-muted">{data.notice}</p>

      <div className="mt-4 flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-3">
        <div>
          <p className="stat-label">W-2s to issue</p>
          <p className="stat-value tabular-nums">{data.pack.w2Count}</p>
        </div>
        <div>
          <p className="stat-label">1099-NECs to issue</p>
          <p className="stat-value tabular-nums">{data.pack.necCount}</p>
        </div>
        <div>
          <p className="stat-label">Reportable</p>
          <p className="stat-value tabular-nums">
            {data.pack.currency
              ? formatCents(data.pack.totalReportableCents)
              : '—'}
          </p>
          {!data.pack.currency && (
            <p className="mt-0.5 max-w-[30ch] text-[11px] text-etyme-faint">
              More than one currency in the year, so there is no single total to give.
            </p>
          )}
        </div>
        <div>
          <p className="stat-label">Deposits</p>
          <p className="stat-value tabular-nums">
            {data.deposits.schedule === 'MONTHLY' ? 'Monthly' : 'Semiweekly'}
          </p>
        </div>
        <a className="btn-primary" href={data.csvUrl}>
          Download the file for your bureau
        </a>
      </div>

      <p className="mt-3 max-w-[70ch] text-[13px] text-etyme-ink">{data.pack.says}</p>
      <p className="mt-1 max-w-[70ch] text-[13px] text-etyme-ink">{data.pack.yearPaidSays}</p>
      {data.pack.unpaidSays && (
        <p className="mt-1 max-w-[70ch] text-[11px] text-etyme-muted">{data.pack.unpaidSays}</p>
      )}
      {(data.pack.wagesShort ?? []).map((w: any) => (
        <p key={w.personId} className="mt-1 max-w-[70ch] text-[11px] text-etyme-attention">{w.says}</p>
      ))}
      {data.pack.undatedSays && (
        <p className="mt-1 max-w-[70ch] text-[11px] text-etyme-attention">{data.pack.undatedSays}</p>
      )}
      {data.pack.receiptsWaitingSays && (
        <p className="mt-1 max-w-[70ch] text-[11px] text-etyme-muted">{data.pack.receiptsWaitingSays}</p>
      )}
      {data.pack.receiptsUndatedSays && (
        <p className="mt-1 max-w-[70ch] text-[11px] text-etyme-attention">{data.pack.receiptsUndatedSays}</p>
      )}
      <p className="mt-2 max-w-[70ch] text-[11px] text-etyme-faint">{data.taxIdNote}</p>
      <p className="mt-2 max-w-[70ch] text-[11px] text-etyme-faint">{data.deposits.proxySays}</p>

      {summaries.length > 0 && (
        <div className="mt-4 space-y-2">
          {summaries.slice(0, 25).map((s: any) => (
            <article key={s.personId} className="panel">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold text-etyme-ink">{s.personName}</p>
                <div className="flex items-center gap-2">
                  <span
                    className={`chip ${s.form === 'NONE' ? 'chip--passive' : 'chip--action'}`}
                  >
                    {s.form === 'NONE' ? 'no form' : s.form.replace('_', '-')}
                  </span>
                  <span className="chip chip--passive tabular-nums">
                    {s.grossCents == null ? '—' : formatCents(s.grossCents)}
                  </span>
                </div>
              </div>
              <p className="mt-2 max-w-[74ch] text-[13px] text-etyme-muted">{s.says}</p>
            </article>
          ))}
        </div>
      )}

      {data.deposits.deadlines?.length > 0 && (
        <div className="panel mt-4">
          <p className="stat-label">Deposit deadlines</p>
          <p className="mt-1 max-w-[70ch] text-[11px] text-etyme-faint">{data.deposits.payDaysSay}</p>
          <ul className="mt-2 space-y-1">
            {data.deposits.deadlines.map((d: any) => (
              <li key={`${String(d.payDay)}-${d.paid}`} className="text-[11px] text-etyme-muted tabular-nums">
                {d.paid === false ? 'due to be paid' : 'paid'} {plainDate(String(d.payDay))} → deposit by {plainDate(String(d.dueOn))}
                {d.shifted && ' (moved off a non-business day)'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
