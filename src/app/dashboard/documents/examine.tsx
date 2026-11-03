'use client'

import { useState } from 'react'
import { readJson, statusMeans } from '@/lib/read-response'
import { FormMessage } from '@/components/ui'
import { I9_SHOWN, VERDICT_OUTCOMES, examineBody, examineFields, type ExamineNeeds, type ExamineValues } from '@/lib/document-stages/examine-form'

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
  /** About a firm, whichever way it arrived (a request's item about a supplier, too). */
  aboutAFirm?: boolean
  fileName: string | null
  /** What accepting asks for (lib/document-stages/examine-form); a list that predates a field leaves it out. */
  examineNeeds?: Partial<ExamineNeeds>
  /** A license's facts as sent, to fill the form in. */
  licenseFacts?: { licenseNumber: string; issuer: string; expiresAt: string } | null
}

export function ExaminePaper({ row, onDone, onClose }: { row: ExamineRow; onDone: (says: string) => void; onClose: () => void }) {
  const aboutAFirm = row.aboutAFirm ?? row.subjectType === 'COMPANY'
  const given = row.examineNeeds ?? {}
  const needs: ExamineNeeds = {
    start: !!given.start, end: !!given.end, edition: !!given.edition,
    shown: !!given.shown, license: !!given.license, verdict: !!given.verdict,
    // A list that predates the field: a firm's certificate with an end names its issuer.
    firmIssuer: given.firmIssuer ?? (aboutAFirm && !!given.end),
  }
  const shows = new Set(examineFields(needs))
  const [verdict, setVerdict] = useState<'ACCEPT' | 'SEND_BACK'>('ACCEPT')
  const [v, setV] = useState<ExamineValues>({
    expiresAt: row.licenseFacts?.expiresAt ?? '',
    issuer: row.licenseFacts?.issuer ?? '',
    licenseNumber: row.licenseFacts?.licenseNumber ?? '',
    shownType: I9_SHOWN[0].key,
    shownIssuer: I9_SHOWN[0].issuer,
    outcome: VERDICT_OUTCOMES[0].key,
  })
  const set = (k: keyof ExamineValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value })
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  // The screen that can record what this dialog could not, where the route names one.
  const [door, setDoor] = useState<{ says: string; href: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setDoor(null)
    try {
      // Exactly what the fields above hold, in the names the route reads.
      const body = verdict === 'SEND_BACK' ? { verdict, reason } : examineBody(needs, v)
      const res = await fetch(`/api/documents/${row.id}/examine`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) {
        // The route's sentence, and the screen it names where it names one.
        const text = await res.text().catch(() => '')
        let refused: { error?: { message?: string; door?: { says: string; href: string } } } | null = null
        try { refused = text ? JSON.parse(text) : null } catch { refused = null }
        setError(refused?.error?.message ?? statusMeans(res.status))
        setDoor(refused?.error?.door ?? null)
        return
      }
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
            {shows.has('validFrom') && (
              <label className="block">
                <span className={label}>The day it starts, as printed</span>
                <input type="date" value={v.validFrom ?? ''} onChange={set('validFrom')} required className={field} />
              </label>
            )}
            {shows.has('expiresAt') && (
              <label className="block">
                <span className={label}>The day it runs out, as printed</span>
                <input type="date" value={v.expiresAt ?? ''} onChange={set('expiresAt')} required className={field} />
              </label>
            )}
            {shows.has('edition') && (
              <label className="block">
                <span className={label}>{needs.shown ? 'The edition printed at the foot of the form' : 'The edition printed on the form'}</span>
                <input value={v.edition ?? ''} onChange={set('edition')} required placeholder={needs.shown ? '01/20/25' : 'Rev. March 2024'} className={field} />
              </label>
            )}
            {/* An I-9 is completed from a document the person chose to
                show, and the record names that document: which one, its
                number, who issued it and the day it runs out. Without
                these the route refuses, and an I-9 could never be accepted
                from this screen (the founder's walker, 2026-11-01). */}
            {shows.has('shownType') && (
              <>
                <label className="block">
                  <span className={label}>The document shown</span>
                  <select
                    value={v.shownType}
                    onChange={(e) => setV({ ...v, shownType: e.target.value, shownIssuer: I9_SHOWN.find((d) => d.key === e.target.value)?.issuer ?? '' })}
                    className={field}
                  >
                    {I9_SHOWN.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={label}>Its number</span>
                  <input value={v.shownNumber ?? ''} onChange={set('shownNumber')} required className={field} />
                </label>
                <label className="block">
                  <span className={label}>Issued by</span>
                  <input value={v.shownIssuer ?? ''} onChange={set('shownIssuer')} required className={field} />
                </label>
                <label className="block">
                  <span className={label}>The day it runs out, as printed on it</span>
                  <input type="date" value={v.shownExpiresAt ?? ''} onChange={set('shownExpiresAt')} required className={field} />
                </label>
              </>
            )}
            {/* A license is checked on its board's register by its number. */}
            {shows.has('licenseNumber') && (
              <label className="block">
                <span className={label}>License number</span>
                <input value={v.licenseNumber ?? ''} onChange={set('licenseNumber')} required className={field} />
              </label>
            )}
            {shows.has('issuer') && (
              <label className="block">
                <span className={label}>{needs.license ? 'The board that issued it' : 'Who issued it: the insurer, or the state'}</span>
                <input value={v.issuer ?? ''} onChange={set('issuer')} required placeholder={needs.license ? 'Oregon State Board of Nursing' : 'The Hartford'} className={field} />
              </label>
            )}
            {/* A background check or a drug screen is the screening
                company's report, recorded as they said it: whose it is,
                their reference, the day they reported, their word and
                their own words. Etyme renders no verdict (2026-11-03). */}
            {shows.has('provider') && (
              <>
                <p className="text-sm text-etyme-muted">Record the screening company’s report as they wrote it. The verdict is theirs.</p>
                <label className="block">
                  <span className={label}>The screening company, as named on the report</span>
                  <input value={v.provider ?? ''} onChange={set('provider')} required className={field} />
                </label>
                <label className="block">
                  <span className={label}>Their reference</span>
                  <input value={v.reference ?? ''} onChange={set('reference')} required className={field} />
                </label>
                <label className="block">
                  <span className={label}>The day they reported</span>
                  <input type="date" value={v.renderedOn ?? ''} onChange={set('renderedOn')} required className={field} />
                </label>
                <label className="block">
                  <span className={label}>What they reported</span>
                  <select value={v.outcome} onChange={set('outcome')} className={field}>
                    {VERDICT_OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={label}>Their words, copied as written</span>
                  <input value={v.providerSays ?? ''} onChange={set('providerSays')} required className={field} />
                </label>
              </>
            )}
          </>
        ) : (
          <label className="block">
            <span className={label}>Why it goes back — {row.subject} reads this</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="It names another company as certificate holder." className={field} />
          </label>
        )}
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {door && (
          <a href={door.href} className="block text-sm text-etyme-action hover:underline">{door.says}</a>
        )}
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
