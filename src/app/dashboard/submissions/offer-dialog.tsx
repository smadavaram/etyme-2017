'use client'

import { useCallback, useEffect, useState } from 'react'

import { readJson } from '@/lib/read-response'
import { Field, Input, Select, Textarea, SubmitButton } from '@/components/ui/form'

/**
 * The offer on a submission: rate, start date and terms, made and
 * answered by people (`/api/submissions/:id/offer`, record 112, chain 2).
 * No agent writes here. A draft is saved or offered by the person; the
 * answer the candidate gave is recorded by a person; a decline names its
 * reason from a closed list, never in free text.
 */

interface OfferRow { id: string; state: string; stateWords: string; rate: number; currency: string; startDate: string | null; terms: string | null }
interface Loaded {
  candidate: string
  offers: OfferRow[]
  declineReasons: { code: string; words: string }[]
  mayMake: boolean
  mayRecordAnswer: boolean
  entities: { id: string; name: string }[]
}

export function OfferDialog({ submissionId, candidate, role, onDone, onCancel }: {
  submissionId: string
  candidate: string
  role: string
  onDone: (said: string) => void
  onCancel: () => void
}) {
  const [data, setData] = useState<Loaded | null>(null)
  const [rate, setRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [startDate, setStartDate] = useState('')
  const [terms, setTerms] = useState('')
  const [entity, setEntity] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [declining, setDeclining] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/submissions/${submissionId}/offer`)
    const body = await res.json().catch(() => null)
    if (!res.ok) { setRefusal(body?.error?.message ?? 'The offer could not be read.'); return }
    setData(body.data)
  }, [submissionId])
  useEffect(() => { void load() }, [load])

  const live = data?.offers.find((o) => ['DRAFT', 'PROPOSED', 'ACCEPTED'].includes(o.state)) ?? null

  async function send(method: 'POST' | 'PATCH', payload: Record<string, unknown>, said: string) {
    setWorking(true)
    setRefusal(null)
    try {
      const res = await fetch(`/api/submissions/${submissionId}/offer`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ...(entity ? { actingEntityId: entity } : {}) }),
      })
      const body = await readJson(res)
      if (res.ok) { onDone(body?.says ?? said); return }
      setRefusal(body?.error?.message ?? 'That did not go through.')
    } catch (e: any) {
      setRefusal(e?.message ?? 'Network error. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  const typed = { rate, currency, startDate: startDate || undefined, terms: terms || undefined }
  const needsEntity = (data?.entities.length ?? 0) > 1 && !entity

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="headline-serif text-[18px] text-etyme-ink mb-1">Offer for {candidate}</h3>
        <p className="text-[12px] text-etyme-muted mb-4">{role}. The rate, the start date and the terms are yours to set. Placing opens on them once the offer is accepted.</p>

        {data && data.entities.length > 1 && (
          <Field label="Made for">
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Choose the legal entity</option>
              {data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
        )}

        {live ? (
          <div className="space-y-3">
            <div className="px-3 py-2 bg-etyme-canvas rounded-lg text-[13px] text-etyme-ink">
              <p className="font-medium">{live.stateWords}</p>
              <p>{live.rate.toFixed(2)} {live.currency} an hour{live.startDate ? `, starting ${live.startDate}` : ''}</p>
              {live.terms && <p className="text-etyme-muted whitespace-pre-wrap">{live.terms}</p>}
            </div>

            {declining && (
              <Field label="Why was it declined">
                <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                  <option value="">Choose a reason</option>
                  {data?.declineReasons.map((r) => <option key={r.code} value={r.code}>{r.words}</option>)}
                </Select>
              </Field>
            )}

            {refusal && <div className="px-4 py-3 rounded-lg bg-etyme-danger-wash border border-etyme-danger-line" role="alert"><p className="text-sm text-etyme-ink">{refusal}</p></div>}

            <div className="flex flex-wrap gap-2 pt-2">
              {live.state === 'DRAFT' && data?.mayMake && (
                <SubmitButton pending={working} pendingLabel="Offering…" disabled={needsEntity} type="button" onClick={() => send('PATCH', { offerId: live.id, action: 'PROPOSE' }, `Offered ${candidate} the job.`)}>Make the offer</SubmitButton>
              )}
              {live.state === 'PROPOSED' && data?.mayRecordAnswer && !declining && (
                <>
                  <SubmitButton pending={working} pendingLabel="Saving…" disabled={needsEntity} type="button" onClick={() => send('PATCH', { offerId: live.id, action: 'ACCEPT' }, `Recorded that ${candidate} accepted.`)}>Record accepted</SubmitButton>
                  <button type="button" className="btn-secondary" disabled={working} onClick={() => setDeclining(true)}>Record declined</button>
                </>
              )}
              {declining && (
                <SubmitButton pending={working} pendingLabel="Saving…" disabled={!reasonCode || needsEntity} type="button" onClick={() => send('PATCH', { offerId: live.id, action: 'DECLINE', reasonCode }, `Recorded that ${candidate} declined.`)}>Record declined</SubmitButton>
              )}
              {data?.mayMake && (
                <button type="button" className="btn-secondary" disabled={working || needsEntity} onClick={() => send('PATCH', { offerId: live.id, action: 'WITHDRAW' }, `Withdrew the offer to ${candidate}.`)}>Withdraw the offer</button>
              )}
              <button type="button" className="btn-secondary" onClick={onCancel}>Close</button>
            </div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
            {data && !data.mayMake ? (
              <p className="text-sm text-etyme-muted">Offers are made by the hiring manager, or whoever places people at the firm that is hiring.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Field label="Rate an hour" className="flex-1"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
                  <Field label="Currency" className="w-24"><Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
                </div>
                <Field label="Start date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
                <Field label="Terms"><Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
              </>
            )}
            {refusal && <div className="px-4 py-3 rounded-lg bg-etyme-danger-wash border border-etyme-danger-line" role="alert"><p className="text-sm text-etyme-ink">{refusal}</p></div>}
            <div className="flex gap-2 pt-2">
              <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Close</button>
              {data?.mayMake && (
                <>
                  <button type="button" className="btn-secondary flex-1" disabled={working || !rate || needsEntity} onClick={() => send('POST', typed, 'Saved the draft offer.')}>Save draft</button>
                  <SubmitButton pending={working} pendingLabel="Offering…" disabled={!rate || needsEntity} type="button" className="flex-1" onClick={() => send('POST', { ...typed, propose: true }, `Offered ${candidate} the job.`)}>Make the offer</SubmitButton>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
