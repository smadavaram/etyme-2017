'use client'

import { useState } from 'react'

/**
 * "Pick one of your suppliers", under Ask somebody you know.
 *
 * A firm that may take somebody on is a button. A firm that may not is
 * its name and the sentence why, read from the same rule the `pick`
 * action refuses on (`supplierOptions` in app/api/contractor-invites):
 * never a greyed-out choice with nothing beside it, which is what the
 * founder's tester met when every firm was held back for having no
 * standing set. Where nobody may, the one sentence says what to do.
 *
 * A firm on probation is a warning, not a refusal (Addendum E: vendor
 * tier warns, takes a reason and proceeds). It is drawn with its standing
 * beside its name; pressing it opens a reason box, and the ask goes with
 * the reason, which the route records with the name of who gave it.
 */

export interface SupplierChoiceRow {
  companyId: string
  name: string
  offered: boolean
  why: string | null
  /** A firm the client may still ask with a reason (on probation). */
  withReason?: boolean
}

/** Said beside the reason button while the box is empty, so a button that cannot be pressed says why. */
export const REASON_FIRST = 'Write the reason first.'

export function SupplierPicker({ personName, choices, says, busy, onPick }: {
  personName: string
  /** Null until the read is back. */
  choices: SupplierChoiceRow[] | null
  says: string | null
  busy: boolean
  onPick: (supplierCompanyId: string, reason?: string) => void
}) {
  const [warnedOpen, setWarnedOpen] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  if (choices === null) return <p className="text-[12px] text-etyme-muted">Reading your suppliers…</p>
  const offered = choices.filter((c) => c.offered)
  const warned = choices.filter((c) => !c.offered && c.withReason)
  const held = choices.filter((c) => !c.offered && !c.withReason)
  return (
    <div className="w-full space-y-1.5" aria-label={`A supplier to take ${personName} on`}>
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {offered.map((c) => (
            <button
              key={c.companyId}
              type="button"
              disabled={busy}
              onClick={() => onPick(c.companyId)}
              className="rounded-lg border border-etyme-rule px-3 py-1.5 text-[12px] text-etyme-ink hover:border-etyme-ink disabled:opacity-40"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {warned.length > 0 && (
        <ul className="space-y-1.5">
          {warned.map((c) => (
            <li key={c.companyId} className="space-y-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => { setWarnedOpen(warnedOpen === c.companyId ? null : c.companyId); setReason('') }}
                className="rounded-lg border border-etyme-attention-line px-3 py-1.5 text-[12px] text-etyme-ink hover:border-etyme-ink disabled:opacity-40"
              >
                {c.name} · on probation
              </button>
              <p className="text-[12px] text-etyme-attention">{c.why}</p>
              {warnedOpen === c.companyId && (
                <div className="space-y-1">
                  <label className="block text-[12px] text-etyme-muted" htmlFor={`why-${c.companyId}`}>
                    Why ask {c.name} anyway
                  </label>
                  <textarea
                    id={`why-${c.companyId}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-etyme-rule px-2 py-1 text-[12px]"
                    placeholder="Required: recorded with your name"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() => onPick(c.companyId, reason.trim())}
                      className="rounded-lg bg-etyme-action px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                      Ask {c.name} with this reason
                    </button>
                    {!reason.trim() && <span className="text-[12px] text-etyme-muted">{REASON_FIRST}</span>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {offered.length === 0 && warned.length === 0 && says && <p className="text-[12px] text-etyme-attention">{says}</p>}
      {held.length > 0 && (
        <ul className="space-y-0.5">
          {held.map((c) => (
            <li key={c.companyId} className="text-[12px] text-etyme-muted">{c.why}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
