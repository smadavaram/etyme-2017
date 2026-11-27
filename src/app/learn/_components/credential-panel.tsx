'use client'
import { useEffect, useState } from 'react'

type State = { shown: boolean; address?: string }

/**
 * A finished track, offered as a public page. Her own yes shows it; one
 * press takes it down. Nothing is shown before she says so.
 */
export function CredentialPanel({ tenant, track }: { tenant: string; track: string }) {
  const [state, setState] = useState<State | null>(null)
  const [says, setSays] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/learn/${tenant}/progress?track=${track}`, { credentials: 'same-origin' })
      .then(async (r) => { if (r.ok && alive) { const j = await r.json(); setState(j.data.credential ?? { shown: false }) } })
      .catch(() => {})
    return () => { alive = false }
  }, [tenant, track])
  async function act(action: 'show' | 'revoke') {
    const r = await fetch(`/api/learn/${tenant}/credential`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ track, action }) })
    const j = await r.json().catch(() => null)
    if (r.ok) { setState(j.data.shown ? { shown: true, address: j.data.address } : { shown: false }); setSays(null) } else setSays(j?.error?.message ?? 'That did not go through.')
  }
  if (!state) return null
  return (
    <div className="learn-example mt-4" data-credential>
      <h2 className="text-lg font-semibold">Show you finished</h2>
      {state.shown ? (
        <>
          <p className="mt-1">Anyone with this address can see your name, the course and the date. <a className="underline" href={state.address}>Open the page</a></p>
          <button className="underline mt-2" onClick={() => act('revoke')}>Stop showing it</button>
        </>
      ) : (
        <>
          <p className="mt-1">You can put a page online that shows your name, the course, who issued it and the date. It is yours to show and to take down.</p>
          <button className="learn-run mt-2" onClick={() => act('show')}>Yes, show it</button>
        </>
      )}
      {says && <p className="learn-no mt-2">{says}</p>}
    </div>
  )
}
