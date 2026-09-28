'use client'

import { useEffect, useState, useCallback } from 'react'
import { SERIES, AGE_BANDS, segmentStyle } from '@/lib/chart-colors'
import { fromUnits as fmtCurrency, compact as fmtMinor, amount as fmtMinorExact } from '@/lib/money-display'

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
  /**
   * Whose line this is.
   *
   * Not cosmetic. `/api/contracts?side=sell` serves a prime or a GSI
   * `OR: [companyId, clientCompanyId]` — correctly, because a prime both
   * sells and buys and wants both sides of its placements on one list. So
   * the list contains the lines this firm sells **and** the lines its own
   * suppliers sell to it, and the second kind is its cost.
   *
   * This page counted both as revenue until 2026-09-26: Teleworld
   * Solutions read $41,280 a month over two contracts when one of the two
   * was Nimbus Talent's $116/hr line billing Teleworld. Its revenue is
   * $22,720. The one live consultant was counted twice, once at each rung
   * of one chain.
   */
  companyId: string | null
}

/**
 * The margin, from the one route that computes it.
 *
 * This page used to work a margin out in the browser — the mean of every
 * active sell rate less the mean of every active buy rate — and printed
 * 10.1% where the placement's own spread was 18.3%. Two screens each doing
 * their own arithmetic is two numbers, so the figure comes from
 * `/api/profitability?by=book` now, which is the same door
 * `/dashboard/profitability` reads. One door or two numbers; there is no
 * third option.
 *
 * It is also the gate. A margin percentage requires `margin.read`
 * (`lib/permissions`), the Profitability nav link asks for it and this
 * page does not — so a Recruiter who is deliberately refused the
 * Profitability page was reading a margin off this one. The route refuses
 * them and the panel says why instead of printing a number.
 */
interface Book {
  agreed: {
    pct: number | null
    billRateCents: number | null
    payRateCents: number | null
    currency: string | null
    placements: number
    unpriced: number
    refusedBecause: string | null
    says: string
  }
  /** What is billed, whether or not anything is priced behind it. */
  revenue: {
    /** The rates added. What a run rate multiplies. */
    totalBillRateCents: number | null
    /** The blended rate, which is a rate somebody pays. */
    billRateCents: number | null
    monthlyCents: number | null
    placements: number
    currency: string | null
    withoutCost: number
    refusedBecause: string | null
    says: string
  }
  revenueByClient: {
    clientId: string
    name: string
    placements: number
    monthlyCents: number | null
    currency: string | null
    refusedBecause: string | null
  }[]
  /** The firm's own placements by state. Never its suppliers' lines. */
  pipeline: { counts: Record<string, number>; total: number }
  placements: number
  unlinked: number
  scopeSays: string
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

type AgingKey = 'current' | '1-30' | '31-60' | '61-90' | '90+'

/**
 * One currency's book, on one side of the ledger.
 *
 * `/api/invoices` no longer returns a single outstanding figure, because
 * a single figure required adding a firm's own supplier bills to what it
 * was owed and adding dollars to rupees. This report shows the largest
 * receivable book and names its currency rather than inventing a total.
 */
interface CurrencySummary {
  currency: string
  outstandingMinor: number
  overdueMinor: number
  buckets: Record<AgingKey, { count: number; minor: number }>
  invoiceCount: number
}

interface InvoiceSummary {
  units: 'MINOR'
  receivable: CurrencySummary[]
  payable: CurrencySummary[]
  unattributedCount: number
  gaps: string[]
  says: string
}

interface Invoice {
  id: string
  currency: string
  totalMinor: number
  paidMinor: number
  outstandingMinor: number
  status: string
  aging: string
}

interface ReportData {
  sellContracts: SellContract[]
  buyContracts: BuyContract[]
  benchEntries: BenchEntry[]
  invoices: Invoice[]
  invoiceSummary: InvoiceSummary | null
  book: Book | null
  /** Set where the caller may not read a margin at all. */
  bookRefusal: string | null
}

// ── Helpers ────────────────────────────────────────────


function fmtPercent(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

// ── Page ───────────────────────────────────────────────


/** The five age bands of a book, in the order a credit controller reads them. */
function agingOf(book: any) {
  return [
    { key: 'current', label: 'Current', color: AGE_BANDS[0], amount: book.buckets.current.minor },
    { key: '1-30', label: '1–30d', color: AGE_BANDS[1], amount: book.buckets['1-30'].minor },
    { key: '31-60', label: '31–60d', color: AGE_BANDS[2], amount: book.buckets['31-60'].minor },
    { key: '61-90', label: '61–90d', color: AGE_BANDS[3], amount: book.buckets['61-90'].minor },
    { key: '90+', label: '90+d', color: AGE_BANDS[4], amount: book.buckets['90+'].minor },
  ]
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [sellRes, buyRes, benchRes, invoiceRes, bookRes] = await Promise.all([
        fetch('/api/contracts?side=sell&limit=100'),
        fetch('/api/contracts?side=buy&limit=100'),
        fetch('/api/bench?scope=company'),
        fetch('/api/invoices?limit=100'),
        // The margin, from the one door. `scope=live` because the panel
        // beside it is a monthly run rate, and a run rate over finished
        // work is not a run rate — the two figures on one row have to be
        // answering the same question about the same placements.
        fetch('/api/profitability?by=book&scope=live'),
      ])

      // Parse responses — each might fail independently
      const sellBody = sellRes.ok ? await sellRes.json() : null
      const buyBody = buyRes.ok ? await buyRes.json() : null
      const benchBody = benchRes.ok ? await benchRes.json() : null
      const invoiceBody = invoiceRes.ok ? await invoiceRes.json() : null
      const bookBody = bookRes.ok ? await bookRes.json() : null

      // A refusal is not a failure. A seat without `margin.read` reads the
      // sentence rather than a blank, because a blank invites somebody to
      // conclude the margin is nothing.
      let bookRefusal: string | null = null
      if (!bookRes.ok) {
        try {
          const b = await bookRes.json()
          bookRefusal = b?.error?.message ?? null
        } catch {
          bookRefusal = null
        }
        if (bookRes.status === 403 && !bookRefusal) {
          bookRefusal = 'You cannot see what placements earn.'
        }
      }

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
        companyId: c.companyId ?? null,
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
        currency: inv.currency,
        totalMinor: inv.totalMinor,
        paidMinor: inv.paidMinor,
        outstandingMinor: inv.outstandingMinor,
        status: inv.status,
        aging: inv.aging,
      }))

      const invoiceSummary: InvoiceSummary | null = invoiceBody?.data?.summary ?? null

      const book: Book | null = bookBody?.data
        ? {
            agreed: bookBody.data.agreed,
            revenue: bookBody.data.revenue,
            revenueByClient: bookBody.data.revenueByClient ?? [],
            pipeline: bookBody.data.pipeline ?? { counts: {}, total: 0 },
            placements: bookBody.data.placements,
            unlinked: bookBody.data.unlinked,
            scopeSays: bookBody.data.scopeSays,
          }
        : null

      setData({ sellContracts, buyContracts, benchEntries, invoices, invoiceSummary, book, bookRefusal })
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

  const { sellContracts, buyContracts, benchEntries, invoices, invoiceSummary, book, bookRefusal } = data

  // 1. Active Revenue — from the same door as the margin.
  //
  // This was `sum(billRate for IN_PROGRESS sell contracts) x 160` computed
  // over `/api/contracts?side=sell`, and that list serves a prime or a GSI
  // both sides of its placements — correctly, because a prime both sells
  // and buys. So a supplier's line billing *us* was being counted as our
  // revenue: Teleworld Solutions read $41,280 a month over "2 contracts"
  // when one of the two was Nimbus Talent's $116/hr line billing Teleworld
  // for the same consultant. Its revenue is $22,720 from one placement.
  //
  // `/api/profitability?by=book` scopes to `companyId` server-side, which
  // is the only place the question can be answered, and it counts a live
  // placement with no buy line behind it — revenue does not need a cost.
  const revenue = book?.revenue ?? null
  const monthlyRevenue = revenue?.monthlyCents != null ? revenue.monthlyCents / 100 : null
  const revenuePlacements = revenue?.placements ?? null

  // 2. Avg Margin — from `/api/profitability?by=book&scope=live`, and from
  //    nowhere else. Never recomputed here; see the `Book` note above.
  const avgMargin = book?.agreed.pct ?? null


  // 3. Bench Utilization — live placements / (live + bench available)
  //
  // Also reads the route's count rather than the contract list, and for
  // the same reason: a GSI's own placements are the numerator, never its
  // supplier's line billing it, which would have shown a firm as more
  // utilized the more it subcontracted.
  const activeContractCount = revenuePlacements ?? 0
  const benchAvailableCount = benchEntries.length
  const utilizationDenominator = activeContractCount + benchAvailableCount
  const benchUtilization = utilizationDenominator > 0
    ? (activeContractCount / utilizationDenominator) * 100
    : null

  // 4. AR Outstanding — the receivable side only, one currency at a time.
  //
  // The old figure here added payables into the receivable and added two
  // currencies together. There is no total that fixes either, so the
  // largest book is shown with its currency named, and a second book is
  // said out loud rather than folded in.
  const arBooks = invoiceSummary?.receivable ?? []
  const arBook = arBooks.length > 0
    ? arBooks.reduce((a, b) => (b.outstandingMinor > a.outstandingMinor ? b : a))
    : null
  const arOutstandingMinor = arBook?.outstandingMinor ?? 0
  const arCurrency = arBook?.currency ?? 'USD'
  const otherArBooks = arBooks.filter((b) => b.currency !== arCurrency)

  // ── Revenue by client ─────────────────────────────

  // From the route, over the firm's own sell lines. A client billed in two
  // currencies carries its reason instead of a bar, because a bar of two
  // currencies added together is not a length.
  const revenueByClient = (book?.revenueByClient ?? [])
    .filter((c) => c.monthlyCents != null)
    .map((c) => ({ name: c.name, monthly: c.monthlyCents! / 100 }))
  const clientsWithoutTotal = (book?.revenueByClient ?? []).filter((c) => c.monthlyCents == null)

  const maxClientRevenue = revenueByClient.length > 0 ? revenueByClient[0].monthly : 0

  // ── Contract pipeline ─────────────────────────────

  // From the route, over the firm's own placements. Counted off
  // `sellContracts` this read "3 total sell contracts" for a firm with
  // two, because its supplier's line billing it is on that list — the
  // same correction as the revenue figure, one panel over.
  const pipelineStates = ['DRAFT', 'IN_PROGRESS', 'ENDED', 'PAUSED'] as const
  const pipelineCounts: Record<string, number> = {}
  for (const state of pipelineStates) {
    pipelineCounts[state] = book?.pipeline.counts[state] ?? 0
  }
  const totalPipeline = book?.pipeline.total ?? 0

  // Four states of a contract: identity, not severity — a paused
  // contract is not "worse" than a draft. The fixed series order, so
  // the color follows the state and a filter never repaints it. The
  // green and the gray used to sit side by side at ΔE 5.6 for normal
  // vision, under the floor of 15.
  const pipelineColors: Record<string, string> = {
    DRAFT: SERIES[0],
    IN_PROGRESS: SERIES[2],
    ENDED: SERIES[4],
    PAUSED: SERIES[1],
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
            Reports will populate as you add contracts, bench listings, and bills.
            Start by creating a contract or importing consultant data.
          </p>
        </div>
      ) : (
        <>
          {/* Stats row — four panels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {/* Active Revenue */}
            <div className="panel">
              <p className="stat-label">Active Revenue</p>
              <p className="stat-value text-etyme-ink">
                {monthlyRevenue == null ? '—' : fmtCurrency(monthlyRevenue)}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">
                {/* "Placement" rather than "contract": there are two
                    contracts behind one placement in a chain and counting
                    them was how one consultant was billed twice. */}
                {monthlyRevenue == null
                  ? revenue?.refusedBecause ?? 'nothing running'
                  : `monthly at 160 hrs (${revenuePlacements} placement${revenuePlacements === 1 ? '' : 's'})`}
              </p>
            </div>

            {/* Avg Margin */}
            <div className="panel">
              <p className="stat-label">Avg Margin</p>
              <p className={`stat-value ${avgMargin != null && avgMargin > 0 ? 'text-etyme-verified' : 'text-etyme-ink'}`}>
                {avgMargin != null ? fmtPercent(avgMargin) : '—'}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">
                {/* Never a bare dash. Where there is no figure there is a
                    reason, and a seat that may not read a margin is told
                    that rather than shown an empty box. */}
                {avgMargin != null
                  ? 'agreed rate spread, running now'
                  : bookRefusal ?? book?.agreed.refusedBecause ?? 'needs both sides of a placement'}
              </p>
              {book != null && book.unlinked > 0 && (
                <p className="text-[11px] text-etyme-attention mt-0.5">
                  {book.unlinked} with no buy line behind {book.unlinked === 1 ? 'it' : 'them'}
                </p>
              )}
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
              <p className={`stat-value ${arOutstandingMinor > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
                {fmtMinor(arOutstandingMinor, arCurrency)}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">
                {arBook
                  ? `${arBook.invoiceCount} bill${arBook.invoiceCount !== 1 ? 's' : ''} · ${arCurrency}` +
                    (otherArBooks.length > 0
                      ? ` · ${otherArBooks.length} other book${otherArBooks.length !== 1 ? 's' : ''} not added in`
                      : '')
                  : 'no bills'}
              </p>
            </div>
          </div>

          {/* Two-column layout for main sections */}
          <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

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
                <p className="text-sm text-etyme-faint">Nothing running to bill for right now.</p>
              )}
              {/* A client billed in two currencies carries its reason
                  rather than a bar, because a bar of two currencies added
                  together is not a length. */}
              {clientsWithoutTotal.map((c) => (
                <p key={c.clientId} className="mt-2 text-[11px] text-etyme-attention">
                  {c.name} — {c.refusedBecause}
                </p>
              ))}
            </div>

            {/* Contract pipeline */}
            <div className="panel">
              <p className="stat-label mb-4">Contract Pipeline</p>
              {totalPipeline > 0 ? (
                <>
                  {/* Stacked horizontal bar */}
                  {/* The counts live in the legend below, never inside
                      the segments: a number printed on a fill is the
                      first thing a narrow segment clips, and it wore
                      white on four different backgrounds. */}
                  <div className="flex h-6 rounded-full overflow-hidden mb-4">
                    {(() => {
                      const shown = pipelineStates.filter((st) => pipelineCounts[st] > 0)
                      return shown.map((state, i) => (
                        <div
                          key={state}
                          className="transition-all"
                          style={segmentStyle(pipelineCounts[state] / totalPipeline, pipelineColors[state], i === shown.length - 1)}
                          title={`${pipelineLabels[state]}: ${pipelineCounts[state]}`}
                        />
                      ))
                    })()}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {pipelineStates.map((state) => (
                      <div key={state} className="flex items-center gap-1.5">
                        {/* A swatch stands for a segment on the bar. A
                            state with nothing in it has no segment, so
                            it keeps its count and loses its dot. */}
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={pipelineCounts[state] > 0
                            ? { background: pipelineColors[state] }
                            : { border: '1px solid var(--color-rule)' }}
                        />
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
                    {totalPipeline} placement{totalPipeline !== 1 ? 's' : ''} this firm sells
                  </p>
                </>
              ) : book == null ? (
                /* Not a blank. Counting these off the contract list would
                   include the lines this firm's own suppliers bill it,
                   which is how it read "3" for a firm with two, and only
                   the server can tell those apart. So it says what is
                   missing rather than showing a number that is wrong. */
                <p className="text-sm text-etyme-faint">
                  {bookRefusal
                    ? `${bookRefusal} The placement count sits behind the same permission.`
                    : 'Could not read this firm\u2019s own placements just now. Retry above.'}
                </p>
              ) : (
                <p className="text-sm text-etyme-faint">No placements yet.</p>
              )}
            </div>
          </div>

          {/* Second row — bench skills + invoice aging */}
          <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Bench skills distribution */}
            <div className="panel">
              <p className="stat-label mb-4">Bench Skills Distribution</p>
              {/* Eight bars of identical length is not a chart; it is
                  eight skills, one listing each, drawn as though the
                  lengths meant something. Where nothing varies, the
                  list is the honest form. */}
              {topSkills.length > 0 && topSkills.every(([, c]) => c === topSkills[0][1]) ? (
                <div className="flex flex-wrap gap-1.5">
                  {topSkills.map(([skill]) => (
                    <span key={skill} className="chip chip--passive">{skill}</span>
                  ))}
                </div>
              ) : topSkills.length > 0 ? (
                <div className="space-y-2.5">
                  {topSkills.map(([skill, count]) => (
                    <div key={skill} className="flex items-center gap-3">
                      <span className="text-sm text-etyme-ink truncate min-w-0 flex-1">
                        {skill}
                      </span>
                      <div className="w-24 h-1.5 bg-etyme-canvas rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            background: SERIES[0],
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
              <p className="stat-label mb-4">Bills and invoices</p>
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
                  {arBook && arBook.outstandingMinor > 0 && (
                    <div className="mt-5 pt-4 border-t border-etyme-rule">
                      <p className="stat-label mb-2">Aging Breakdown — owed to us, {arCurrency}</p>
                      {/* The third place this book is drawn. All three
                          wear AGE_BANDS now; they used to be three
                          different palettes for one set of numbers. */}
                      <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
                        {(() => {
                          const shown = agingOf(arBook).filter((b) => b.amount > 0)
                          return shown.map((bucket, i) => (
                            <div
                              key={bucket.key}
                              className="transition-all"
                              style={segmentStyle(bucket.amount / arBook.outstandingMinor, bucket.color, i === shown.length - 1)}
                              title={`${bucket.label}: ${fmtMinorExact(bucket.amount, arCurrency)}`}
                            />
                          ))
                        })()}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {agingOf(arBook).map((bucket) => (
                          <div key={bucket.key} className="flex items-center gap-1 text-[11px]">
                            <span className="w-2 h-2 rounded-full" style={{ background: bucket.color }} />
                            <span className="text-etyme-muted">{bucket.label}</span>
                            <span className="font-medium text-etyme-ink"
                                  style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {fmtMinor(bucket.amount, arCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-etyme-faint mt-3"
                     style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {invoices.length} loaded — what we billed and what we were invoiced
                  </p>
                </>
              ) : (
                <p className="text-sm text-etyme-faint">No bills or invoices yet.</p>
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
