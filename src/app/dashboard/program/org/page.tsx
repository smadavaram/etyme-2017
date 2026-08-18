'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from '@/components/session-provider'

/**
 * The multi-manager org view — Addendum E client workforce governance.
 *
 * CLAUDE.md, two surface types: this is a DECISION surface.
 *   "Prose, reasoning, confidence, calm · 3–10 items · serif headlines,
 *    generous space · Success: user decides well and leaves."
 *
 * So it opens with the finding, not a table. Each manager sourced their own
 * vendors and set their own rates; nobody has seen them side by side, because
 * until now the data lived across separate inboxes and AP records.
 */

interface ManagerRow {
  managerId: string
  managerName: string
  orgUnit: string | null
  headcount: number
  vendors: number
  annualSpend: number
  rateMin: number
  rateMax: number
  skills: string[]
  flags: string[]
}

interface VarianceEntry {
  rate: number
  managerId: string
  managerName: string
  vendorName: string
  personName: string
}

interface VarianceRow {
  skill: string
  headcount: number
  managers: number
  rateMin: number
  rateMax: number
  rateMedian: number
  spread: number
  annualSaving: number
  entries: VarianceEntry[]
}

interface VendorRow {
  id: string
  name: string
  placements: number
  managers: number
  skills: string[]
  tier: 'preferred' | 'occasional' | 'one-time'
}

interface OrgData {
  client: { id: string; name: string }
  summary: {
    managers: number
    vendors: number
    oneTimeVendors: number
    headcount: number
    unassigned: number
    annualSpend: number
    annualSaving: number
  }
  managers: ManagerRow[]
  variance: VarianceRow[]
  vendors: VendorRow[]
  basis: string
}

// ── Formatting ─────────────────────────────────────────

/**
 * Abbreviated spend: "$1.24m", "$840k".
 *
 * This receives WHOLE DOLLARS — annualCost() in the org endpoint already
 * divides. The parameter used to be named `cents`, which is precisely how a
 * unit mistake survives review: the name said one thing and the arithmetic
 * did another, and both were plain numbers so neither could complain.
 */
function money(dollars: number): string {
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}m`
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}k`
  return `$${dollars}`
}

function rate(cents: number): string {
  return `$${Math.round(cents / 100)}`
}

const TIER_LABEL: Record<VendorRow['tier'], string> = {
  preferred: 'Preferred — volume, negotiated rates',
  occasional: 'Occasional — a handful of placements',
  'one-time': 'One-time — full onboarding cost, no leverage',
}

const TIER_CHIP: Record<VendorRow['tier'], string> = {
  preferred: 'chip--verified',
  occasional: 'chip--action',
  'one-time': 'chip--attention',
}

// ── Page ───────────────────────────────────────────────

export default function ProgramOrgPage() {
  const { company, loading: sessionLoading } = useSession()
  const [data, setData] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openSkill, setOpenSkill] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/program/org')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      setData(body.data)
    } catch (err: any) {
      setError(err.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading || sessionLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-2/3 rounded bg-etyme-rule/50" />
        <div className="h-4 w-1/2 rounded bg-etyme-rule/40" />
        <div className="h-32 rounded bg-etyme-rule/30 mt-8" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-etyme-attention font-medium">Could not load the org view</p>
        <p className="text-sm text-etyme-muted mt-1">{error}</p>
        <button onClick={load} className="btn-secondary mt-4">Try again</button>
      </div>
    )
  }

  if (!data) return null

  const { summary, managers, variance, vendors } = data
  const hasFinding = summary.annualSaving > 0

  return (
    <>
      {/* Head — the finding, stated as prose */}
      <div className="page-head mb-8">
        <p className="eyebrow">Governance</p>
        <h1 className="text-balance">
          {summary.managers} manager{summary.managers === 1 ? '' : 's'}.{' '}
          {summary.vendors} vendor{summary.vendors === 1 ? '' : 's'}.
          {hasFinding && (
            <span className="text-etyme-attention">
              {' '}${summary.annualSaving.toLocaleString()} of rate variance.
            </span>
          )}
        </h1>
        <p>
          {hasFinding
            ? 'Each manager found their own vendors and negotiated their own rates. Nobody has seen this together before, because it has never existed in one place — it lived across separate inboxes and AP records.'
            : 'Every skill is bought at a consistent rate across your managers. Nothing to reconcile.'}
        </p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-etyme-rule border border-etyme-rule mb-10">
        {[
          { label: 'Annual run rate', value: money(summary.annualSpend), note: `${summary.headcount} contractor${summary.headcount === 1 ? '' : 's'}` },
          { label: 'Rate variance', value: money(summary.annualSaving), note: 'same skill, different price', tone: hasFinding },
          { label: 'One-time vendors', value: String(summary.oneTimeVendors), note: `of ${summary.vendors} · full onboarding each` },
          { label: 'Unassigned', value: String(summary.unassigned), note: 'no named manager' },
        ].map((s) => (
          <div key={s.label} className="bg-etyme-raised px-5 py-5">
            <p className="stat-label">{s.label}</p>
            <p className={`stat-value mt-1.5 ${s.tone ? 'text-etyme-attention' : ''}`}>{s.value}</p>
            <p className="text-[12px] text-etyme-muted mt-1.5">{s.note}</p>
          </div>
        ))}
      </div>

      {/* Rate variance — the actionable finding */}
      {variance.length > 0 && (
        <section className="mb-10">
          <p className="eyebrow mb-3">Same skill, different price</p>
          <div className="panel divide-y divide-etyme-rule">
            {variance.map((v) => {
              const open = openSkill === v.skill
              return (
                <div key={v.skill}>
                  <button
                    onClick={() => setOpenSkill(open ? null : v.skill)}
                    className="w-full text-left px-5 py-4 hover:bg-etyme-canvas/50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="flex items-baseline gap-3 min-w-0">
                        <span className="text-[15px] font-medium text-etyme-ink truncate">{v.skill}</span>
                        <span className="text-[12px] text-etyme-muted shrink-0">
                          {v.headcount} people · {v.managers} managers
                        </span>
                      </div>
                      <div className="flex items-baseline gap-4 shrink-0">
                        <span className="text-[13px] tabular-nums text-etyme-muted">
                          {rate(v.rateMin)}–{rate(v.rateMax)}<span className="text-etyme-faint">/hr</span>
                        </span>
                        <span className="text-[15px] tabular-nums font-medium text-etyme-attention">
                          {money(v.annualSaving)}
                        </span>
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                          className={`text-etyme-faint transition-transform ${open ? 'rotate-90' : ''}`}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="px-5 pb-5 -mt-1">
                      <p className="text-[12px] text-etyme-muted mb-3">
                        Median is {rate(v.rateMedian)}/hr. Moving everyone above it down to the median
                        returns {money(v.annualSaving)} a year.
                      </p>
                      <div className="space-y-1.5">
                        {v.entries.map((e, i) => {
                          const above = e.rate > v.rateMedian
                          return (
                            <div key={i} className="flex items-center gap-3 text-[13px]">
                              <span className="tabular-nums w-12 shrink-0 font-medium text-etyme-ink">
                                {rate(e.rate)}
                              </span>
                              <div className="flex-1 h-1.5 bg-etyme-canvas rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${above ? 'bg-etyme-attention' : 'bg-etyme-verified'}`}
                                  style={{ width: `${(e.rate / v.rateMax) * 100}%` }}
                                />
                              </div>
                              <span className="text-etyme-ink w-32 shrink-0 truncate">{e.personName}</span>
                              <span className="text-etyme-muted w-36 shrink-0 truncate">{e.managerName}</span>
                              <span className="text-etyme-faint w-32 shrink-0 truncate">{e.vendorName}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Managers */}
      <section className="mb-10">
        <p className="eyebrow mb-3">Who owns the headcount</p>
        <div className="panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-etyme-rule">
                {['Manager', 'Department', 'Heads', 'Vendors', 'Annual spend', 'Rate range'].map((h) => (
                  <th key={h} className="stat-label text-left px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => (
                <tr key={m.managerId} className="border-b border-etyme-rule last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-etyme-ink">{m.managerName}</span>
                    {m.flags.map((f) => (
                      <span key={f} className="block text-[11px] text-etyme-attention mt-0.5">⚑ {f}</span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-etyme-muted whitespace-nowrap">{m.orgUnit ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{m.headcount}</td>
                  <td className="px-4 py-3 tabular-nums">{m.vendors}</td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">{money(m.annualSpend)}</td>
                  <td className="px-4 py-3 tabular-nums text-etyme-muted whitespace-nowrap">
                    {rate(m.rateMin)}–{rate(m.rateMax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary.unassigned > 0 && (
          <p className="text-[12px] text-etyme-attention mt-2">
            {summary.unassigned} contractor{summary.unassigned === 1 ? '' : 's'} at your sites {summary.unassigned === 1 ? 'has' : 'have'} no named manager.
          </p>
        )}
      </section>

      {/* Vendor tail */}
      <section className="mb-6">
        <p className="eyebrow mb-3">The vendor tail</p>
        <div className="space-y-2">
          {(['preferred', 'occasional', 'one-time'] as const).map((tier) => {
            const rows = vendors.filter((v) => v.tier === tier)
            if (rows.length === 0) return null
            return (
              <div key={tier} className="panel px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`chip ${TIER_CHIP[tier]}`}>{tier}</span>
                  <span className="text-[12px] text-etyme-muted">{TIER_LABEL[tier]}</span>
                </div>
                <div className="space-y-1.5">
                  {rows.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-4 text-[13px]">
                      <span className="text-etyme-ink truncate">{v.name}</span>
                      <span className="text-etyme-muted tabular-nums shrink-0">
                        {v.placements} placement{v.placements === 1 ? '' : 's'} · {v.managers} manager{v.managers === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Basis — CLAUDE.md: a bare number is a bug */}
      <p className="text-[11px] text-etyme-faint italic">{data.basis}</p>
    </>
  )
}
