'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { STARTED_QUESTION } from '@/app/api/program/start-identity/answer'
import { startIdentityBody } from './start-identity-body'

/**
 * The one question at a start, drawn on the start's row for whoever is
 * hiring: "Is the person who started the person you interviewed?" Yes or
 * No, posted to `POST /api/program/start-identity`, and the answer read
 * back in its sentence.
 */
export function StartIdentity({
  contractId,
  answered,
}: {
  contractId: string
  /** The answer on record, where somebody gave one. */
  answered: { confirmed: boolean; by: string | null; at: string } | null
}) {
  const [says, setSays] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function answer(confirmed: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/program/start-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(startIdentityBody({ contractId, confirmed })),
      })
      const json = await readJson(res)
      setSays(json.data.says)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (says) return <p className="text-xs text-etyme-muted mt-2">{says}</p>
  return (
    <div className="mt-2">
      <p className="text-xs text-etyme-ink">{STARTED_QUESTION}</p>
      {answered && (
        <p className="text-xs text-etyme-muted mt-0.5">
          {answered.confirmed ? 'Answered yes' : 'Answered no, and the start is held'}
          {answered.by ? ` by ${answered.by}` : ''}.
        </p>
      )}
      <div className="flex gap-2 mt-1">
        <button type="button" disabled={busy} onClick={() => answer(true)}
          className="px-3 py-1 border border-etyme-rule rounded text-xs text-etyme-ink hover:bg-etyme-canvas disabled:opacity-50">Yes</button>
        <button type="button" disabled={busy} onClick={() => answer(false)}
          className="px-3 py-1 border border-etyme-rule rounded text-xs text-etyme-ink hover:bg-etyme-canvas disabled:opacity-50">No</button>
      </div>
      {error && <p className="text-xs text-etyme-danger mt-1">{error}</p>}
    </div>
  )
}
