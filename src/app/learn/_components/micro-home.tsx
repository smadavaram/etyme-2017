'use client'
import { useEffect, useState } from 'react'
import { readProgress, storageKey, nextLessonKey, percentDone, type LearnProgress } from '@/lib/training/learn-progress'
import { dueLine } from '@/lib/training/due'
import { CredentialPanel } from './credential-panel'

type T = { key: string; title: string; lessons: { key: string; title: string }[] }
type Live = { live: boolean; state: string; mentorName: string | null; steps: string[] | null; dueOn: string | null; stepDues: Record<string, string> | null } | null

export function MicroHome({ tenant, tracks }: { tenant: string; tracks: T[] }) {
  const [rows, setRows] = useState<{ t: T; p: LearnProgress; path: Live; finished: boolean }[] | null>(null)
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    let alive = true
    Promise.all(tracks.map(async (t) => {
      let p = readProgress(safeParse(localStorage.getItem(storageKey(tenant, t.key))))
      let path: Live = null
      let finished = false
      try {
        const r = await fetch(`/api/learn/${tenant}/progress?track=${t.key}`)
        if (r.ok) { const j = await r.json(); p = readProgress(j.data.progress); path = j.data.path; finished = j.data.status === 'COMPLETED' }
      } catch { /* a visitor keeps the browser's own */ }
      return { t, p, path, finished }
    })).then((r) => alive && setRows(r))
    // A mentor's own queue; a seat that is not one is refused and reads none.
    fetch('/api/learn/paths').then(async (r) => { if (r.ok && alive) setWaiting(((await r.json()).data ?? []).length) }).catch(() => {})
    return () => { alive = false }
  }, [tenant, tracks])

  if (!rows) return <p style={{ color: '#6B6862' }}>One moment.</p>
  const started = rows.filter((r) => r.p.done.length > 0 || r.path)
  const focus = started[0] ?? rows[0]
  const keys = focus.t.lessons.map((l) => l.key)
  const nextKey = nextLessonKey(focus.p, focus.path?.live && focus.path.steps ? focus.path.steps : keys)
  const next = focus.t.lessons.find((l) => l.key === nextKey)
  const titles = Object.fromEntries(focus.t.lessons.map((l) => [l.key, l.title]))
  const due = dueLine({ state: focus.path?.live ? focus.path.state : null, dues: focus.path?.live ? { dueOn: focus.path.dueOn, stepDues: focus.path.stepDues } : null, steps: focus.path?.steps ?? null, done: focus.p.done, titles, today: new Date().toISOString().slice(0, 10) })
  return (
    <section className="space-y-6">
      <div className="learn-card" style={{ minHeight: 0 }}>
        <p className="text-sm" style={{ color: '#6B6862' }}>Next</p>
        {next
          ? <a className="learn-run inline-block mt-2" href={`/learn/${tenant}/${focus.t.key}/${next.key}`}>Continue your path: {next.title}</a>
          : <p className="mt-1 font-semibold">{started.length ? 'You finished every lesson.' : 'Pick where to start.'} <a className="underline" href={`/learn/${tenant}`}>{started.length ? 'See the tracks' : 'Start'}</a></p>}
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-2">Your path</h2>
        {rows.map(({ t, p }) => (
          <div key={t.key} className="mb-3">
            <div className="flex justify-between"><span>{t.title}</span><span className="tabular-nums">{percentDone(p, t.lessons.map((l) => l.key))}%</span></div>
            <div className="learn-bar"><span style={{ width: `${percentDone(p, t.lessons.map((l) => l.key))}%` }} /></div>
          </div>
        ))}
      </div>
      <p><span style={{ color: '#6B6862' }}>Your mentor: </span>{focus.path?.mentorName ?? 'Not named yet'}{focus.path && !focus.path.live ? ' (your path waits for their yes)' : ''}</p>
      <p><span style={{ color: '#6B6862' }}>Due: </span><span className={due.overdue ? 'learn-no' : ''} data-due>{due.text}</span></p>
      {rows.some((r) => r.finished) && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Finished</h2>
          {rows.filter((r) => r.finished).map((r) => <div key={r.t.key}><p>{r.t.title}</p><CredentialPanel tenant={tenant} track={r.t.key} /></div>)}
        </div>
      )}
      {waiting > 0 && <p><a className="underline" href={`/learn/${tenant}/mentor`}>{waiting} {waiting === 1 ? 'path waits' : 'paths wait'} for your yes</a></p>}
    </section>
  )
}

function safeParse(s: string | null): unknown { try { return s ? JSON.parse(s) : null } catch { return null } }
