'use client'

import { useEffect } from 'react'

/**
 * The root layout itself threw. Next gives this its own <html>, because
 * the one that failed cannot be reused. Same two duties as app/error.tsx
 * — a sentence, and a report — with nothing else, since nothing else can
 * be trusted to render.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      void fetch('/api/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: `layout: ${error.message || 'threw without a message'}`,
          stack: error.stack ?? null,
          path: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
        keepalive: true,
      })
    } catch {
      // Nothing left to try.
    }
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#F0EEE6', color: '#1F1E1D', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <main style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 1.5rem' }}>
          <div style={{ maxWidth: 440 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', letterSpacing: '-0.02em', margin: 0 }}>
              Etyme stopped working.
            </h1>
            <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#6B6862', lineHeight: 1.6 }}>
              We have been told. Try again in a moment.
            </p>
            <button
              onClick={reset}
              style={{ marginTop: '1.5rem', padding: '0.5rem 1rem', background: '#2B47E5', color: '#fff', border: 0, borderRadius: 4, fontSize: '0.875rem', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
