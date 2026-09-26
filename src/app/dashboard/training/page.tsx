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

      {/* Courses, and who is on each. The thing to do about the gap. */}
      <Courses />

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

// ── Courses and enrollments ──────────────────────────────────────────

interface Enrollment {
  id: string
  person: { id: string; name: string }
  status: string
  word: string
  score: number | null
  completedAt: string | null
  moves: { move: string; word: string }[]
}
interface CourseRow {
  id: string
  title: string
  category: string | null
  duration: number | null
  counts: { enrolled: number; inProgress: number; completed: number; dropped: number }
  enrollments: Enrollment[]
}

/**
 * What can be done about the gap. A course is added once; people are
 * put on it from the bench; each enrollment is started, finished (with
 * a score and a certificate if there is one) or dropped with a reason.
 * A finished course shows on the person's own page.
 */
function Courses() {
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [newCourse, setNewCourse] = useState({ title: '', category: 'TECH', duration: '' })
  const [enroll, setEnroll] = useState({ courseId: '', personId: '' })
  const [ask, setAsk] = useState<{ id: string; move: string; word: string; score: string; certificateUrl: string; reason: string } | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([
        fetch('/api/training').then((r) => r.json()),
        fetch('/api/bench?limit=200').then((r) => r.json()).catch(() => null),
      ])
      if (c?.error) throw new Error(c.error.message)
      setCourses(c?.data?.courses ?? [])
      const listings: any[] = b?.data?.listings ?? b?.data?.consultants ?? []
      setPeople(listings.map((l) => l.consultant?.person ?? l.person ?? null).filter((x) => x?.id && x?.name))
    } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j?.error?.message ?? `HTTP ${res.status}`)
    return j
  }

  async function addCourse(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      const j = await post('/api/training', newCourse)
      setSaid(j.data.says); setNewCourse({ title: '', category: 'TECH', duration: '' }); await load()
    } catch (e: any) { setErr(e.message) }
  }
  async function enrollSomebody(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try {
      const j = await post('/api/training/enrollments', enroll)
      setSaid(j.data.says); setEnroll({ courseId: '', personId: '' }); await load()
    } catch (e: any) { setErr(e.message) }
  }
  async function move(e: React.FormEvent) {
    e.preventDefault(); if (!ask) return; setErr(null)
    try {
      const j = await post(`/api/training/enrollments/${ask.id}`, { move: ask.move, score: ask.score || undefined, certificateUrl: ask.certificateUrl || undefined, reason: ask.reason || undefined })
      setSaid(j.data.says); setAsk(null); await load()
    } catch (e: any) { setErr(e.message) }
  }

  const tone = (s: string) => s === 'COMPLETED' ? 'chip--verified' : s === 'IN_PROGRESS' ? 'chip--action' : s === 'DROPPED' ? 'chip--attention' : 'chip--passive'

  return (
    <div className="panel mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="stat-label">Courses</p>
        <span className="text-[11px] text-etyme-faint tabular-nums">{courses.length}</span>
      </div>
      {said && <p className="mb-3 text-sm text-etyme-verified">{said}</p>}
      {err && <p className="mb-3 text-sm text-etyme-attention">{err}</p>}

      {courses.length === 0 && <p className="text-sm text-etyme-muted mb-3">No courses yet. Add one for a skill in deficit, then put people on it.</p>}
      <div className="divide-y divide-etyme-rule mb-4">
        {courses.map((c) => (
          <div key={c.id} className="py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm text-etyme-ink">{c.title}</span>
              <span className="text-xs text-etyme-muted">{c.category ? c.category.replace('_', ' ').toLowerCase() : ''}{c.duration ? ` · ${c.duration}h` : ''}</span>
              <span className="text-xs text-etyme-faint tabular-nums ml-auto">
                {c.counts.completed} finished · {c.counts.inProgress} in progress · {c.counts.enrolled} enrolled
              </span>
            </div>
            {c.enrollments.length > 0 && (
              <div className="mt-2 space-y-1">
                {c.enrollments.map((en) => (
                  <div key={en.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-etyme-ink">{en.person.name}</span>
                    <span className={`chip text-[9px] ${tone(en.status)}`}>{en.word}{en.score != null ? ` · ${en.score}` : ''}</span>
                    {en.moves.map((m) => (
                      <button key={m.move} onClick={() => setAsk({ id: en.id, move: m.move, word: m.word, score: '', certificateUrl: '', reason: '' })} className="text-xs text-etyme-action hover:underline">
                        {m.word}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <form onSubmit={addCourse} className="border border-etyme-rule rounded-lg p-3 flex flex-wrap gap-2 items-end">
          <label className="flex-1 min-w-[140px]">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Add a course</span>
            <input value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} required placeholder="Kinaxis RapidResponse fundamentals" className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised" />
          </label>
          <select value={newCourse.category} onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })} className="border border-etyme-rule rounded px-2 py-2 text-sm bg-etyme-raised">
            {['TECH', 'COMPLIANCE', 'SOFT_SKILLS', 'CERTIFICATION', 'AI_UPSKILLING'].map((c) => <option key={c} value={c}>{c.replace('_', ' ').toLowerCase()}</option>)}
          </select>
          <input value={newCourse.duration} onChange={(e) => setNewCourse({ ...newCourse, duration: e.target.value })} placeholder="hours" className="w-20 border border-etyme-rule rounded px-2 py-2 text-sm bg-etyme-raised" />
          <button type="submit" className="px-3 py-2 border border-etyme-rule rounded text-sm text-etyme-ink hover:bg-etyme-canvas">Add</button>
        </form>
        <form onSubmit={enrollSomebody} className="border border-etyme-rule rounded-lg p-3 flex flex-wrap gap-2 items-end">
          <label className="flex-1 min-w-[140px]">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Put somebody on a course</span>
            <select value={enroll.personId} onChange={(e) => setEnroll({ ...enroll, personId: e.target.value })} required className="w-full border border-etyme-rule rounded px-2 py-2 text-sm bg-etyme-raised">
              <option value="">Who</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <select value={enroll.courseId} onChange={(e) => setEnroll({ ...enroll, courseId: e.target.value })} required className="border border-etyme-rule rounded px-2 py-2 text-sm bg-etyme-raised">
            <option value="">Which course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button type="submit" disabled={!enroll.courseId || !enroll.personId} className="px-3 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">Enroll</button>
        </form>
      </div>

      {ask && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-etyme-ink/30 p-4 md:p-8" onClick={() => setAsk(null)} role="dialog" aria-modal="true" aria-label={ask.word}>
          <form onSubmit={move} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-etyme-surface border border-etyme-rule rounded-lg p-5 space-y-4">
            <h2 className="font-serif text-lg text-etyme-ink">{ask.word}</h2>
            {ask.move === 'complete' && (
              <>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Score, if there was one</span>
                  <input value={ask.score} onChange={(e) => setAsk({ ...ask, score: e.target.value })} className="w-24 border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised" />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Certificate, if there is one</span>
                  <input value={ask.certificateUrl} onChange={(e) => setAsk({ ...ask, certificateUrl: e.target.value })} placeholder="https://…" className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised" />
                </label>
              </>
            )}
            {ask.move === 'drop' && (
              <label className="block">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">Why</span>
                <input value={ask.reason} onChange={(e) => setAsk({ ...ask, reason: e.target.value })} required className="w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised" />
              </label>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAsk(null)} className="text-sm text-etyme-muted">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">Record</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
