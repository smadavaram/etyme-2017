'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

/**
 * Training funnel — Talent section (vendor)
 *
 * BRD §9: "Training pipeline that tracks a candidate from sourcing
 * through onboarding to bench-ready."
 *
 * Shows a skill-gap analysis: what skills are in demand (from open
 * requirements) vs what skills are on bench. This drives training
 * investment decisions.
 *
 * Phase 1: derives the gap from live /api/requirements and /api/bench data.
 * Phase 2: will add training programs, certifications, and completion tracking.
 */

// ── Types ────────────────────────────────────────────

interface SkillGap {
  skill: string
  demand: number      // how many open requirements need this skill
  supply: number      // how many bench consultants have this skill
  gap: number         // demand - supply (positive = unfilled demand)
  gapLabel: string
}

interface FunnelStage {
  label: string
  count: number
  color: string
}

// ── Page ─────────────────────────────────────────────

export default function TrainingPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [skillGaps, setSkillGaps] = useState<SkillGap[]>([])
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [totalReqs, setTotalReqs] = useState(0)
  const [totalBench, setTotalBench] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reqsRes, benchRes] = await Promise.all([
        fetch('/api/requirements?status=OPEN&limit=100').then(r => r.ok ? r.json() : { data: { requirements: [] } }),
        fetch('/api/bench?limit=200').then(r => r.ok ? r.json() : { data: { listings: [] } }),
      ])

      const reqs = reqsRes.data?.requirements ?? []
      const bench = benchRes.data?.listings ?? []
      setTotalReqs(reqs.length)
      setTotalBench(bench.length)

      // Count skill demand from open requirements
      const demandMap = new Map<string, number>()
      for (const r of reqs) {
        for (const skill of (r.skills ?? [])) {
          const s = skill.toLowerCase()
          demandMap.set(s, (demandMap.get(s) ?? 0) + 1)
        }
      }

      // Count skill supply from bench
      const supplyMap = new Map<string, number>()
      for (const b of bench) {
        for (const skill of (b.skills ?? [])) {
          const s = skill.toLowerCase()
          supplyMap.set(s, (supplyMap.get(s) ?? 0) + 1)
        }
      }

      // Compute gaps — union of all skills
      const allSkills = new Set([...demandMap.keys(), ...supplyMap.keys()])
      const gaps: SkillGap[] = []
      for (const skill of allSkills) {
        const demand = demandMap.get(skill) ?? 0
        const supply = supplyMap.get(skill) ?? 0
        const gap = demand - supply
        let gapLabel = 'Balanced'
        if (gap > 0) gapLabel = `${gap} needed`
        else if (gap < 0) gapLabel = `${Math.abs(gap)} surplus`

        gaps.push({
          skill: skill.charAt(0).toUpperCase() + skill.slice(1), // capitalize
          demand,
          supply,
          gap,
          gapLabel,
        })
      }

      // Sort by gap (biggest unfilled demand first)
      gaps.sort((a, b) => b.gap - a.gap)
      setSkillGaps(gaps.slice(0, 15))

      // Pipeline funnel — based on consultant states in bench
      const availableNow = bench.filter((b: any) => {
        if (!b.availableFrom) return false
        return new Date(b.availableFrom) <= new Date()
      }).length
      const availableSoon = bench.filter((b: any) => {
        if (!b.availableFrom) return false
        const d = new Date(b.availableFrom)
        const now = new Date()
        const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
        return d > now && d <= twoWeeks
      }).length
      const later = bench.length - availableNow - availableSoon

      setFunnel([
        { label: 'Available now', count: availableNow, color: 'bg-etyme-verified' },
        { label: 'Available ≤14d', count: availableSoon, color: 'bg-etyme-attention' },
        { label: 'In pipeline', count: later, color: 'bg-etyme-action' },
      ])
    } catch (err: any) {
      setError(err.message ?? 'Failed to load training data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="animate-fade-in py-20 text-center text-etyme-muted">
        Loading training data…
      </div>
    )
  }

  if (error) {
    return (
      <div className="animate-fade-in py-20 text-center">
        <p className="text-etyme-attention font-medium mb-2">Unable to load training data</p>
        <p className="text-sm text-etyme-muted mb-4">{error}</p>
        <button onClick={() => { setError(null); fetchData() }} className="btn-secondary">
          Retry
        </button>
      </div>
    )
  }

  const maxDemand = Math.max(...skillGaps.map(g => Math.max(g.demand, g.supply)), 1)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-head mb-6">
        <p className="eyebrow">Talent</p>
        <h1>Training</h1>
        <p>
          Skill gap analysis — what clients need vs what your bench provides.
          Invest in training where demand exceeds supply.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="panel">
          <p className="stat-label">Open requirements</p>
          <p className="stat-value text-etyme-ink">{totalReqs}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">with skill demand</p>
        </div>
        <div className="panel">
          <p className="stat-label">Bench consultants</p>
          <p className="stat-value text-etyme-ink">{totalBench}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">with skills listed</p>
        </div>
        <div className="panel">
          <p className="stat-label">Skills tracked</p>
          <p className="stat-value text-etyme-action">{skillGaps.length}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">across demand &amp; supply</p>
        </div>
        <div className="panel">
          <p className="stat-label">Skills in deficit</p>
          <p className={`stat-value ${skillGaps.filter(g => g.gap > 0).length > 0 ? 'text-etyme-attention' : 'text-etyme-verified'}`}>
            {skillGaps.filter(g => g.gap > 0).length}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">demand &gt; supply</p>
        </div>
      </div>

      {/* Bench pipeline funnel */}
      {funnel.some(f => f.count > 0) && (
        <div className="panel mb-6">
          <p className="stat-label mb-3">Bench pipeline</p>
          <div className="flex h-4 rounded-full overflow-hidden bg-etyme-canvas mb-3">
            {funnel.map(stage =>
              stage.count > 0 ? (
                <div
                  key={stage.label}
                  className={`${stage.color} transition-all`}
                  style={{ width: `${(stage.count / totalBench) * 100}%` }}
                  title={`${stage.label}: ${stage.count}`}
                />
              ) : null
            )}
          </div>
          <div className="flex gap-6 flex-wrap">
            {funnel.map(stage => (
              <div key={stage.label} className="flex items-center gap-1.5 text-[12px]">
                <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <span className="text-etyme-muted">{stage.label}</span>
                <span className="tabular-nums font-medium text-etyme-ink">{stage.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skill gap analysis */}
      <div className="panel mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="stat-label">Skill gap analysis</p>
            <p className="text-[11px] text-etyme-faint mt-0.5">
              Demand (from open requirements) vs supply (bench consultants)
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-etyme-attention" />
              Demand
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-etyme-verified" />
              Supply
            </span>
          </div>
        </div>

        {skillGaps.length === 0 ? (
          <p className="text-sm text-etyme-muted text-center py-6">
            No skill data yet. Add skills to requirements and bench listings to see the gap analysis.
          </p>
        ) : (
          <div className="space-y-2.5">
            {skillGaps.map(gap => (
              <div key={gap.skill} className="flex items-center gap-3">
                <span className="text-[12px] font-medium text-etyme-ink w-28 truncate shrink-0">
                  {gap.skill}
                </span>
                <div className="flex-1 flex items-center gap-1 h-5">
                  {/* Demand bar */}
                  <div
                    className="h-3 rounded-l bg-etyme-attention/70 transition-all"
                    style={{ width: `${(gap.demand / maxDemand) * 50}%`, minWidth: gap.demand > 0 ? '4px' : '0' }}
                    title={`Demand: ${gap.demand}`}
                  />
                  {/* Supply bar */}
                  <div
                    className="h-3 rounded-r bg-etyme-verified/70 transition-all"
                    style={{ width: `${(gap.supply / maxDemand) * 50}%`, minWidth: gap.supply > 0 ? '4px' : '0' }}
                    title={`Supply: ${gap.supply}`}
                  />
                </div>
                <span className={`text-[11px] tabular-nums w-20 text-right shrink-0 ${
                  gap.gap > 0 ? 'text-etyme-attention font-medium' :
                  gap.gap < 0 ? 'text-etyme-verified' :
                  'text-etyme-muted'
                }`}>
                  {gap.gapLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/dashboard/bench" className="btn-secondary">
          View bench →
        </Link>
        <Link href="/dashboard/requirements" className="btn-secondary">
          View requirements →
        </Link>
      </div>
    </div>
  )
}
