'use client'

import { useState } from 'react'

/**
 * A reason, a question or a yes, typed on the page, never in a browser
 * prompt — with the route's sentence under it when it refuses, and the
 * words still there.
 *
 * The screen walk, 2026-11-02: "Ask the supplier" was a browser prompt,
 * and at an MSP seat the thread refused the question with nothing on the
 * screen, so the words were lost. Every money screen's prompts and
 * alerts are this field now: the bill's page (waive a check, withdraw an
 * exception, ask the supplier, withdraw a draft), Accounts receivable (a
 * write-off) and Rate history (reject, a note, back pay).
 */

export interface SaidState {
  text: string
  /** The route's own sentence, where it refused. */
  refused: string | null
  open: boolean
}

/**
 * What the field holds after a press: a refusal is said under it and
 * keeps every word typed; a success closes it and clears it.
 */
export function afterSend(state: SaidState, refusal: string | null): SaidState {
  return refusal ? { ...state, refused: refusal } : { text: '', refused: null, open: false }
}

/** The sentence a failed fetch is said in, where the route sent none. */
export function refusalFrom(body: unknown, fallback: string): string {
  const e = (body as { error?: { message?: unknown } } | null)?.error
  return typeof e?.message === 'string' && e.message.trim() ? e.message : fallback
}

export function SaidField({
  id,
  label,
  placeholder,
  submit,
  minLength = 1,
  minSays,
  optional = false,
  rows = 2,
  onSend,
  onCancel,
}: {
  id: string
  label: string
  placeholder?: string
  /** The button's word: "Record the exception", "Send", "Reject". */
  submit: string
  /** Fewer characters than this is not sent; `minSays` says why, before the press. */
  minLength?: number
  minSays?: string
  /** A note the person may leave empty. */
  optional?: boolean
  rows?: number
  /** Sends what was typed; resolves to null on success, or to the route's sentence. */
  onSend: (text: string) => Promise<string | null>
  onCancel: () => void
}) {
  const [state, setState] = useState<SaidState>({ text: '', refused: null, open: true })
  const [busy, setBusy] = useState(false)
  const short = !optional && state.text.trim().length < minLength
  return (
    <form
      className="space-y-1.5 text-left"
      onClick={(e) => e.stopPropagation()}
      onSubmit={async (e) => {
        e.preventDefault()
        if (short || busy) return
        setBusy(true)
        try {
          const refusal = await onSend(state.text.trim())
          setState((s) => afterSend(s, refusal))
          if (!refusal) onCancel()
        } catch {
          setState((s) => afterSend(s, 'The network did not answer. Your words are still here; press again.'))
        } finally {
          setBusy(false)
        }
      }}
    >
      <label className="block text-[12px] font-semibold text-etyme-muted" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="input w-full text-[13px]"
        rows={rows}
        value={state.text}
        onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
        placeholder={placeholder}
        autoFocus
      />
      {short && minSays && state.text.length > 0 && <p className="text-[11px] text-etyme-faint">{minSays}</p>}
      {state.refused && <p className="text-[12px] leading-snug text-etyme-danger" role="alert">{state.refused}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1 text-[12px]">Cancel</button>
        <button type="submit" disabled={busy || short} className="btn-primary px-3 py-1 text-[12px] disabled:opacity-50">
          {busy ? 'Saving…' : submit}
        </button>
      </div>
    </form>
  )
}

/** A yes asked on the page, never in a browser confirm: the sentence, the two buttons, and the route's refusal under them. */
export function SaidYes({
  says,
  yes,
  no,
  onYes,
  onNo,
}: {
  says: string
  yes: string
  no: string
  onYes: () => Promise<string | null>
  onNo: () => void
}) {
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-1.5 text-left" onClick={(e) => e.stopPropagation()}>
      <p className="text-[12px] text-etyme-ink">{says}</p>
      {refused && <p className="text-[12px] leading-snug text-etyme-danger" role="alert">{refused}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onNo} className="btn-secondary px-3 py-1 text-[12px]">{no}</button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await onYes()
              if (r) setRefused(r)
              else onNo()
            } catch {
              setRefused('The network did not answer. Press again.')
            } finally {
              setBusy(false)
            }
          }}
          className="btn-primary px-3 py-1 text-[12px] disabled:opacity-50"
        >
          {busy ? 'Saving…' : yes}
        </button>
      </div>
    </div>
  )
}
