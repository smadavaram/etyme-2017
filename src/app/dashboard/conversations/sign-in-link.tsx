'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'

/**
 * One line on a person's row or page at the firm that employs or lists
 * them: how they get into Etyme to file their own week.
 *
 * Drawn by any page that shows the person (People, the bench, the
 * placement's person) as `<SignInLink personId={…} />`. It draws nothing
 * for a seat that may not invite, for a person this firm neither employs
 * nor lists, and for somebody who already signs in; the route decides
 * all three (`/api/notifications/sign-in-link`), so the line and the
 * refusal cannot disagree.
 *
 * Where no email can leave, it shows the one-time link to copy; where
 * email can leave, it says the link was sent and offers "Send again".
 */

interface Line {
  personId: string
  state: string
  show: boolean
  says: string
  note: string | null
  action: string | null
  link: string | null
  mail: boolean
}

export function SignInLink({ personId, className = '' }: { personId: string; className?: string }) {
  const [line, setLine] = useState<Line | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!personId) return
    try {
      const res = await fetch(`/api/notifications/sign-in-link?personId=${encodeURIComponent(personId)}`)
      // A seat that may not invite, or a person not on this firm's books: no line.
      if (!res.ok) { setLine(null); return }
      const body = await readJson<{ data: Line }>(res)
      setLine(body.data)
    } catch {
      setLine(null)
    }
  }, [personId])
  useEffect(() => { load() }, [load])

  async function press() {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const body = await readJson<{ data: Line }>(await fetch('/api/notifications/sign-in-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId }),
      }))
      setLine(body.data)
    } catch (e: any) {
      setError(e?.message ?? 'The link was not made. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // The link is on screen to select by hand.
      setCopied(false)
    }
  }

  if (!line || !line.show) return null

  return (
    <div className={`rounded-md border border-etyme-rule bg-etyme-surface px-3 py-2 text-sm ${className}`} data-testid="sign-in-link">
      <p className="text-etyme-ink">{line.says}</p>
      {line.link && (
        <div className="mt-2 flex items-center gap-2">
          <input
            readOnly
            value={line.link}
            aria-label="Sign-in link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded border border-etyme-rule bg-etyme-raised px-2 py-1 font-mono text-xs text-etyme-ink"
          />
          <button type="button" onClick={() => copy(line.link!)} className="rounded bg-etyme-action px-2 py-1 text-xs font-medium text-white">
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      {line.note && <p className="mt-1 text-xs text-etyme-muted">{line.note}</p>}
      {line.action && (
        <button
          type="button"
          onClick={press}
          disabled={busy}
          className="mt-2 text-xs font-medium text-etyme-action-press underline disabled:opacity-50"
        >
          {busy ? 'Working…' : line.action}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-etyme-danger" role="alert">{error}</p>}
    </div>
  )
}
