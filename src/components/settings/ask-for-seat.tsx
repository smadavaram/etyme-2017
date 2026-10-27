'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { FormMessage } from '@/components/ui/form'
import { Lbl } from './panel-bits'

/**
 * "Ask for a seat", under the sentence an MSP with no seat reads
 * (`noSeatYet` in lib/program-seat): "Palliser MSP is not tied to a
 * client yet … ask an owner or the program manager at that client".
 *
 * The onboarding walk of 2026-10-27 found the sentence and nowhere to act
 * on it. This asks the client by its name or Etyme address
 * (`POST /api/seat-requests`); the client's owner and program manager
 * are told, and the asks already made are listed with where each got to.
 * An ask grants nothing. Placed by the page's owner (demand) on the MSP's
 * first screen, where the refusal is drawn.
 */

interface MyAsk { id: string; says: string; state: 'WAITING' | 'GRANTED' | 'NOT_NOW' }

export function AskForSeat() {
  const [client, setClient] = useState('')
  const [note, setNote] = useState('')
  const [asks, setAsks] = useState<MyAsk[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function load() {
    const j = await fetch('/api/seat-requests').then(readJson).catch(() => null)
    setAsks(Array.isArray(j?.data?.asks) ? j.data.asks : [])
  }
  useEffect(() => { void load() }, [])

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setDone(null)
    try {
      const j = await readJson(await fetch('/api/seat-requests', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client, note: note.trim() || undefined }),
      }))
      setDone(j.data.says)
      setClient(''); setNote('')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={ask} className="space-y-3 max-w-xl">
        <div>
          <Lbl>The client</Lbl>
          <input value={client} onChange={(e) => setClient(e.target.value)} required
            placeholder="Its name, or its Etyme address" className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg" />
        </div>
        <div>
          <Lbl>What you would run for them (optional)</Lbl>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
            placeholder="Their contractor program, from January" className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg" />
        </div>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {done && <FormMessage tone="ok">{done}</FormMessage>}
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
          {busy ? 'Asking…' : 'Ask for a seat'}
        </button>
      </form>
      {asks.length > 0 && (
        <ul className="space-y-1 text-[13px] text-etyme-muted">
          {asks.map((a) => <li key={a.id}>{a.says}</li>)}
        </ul>
      )}
    </div>
  )
}
