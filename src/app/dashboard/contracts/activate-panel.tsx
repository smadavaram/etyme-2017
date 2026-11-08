'use client'

import { useEffect, useState } from 'react'
import { Field, FormMessage, SubmitButton, Textarea } from '@/components/ui/form'
import { activateBody } from './activate-body'
import { viewBefore, viewAfterRefusal, startedSays, startedKey, keptStarted, type PanelView, type StartPreflight } from './activate-view'
import { keepRefusal, keptRefusal, refusalKey } from '@/lib/award/start-refusal'

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

  useEffect(() => {
    let live = true
    // A start pressed a moment ago, before the page reloaded behind it:
    // its sentence stays on the screen, read once.
    try {
      const kept = keptStarted(window.sessionStorage.getItem(startedKey(contractId)), Date.now())
      window.sessionStorage.removeItem(startedKey(contractId))
      if (kept) { setDone(kept); return () => { live = false } }
    } catch { /* storage refused: nothing kept */ }
    // A refusal said a moment ago, before a reload: it stays for a minute,
    // above the button, and the route is still asked for the button itself.
    let refused: string | null = null
    try { refused = keptRefusal(window.sessionStorage.getItem(refusalKey(contractId)), Date.now()) } catch { /* nothing kept */ }
    ;(async () => {
      try {
        const res = await fetch(`/api/contracts/${contractId}/activate`)
        const body = await res.json().catch(() => ({}))
        const before = res.ok ? viewBefore(body.data as StartPreflight) : viewBefore(null)
        if (live) setView(refused && before.button ? { ...before, says: refused } : before)
      } catch {
        if (live) setView(viewBefore(null))
      }
    })()
    return () => { live = false }
  }, [contractId])

  // A refusal is always a sentence on the screen, never a silent revert,
  // and it is kept for a minute across a reload.
  function refuse(next: PanelView) {
    setView(next)
    if (next.says) {
      try { window.sessionStorage.setItem(refusalKey(contractId), keepRefusal(next.says, Date.now())) } catch { /* not kept */ }
    }
  }

  async function press() {
    setBusy(true)
    try {
      const payload = activateBody({ action: 'activate', reason: view.box ? reason.trim() : undefined, answering: view.box?.answering })
      const res = await fetch(`/api/contracts/${contractId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        refuse(viewAfterRefusal(body.error, res.status))
        return
      }
      try { window.sessionStorage.removeItem(refusalKey(contractId)) } catch { /* nothing kept */ }
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
      refuse(viewAfterRefusal(null, null))
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
    </div>
  )
}
