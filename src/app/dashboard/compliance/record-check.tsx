'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { FormMessage } from '@/components/ui'

/**
 * Put a check on file for somebody about to start, from the screen.
 *
 * Found by the walk on screens, 2026-10-22: recording an I-9 with the
 * document it was completed from, a screening company's verdict and the
 * steps after a flagged report were API only, so a person whose I-9 was
 * missing could never be started from the screens. Three forms, each
 * the route's own fields and nothing else; every refusal is the route's
 * sentence, shown as it came.
 *
 *   I-9          POST /api/compliance/verifications, the edition and the
 *                document HR looked at, with the date printed on it.
 *   Verdict      the same route: the screening company's name, its
 *                reference, the day it reported and its own words.
 *   After a      POST /api/compliance/adverse-action: the pre-adverse
 *   flagged      notice with the copy of the report attached, the final
 *   report       notice after the wait, or the decision not to act.
 */

export type RecordKind = 'I9' | 'VERDICT' | 'ADVERSE'

/** What an I-9 may be completed from, in the words on the document. */
const I9_DOCUMENTS: { key: string; label: string; issuer: string }[] = [
  { key: 'PASSPORT', label: 'Passport', issuer: 'U.S. Department of State' },
  { key: 'GREEN_CARD', label: 'Permanent resident card', issuer: 'U.S. Citizenship and Immigration Services' },
  { key: 'WORK_PERMIT', label: 'Work permit (EAD)', issuer: 'U.S. Citizenship and Immigration Services' },
  { key: 'VISA', label: 'Visa', issuer: 'U.S. Department of State' },
  { key: 'DRIVERS_LICENSE', label: 'Driver’s license (with another document for work authorization)', issuer: '' },
]

const OUTCOMES = [
  { key: 'ORDERED', label: 'Ordered, not back yet' },
  { key: 'CLEAR', label: 'Clear' },
  { key: 'CONDITIONAL', label: 'Conditional' },
  { key: 'FLAGGED', label: 'Something to review' },
  { key: 'FAILED', label: 'Failed' },
]

export interface RecordFor {
  contractId: string
  personId: string
  name: string
  /** The flagged report, where the form is the steps after it. */
  verificationId?: string
  provider?: string | null
}

const field = 'w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised'
const label = 'block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1'
const today = () => new Date().toISOString().slice(0, 10)

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return readJson(res)
}

export function RecordCheck({ kind, who, onDone, onClose }: { kind: RecordKind; who: RecordFor; onDone: (says: string) => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // I-9
  const [edition, setEdition] = useState('01/20/25')
  const [doc, setDoc] = useState(I9_DOCUMENTS[0].key)
  const [docIssuer, setDocIssuer] = useState(I9_DOCUMENTS[0].issuer)
  const [docExpires, setDocExpires] = useState('')
  // Verdict
  const [type, setType] = useState('BACKGROUND_CHECK')
  const [provider, setProvider] = useState('')
  const [reference, setReference] = useState('')
  const [renderedOn, setRenderedOn] = useState(today())
  const [outcome, setOutcome] = useState('CLEAR')
  const [providerSays, setProviderSays] = useState('')
  // After a flagged report
  const [step, setStep] = useState<'PRE_NOTICE' | 'FINAL' | 'NOT_TAKEN'>('PRE_NOTICE')
  const [copy, setCopy] = useState<File | null>(null)
  const [reason, setReason] = useState('')

  /** The notice is a paper like any other: raised from the firm's template, the copy attached, sent to the person. */
  async function notice(name: string): Promise<string> {
    const lib = await readJson(await fetch('/api/documents?view=templates'))
    let templateId = ((lib?.data?.templates ?? []) as { id: string; name: string }[]).find((t) => t.name === name)?.id
    if (!templateId) templateId = (await postJson('/api/documents', { name, audience: 'CANDIDATE', needsSignature: false }))?.data?.template?.id
    const made = await postJson('/api/documents', { type: 'instance', templateId, subjectType: 'PERSON', subjectId: who.personId })
    const id = made?.data?.instance?.id as string
    await postJson(`/api/documents/${id}/send`, {})
    const form = new FormData()
    form.set('file', copy!)
    await readJson(await fetch(`/api/documents/${id}/upload`, { method: 'POST', body: form }))
    return id
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let says: string
      if (kind === 'I9') {
        const shown = I9_DOCUMENTS.find((d) => d.key === doc)!
        const r = await postJson('/api/compliance/verifications', {
          contractId: who.contractId, about: 'PERSON', type: 'I9_EVERIFY', formEdition: edition,
          evidence: [{ type: shown.key, issuer: docIssuer || null, expiresAt: docExpires || null }],
        })
        says = r?.data?.says ?? `The I-9 for ${who.name} is on file.`
      } else if (kind === 'VERDICT') {
        const r = await postJson('/api/compliance/verifications', {
          contractId: who.contractId, about: 'PERSON', type, provider, reference, renderedOn, outcome,
          ...(outcome === 'ORDERED' ? {} : { providerSays }),
        })
        says = r?.data?.says ?? `${provider}’s report is on file.`
      } else {
        const noticeDocumentId =
          step === 'NOT_TAKEN' ? undefined : await notice(step === 'PRE_NOTICE' ? 'Pre-adverse action notice' : 'Adverse action notice')
        const r = await postJson('/api/compliance/adverse-action', {
          verificationId: who.verificationId, contractId: who.contractId, step,
          ...(noticeDocumentId ? { noticeDocumentId } : {}),
          ...(step === 'PRE_NOTICE' ? {} : { reason }),
        })
        says = r?.data?.says ?? 'Recorded.'
      }
      onDone(says)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const title =
    kind === 'I9' ? `The I-9 for ${who.name}` : kind === 'VERDICT' ? `A screening company’s report on ${who.name}` : `After ${who.provider ?? 'the screening company'}’s report on ${who.name}`

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-etyme-ink/30 p-4 md:p-8" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-etyme-surface border border-etyme-rule rounded-lg p-5 space-y-4">
        <h2 className="font-serif text-lg text-etyme-ink">{title}</h2>
        {kind === 'I9' && (
          <>
            <p className="text-sm text-etyme-muted">Completed by the firm that employs or places the person, from the document they chose to show.</p>
            <label className="block">
              <span className={label}>Edition printed at the foot of the form</span>
              <input value={edition} onChange={(e) => setEdition(e.target.value)} required className={field} />
            </label>
            <label className="block">
              <span className={label}>The document shown</span>
              <select value={doc} onChange={(e) => { setDoc(e.target.value); setDocIssuer(I9_DOCUMENTS.find((d) => d.key === e.target.value)?.issuer ?? '') }} className={field}>
                {I9_DOCUMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={label}>Issued by</span>
              <input value={docIssuer} onChange={(e) => setDocIssuer(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className={label}>The day it runs out, as printed</span>
              <input type="date" value={docExpires} onChange={(e) => setDocExpires(e.target.value)} className={field} />
            </label>
          </>
        )}
        {kind === 'VERDICT' && (
          <>
            <p className="text-sm text-etyme-muted">The verdict is the screening company’s. Copy their words as they wrote them.</p>
            <label className="block">
              <span className={label}>Which check</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
                <option value="BACKGROUND_CHECK">Background check</option>
                <option value="DRUG_SCREENING">Drug screen</option>
              </select>
            </label>
            <label className="block">
              <span className={label}>Screening company</span>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} required placeholder="Sterling" className={field} />
            </label>
            <label className="block">
              <span className={label}>Their reference</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} required placeholder="4471" className={field} />
            </label>
            <label className="block">
              <span className={label}>The day they reported</span>
              <input type="date" value={renderedOn} onChange={(e) => setRenderedOn(e.target.value)} required className={field} />
            </label>
            <label className="block">
              <span className={label}>Their answer</span>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={field}>
                {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
            {outcome !== 'ORDERED' && (
              <label className="block">
                <span className={label}>What their report says, word for word</span>
                <textarea value={providerSays} onChange={(e) => setProviderSays(e.target.value)} required rows={3} className={field} />
              </label>
            )}
          </>
        )}
        {kind === 'ADVERSE' && (
          <>
            <label className="block">
              <span className={label}>The step</span>
              <select value={step} onChange={(e) => setStep(e.target.value as typeof step)} className={field}>
                <option value="PRE_NOTICE">Give the pre-adverse action notice</option>
                <option value="FINAL">Give the final notice, after the wait</option>
                <option value="NOT_TAKEN">Decide not to act on the report</option>
              </select>
            </label>
            {step !== 'NOT_TAKEN' && (
              <label className="block">
                <span className={label}>The notice, with the copy of the report and the summary of rights</span>
                <input type="file" accept=".pdf,image/*" required onChange={(e) => setCopy(e.target.files?.[0] ?? null)} className="text-sm" />
              </label>
            )}
            {step !== 'PRE_NOTICE' && (
              <label className="block">
                <span className={label}>The reason, kept beside the report</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} required className={field} />
              </label>
            )}
          </>
        )}
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-etyme-muted">Cancel</button>
          <button type="submit" disabled={busy} className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">Put it on file</button>
        </div>
      </form>
    </div>
  )
}
