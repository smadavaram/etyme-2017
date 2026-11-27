'use client'
import { useCallback, useEffect, useState } from 'react'

type Row = { id: string; learner: string; lessons: number; dueOn: string | null }

/** A mentor's queue: set the day a path is due, then say yes. Her yes is what makes the path the learner's. */
export function MentorQueue({ tenant }: { tenant: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [days, setDays] = useState<Record<string, string>>({})
  const [says, setSays] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch('/api/learn/paths')
    if (!r.ok) { setRows([]); setSays((await r.json().catch(() => null))?.error?.message ?? 'This is for mentors.'); return }
    const list: Row[] = (await r.json()).data
    setRows(list)
    setDays(Object.fromEntries(list.map((x) => [x.id, x.dueOn ?? ''])))
  }, [])
  useEffect(() => { void load() }, [load])
  async function patch(id: string, body: object) {
    const r = await fetch(`/api/learn/paths/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => null)
    setSays(r.ok ? null : j?.error?.message ?? 'That did not go through.')
    return r.ok
  }
  async function yes(id: string) {
    if (days[id] && !(await patch(id, { move: 'dates', dueOn: days[id] }))) return
    if (await patch(id, { move: 'approve' })) await load()
  }
  if (!rows) return <p style={{ color: '#6B6862' }}>One moment.</p>
  return (
    <section className="space-y-4">
      <h1 className="text-2xl" style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}>Paths waiting for your yes</h1>
      {rows.length === 0 && <p>{says ?? 'Nothing is waiting for you.'}</p>}
      {rows.map((r) => (
        <div key={r.id} className="learn-card" style={{ minHeight: 0 }}>
          <p className="font-semibold">{r.learner}</p>
          <p className="text-sm" style={{ color: '#6B6862' }}>{r.lessons} lessons</p>
          <label className="block mt-2">Due by <input type="date" value={days[r.id] ?? ''} onChange={(e) => setDays({ ...days, [r.id]: e.target.value })} /></label>
          <button className="learn-run mt-3" onClick={() => yes(r.id)}>Yes, make it theirs</button>
        </div>
      ))}
      {rows.length > 0 && says && <p className="learn-no">{says}</p>}
      <p><a className="underline" href={`/learn/${tenant}/home`}>Back to your learning</a></p>
    </section>
  )
}
