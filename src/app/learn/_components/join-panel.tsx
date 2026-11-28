'use client'
import { useState } from 'react'

/** At completion: her own yes, never a seat or a record before it. A visitor is offered to sign in to keep her result. */
export function JoinPanel({ tenant, firm, signedIn }: { tenant: string; firm: string; signedIn: boolean }) {
  const [says, setSays] = useState<string | null>(null)
  async function ask() {
    const r = await fetch(`/api/learn/${tenant}/join`, { method: 'POST' })
    const j = await r.json().catch(() => null)
    setSays(r.ok ? j.data.says : j?.error?.message ?? 'That did not go through.')
  }
  return (
    <div className="learn-example mt-6">
      <h2 className="text-lg font-semibold">You finished the track</h2>
      {signedIn ? (
        <>
          <p className="mt-1">Would you like {firm} to ask you onto its bench? Nothing happens until you answer its ask yourself.</p>
          {says ? <p className="mt-2 learn-ok learn-fade">{says}</p> : <button className="learn-run mt-3" onClick={ask}>Yes, ask me</button>}
        </>
      ) : (
        <p className="mt-1">Sign in to keep your result and to ask {firm} to consider you. <a className="underline" href="/login">Sign in</a></p>
      )}
    </div>
  )
}
