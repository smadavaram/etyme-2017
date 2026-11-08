'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/components/session-provider'
import { usePageSection } from '@/components/page-section'
import { mayOpen } from '@/components/shell/sidebar'
import { ListSurface } from '@/components/list-surface'
import type { Column } from '@/components/list-surface'
import { EmptyState, ErrorState, FilterChips, Lbl, LoadingState, PageHead, Panel, RefusedState, Stat } from '@/components/ui'
import { refusalOf, refusedRead } from '@/lib/money/refused-read'
import { AGE_BANDS, segmentStyle } from '@/lib/chart-colors'
import { amount } from '@/lib/money-display'
import { BUCKETS, BUCKET_LABEL } from '@/lib/ar-ageing'
import {
  CASH_PERIODS, CASH_PERIOD_WORD, GRAINS, GRAIN_WORD, FIGURE_WORD, varies,
  type Bands, type CashPeriod, type CashRow, type CurrencyFlow, type Figure, type Grain,
} from '@/lib/money/cash-flow'
import { CutTable } from '../profitability/cut-table'

/**
 * Reports — cash flow and profitability, and nothing else.
 *
 * The founder, 2026-11-08: "Reports is nothing but cashflow and
 * profitability margin analysis tools." So two tabs, each at its own
 * address so a link can open it:
 *
 *   · **Cash flow** (`?tab=cash-flow`, the default) — billed, payments in,
 *     invoice receipts due, payments out, payroll due and paid, and the
 *     net, by week or by month, for this month, this quarter or the last
 *     90 days, with what is owed both ways in the five age bands. One
 *     table per currency: rupees and dollars are never added. Every
 *     figure is the route's (`/api/ap?view=cash-flow`), which reads the
 *     Accounts receivable, Accounts payable and Payroll pages' own
 *     readers; this screen computes nothing.
 *   · **Profitability** (`?tab=profitability`) — the Profitability page's
 *     own cut table, the same component, so the two addresses cannot say
 *     two margins. `/dashboard/profitability` keeps its address and its
 *     detail views.
 *
 * Removed on the same day, because none of it is cash or margin and each
 * is shown on its own page: the revenue and margin tiles computed from
 * contract lists, revenue by client, the contract pipeline (Contracts),
 * the bench skills distribution (Network · Candidates) and the bills
 * summary (Bills and its AR tab).
 *
 * A tab is asked for only where the seat's menu would open what it reads:
 * cash flow where Bills or Invoice receipts open, Profitability where
 * Profitability does. A seat that opens neither reads one sentence.
 *
 * A client is held back for now (the architect holds its link, the
 * coordinator's call of 2026-11-08): the route answers a client's own book
 * — what it owes its suppliers, paid and due, by age band, and never a
 * margin — and the page says it is not open yet rather than drawing it.
 */

type Tab = 'cash-flow' | 'profitability'
const TAB_WORD: Record<Tab, string> = { 'cash-flow': 'Cash flow', profitability: 'Profitability' }

export default function ReportsPage() {
  const { permissions, company, loading: sessionLoading } = useSession()
  const eyebrow = usePageSection('/dashboard/reports')
  const params = useSearchParams()

  const readsCash = permissions != null && (mayOpen('/dashboard/ap', permissions) || mayOpen('/dashboard/ar', permissions))
  const readsMargin = permissions != null && mayOpen('/dashboard/profitability', permissions)
  const offered: Tab[] = [...(readsCash ? ['cash-flow' as const] : []), ...(readsMargin ? ['profitability' as const] : [])]
  const asked = params?.get('tab') === 'profitability' ? 'profitability' : 'cash-flow'
  const tab: Tab | null = offered.includes(asked) ? asked : offered[0] ?? null

  if (!company) {
    return sessionLoading ? <LoadingState /> : <RefusedState says="These are a company’s books, and you are not signed in at a company." />
  }
  if (permissions == null) return <LoadingState />
  if (company.kind === 'CLIENT') {
    return (
      <>
        <PageHead eyebrow={eyebrow} title="Reports" />
        <EmptyState says="Reports is not open for a client yet. What you owe your suppliers is under Payables." />
      </>
    )
  }
  if (!tab) {
    return (
      <RefusedState says="Reports add up your firm’s cash flow and what it made. Your role reads neither. Ask whoever manages roles at your company for Accounts receivable, Accounts payable or Finance." />
    )
  }

  return (
    <>
      <PageHead
        eyebrow={eyebrow}
        title="Reports"
        subtitle="Cash in and out, and what the work made. Nothing else is here."
      />
      <nav aria-label="Reports" className="mb-5 flex gap-1 border-b border-etyme-rule">
        {offered.map((t) => (
          <Link
            key={t}
            href={`/dashboard/reports?tab=${t}` as Route}
            aria-current={t === tab ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${
              t === tab ? 'border-etyme-ink font-medium text-etyme-ink' : 'border-transparent text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            {TAB_WORD[t]}
          </Link>
        ))}
      </nav>
      {tab === 'cash-flow' ? <CashFlowTab kind={company.kind} name={company.name} /> : <CutTable />}
    </>
  )
}

// ── Cash flow ──────────────────────────────────────────

interface CashBody {
  window: { label: string }
  figures: Figure[]
  currencies: CurrencyFlow[]
  says: string[]
}

function CashFlowTab({ kind, name }: { kind: string; name: string }) {
  const [period, setPeriod] = useState<CashPeriod>('month')
  const [grain, setGrain] = useState<Grain>('week')
  const [data, setData] = useState<CashBody | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refusedSaid, setRefusedSaid] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ap?view=cash-flow&period=${period}&grain=${grain}`)
      const body = await res.json().catch(() => null)
      if (res.status === 403) {
        setRefusedSaid(refusalOf(403, body) ?? '')
        setData(null)
        return
      }
      if (!res.ok || !body?.data) throw new Error(body?.error?.message ?? 'Cash flow could not be read just now. Try again in a minute.')
      setRefusedSaid(null)
      setData(body.data)
    } catch (e: any) {
      setError(e?.message ?? 'Cash flow could not be read just now. Try again in a minute.')
    } finally {
      setLoading(false)
    }
  }, [period, grain])

  useEffect(() => { load() }, [load])

  // Refused: the sentence and nothing else under the tab — no chip, no figure.
  const refused = refusedRead(refusedSaid, { what: 'Cash flow', kind, company: name })
  if (refused) {
    return <RefusedState says={refused} />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips<CashPeriod>
          label="Period"
          options={CASH_PERIODS.map((p) => ({ key: p, label: CASH_PERIOD_WORD[p] }))}
          value={period}
          onChange={setPeriod}
        />
        <FilterChips<Grain>
          label="Rows"
          options={GRAINS.map((g) => ({ key: g, label: GRAIN_WORD[g] }))}
          value={grain}
          onChange={setGrain}
        />
      </div>

      {loading ? <LoadingState says="Reading cash flow…" /> : error ? (
        <ErrorState says={error} action={{ label: 'Try again', onClick: load }} />
      ) : !data ? null : data.currencies.length === 0 ? (
        <EmptyState says={`No money moved in ${data.window.label}, and nothing is owed either way.`} />
      ) : (
        <>
          {data.says.map((s) => <p key={s} className="text-[12.5px] text-etyme-muted">{s}</p>)}
          {data.currencies.map((c) => (
            <CurrencyPanel key={c.currency} flow={c} figures={data.figures} label={data.window.label} several={data.currencies.length > 1} grain={grain} />
          ))}
        </>
      )}
    </div>
  )
}

function money(minor: number | null | undefined, currency: string): string {
  return minor == null ? '—' : amount(minor, currency)
}

function CurrencyPanel({ flow, figures, label, several, grain }: {
  flow: CurrencyFlow; figures: Figure[]; label: string; several: boolean; grain: Grain
}) {
  const cur = flow.currency
  const columns: Column<CashRow>[] = [
    { key: 'label', label: grain === 'week' ? 'Week' : 'Month', sortValue: (r) => r.start, exportValue: (r) => r.label },
    ...figures.map((f): Column<CashRow> => ({
      key: f,
      label: FIGURE_WORD[f],
      align: 'right',
      render: (r) => money(r.figures[f], cur),
      sortValue: (r) => r.figures[f] ?? null,
      exportValue: (r) => r.figures[f] ?? null,
    })),
    {
      key: 'net', label: FIGURE_WORD.net, align: 'right',
      render: (r) => (
        <span className={r.net != null && r.net < 0 ? 'text-etyme-attention' : undefined}>{money(r.net, cur)}</span>
      ),
      sortValue: (r) => r.net, exportValue: (r) => r.net,
    },
  ]

  return (
    <Panel
      title={several ? `${label}, in ${cur}` : label}
      subtitle={several ? 'Each currency is its own table. They are never added together.' : undefined}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map((f) => <Stat key={f} label={FIGURE_WORD[f]} value={money(flow.totals.figures[f], cur)} />)}
        <Stat label={FIGURE_WORD.net} value={money(flow.totals.net, cur)} tone={flow.totals.net != null && flow.totals.net < 0 ? 'attention' : 'default'} />
      </div>

      <ListSurface<CashRow>
        name={`reports-cash-flow-${cur}`}
        exportName={`cash-flow-${cur}-${grain}`}
        columns={columns}
        data={flow.rows}
        rowKey={(r) => r.key}
        searchable={false}
        emptyMessage="No rows in this period."
      />

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {flow.owedToUs && <AgeBands title="Owed to you, by how late" bands={flow.owedToUs} currency={cur} />}
        <AgeBands title="You owe suppliers, by how late" bands={flow.weOwe} currency={cur} />
      </div>
    </Panel>
  )
}

/**
 * The five age bands, in AGE_BANDS. A stacked bar only where the values
 * differ; where they do not, the list is the honest form and no bar is
 * drawn. The counts live in the legend below, never inside a segment,
 * where a narrow band clips them.
 */
function AgeBands({ title, bands, currency }: { title: string; bands: Bands; currency: string }) {
  const rows = BUCKETS.map((b, i) => ({ key: b, label: BUCKET_LABEL[b], color: AGE_BANDS[i], ...bands[b] }))
  const total = rows.reduce((n, r) => n + r.minor, 0)
  if (total <= 0) {
    return (
      <div>
        <Lbl className="mb-2">{title}</Lbl>
        <p className="text-[12.5px] text-etyme-muted">Nothing open.</p>
      </div>
    )
  }
  const drawn = rows.filter((r) => r.minor > 0)
  return (
    <div>
      <Lbl className="mb-2">{title}</Lbl>
      {varies(rows.map((r) => r.minor)) && (
        <div className="mb-3 flex h-3 w-full overflow-hidden rounded-pill bg-etyme-sunk" aria-hidden>
          {drawn.map((r, i) => (
            <div key={r.key} style={segmentStyle(r.minor / total, r.color, i === drawn.length - 1)} title={`${r.label}: ${amount(r.minor, currency)}`} />
          ))}
        </div>
      )}
      <ul className="space-y-1 text-[12.5px]">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-etyme-muted">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
              {r.label}{r.count ? ` · ${r.count}` : ''}
            </span>
            <span className="tabular-nums text-etyme-ink">{amount(r.minor, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
