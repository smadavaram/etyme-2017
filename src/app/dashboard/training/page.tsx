'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { readBench } from '@/lib/bench-filter'
import { skillGap, type SkillGapReading } from '@/lib/training'

/**
 * Training funnel — Talent section (vendor)
 *
 * BRD §9: "Training pipeline that tracks a candidate from sourcing
 * through onboarding to bench-ready."
 *
 * Shows a skill-gap analysis: what skills clients are asking for against
 * what this firm can actually field. That drives training investment,
 * which is the BRD's founding thesis — recruiters as human capital
 * developers rather than resume forwarders.
 *
 * ── What was wrong with it, and for how long ──────────────────────────
 *
 * This page read the bench under `data.listings`, a key `/api/bench` has
 * never returned. So the supply side of every comparison was nought, on
 * every firm, for the life of the screen: CloudEPA read "Bench
 * consultants 0 with skills listed" over five fully skilled people, and
 * every skill a client asked for read as an unfilled deficit.
 *
 * Both halves of the fix live outside this component on purpose. The
 * bench answer is read through `readBench` — one door, so this page and
 * `/dashboard/bench` cannot disagree about the same firm's bench again —
 * and the gap is `skillGap` in `lib/training`, which returns null where
 * it cannot compare and a sentence saying why.
 *
 * ── And it asks for both benches ──────────────────────────────────────
 *
 * A firm can field two kinds of person: somebody who granted it a bench
 * listing, and somebody it employs. An integrator's supply is almost all
 * the second, so a page that asked only for listings showed a GSI an
 * empty bench and a full order book. Both are fetched and counted once
 * per person.
 */

// ── Types ────────────────────────────────────────────

interface FunnelStage {
  label: string
  count: number
  color: string
}

// ── Page ─────────────────────────────────────────────

export default function TrainingPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gap, setGap] = useState<SkillGapReading | null>(null)
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [totalReqs, setTotalReqs] = useState(0)
  /** Said on the screen when the bench could not be read at all. */
  const [benchWhy, setBenchWhy] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reqsRes, benchRes, payrollRes] = await Promise.all([
        fetch('/api/requirements?status=OPEN&limit=100').then(r => r.ok ? r.json() : { data: { requirements: [] } }),
        fetch('/api/bench?scope=company').then(r => r.ok ? r.json() : null),
        // The firm's own people. A GSI's whole supply is here and none of
        // it is a listing — see `rosterFor` in `app/api/bench`.
        fetch('/api/bench?scope=payroll').then(r => r.ok ? r.json() : null),
      ])

      const reqs = reqsRes.data?.requirements ?? []
      setTotalReqs(reqs.length)

      // One door. This page read `data.listings` for its whole life and
      // the route never sent one.
      const listings = readBench(benchRes)
      const roster = Array.isArray(payrollRes?.data?.roster) ? payrollRes.data.roster : null

      if (!listings.ok && roster === null) {
        // Neither side could be read. No number is shown at all — the
        // gap function returns nulls and says why.
        setBenchWhy(listings.why)
        setGap(skillGap(reqs, null))
        setFunnel([])
        return
      }

      setBenchWhy(listings.ok ? null : listings.why)

      // One row per person. Somebody on a listing who is also on the
      // payroll is one person the firm can field, not two.
      const people = new Map<string, { skills: string[]; availableFrom: string | null }>()
      for (const r of listings.rows) {
        people.set(r.personId, { skills: r.skills, availableFrom: r.availableFrom })
      }
      for (const r of roster ?? []) {
        const existing = people.get(r.personId)
        if (existing) {
          // Skills come off one profile, so they are the same list. Keep
          // whichever side actually has them.
          if (existing.skills.length === 0) existing.skills = Array.isArray(r.skills) ? r.skills : []
          continue
        }
        people.set(r.personId, {
          skills: Array.isArray(r.skills) ? r.skills : [],
          // A roster carries a standing rather than a date. Somebody
          // between projects is free now; anybody else is not claimed to be.
          availableFrom: r.standing === 'BETWEEN_PROJECTS' ? new Date().toISOString() : null,
        })
      }

      const supply = [...people.values()]
      setGap(skillGap(reqs, { people: supply.map((p) => ({ skills: p.skills })) }))

      const now = new Date()
      const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      const availableNow = supply.filter(p => p.availableFrom != null && new Date(p.availableFrom) <= now).length
      const availableSoon = supply.filter(p => {
        if (!p.availableFrom) return false
        const d = new Date(p.availableFrom)
        return d > now && d <= twoWeeks
      }).length
      // Not "in pipeline" — the rest are people whose next free day this
      // firm has not recorded, and calling that a pipeline was a claim.
      const unknown = supply.length - availableNow - availableSoon

      setFunnel([
        { label: 'Free now', count: availableNow, color: 'bg-etyme-verified' },
        { label: 'Free within 14 days', count: availableSoon, color: 'bg-etyme-attention' },
        { label: 'No free date on record', count: unknown, color: 'bg-etyme-action' },
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

  const rows = gap?.rows ?? []
  const maxDemand = Math.max(...rows.map(r => Math.max(r.demand, r.supply)), 1)
  const top = rows.slice(0, 15)
  /** A figure nobody can stand behind is a dash and a sentence, never a number. */
  const figure = (n: number | null) => (n == null ? '—' : String(n))

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-head mb-6">
        <p className="eyebrow">Talent</p>
        <h1>Training</h1>
        <p>
          What clients are asking for, against the people you could field — your bench
          and your own payroll. Invest where more jobs want a skill than you have people for.
        </p>
      </div>

      {/* What the gap actually says, before any number on it. */}
      {gap && (
        <div className="panel mb-6">
          <p className="text-body-sm text-etyme-ink">{gap.says}</p>
          {benchWhy && (
            <p className="text-[12px] text-etyme-attention mt-1.5">{benchWhy}</p>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="panel">
          <p className="stat-label">Open requirements</p>
          <p className="stat-value text-etyme-ink">{totalReqs}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">asking for a skill</p>
        </div>
        <div className="panel">
          <p className="stat-label">People you could field</p>
          <p className="stat-value text-etyme-ink">{figure(gap?.people ?? null)}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {gap?.people == null
              ? 'not readable'
              : gap.peopleWithSkills === gap.people
                ? 'all with skills on record'
                : `${gap.peopleWithSkills} with skills on record`}
          </p>
        </div>
        <div className="panel">
          <p className="stat-label">Skills tracked</p>
          <p className="stat-value text-etyme-action">{figure(gap?.skillsTracked ?? null)}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {gap?.skillsTracked == null ? 'both sides, or neither' : 'across jobs and people'}
          </p>
        </div>
        <div className="panel">
          <p className="stat-label">Skills short</p>
          <p className={`stat-value ${(gap?.inDeficit ?? 0) > 0 ? 'text-etyme-attention' : 'text-etyme-verified'}`}>
            {figure(gap?.inDeficit ?? null)}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {gap?.inDeficit == null ? 'not comparable' : 'more jobs than people'}
          </p>
        </div>
      </div>

      {/* Courses, and who is on each. The thing to do about the gap. */}
      <Courses />

      {/* Bench pipeline funnel */}
      {funnel.some(f => f.count > 0) && (
        <div className="panel mb-6">
          <p className="stat-label mb-3">When they are free</p>
          <div className="flex h-4 rounded-full overflow-hidden bg-etyme-canvas mb-3">
            {funnel.map(stage =>
              stage.count > 0 ? (
                <div
                  key={stage.label}
                  className={`${stage.color} transition-all`}
                  style={{ width: `${(stage.count / Math.max(1, funnel.reduce((n, f) => n + f.count, 0))) * 100}%` }}
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
            <p className="stat-label">Skill gap</p>
            <p className="text-[11px] text-etyme-faint mt-0.5">
              What open jobs ask for, against the people you could field — your bench and your own payroll
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-etyme-attention" />
              Jobs asking
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-etyme-verified" />
              People who have it
            </span>
          </div>
        </div>

        {top.length === 0 ? (
          <p className="text-sm text-etyme-muted text-center py-6">
            {gap?.says ??
              'No skill data yet. Put skills on your jobs and on your people, and the comparison appears here.'}
          </p>
        ) : (
          <div className="space-y-2.5">
            {top.map(row => (
              <div key={row.skill} className="flex items-center gap-3">
                <span className="text-[12px] font-medium text-etyme-ink w-28 truncate shrink-0" title={row.skill}>
                  {row.skill}
                </span>
                <div className="flex-1 flex items-center gap-1 h-5">
                  <div
                    className="h-3 rounded-l bg-etyme-attention/70 transition-all"
                    style={{ width: `${(row.demand / maxDemand) * 50}%`, minWidth: row.demand > 0 ? '4px' : '0' }}
                    title={`${row.demand} open ${row.demand === 1 ? 'job asks' : 'jobs ask'} for it`}
                  />
                  <div
                    className="h-3 rounded-r bg-etyme-verified/70 transition-all"
                    style={{ width: `${(row.supply / maxDemand) * 50}%`, minWidth: row.supply > 0 ? '4px' : '0' }}
                    title={`${row.supply} ${row.supply === 1 ? 'person has' : 'people have'} it on record`}
                  />
                </div>
                <span className={`text-[11px] tabular-nums w-24 text-right shrink-0 ${
                  row.gap == null ? 'text-etyme-faint' :
                  row.gap > 0 ? 'text-etyme-attention font-medium' :
                  row.gap < 0 ? 'text-etyme-verified' :
                  'text-etyme-muted'
                }`}>
                  {row.says}
                </span>
              </div>
            ))}
            {rows.length > top.length && (
              <p className="text-[11px] text-etyme-faint pt-1 tabular-nums">
                Showing the 15 with the widest gap, of {rows.length} skills tracked.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/dashboard/bench" className="btn-secondary">
          Your bench and your payroll →
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
      const [c, b, payroll] = await Promise.all([
        fetch('/api/training').then((r) => r.json()),
        fetch('/api/bench?scope=company').then((r) => r.json()).catch(() => null),
        fetch('/api/bench?scope=payroll').then((r) => r.json()).catch(() => null),
      ])
      if (c?.error) throw new Error(c.error.message)
      setCourses(c?.data?.courses ?? [])

      // Who can be enrolled on a course.
      //
      // This picker read `b?.data?.listings` — a key `/api/bench` has
      // never sent — so "Enroll somebody from the skill gap" offered an
      // empty list at every firm in the product's life. The one door
      // reads it now, and the firm's own payroll is here too: an
      // integrator develops the people it employs, and none of them is a
      // bench listing.
      const listed = readBench(b)
      const roster: any[] = Array.isArray(payroll?.data?.roster) ? payroll.data.roster : []
      const byId = new Map<string, { id: string; name: string }>()
      for (const r of listed.rows) byId.set(r.personId, { id: r.personId, name: r.name })
      for (const r of roster) if (r?.personId && r?.name) byId.set(r.personId, { id: r.personId, name: r.name })
      setPeople([...byId.values()].sort((x, y) => x.name.localeCompare(y.name)))
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
