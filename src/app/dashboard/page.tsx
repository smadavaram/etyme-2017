'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

/**
 * Vendor Dashboard — the "Today" view.
 *
 * CLAUDE.md design system:
 *   Decision surfaces: "Prose, reasoning, confidence, calm. 3–10 items.
 *   Serif headlines, generous space. User decides well and leaves."
 *
 * Shows: live counts from APIs — contracts, decisions, bench, pipeline.
 * Links into working surfaces for each actionable item.
 */

// ── Types ────────────────────────────────────────────

interface Decision {
  type: string
  title: string
  subtitle: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  actionUrl: string
  amount: number | null
}

interface DashboardData {
  decisions: Decision[]
  totalDecisions: number
  highCount: number
  contracts: { total: number; active: number; draft: number; ending: number }
  bench: { name: string; skill: string; status: string; daysSince: number }[]
  pipeline: { total: number; monthlyRevenue: number }
  recentAutomation: { summary: string; at: string }[]
}

/** Good submissions per day per requirement, and what one costs. */
interface Bar {
  target: number
  window: number
  bar: { rate: number | null; good: number; sent: number; requirements: number; says: string; hit: boolean }
  stopping: { reason: string; count: number; label: string }[]
  cost: {
    perSubmission: number | null
    shown: string
    trend: string | null
    filtered: { kept: number; considered: number; percent: number | null }
    worst: { agent: string; micros: number } | null
  }
  recurring: {
    headline: string | null
    recordsChecked: number
    patterns: { code: string; hits: number; outOf: number; percent: number; says: string; reallyFix: string }[]
  }
}

// ── Helpers ──────────────────────────────────────────

function urgencyDot(urgency: string): string {
  switch (urgency) {
    case 'HIGH': return 'evidence-dot--blocked'
    case 'MEDIUM': return 'evidence-dot--pending'
    case 'LOW': return 'evidence-dot--pending'
    default: return ''
  }
}

function urgencyAction(urgency: string): string {
  switch (urgency) {
    case 'HIGH': return 'chip--danger'
    case 'MEDIUM': return 'chip--attention'
    case 'LOW': return 'chip--action'
    default: return 'chip--passive'
  }
}

function urgencyLabel(urgency: string): string {
  switch (urgency) {
    case 'HIGH': return 'Urgent'
    case 'MEDIUM': return 'Review'
    case 'LOW': return 'View'
    default: return 'View'
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / (1000 * 60))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function greetingTime(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

// ── Page ─────────────────────────────────────────────


/**
 * The one number, and what it costs.
 *
 * Good submissions per day, per requirement. Not users, not logins, not
 * model accuracy, not requirements processed. Five and there is a
 * business; two and something is wrong that no further feature will fix.
 *
 * Meant to be looked at with the customer in the room — both sides read
 * the same screen, which turns pricing day into arithmetic instead of an
 * argument. So it sits at the top, not in a reports tab.
 */
function TheBar() {
  const [b, setB] = useState<Bar | null>(null)

  useEffect(() => {
    fetch('/api/bar?days=30')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => body && setB(body.data))
      .catch(() => {})
  }, [])

  if (!b) return null

  const { bar, cost, stopping, target } = b

  return (
    <div className="panel mb-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="eyebrow mb-1">The number · last {b.window} days</p>
          <div className="flex items-baseline gap-3">
            <span
              className="headline-serif text-[42px] leading-none tabular-nums"
              style={{ color: bar.hit ? 'var(--color-verified)' : 'var(--color-ink)' }}
            >
              {bar.rate ?? '—'}
            </span>
            <span className="text-[13px] text-etyme-faint">
              good submissions a day, per role · target {target}
            </span>
          </div>
          <p className="mt-2 max-w-[52ch] text-[13px] text-etyme-muted">{bar.says}</p>

          {stopping.length > 0 && (
            <p className="mt-1 text-[12px] text-etyme-attention">
              What is stopping it:{' '}
              {stopping.map((s) => `${s.count} on ${s.label.toLowerCase()}`).join(', ')}.
            </p>
          )}
        </div>

        <div className="shrink-0 border-l border-etyme-rule pl-6">
          <p className="stat-label">Cost per submission</p>
          <p className="stat-value">{cost.shown}</p>
          <p className="mt-0.5 text-[11px] text-etyme-faint">
            {cost.trend ?? 'no week to compare yet'}
          </p>
          {cost.filtered.percent !== null && (
            <p className="mt-2 text-[11px] text-etyme-faint">
              Rules removed {cost.filtered.percent}% before anything was paid for
            </p>
          )}
        </div>
      </div>

      {/* Step four of the loop: the fix that should not have to happen
          twice. The check tells somebody Ravi has no CV and they attach
          one; tomorrow it says Kavitha. Nothing noticed that the answer
          was never "attach a CV".

          Silent when there is no pattern, because a panel that always has
          something in it is a panel nobody reads. */}
      {b.recurring?.headline && (
        <div className="mt-5 border-t border-etyme-rule pt-4">
          <p className="eyebrow mb-2">Keeps coming back</p>
          {b.recurring.patterns.map((p) => (
            <div key={p.code} className="mb-3 last:mb-0">
              <p className="text-[13px] text-etyme-ink">
                <strong className="font-semibold">{p.says}</strong>
              </p>
              <p className="mt-0.5 max-w-[62ch] text-[12px] text-etyme-muted">{p.reallyFix}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('there')

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch in parallel: decisions, contracts, bench, me, automation
      const [decisionsRes, contractsRes, benchRes, meRes, automationRes] = await Promise.all([
        fetch('/api/decisions').then((r) => r.ok ? r.json() : { data: { decisions: [], counts: {} } }),
        fetch('/api/contracts').then((r) => r.ok ? r.json() : { data: { contracts: [] } }),
        fetch('/api/bench').then((r) => r.ok ? r.json() : { data: { listings: [] } }),
        fetch('/api/me').then((r) => r.ok ? r.json() : { data: {} }),
        fetch('/api/automation?limit=5').then((r) => r.ok ? r.json() : { data: { entries: [] } }),
      ])

      // Parse name
      const name = meRes.data?.person?.name ?? 'there'
      const firstName = name.split(' ')[0]
      setUserName(firstName)

      // Parse decisions
      const decisions = decisionsRes.data?.decisions ?? []
      const highCount = decisions.filter((d: any) => d.urgency === 'HIGH').length

      // Parse contracts
      const contracts = contractsRes.data?.contracts ?? []
      const activeContracts = contracts.filter((c: any) => c.state === 'IN_PROGRESS')
      const draftContracts = contracts.filter((c: any) => c.state === 'DRAFT')
      const now = new Date()
      const in28 = new Date(now)
      in28.setDate(in28.getDate() + 28)
      const endingContracts = activeContracts.filter((c: any) => {
        const end = new Date(c.endDate)
        return end <= in28 && end >= now
      })

      // Parse bench — API returns { tiers: { RETAINED: [...], MARKETING: [...] } }
      const benchTiers = benchRes.data?.tiers ?? {}
      const allBenchListings = [
        ...(benchTiers.RETAINED ?? []),
        ...(benchTiers.MARKETING ?? []),
      ]
      const benchItems = allBenchListings.slice(0, 5).map((bl: any) => ({
        name: bl.consultant?.person?.name ?? 'Unknown',
        skill: bl.consultant?.headline ?? bl.consultant?.skills?.[0] ?? '',
        status: bl.tier === 'RETAINED' ? 'available' : 'marketing',
        daysSince: Math.max(0, Math.floor((now.getTime() - new Date(bl.consultant?.availableFrom ?? bl.grantedAt).getTime()) / (1000 * 60 * 60 * 24))),
      }))

      // Pipeline revenue (sum of active contract bill rates as monthly)
      const monthlyRevenue = activeContracts.reduce(
        (sum: number, c: any) => sum + (c.billRate ?? 0) / 100 * 160,
        0
      )

      // Automation
      const recentAutomation = (automationRes.data?.entries ?? []).map((e: any) => ({
        summary: e.summary,
        at: e.at,
      }))

      setData({
        decisions: decisions.slice(0, 5),
        totalDecisions: decisions.length,
        highCount,
        contracts: {
          total: contracts.length,
          active: activeContracts.length,
          draft: draftContracts.length,
          ending: endingContracts.length,
        },
        bench: benchItems,
        pipeline: {
          total: activeContracts.length,
          monthlyRevenue,
        },
        recentAutomation,
      })
    } catch (err: any) {
      setError(err.message ?? 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) {
    return (
      <div className="animate-fade-in py-20 text-center text-etyme-muted">
        Loading dashboard…
      </div>
    )
  }

  if (error) {
    return (
      <div className="animate-fade-in py-20 text-center">
        <p className="text-etyme-attention font-medium mb-2">Unable to load dashboard</p>
        <p className="text-sm text-etyme-muted mb-4">{error}</p>
        <button
          onClick={() => { setError(null); fetchDashboard() }}
          className="btn-secondary"
        >
          Retry
        </button>
      </div>
    )
  }

  const d = data

  return (
    <div className="animate-fade-in">
      {/* Hero — today's summary */}
      <div className="mb-8">
        <div className="eyebrow mb-2">Today · {todayLabel()}</div>
        <h1 className="headline-serif text-heading text-etyme-ink mb-2">
          Good {greetingTime()}, {userName}
        </h1>
        <p className="text-body text-etyme-muted max-w-xl">
          {d && d.totalDecisions > 0
            ? `${d.totalDecisions} item${d.totalDecisions !== 1 ? 's' : ''} need${d.totalDecisions === 1 ? 's' : ''} your attention${d.highCount > 0 ? ` — ${d.highCount} urgent` : ''}.`
            : 'All clear — nothing needs your attention right now.'}
          {d && d.contracts.ending > 0 && ` ${d.contracts.ending} contract${d.contracts.ending !== 1 ? 's' : ''} ending within 28 days.`}
        </p>
      </div>

      <TheBar />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Contracts"
          value={String(d?.contracts.active ?? 0)}
          subtitle={`${d?.contracts.active ?? 0} sell · ${d?.contracts.draft ?? 0} draft`}
          tone="default"
        />
        <StatCard
          label="Pipeline"
          value={`$${Math.round((d?.pipeline.monthlyRevenue ?? 0) / 1000)}K`}
          subtitle="monthly revenue"
          tone="default"
        />
        <StatCard
          label="Pending Actions"
          value={String(d?.totalDecisions ?? 0)}
          subtitle={d?.highCount ? `${d.highCount} urgent` : 'none urgent'}
          tone={d?.highCount ? 'attention' : 'default'}
        />
        <StatCard
          label="On Bench"
          value={String(d?.bench.length ?? 0)}
          subtitle={`${d?.bench.filter(b => b.status === 'available').length ?? 0} available now`}
          tone="verified"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left — Decision queue */}
        <div className="lg:col-span-3">
          <div className="panel">
            <div className="flex items-center justify-between mb-4">
              <h2 className="headline-serif text-[18px] text-etyme-ink">
                Yours to decide
              </h2>
              <Link href="/dashboard/decisions" className="text-[12px] text-etyme-action hover:underline">
                View all →
              </Link>
            </div>

            {d && d.decisions.length === 0 && (
              <div className="py-8 text-center text-etyme-muted text-[13px]">
                ✓ All clear — nothing needs your attention right now.
              </div>
            )}

            <div className="space-y-0">
              {d?.decisions.map((decision, i) => (
                <Link
                  key={i}
                  href={decision.actionUrl as any}
                  className="flex items-start gap-3 py-3 border-b border-etyme-rule last:border-b-0 hover:bg-etyme-canvas/40 transition-colors -mx-2 px-2 rounded-sm"
                >
                  <span className={`evidence-dot ${urgencyDot(decision.urgency)} mt-1.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-etyme-ink">{decision.title}</div>
                    <div className="text-[12px] text-etyme-muted mt-0.5">{decision.subtitle}</div>
                  </div>
                  <span className={`chip ${urgencyAction(decision.urgency)} flex-shrink-0 mt-0.5`}>
                    {urgencyLabel(decision.urgency)}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent system activity */}
          {d && d.recentAutomation.length > 0 && (
            <div className="panel mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="headline-serif text-[18px] text-etyme-ink">
                  System activity
                </h2>
                <Link href="/dashboard/automation" className="text-[12px] text-etyme-action hover:underline">
                  View log →
                </Link>
              </div>
              <div className="space-y-2">
                {d.recentAutomation.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <span className="text-[10px] text-etyme-faint opacity-50">⚙</span>
                    <span className="text-[12px] text-etyme-muted flex-1 truncate">{entry.summary}</span>
                    <span className="text-[10px] text-etyme-faint tabular-nums shrink-0">{timeAgo(entry.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — Bench + pipeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bench snapshot */}
          <div className="panel">
            <div className="flex items-center justify-between mb-4">
              <h2 className="headline-serif text-[18px] text-etyme-ink">
                Bench
              </h2>
              <Link href="/dashboard/bench" className="text-[12px] text-etyme-action hover:underline">
                View all →
              </Link>
            </div>
            {d && d.bench.length === 0 && (
              <div className="py-4 text-center text-etyme-muted text-[12px]">
                No consultants on bench.
              </div>
            )}
            <div className="space-y-2.5">
              {d?.bench.map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <div className="w-7 h-7 rounded-full bg-etyme-action/10 text-etyme-action
                                  text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {item.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-etyme-ink truncate">{item.name}</div>
                    <div className="text-[11px] text-etyme-faint">{item.skill}</div>
                  </div>
                  <span className={`chip ${item.status === 'available' ? 'chip--verified' : 'chip--action'}`}>
                    {item.status === 'available' ? `${item.daysSince}d` : 'network'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Contract pipeline */}
          <div className="panel">
            <div className="flex items-center justify-between mb-4">
              <h2 className="headline-serif text-[18px] text-etyme-ink">
                Contract Pipeline
              </h2>
              <Link href="/dashboard/contracts" className="text-[12px] text-etyme-action hover:underline">
                View all →
              </Link>
            </div>
            <div className="space-y-2.5">
              <PipelineRow label="Draft"       count={d?.contracts.draft ?? 0}  color="faint" />
              <PipelineRow label="In Progress" count={d?.contracts.active ?? 0} color="verified" />
              <PipelineRow label="Ending Soon" count={d?.contracts.ending ?? 0} color="attention" />
            </div>
          </div>

          {/* Revenue */}
          {d && d.pipeline.monthlyRevenue > 0 && (
            <div className="panel">
              <h2 className="headline-serif text-[18px] text-etyme-ink mb-3">
                Revenue
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="stat-value text-etyme-verified">
                  ${Math.round(d.pipeline.monthlyRevenue).toLocaleString()}
                </span>
                <span className="text-body-sm text-etyme-faint">est. monthly</span>
              </div>
              <p className="text-[11px] text-etyme-faint mt-1">
                Based on {d.contracts.active} active contract{d.contracts.active !== 1 ? 's' : ''} at 160 hrs/mo
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────

function StatCard({
  label, value, subtitle, tone,
}: {
  label: string
  value: string
  subtitle: string
  tone: 'default' | 'attention' | 'verified'
}) {
  const valueColor = {
    default:   'text-etyme-ink',
    attention: 'text-etyme-attention',
    verified:  'text-etyme-verified',
  }[tone]

  return (
    <div className="panel">
      <div className="stat-label mb-2">{label}</div>
      <div className={`stat-value ${valueColor}`}>{value}</div>
      <div className="text-[12px] text-etyme-faint mt-1">{subtitle}</div>
    </div>
  )
}

function PipelineRow({
  label, count, color,
}: {
  label: string
  count: number
  color: 'faint' | 'attention' | 'action' | 'verified'
}) {
  const barColor = {
    faint:     'bg-etyme-faint/30',
    attention: 'bg-etyme-attention/60',
    action:    'bg-etyme-action/60',
    verified:  'bg-etyme-verified/60',
  }[color]

  const maxWidth = Math.max(10, (count / 20) * 100)

  return (
    <div className="flex items-center gap-3">
      <div className="w-[140px] text-[12px] text-etyme-muted truncate">{label}</div>
      <div className="flex-1 h-[6px] bg-etyme-rule/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${maxWidth}%` }}
        />
      </div>
      <div className="w-6 text-right text-[12px] font-medium text-etyme-ink tabular-nums">
        {count}
      </div>
    </div>
  )
}
