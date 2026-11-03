'use client'

import { useEffect, useState } from 'react'
import { Field, FormMessage, SubmitButton, Textarea } from '@/components/ui/form'
import { activateBody } from './activate-body'
import { viewBefore, viewAfterRefusal, startedSays, startedKey, keptStarted, type PanelView, type StartPreflight } from './activate-view'

/**
 * Activate, and Activate with a reason, as real buttons.
 *
 * Drawn on the placement page and in the contracts list's drawer from one
 * component, for the seat the start's route will take and nobody else:
 * the route is asked first (GET), and draws nothing where it says no. A
 * paper that warns draws the reason box; a paper that blocks draws the
 * sentence and no box. A refusal after a press is shown in the route's
 * own words. What it posts is `activateBody`, the one the field-contract
 * test fills in.
 */
export function ActivatePanel({ contractId, onDone }: { contractId: string; onDone?: (says: string) => void }) {
  const [view, setView] = useState<PanelView>({ button: null, says: null, box: null })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [unreached, setUnreached] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // A start pressed a moment ago, before the page reloaded behind it:
    // its sentence stays on the screen, read once.
    try {
      const kept = keptStarted(window.sessionStorage.getItem(startedKey(contractId)), Date.now())
      window.sessionStorage.removeItem(startedKey(contractId))
      if (kept) { setDone(kept); return () => { live = false } }
    } catch { /* storage refused: nothing kept */ }
    ;(async () => {
      try {
        const res = await fetch(`/api/contracts/${contractId}/activate`)
        const body = await res.json().catch(() => ({}))
        if (live) setView(res.ok ? viewBefore(body.data as StartPreflight) : viewBefore(null))
      } catch {
        if (live) setView(viewBefore(null))
      }
    })()
    return () => { live = false }
  }, [contractId])

  async function press() {
    setBusy(true)
    setUnreached(null)
    try {
      const payload = activateBody({ action: 'activate', reason: view.box ? reason.trim() : undefined, answering: view.box?.answering })
      const res = await fetch(`/api/contracts/${contractId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setView(viewAfterRefusal(body.error))
        return
      }
      const says = startedSays(body.data?.message)
      setDone(says)
      setView({ button: null, says: null, box: null })
      // The route's sentence stays on the screen while the page behind it
      // reads the new state: kept for the reload where the page reloads,
      // and the panel stays mounted where a list refreshes around it.
      if (onDone) onDone(says)
      else {
        try { window.sessionStorage.setItem(startedKey(contractId), JSON.stringify({ says, at: Date.now() })) } catch { /* not kept */ }
        window.location.reload()
      }
    } catch {
      setUnreached('The server could not be reached. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) return <FormMessage tone="ok">{done}</FormMessage>
  if (!view.button && !view.says) return null
  // Who starts this placement, said to a seat that does not, and no button.
  if (!view.button) return <p className="card mt-3 text-[13px] leading-relaxed text-etyme-muted">{view.says}</p>

  return (
    <div className="card mt-3 space-y-3">
      {view.says && (
        <p className={`text-[13px] leading-relaxed ${view.box ? 'text-etyme-ink' : 'text-etyme-attention'}`}>{view.says}</p>
      )}
      {view.box && (
        <Field label="Why start anyway" help="Recorded with your name on the start.">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Required: why this start goes ahead today"
          />
        </Field>
      )}
      <SubmitButton
        type="button"
        onClick={press}
        pending={busy}
        pendingLabel="Starting…"
        disabled={Boolean(view.box) && !reason.trim()}
      >
        {view.button}
      </SubmitButton>
      {unreached && <FormMessage tone="error">{unreached}</FormMessage>}
    </div>
  )
}
