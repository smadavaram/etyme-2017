'use client'

import { useState } from 'react'

/**
 * A button in the frame that asks the real route, as the sample seat.
 *
 * The route's own door answers (`lib/api-context`): the sample seat may
 * read and never write, so what comes back is the sample's sentence and
 * its two doors. They open over the whole home page, not inside the
 * frame, because a sign-up form inside a frame is a page inside a page.
 */
export function TryIt({ label, method = 'POST', href }: { label: string; method?: string; href: string }) {
  const [said, setSaid] = useState<{ message: string; actions: { label: string; href: string }[] } | null>(null)
  const [busy, setBusy] = useState(false)

  async function press() {
    setBusy(true)
    try {
      const res = await fetch(href, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const body = await res.json().catch(() => null)
      setSaid({
        message: body?.error?.message ?? (res.ok ? 'Done.' : 'That did not go through.'),
        actions: Array.isArray(body?.error?.actions) ? body.error.actions : [],
      })
    } catch {
      setSaid({ message: 'That did not go through. Check the connection and try again.', actions: [] })
    } finally {
      setBusy(false)
    }
  }

  if (said) {
    return (
      <div role="status" className="rounded-md border border-etyme-attention-line bg-etyme-attention-wash p-2 text-xs text-etyme-ink">
        <p>{said.message}</p>
        {said.actions.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-2">
            {said.actions.map((a) => (
              <a key={a.href} href={a.href} target="_top" className="font-medium text-etyme-action-press underline">
                {a.label}
              </a>
            ))}
          </p>
        )}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={press}
      disabled={busy}
      className="rounded-md bg-etyme-action px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
    >
      {label}
    </button>
  )
}
