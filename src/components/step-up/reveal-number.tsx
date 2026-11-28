'use client'

import { useState } from 'react'
import { useSecondCheck, askedFor } from '@/components/step-up/second-check-dialog'

/**
 * "Show" beside a masked number (record 99). Drawn only for an Owner of
 * the company the number is on. Pressing it asks the reveal route, which
 * answers with the act and subject to check; the second check opens,
 * passkey first; the number then shows in this view only and is never
 * kept, so leaving the page or pressing Hide masks it again.
 */
export function RevealNumber({ field, id, masked }: { field: 'COMPANY_TAX_ID' | 'REMIT_TAX_ID'; id: string; masked: string }) {
  const check = useSecondCheck()
  const [shown, setShown] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ask = (proof?: string) => fetch('/api/settings/sensitive/reveal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ field, id, ...(proof ? { proof } : {}) }),
  }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }))

  async function show() {
    setBusy(true); setSaid(null)
    try {
      let r = await ask()
      const wanted = r.ok ? null : askedFor(r.body)
      if (wanted) {
        const proof = await check.ask(wanted.act, wanted.subjectId)
        if (!proof) return
        r = await ask(proof)
      }
      if (r.ok) setShown(String(r.body?.data?.value ?? ''))
      else setSaid(r.body?.error?.message ?? 'The number could not be shown. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="font-mono tabular-nums">{shown ?? masked}</span>
      {shown
        ? <button type="button" className="text-etyme-action-press" onClick={() => setShown(null)}>Hide</button>
        : <button type="button" className="text-etyme-action-press" disabled={busy} onClick={show}>{busy ? 'Checking it is you' : 'Show'}</button>}
      {said ? <span className="text-etyme-danger">{said}</span> : null}
      {check.dialog}
    </span>
  )
}
