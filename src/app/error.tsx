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
    <main className="min-h-[60vh] flex items-start justify-center px-6 py-16 sm:py-24 bg-etyme-canvas text-etyme-ink">
      <div className="max-w-xl w-full">
        <p className="eyebrow">Something broke</p>
        <h1 className="headline-serif mt-3 text-[30px] leading-[1.12] sm:text-[38px]">
          This page stopped working.
        </h1>
        <p className="mt-4 text-[15px] text-etyme-muted leading-relaxed">
          Nothing you entered has been lost on the server. We have been told what happened and where.
          Try the page again; if it stops again, come back in a few minutes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <a href="/dashboard" className="btn-secondary inline-flex items-center">
            Back to your desk
          </a>
        </div>
        {error.digest && <p className="mt-8 font-mono text-meta text-etyme-faint">Reference {error.digest}</p>}
      </div>
    </main>
  )
}
