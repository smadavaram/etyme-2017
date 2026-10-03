'use client'

import { useEffect } from 'react'

/**
 * What a person sees when a page throws.
 *
 * Next renders this instead of the page. Two duties: say something a
 * person can act on, in a sentence rather than a stack trace, and tell
 * us — because until this existed a broken screen was known only to the
 * one person looking at it, who closed the tab.
 *
 * The report is fire-and-forget to /api/incidents. If that fails too,
 * there is nothing more this page can do, and it does not pretend.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      void fetch('/api/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: error.message || 'A page threw without a message',
          stack: error.stack ?? null,
          path: typeof window !== 'undefined' ? window.location.pathname : null,
          digest: error.digest ?? null,
        }),
        keepalive: true,
      })
    } catch {
      // Nothing left to try.
    }
  }, [error])

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6 py-16 bg-etyme-canvas text-etyme-ink">
      <div className="max-w-md">
        <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">Something broke</p>
        <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          This page stopped working.
        </h1>
        <p className="mt-3 text-sm text-etyme-muted leading-relaxed">
          Nothing you entered has been lost on the server. We have been told what happened and where.
          Try the page again; if it stops again, come back in a few minutes.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90"
          >
            Try again
          </button>
          <a href="/dashboard" className="px-4 py-2 border border-etyme-rule rounded text-sm text-etyme-ink hover:bg-etyme-surface">
            Back to your desk
          </a>
        </div>
        {error.digest && <p className="mt-6 text-xs text-etyme-faint tabular-nums">Reference {error.digest}</p>}
      </div>
    </main>
  )
}
