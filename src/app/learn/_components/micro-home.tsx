'use client'
import { useEffect, useState } from 'react'
import { readProgress, storageKey, nextLessonKey, percentDone, type LearnProgress } from '@/lib/training/learn-progress'

type T = { key: string; title: string; lessons: { key: string; title: string }[] }
type Live = { live: boolean; state: string; mentorName: string | null; steps: string[] | null } | null

export function MicroHome({ tenant, tracks }: { tenant: string; tracks: T[] }) {
  const [rows, setRows] = useState<{ t: T; p: LearnProgress; path: Live }[] | null>(null)
  useEffect(() => {
    let alive = true
    Promise.all(tracks.map(async (t) => {
      let p = readProgress(safeParse(localStorage.getItem(storageKey(tenant, t.key))))
      let path: Live = null
      try {
        const r = await fetch(`/api/learn/${tenant}/progress?track=${t.key}`)
        if (r.ok) { const j = await r.json(); p = readProgress(j.data.progress); path = j.data.path }
      } catch { /* a visitor keeps the browser's own */ }
      return { t, p, path }
    })).then((r) => alive && setRows(r))
    return () => { alive = false }
  }, [tenant, tracks])

  if (!rows) return <p style={{ color: '#6B6862' }}>One moment.</p>
  const started = rows.filter((r) => r.p.done.length > 0 || r.path)
  const focus = started[0] ?? rows[0]
  const keys = focus.t.lessons.map((l) => l.key)
  const nextKey = nextLessonKey(focus.p, focus.path?.live && focus.path.steps ? focus.path.steps : keys)
  const next = focus.t.lessons.find((l) => l.key === nextKey)
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
      <p><span style={{ color: '#6B6862' }}>Due: </span>Nothing is due.</p>
    </section>
  )
}

function safeParse(s: string | null): unknown { try { return s ? JSON.parse(s) : null } catch { return null } }
