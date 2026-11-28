'use client'
import { useEffect, useState } from 'react'

type Board = { cohortId: string; name: string; rows: { personId: string; name: string; points: number; weeks: number; badges: number; percent: number }[] }

/** The mentor's board of a cohort: who has done what. Read by the mentor only; a learner is never sent here. */
export function CohortBoard() {
  const [boards, setBoards] = useState<Board[] | null>(null)
  useEffect(() => { fetch('/api/learn/cohort-board').then(async (r) => setBoards(r.ok ? (await r.json()).data : [])).catch(() => setBoards([])) }, [])
  if (!boards || boards.length === 0) return null
  return (
    <section className="space-y-4" data-cohort-board>
      <h2 className="text-xl" style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}>Your cohorts</h2>
      {boards.map((b) => (
        <div key={b.cohortId} className="learn-card" style={{ minHeight: 0 }}>
          <p className="font-semibold">{b.name}</p>
          <table className="w-full text-sm mt-2 tabular-nums">
            <thead><tr style={{ textAlign: 'left', color: '#6B6862' }}><th>Learner</th><th>Points</th><th>Weeks in a row</th><th>Badges</th><th>Done</th></tr></thead>
            <tbody>{b.rows.map((r) => <tr key={r.personId}><td>{r.name}</td><td>{r.points}</td><td>{r.weeks}</td><td>{r.badges}</td><td>{r.percent}%</td></tr>)}</tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
