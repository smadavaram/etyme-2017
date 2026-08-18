'use client'

import { useEffect, useState, useCallback } from 'react'
import { fromUnits as fmtCurrency } from '@/lib/money-display'

/**
 * Reports — Grow section (vendor)
 *
 * BRD §18: Performance metrics, revenue analytics, and operational
 * dashboards.
 *
 * CLAUDE.md design system:
 *   Decision surfaces: "Prose, reasoning, confidence, calm. 3–10 items.
 *   Serif headlines, generous space. User decides well and leaves."
 *
 * Fetches from four API endpoints in parallel:
 *   - GET /api/contracts?side=sell   → revenue, client breakdown
 *   - GET /api/contracts?side=buy    → cost, margin calculation
 *   - GET /api/bench                 → bench utilization, skills
 *   - GET /api/invoices              → AR outstanding, aging
 *
 * All metrics are computed client-side from raw API responses.
 */

// ── Types ──────────────────────────────────────────────

interface SellContract {
  id: string
  billRate: number // cents per hour
  state: string
  startDate: string
  endDate: string | null
  clientCompany: { id: string; name: string } | null
  endClientCompany: { id: string; name: string } | null
}

interface BuyContract {
  id: string
  payRate: number // cents per hour
  state: string
  contractType: string
}

interface BenchEntry {
  id: string
  tier: string
  consultant: {
    id: string
    skills: string[]
    availableFrom: string | null
  }
}

interface InvoiceSummary {
  totalOutstanding: number
  current: number
  '1-30': number
  '31-60': number
  '61-90': number
  '90+': number
  invoiceCount: number
}

interface Invoice {
  id: string
  total: number
  paid: number
  outstanding: number
  status: string
  aging: string
}

interface ReportData {
  sellContracts: SellContract[]
  buyContracts: BuyContract[]
  benchEntries: BenchEntry[]
  invoices: Invoice[]
  invoiceSummary: InvoiceSummary | null
}

// ── Helpers ────────────────────────────────────────────


function fmtPercent(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

// ── Page ───────────────────────────────────────────────

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [sellRes, buyRes, benchRes, invoiceRes] = await Promise.all([
        fetch('/api/contracts?side=sell&limit=100'),
        fetch('/api/contracts?side=buy&limit=100'),
        fetch('/api/bench?scope=company'),
        fetch('/api/invoices?limit=100'),
      ])

      // Parse responses — each might fail independently
      const sellBody = sellRes.ok ? await sellRes.json() : null
      const buyBody = buyRes.ok ? await buyRes.json() : null
      const benchBody = benchRes.ok ? await benchRes.json() : null
      const invoiceBody = invoiceRes.ok ? await invoiceRes.json() : null

      // If all four failed, throw
      if (!sellBody && !buyBody && !benchBody && !invoiceBody) {
        throw new Error('Could not load any data. Check your connection and try again.')
      }

      // Sell contracts
      const sellContracts: SellContract[] = (sellBody?.data?.contracts ?? []).map((c: any) => ({
        id: c.id,
        billRate: c.billRate,
        state: c.state,
        startDate: c.startDate,
        endDate: c.endDate ?? null,
        clientCompany: c.clientCompany ?? null,
        endClientCompany: c.endClientCompany ?? null,
      }))

      // Buy contracts
      const buyContracts: BuyContract[] = (buyBody?.data?.contracts ?? []).map((c: any) => ({
        id: c.id,
        payRate: c.payRate,
        state: c.state,
        contractType: c.contractType,
      }))

      // Bench entries — flatten from tiers
      const benchEntries: BenchEntry[] = []
      const tiers = benchBody?.data?.tiers ?? {}
      for (const [tier, listings] of Object.entries(tiers)) {
        for (const l of listings as any[]) {
          benchEntries.push({
            id: l.id,
            tier,
            consultant: {
              id: l.consultant?.id,
              skills: l.consultant?.skills ?? [],
              availableFrom: l.consultant?.availableFrom ?? null,
            },
          })
        }
      }

      // Invoices
      const invoices: Invoice[] = (invoiceBody?.data?.invoices ?? []).map((inv: any) => ({
        id: inv.id,
        total: inv.total,
        paid: inv.paid,
        outstanding: inv.outstanding,
        status: inv.status,
        aging: inv.aging,
      }))

      const invoiceSummary: InvoiceSummary | null = invoiceBody?.data?.summary ?? null

      setData({ sellContracts, buyContracts, benchEntries, invoices, invoiceSummary })
    } catch (err: any) {
      setError(err.message ?? 'Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ── Loading state ─────────────────────────────────

  if (loading) {
    return (
      <>
        <div className="page-head">
          <p className="eyebrow">Grow</p>
          <h1>Reports</h1>
          <p>Revenue, margin, and operational metrics from live data.</p>
        </div>
        <div className="animate-fade-in py-20 text-center text-etyme-muted">
          Loading reports…
        </div>
      </>
    )
  }

  // ── Error state ───────────────────────────────────

  if (error) {
    return (
      <>
        <div className="page-head">
          <p className="eyebrow">Grow</p>
          <h1>Reports</h1>
          <p>Revenue, margin, and operational metrics from live data.</p>
        </div>
        <div className="panel text-center py-16">
          <p className="text-sm text-etyme-attention mb-4">{error}</p>
          <button onClick={fetchAll} className="btn-primary">
            Retry
          </button>
        </div>
      </>
    )
  }

  if (!data) return null

  // ── Compute metrics ───────────────────────────────

  const { sellContracts, buyContracts, benchEntries, invoices, invoiceSummary } = data

  // 1. Active Revenue — sum of billRate for IN_PROGRESS sell contracts, as monthly ($rate x 160)
  const activeSellContracts = sellContracts.filter(c => c.state === 'IN_PROGRESS')
  const totalBillRateCentsPerHr = activeSellContracts.reduce((sum, c) => sum + c.billRate, 0)
  const monthlyRevenue = (totalBillRateCentsPerHr / 100) * 160

  // 2. Avg Margin — (avgBillRate - avgPayRate) / avgBillRate * 100
  const activeBuyContracts = buyContracts.filter(c => c.state === 'IN_PROGRESS')
  const avgBillRate = activeSellContracts.length > 0
    ? activeSellContracts.reduce((sum, c) => sum + c.billRate, 0) / activeSellContracts.length
    : 0
  const avgPayRate = activeBuyContracts.length > 0
    ? activeBuyContracts.reduce((sum, c) => sum + c.payRate, 0) / activeBuyContracts.length
    : 0
  const avgMargin = avgBillRate > 0 && avgPayRate > 0
    ? ((avgBillRate - avgPayRate) / avgBillRate) * 100
    : null

  // 3. Bench Utilization — IN_PROGRESS contracts / (IN_PROGRESS + bench available)
  const activeContractCount = activeSellContracts.length
  const benchAvailableCount = benchEntries.length
  const utilizationDenominator = activeContractCount + benchAvailableCount
  const benchUtilization = utilizationDenominator > 0
    ? (activeContractCount / utilizationDenominator) * 100
    : null

  // 4. AR Outstanding — from invoice summary
  const arOutstanding = invoiceSummary?.totalOutstanding ?? 0

  // ── Revenue by client ─────────────────────────────

  const revenueByClient: { name: string; monthly: number }[] = []
  const clientMap = new Map<string, number>()

  for (const c of activeSellContracts) {
    const clientName = c.endClientCompany?.name ?? c.clientCompany?.name ?? 'Unknown'
    const existing = clientMap.get(clientName) ?? 0
    clientMap.set(clientName, existing + (c.billRate / 100) * 160)
  }

  for (const [name, monthly] of clientMap.entries()) {
    revenueByClient.push({ name, monthly })
  }
  revenueByClient.sort((a, b) => b.monthly - a.monthly)

  const maxClientRevenue = revenueByClient.length > 0 ? revenueByClient[0].monthly : 0

  // ── Contract pipeline ─────────────────────────────

  const pipelineStates = ['DRAFT', 'IN_PROGRESS', 'ENDED', 'PAUSED'] as const
  const pipelineCounts: Record<string, number> = {}
  for (const state of pipelineStates) {
    pipelineCounts[state] = sellContracts.filter(c => c.state === state).length
  }
  const totalPipeline = sellContracts.length

  const pipelineColors: Record<string, string> = {
    DRAFT: 'bg-etyme-action',
    IN_PROGRESS: 'bg-etyme-verified',
    ENDED: 'bg-etyme-muted',
    PAUSED: 'bg-etyme-attention',
  }

  const pipelineLabels: Record<string, string> = {
    DRAFT: 'Draft',
    IN_PROGRESS: 'Active',
    ENDED: 'Ended',
    PAUSED: 'Paused',
  }

  // ── Bench skills distribution ─────────────────────

  const skillCounts = new Map<string, number>()
  for (const entry of benchEntries) {
    for (const skill of entry.consultant.skills) {
      skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1)
    }
  }

  const topSkills = Array.from(skillCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const maxSkillCount = topSkills.length > 0 ? topSkills[0][1] : 0

  // ── Invoice aging summary ─────────────────────────

  const invoiceStatusCounts: Record<string, number> = {}
  const statusLabels: Record<string, string> = {
    DRAFT: 'Draft',
    ISSUED: 'Issued',
    SUBMITTED: 'Submitted',
    PARTIALLY_PAID: 'Partially Paid',
    PAID: 'Paid',
    CANCELLED: 'Cancelled',
  }

  for (const inv of invoices) {
    invoiceStatusCounts[inv.status] = (invoiceStatusCounts[inv.status] ?? 0) + 1
  }

  const invoiceStatusEntries = Object.entries(invoiceStatusCounts)
    .map(([status, count]) => ({
      status,
      label: statusLabels[status] ?? status,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  function statusChipClass(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'chip--passive',
      ISSUED: 'chip--action',
      SUBMITTED: 'chip--action',
      PARTIALLY_PAID: 'chip--attention',
      PAID: 'chip--verified',
      CANCELLED: 'chip--passive',
    }
    return map[status] ?? 'chip--passive'
  }

  // ── Has data checks ───────────────────────────────

  const hasContracts = sellContracts.length > 0
  const hasBench = benchEntries.length > 0
  const hasInvoices = invoices.length > 0
  const hasAnyData = hasContracts || hasBench || hasInvoices

  // ── Render ────────────────────────────────────────

  return (
    <div className="animate-fade-in">
      {/* Header — decision surface: eyebrow + serif h1 + prose subtitle */}
      <div className="page-head">
        <p className="eyebrow">Grow</p>
        <h1>Reports</h1>
        <p>Revenue, margin, and operational metrics from live data.</p>
      </div>

      {!hasAnyData ? (
        <div className="panel text-center py-16">
          <p className="text-lg font-serif text-etyme-ink mb-2">No data yet</p>
          <p className="text-sm text-etyme-muted max-w-md mx-auto">
            Reports will populate as you add contracts, bench listings, and invoices.
            Start by creating a contract or importing consultant data.
          </p>
        </div>
      ) : (
        <>
          {/* Stats row — four panels */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {/* Active Revenue */}
            <div className="panel">
              <p className="stat-label">Active Revenue</p>
              <p className="stat-value text-etyme-ink">
                {fmtCurrency(monthlyRevenue)}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">
                monthly ({activeSellContracts.length} contract{activeSellContracts.length !== 1 ? 's' : ''})
              </p>
            </div>

            {/* Avg Margin */}
            <div className="panel">
              <p className="stat-label">Avg Margin</p>
              <p className={`stat-value ${avgMargin != null && avgMargin > 0 ? 'text-etyme-verified' : 'text-etyme-ink'}`}>
                {avgMargin != null ? fmtPercent(avgMargin) : '—'}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">
                {avgMargin != null ? 'sell vs buy rate' : 'needs both sides'}
              </p>
            </div>

            {/* Bench Utilization */}
            <div className="panel">
              <p className="stat-label">Bench Utilization</p>
              <p className={`stat-value ${benchUtilization != null && benchUtilization >= 70 ? 'text-etyme-verified' : benchUtilization != null && benchUtilization >= 40 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
                {benchUtilization != null ? fmtPercent(benchUtilization) : '—'}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">
                {benchUtilization != null
                  ? `${activeContractCount} active / ${benchAvailableCount} bench`
                  : 'no data'}
              </p>
            </div>

            {/* AR Outstanding */}
            <div className="panel">
              <p className="stat-label">AR Outstanding</p>
              <p className={`stat-value ${arOutstanding > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
                {fmtCurrency(arOutstanding)}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">
                {invoiceSummary
                  ? `${invoiceSummary.invoiceCount} invoice${invoiceSummary.invoiceCount !== 1 ? 's' : ''}`
                  : 'no invoices'}
              </p>
            </div>
          </div>

          {/* Two-column layout for main sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* Revenue by client */}
            <div className="panel">
              <p className="stat-label mb-4">Revenue by Client</p>
              {revenueByClient.length > 0 ? (
                <div className="space-y-3">
                  {revenueByClient.map((client) => (
                    <div key={client.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-etyme-ink truncate mr-3">
                          {client.name}
                        </span>
                        <span className="text-sm font-medium text-etyme-ink whitespace-nowrap"
                              style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtCurrency(client.monthly)}<span className="text-etyme-faint text-[11px]">/mo</span>
                        </span>
                      </div>
                      <div className="h-2 bg-etyme-canvas rounded-full overflow-hidden">
                        <div
                          className="h-full bg-etyme-action rounded-full transition-all"
                          style={{
                            width: maxClientRevenue > 0
                              ? `${(client.monthly / maxClientRevenue) * 100}%`
                              : '0%',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-etyme-faint">No active sell contracts.</p>
              )}
            </div>

            {/* Contract pipeline */}
            <div className="panel">
              <p className="stat-label mb-4">Contract Pipeline</p>
              {totalPipeline > 0 ? (
                <>
                  {/* Stacked horizontal bar */}
                  <div className="flex h-6 rounded-full overflow-hidden mb-4">
                    {pipelineStates.map((state) => {
                      const count = pipelineCounts[state]
                      if (count === 0) return null
                      const pct = (count / totalPipeline) * 100
                      return (
                        <div
                          key={state}
                          className={`${pipelineColors[state]} transition-all flex items-center justify-center`}
                          style={{ width: `${pct}%` }}
                          title={`${pipelineLabels[state]}: ${count}`}
                        >
                          {pct > 12 && (
                            <span className="text-white text-[10px] font-semibold"
                                  style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {count}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {pipelineStates.map((state) => (
                      <div key={state} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${pipelineColors[state]}`} />
                        <span className="text-[12px] text-etyme-muted">{pipelineLabels[state]}</span>
                        <span className="text-[12px] font-medium text-etyme-ink"
                              style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {pipelineCounts[state]}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-etyme-faint mt-3"
                     style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {totalPipeline} total sell contract{totalPipeline !== 1 ? 's' : ''}
                  </p>
                </>
              ) : (
                <p className="text-sm text-etyme-faint">No sell contracts yet.</p>
              )}
            </div>
          </div>

          {/* Second row — bench skills + invoice aging */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Bench skills distribution */}
            <div className="panel">
              <p className="stat-label mb-4">Bench Skills Distribution</p>
              {topSkills.length > 0 ? (
                <div className="space-y-2.5">
                  {topSkills.map(([skill, count]) => (
                    <div key={skill} className="flex items-center gap-3">
                      <span className="text-sm text-etyme-ink truncate min-w-0 flex-1">
                        {skill}
                      </span>
                      <div className="w-24 h-1.5 bg-etyme-canvas rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className="h-full bg-etyme-verified rounded-full transition-all"
                          style={{
                            width: maxSkillCount > 0
                              ? `${(count / maxSkillCount) * 100}%`
                              : '0%',
                          }}
                        />
                      </div>
                      <span className="text-[12px] font-medium text-etyme-muted w-6 text-right flex-shrink-0"
                            style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-etyme-faint">
                  {hasBench ? 'No skills listed on bench profiles.' : 'No bench listings yet.'}
                </p>
              )}
              {hasBench && (
                <p className="text-[11px] text-etyme-faint mt-3">
                  {benchEntries.length} bench listing{benchEntries.length !== 1 ? 's' : ''} across {skillCounts.size} unique skill{skillCounts.size !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Invoice aging summary */}
            <div className="panel">
              <p className="stat-label mb-4">Invoice Summary</p>
              {invoiceStatusEntries.length > 0 ? (
                <>
                  <div className="space-y-2.5">
                    {invoiceStatusEntries.map(({ status, label, count }) => (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`chip ${statusChipClass(status)}`}>{label}</span>
                        </div>
                        <span className="text-sm font-medium text-etyme-ink"
                              style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Aging breakdown if available */}
                  {invoiceSummary && invoiceSummary.totalOutstanding > 0 && (
                    <div className="mt-5 pt-4 border-t border-etyme-rule">
                      <p className="stat-label mb-2">Aging Breakdown</p>
                      <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
                        {([
                          { key: 'current', color: 'bg-etyme-verified', amount: invoiceSummary.current },
                          { key: '1-30', color: 'bg-amber-400', amount: invoiceSummary['1-30'] },
                          { key: '31-60', color: 'bg-orange-500', amount: invoiceSummary['31-60'] },
                          { key: '61-90', color: 'bg-red-500', amount: invoiceSummary['61-90'] },
                          { key: '90+', color: 'bg-red-700', amount: invoiceSummary['90+'] },
                        ] as const).map((bucket) => {
                          if (bucket.amount <= 0) return null
                          const pct = (bucket.amount / invoiceSummary.totalOutstanding) * 100
                          return (
                            <div
                              key={bucket.key}
                              className={`${bucket.color} transition-all`}
                              style={{ width: `${pct}%` }}
                              title={`${bucket.key}: ${fmtCurrency(bucket.amount)}`}
                            />
                          )
                        })}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {([
                          { key: 'Current', color: 'bg-etyme-verified', amount: invoiceSummary.current },
                          { key: '1–30d', color: 'bg-amber-400', amount: invoiceSummary['1-30'] },
                          { key: '31–60d', color: 'bg-orange-500', amount: invoiceSummary['31-60'] },
                          { key: '61–90d', color: 'bg-red-500', amount: invoiceSummary['61-90'] },
                          { key: '90+d', color: 'bg-red-700', amount: invoiceSummary['90+'] },
                        ] as const).map((bucket) => (
                          <div key={bucket.key} className="flex items-center gap-1 text-[11px]">
                            <span className={`w-2 h-2 rounded-full ${bucket.color}`} />
                            <span className="text-etyme-muted">{bucket.key}</span>
                            <span className="font-medium text-etyme-ink"
                                  style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {fmtCurrency(bucket.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-etyme-faint mt-3"
                     style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} loaded
                  </p>
                </>
              ) : (
                <p className="text-sm text-etyme-faint">No invoices yet.</p>
              )}
            </div>
          </div>

          {/* Refresh footer */}
          <div className="mt-6 text-center">
            <button
              onClick={fetchAll}
              className="text-[12px] text-etyme-action hover:underline"
            >
              Refresh data
            </button>
          </div>
        </>
      )}
    </div>
  )
}
