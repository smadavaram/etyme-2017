'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { FormMessage } from '@/components/ui'

/**
 * Look at a paper that arrived, and accept it or send it back.
 *
 * Found by the walk on screens, 2026-10-22: a paper that arrived had no
 * button to accept it or send it back, so the route that does it
 * (`POST /api/documents/:id/examine`) was reached by the simulation and
 * by nobody at a desk. Accepting asks for exactly what the paper's type
 * needs — the two dates printed on a certificate, the day an ID runs
 * out, the edition of a W-9 — and the route refuses in a sentence if
 * anything is missing. Sending back always needs a reason, which the
 * person reads.
 */
export interface ExamineRow {
  id: string
  template: { name: string }
  subject: string
  subjectType: string
  fileName: string | null
  examineNeeds?: { start: boolean; end: boolean; edition: boolean }
  /** A license's facts as sent, to fill the form in. */
  licenseFacts?: { licenseNumber: string; issuer: string; expiresAt: string } | null
}

export function ExaminePaper({ row, onDone, onClose }: { row: ExamineRow; onDone: (says: string) => void; onClose: () => void }) {
  const needs = row.examineNeeds ?? { start: false, end: false, edition: false }
  const [verdict, setVerdict] = useState<'ACCEPT' | 'SEND_BACK'>('ACCEPT')
  const [validFrom, setValidFrom] = useState('')
  const [expiresAt, setExpiresAt] = useState(row.licenseFacts?.expiresAt ?? '')
  const [edition, setEdition] = useState('')
  const [issuer, setIssuer] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const aboutAFirm = row.subjectType === 'COMPANY'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body =
        verdict === 'SEND_BACK'
          ? { verdict, reason }
          : {
              verdict,
              ...(validFrom ? { validFrom } : {}),
              ...(expiresAt ? { expiresAt } : {}),
              ...(edition ? { edition } : {}),
              ...(issuer ? { issuer } : {}),
            }
      const res = await fetch(`/api/documents/${row.id}/examine`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await readJson(res)
      onDone(json?.data?.says ?? (verdict === 'ACCEPT' ? `${row.template.name} accepted.` : `${row.template.name} sent back.`))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised'
  const label = 'block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-etyme-ink/30 p-4 md:p-8" onClick={onClose} role="dialog" aria-modal="true" aria-label="Look at what arrived">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-etyme-surface border border-etyme-rule rounded-lg p-5 space-y-4">
        <h2 className="font-serif text-lg text-etyme-ink">{row.template.name} from {row.subject}</h2>
        {row.fileName && (
          <a href={`/api/documents/${row.id}/file`} target="_blank" rel="noreferrer" className="text-sm text-etyme-action hover:underline">
            Open {row.fileName}
          </a>
        )}
        {row.licenseFacts && (
          <p className="text-sm text-etyme-muted">
            License {row.licenseFacts.licenseNumber}, issued by {row.licenseFacts.issuer}. Check the number on their register.
          </p>
        )}
        <div className="flex gap-4 text-sm text-etyme-ink">
          <label className="flex items-center gap-2">
            <input type="radio" checked={verdict === 'ACCEPT'} onChange={() => setVerdict('ACCEPT')} /> Accept it
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={verdict === 'SEND_BACK'} onChange={() => setVerdict('SEND_BACK')} /> Send it back
          </label>
        </div>
        {verdict === 'ACCEPT' ? (
          <>
            {needs.start && (
              <label className="block">
                <span className={label}>The day it starts, as printed</span>
                <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required className={field} />
              </label>
            )}
            {needs.end && (
              <label className="block">
                <span className={label}>The day it runs out, as printed</span>
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required className={field} />
              </label>
            )}
            {needs.edition && (
              <label className="block">
                <span className={label}>The edition printed on the form</span>
                <input value={edition} onChange={(e) => setEdition(e.target.value)} required placeholder="Rev. March 2024" className={field} />
              </label>
            )}
            {aboutAFirm && needs.end && (
              <label className="block">
                <span className={label}>Who issued it, if it says</span>
                <input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="The Hartford" className={field} />
              </label>
            )}
          </>
        ) : (
          <label className="block">
            <span className={label}>Why it goes back — {row.subject} reads this</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="It names another company as certificate holder." className={field} />
          </label>
        )}
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-etyme-muted">Cancel</button>
          <button type="submit" disabled={busy} className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {verdict === 'ACCEPT' ? 'Accept' : 'Send back'}
          </button>
        </div>
      </form>
    </div>
  )
}
