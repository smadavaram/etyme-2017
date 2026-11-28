'use client'
import { useCallback, useEffect, useState } from 'react'

type Mine = {
  points: number
  streak: { current: number; longest: number; says: string }
  badges: { id: string; words: string; earnedOn: string; shown: boolean }[]
  ranking: { on: boolean; place: { place: number; of: number } | null }
}

/**
 * Points, the weekly streak and badges, on the learner's own micro
 * dashboard. Points are a count of what she finished, nothing more. A badge
 * is shown or shared only by her own press; her place in the cohort is
 * drawn only where the Owner turned it on.
 */
export function MyProgress({ tenant }: { tenant: string }) {
  const [m, setM] = useState<Mine | null>(null)
  const [says, setSays] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(`/api/learn/${tenant}/mine`)
    if (r.ok) setM((await r.json()).data)
  }, [tenant])
  useEffect(() => { void load() }, [load])
  async function act(badgeId: string, action: 'show' | 'hide' | 'share') {
    // The window opens at once so a pop-up blocker allows it; the share goes where the route says, from her own click.
    const w = action === 'share' ? window.open('', '_blank') : null
    if (w) w.opener = null
    const r = await fetch(`/api/learn/${tenant}/badges`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ badgeId, action }) })
    const j = await r.json().catch(() => null)
    if (!r.ok) { w?.close(); setSays(j?.error?.message ?? 'That did not go through.'); return }
    setSays(null)
    if (w) w.location.href = j.data.url
    await load()
  }
  if (!m) return null
  return (
    <div className="space-y-4" data-my-progress>
      <div className="flex flex-wrap gap-6">
        <div><p className="text-sm" style={{ color: '#6B6862' }}>Points</p><p className="text-2xl tabular-nums" data-points>{m.points}</p></div>
        <div><p className="text-sm" style={{ color: '#6B6862' }}>Weeks in a row</p><p className="text-2xl tabular-nums" data-streak>{m.streak.current}</p></div>
        {m.ranking.on && m.ranking.place && <div><p className="text-sm" style={{ color: '#6B6862' }}>Your place in your cohort</p><p className="text-2xl tabular-nums" data-place>{m.ranking.place.place} of {m.ranking.place.of}</p></div>}
      </div>
      <p className="text-sm" style={{ color: '#6B6862' }}>{m.streak.says}</p>
      {m.badges.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Your badges</h2>
          {m.badges.map((b) => (
            <div key={b.id} className="mb-2" data-badge>
              <p>{b.words} <span className="text-sm" style={{ color: '#6B6862' }}>({b.earnedOn})</span></p>
              <div className="flex flex-wrap gap-3 mt-1">
                {b.shown
                  ? <><button className="learn-run" onClick={() => act(b.id, 'share')}>Share on LinkedIn</button><button className="underline" onClick={() => act(b.id, 'hide')}>Stop showing it</button></>
                  : <button className="learn-run" onClick={() => act(b.id, 'show')}>Yes, show this badge</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {says && <p className="learn-no">{says}</p>}
    </div>
  )
}
