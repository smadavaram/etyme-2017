'use client'

import { useEffect, useState } from 'react'

import { readJson } from '@/lib/read-response'
import { Field, Input, Select, SubmitButton } from '@/components/ui/form'
import { CONFIRM_CHANNELS, confirmationBody } from './confirmation-words'

/**
 * Record that the other side confirmed a submission: how (email, phone,
 * portal or manual), the day, and a note. Posts to the one route
 * (`/api/bench/submission-confirmations`); the route says no in a sentence
 * and the sentence is shown. A firm with several legal entities chooses
 * which one it is recorded for; a firm with one is never asked.
 */
export function ConfirmationDialog({ submissionId, candidate, onDone, onCancel }: {
  submissionId: string
  candidate: string
  onDone: (said: string) => void
  onCancel: () => void
}) {
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([])
  const [channel, setChannel] = useState('PHONE')
  const [note, setNote] = useState('')
  const [entity, setEntity] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    void fetch(`/api/bench/submission-confirmations?submissionId=${encodeURIComponent(submissionId)}`)
      .then((r) => r.json()).then((b) => setEntities(b?.data?.entities ?? [])).catch(() => setEntities([]))
  }, [submissionId])

  async function save() {
    setWorking(true); setRefusal(null)
    try {
      const res = await fetch('/api/bench/submission-confirmations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmationBody({ submissionId, channel, note, entity })),
      })
      const body = await readJson(res)
      if (res.ok) { onDone(`Recorded that ${candidate} was confirmed.`); return }
      setRefusal(body?.error?.message ?? 'That did not go through.')
    } catch (e: any) {
      setRefusal(e?.message ?? 'Network error. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="headline-serif text-[18px] text-etyme-ink mb-1">Record confirmation for {candidate}</h3>
        <p className="text-[12px] text-etyme-muted mb-4">Say how the other side confirmed they have the submission. It is recorded as of today.</p>
        <div className="space-y-3">
          {entities.length > 1 && (
            <Field label="Recorded for">
              <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="">Choose the legal entity</option>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="How">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CONFIRM_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.words}</option>)}
            </Select>
          </Field>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {refusal && <div className="px-4 py-3 rounded-lg bg-etyme-danger-wash border border-etyme-danger-line" role="alert"><p className="text-sm text-etyme-ink">{refusal}</p></div>}
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Close</button>
            <SubmitButton pending={working} pendingLabel="Saving…" disabled={entities.length > 1 && !entity} type="button" className="flex-1" onClick={save}>Record confirmation</SubmitButton>
          </div>
        </div>
      </div>
    </div>
  )
}
