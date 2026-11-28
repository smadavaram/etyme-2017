'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Field, FormMessage, Input, Panel, SubmitButton, Textarea } from '@/components/ui'
import { formatDay } from '@/lib/format-date'
import type { LetterPanel } from '@/lib/party-ledger/lines'

/**
 * Letters, on the party's ledger (record 135). Basic outreach is core: a
 * direct letter to one contact, and a candidate's standing yes to updates with
 * the firm's last letters. The letter is drafted here and asked for one yes on
 * a card; this screen never says it went. No plugin component is imported.
 */
export function PartyLetters({ name, letters, onAsked }: { name: string; letters: LetterPanel; onAsked: () => void }) {
  const [to, setTo] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [says, setSays] = useState<{ tone: 'ok' | 'error'; text: string; field?: string } | null>(null)

  async function ask() {
    setPending(true); setSays(null)
    try {
      const r = await fetch('/api/letters/direct', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId: to, subject, body }) })
      await readJson(r)
      setSays({ tone: 'ok', text: 'The letter is drafted and waiting for a yes on its card. Nothing is sent until it is given.' })
      setTo(null); setSubject(''); setBody(''); onAsked()
    } catch (e) {
      setSays({ tone: 'error', text: (e as Error).message })
    } finally { setPending(false) }
  }

  if (!letters.writeTo && !letters.writeToSays && !letters.candidate) return null
  return (
    <Panel title="Letters" subtitle={`What ${name} is written to about, and who may be.`}>
      {letters.candidate && (
        <div className="space-y-2 text-[13px]">
          <p>{letters.candidate.says}</p>
          {letters.candidate.last.length > 0 && (
            <ul className="space-y-1">
              {letters.candidate.last.map((l, i) => <li key={i} className="text-etyme-muted"><span className="tabular-nums text-etyme-faint">{formatDay(new Date(l.when))}</span> {l.says}</li>)}
            </ul>
          )}
        </div>
      )}
      {letters.writeToSays && <p className="text-[13px] text-etyme-muted py-1">{letters.writeToSays}</p>}
      {letters.writeTo && letters.writeTo.length > 0 && (
        <ul className="space-y-2 text-[13px]">
          {letters.writeTo.map((c) => (
            <li key={c.id}>
              <div className="flex items-center justify-between gap-3">
                <span>{c.name}</span>
                {c.canWrite
                  ? <button type="button" className="text-etyme-action-text" onClick={() => { setTo(c.id); setSays(null) }}>Write to {c.name}</button>
                  : <span className="text-etyme-muted">{c.says}</span>}
              </div>
              {to === c.id && (
                <form className="mt-2 space-y-3" onSubmit={(e) => { e.preventDefault(); void ask() }}>
                  <Field label="Subject" error={says?.tone === 'error' && says.field === 'subject' ? says.text : undefined}>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </Field>
                  <Field label="Letter" help="Plain words. Etyme adds who is writing, the postal address and a link to stop letters." >
                    <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
                  </Field>
                  <SubmitButton pending={pending} pendingLabel="Drafting…">Ask for a yes to send</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {says && <div className="mt-2"><FormMessage tone={says.tone}>{says.text}</FormMessage></div>}
    </Panel>
  )
}
