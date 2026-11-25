'use client'

import { useCallback, useEffect, useState } from 'react'
import { readBench } from '@/lib/bench-filter'
import { trainable } from '@/lib/training'

/**
 * Cohorts: a group taking one course together (record 120). Plan one with
 * dates, a trainer and a capacity; enroll people; start it; enter what
 * each trainee scored (an earlier attempt always stays in view); certify
 * her; and, once her own course is finished, ask her onto the bench. Only
 * her own yes puts her there, and the ask's state is on the row.
 */

interface Attempt { id: string; skill: string; score: number; attempt: number; on: string }
interface Trainee {
  enrollmentId: string
  person: { id: string; name: string }
  status: string
  word: string
  /** What each button's own route would take from this reader. */
  can: { assess: boolean; certify: boolean; ask: boolean; finish: boolean }
  assessments: Attempt[]
  certifications: { id: string; title: string; issued: string; expires: string | null; standing: string }[]
  ask: { method: string; on: string; answer: string | null; answeredOn: string | null; answeredVia: string | null; says: string } | null
}
interface Cohort {
  id: string
  name: string
  course: { id: string; title: string }
  state: string
  word: string
  startsOn: string
  endsOn: string | null
  seatsSays: string
  /** Set when no seat is left: the sentence that replaces the enroll form. */
  fullSays: string | null
  trainer: { personId: string; name: string | null } | null
  moves: string[]
  trainees: Trainee[]
}

const MOVE_WORD: Record<string, string> = { start: 'Start', complete: 'Finish', cancel: 'Cancel' }

/** "Python 60, then 82": every attempt, earliest first, so a retake never hides the first. */
function attemptsLine(a: Attempt[]): { skill: string; says: string }[] {
  const by = new Map<string, Attempt[]>()
  for (const x of a) by.set(x.skill, [...(by.get(x.skill) ?? []), x])
  return [...by.entries()].map(([skill, rows]) => ({ skill, says: rows.sort((p, q) => p.attempt - q.attempt).map((r) => r.score).join(', then ') }))
}

export function Cohorts() {
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null)
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([])
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [said, setSaid] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({ courseId: '', name: '', startsOn: '', endsOn: '', trainerPersonId: '', capacity: '' })
  const [enroll, setEnroll] = useState<Record<string, string>>({})
  const [score, setScore] = useState<Record<string, { skill: string; score: string }>>({})
  const [certTitle, setCertTitle] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const [c, t, b, payroll] = await Promise.all([
        fetch('/api/training/cohorts').then((r) => r.json()),
        fetch('/api/training').then((r) => r.json()),
        fetch('/api/bench?scope=company').then((r) => r.json()).catch(() => null),
        fetch('/api/bench?scope=payroll').then((r) => r.json()).catch(() => null),
      ])
      if (c?.error) throw new Error(c.error.message)
      setCohorts(c.data.cohorts)
      setTrainers(c.data.trainerChoices ?? [])
      setCourses((t?.data?.courses ?? []).map((x: any) => ({ id: x.id, title: x.title })))
      const roster: any[] = Array.isArray(payroll?.data?.roster) ? payroll.data.roster : []
      // Everybody the firm keeps: on the bench, asked and not answered yet, or employed.
      const listed = readBench(b)
      setPeople(trainable(listed.rows, listed.asked, roster.filter((r) => r?.personId && r?.name), new Date()).map((p) => ({ id: p.personId, name: p.name })))
    } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])
  // A course added above is offered in the plan form at once.
  useEffect(() => {
    const again = () => { void load() }
    window.addEventListener('training:courses-changed', again)
    return () => window.removeEventListener('training:courses-changed', again)
  }, [load])

  async function send(method: string, url: string, body: unknown) {
    setErr(null); setSaid(null)
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error?.message ?? `HTTP ${res.status}`)
      setSaid(j.data?.says ?? 'Done.')
      await load()
      return true
    } catch (e: any) { setErr(e.message); return false }
  }

  if (cohorts === null) {
    return (
      <div className="panel mb-6">
        <p className="stat-label mb-3">Cohorts</p>
        {err ? <p className="text-sm text-etyme-attention">{err}</p> : <p className="text-sm text-etyme-muted">Reading the cohorts…</p>}
      </div>
    )
  }

  const field = 'border border-etyme-rule rounded px-2 py-2 text-sm bg-etyme-raised'
  const label = 'block text-[11px] text-etyme-muted mb-1'

  return (
    <div className="panel mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="stat-label">Cohorts</p>
        <span className="text-[11px] text-etyme-faint tabular-nums">{cohorts.length}</span>
      </div>
      {said && <p className="mb-3 text-sm text-etyme-verified">{said}</p>}
      {err && <p className="mb-3 text-sm text-etyme-attention">{err}</p>}
      {cohorts.length === 0 && <p className="text-sm text-etyme-muted mb-3">No cohorts yet. Plan one for a course, then put people in it.</p>}

      <div className="divide-y divide-etyme-rule mb-4">
        {cohorts.map((c) => (
          <div key={c.id} className="py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm text-etyme-ink">{c.name}</span>
              <span className="chip text-[9px] chip--passive">{c.word}</span>
              <span className="text-xs text-etyme-muted">{c.course.title} · {c.startsOn}{c.endsOn ? ` to ${c.endsOn}` : ''} · {c.seatsSays}{c.trainer ? ` · trainer ${c.trainer.name ?? 'named'}` : ' · no trainer yet'}</span>
              <span className="ml-auto flex gap-3">
                {c.moves.map((m) => (
                  <button key={m} onClick={() => send('PATCH', `/api/training/cohorts/${c.id}`, { move: m })} className="text-xs text-etyme-action hover:underline">{MOVE_WORD[m]}</button>
                ))}
              </span>
            </div>
            {c.state !== 'COMPLETE' && c.state !== 'CANCELLED' && (
              <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-etyme-muted">
                Trainer
                <select value={c.trainer?.personId ?? ''} onChange={(e) => send('PATCH', `/api/training/cohorts/${c.id}`, { trainerPersonId: e.target.value })} className={field}>
                  <option value="">None yet</option>
                  {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}

            <div className="mt-2 space-y-3">
              {c.trainees.filter((t) => t.status !== 'DROPPED').map((t) => {
                const sc = score[t.enrollmentId] ?? { skill: '', score: '' }
                return (
                  <div key={t.enrollmentId} className="border border-etyme-rule rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-etyme-ink">{t.person.name}</span>
                      <span className={`chip text-[9px] ${t.status === 'COMPLETED' ? 'chip--verified' : 'chip--passive'}`}>{t.word}</span>
                      {t.can.finish && (
                        <button onClick={() => send('POST', `/api/training/enrollments/${t.enrollmentId}`, { move: 'complete' })} className="text-xs text-etyme-action hover:underline">Finish her course</button>
                      )}
                    </div>
                    {attemptsLine(t.assessments).length > 0 && (
                      <ul className="mt-1 text-xs text-etyme-muted">
                        {attemptsLine(t.assessments).map((a) => <li key={a.skill}>{a.skill}: {a.says}</li>)}
                      </ul>
                    )}
                    {t.certifications.map((k) => (
                      <p key={k.id} className="mt-1 text-xs text-etyme-verified">Certified: {k.title}, issued {k.issued}{k.expires ? `, expires ${k.expires}${k.standing === 'EXPIRED' ? ' (lapsed)' : ''}` : ''}</p>
                    ))}
                    {t.can.assess && <form
                      onSubmit={async (e) => { e.preventDefault(); if (await send('POST', `/api/training/enrollments/${t.enrollmentId}/assessments`, sc)) setScore({ ...score, [t.enrollmentId]: { skill: sc.skill, score: '' } }) }}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <label><span className={label}>Skill assessed</span>
                        <input value={sc.skill} onChange={(e) => setScore({ ...score, [t.enrollmentId]: { ...sc, skill: e.target.value } })} required className={`${field} w-40`} /></label>
                      <label><span className={label}>Score, 0 to 100</span>
                        <input value={sc.score} onChange={(e) => setScore({ ...score, [t.enrollmentId]: { ...sc, score: e.target.value } })} required inputMode="numeric" className={`${field} w-24`} /></label>
                      <button type="submit" className="px-3 py-2 border border-etyme-rule rounded text-sm text-etyme-ink hover:bg-etyme-canvas">Record score</button>
                    </form>}
                    {t.status === 'COMPLETED' && (t.can.certify || (t.can.ask && !t.ask)) && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        {t.can.certify && <>
                        <label><span className={label}>Certification</span>
                          <input value={certTitle[t.enrollmentId] ?? ''} onChange={(e) => setCertTitle({ ...certTitle, [t.enrollmentId]: e.target.value })} placeholder={c.course.title} className={`${field} w-48`} /></label>
                        <button onClick={() => send('POST', `/api/training/enrollments/${t.enrollmentId}/certification`, { title: certTitle[t.enrollmentId] || undefined })} className="px-3 py-2 border border-etyme-rule rounded text-sm text-etyme-ink hover:bg-etyme-canvas">Certify</button></>}
                        {t.can.ask && !t.ask && (
                          <button onClick={() => send('POST', `/api/training/enrollments/${t.enrollmentId}/bench-ask`, {})} className="px-3 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">Ask her onto the bench</button>
                        )}
                      </div>
                    )}
                    {t.ask && (
                      <p className="mt-2 text-xs text-etyme-muted">
                        Ask onto the bench, {t.ask.on}: {t.ask.says}{t.ask.answeredOn ? ` (${t.ask.answeredOn})` : ''}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {(c.state === 'PLANNED' || c.state === 'RUNNING') && c.fullSays && <p className="mt-2 text-xs text-etyme-muted">{c.fullSays}</p>}
            {(c.state === 'PLANNED' || c.state === 'RUNNING') && !c.fullSays && (
              <form
                onSubmit={async (e) => { e.preventDefault(); await send('POST', '/api/training/enrollments', { courseId: c.course.id, cohortId: c.id, personId: enroll[c.id] }) }}
                className="mt-2 flex flex-wrap items-end gap-2"
              >
                <label><span className={label}>Put somebody in {c.name}</span>
                  <select value={enroll[c.id] ?? ''} onChange={(e) => setEnroll({ ...enroll, [c.id]: e.target.value })} required className={field}>
                    <option value="">Choose a person</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></label>
                <button type="submit" className="px-3 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">Enroll</button>
              </form>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (await send('POST', '/api/training/cohorts', form)) setForm({ courseId: '', name: '', startsOn: '', endsOn: '', trainerPersonId: '', capacity: '' })
        }}
        className="border border-etyme-rule rounded-lg p-3 flex flex-wrap gap-2 items-end"
      >
        <p className="w-full text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">Plan a cohort</p>
        <label className="flex-1 min-w-[140px]"><span className={label}>Cohort name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={`${field} w-full`} /></label>
        <label><span className={label}>Course</span>
          <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} required className={field}>
            <option value="">Choose a course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></label>
        <label><span className={label}>Starts</span>
          <input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} required className={field} /></label>
        <label><span className={label}>Ends</span>
          <input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} className={field} /></label>
        <label><span className={label}>Trainer</span>
          <select value={form.trainerPersonId} onChange={(e) => setForm({ ...form, trainerPersonId: e.target.value })} className={field}>
            <option value="">None yet</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <label><span className={label}>People it holds</span>
          <input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} inputMode="numeric" className={`${field} w-24`} /></label>
        <button type="submit" className="px-3 py-2 border border-etyme-rule rounded text-sm text-etyme-ink hover:bg-etyme-canvas">Plan it</button>
      </form>
    </div>
  )
}
