'use client'

import { useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { DemoTarget, PersonTarget } from './flow'
import { count } from './count'

/**
 * "See this step in the demo": one click seats the reader at the right
 * desk and opens the exact screen the step is about.
 *
 * ── The smallest door. Decided 2026-09-30 ───────────────────────────
 *
 * The demo door already exists: `POST /api/demo {"as","desk"}` takes a
 * seat at a seeded company and answers with where that desk usually
 * lands. A step needs one screen, not the desk's usual landing, so this
 * link posts the same body and then opens the step's own screen. Nothing
 * on the server changed, and nothing new can be asked of it.
 *
 * It is a real link to /demo, so a reader with scripts off, or one who
 * opens it in a new tab, reaches the page of desks instead of nothing.
 */

/** What the click sends, and where it goes after. Pure, so a test can read it. */
export function demoRequest(target: DemoTarget): { url: '/api/demo'; body: { as: string; desk: string }; then: string }
/**
 * A person's own seat (2026-10-19, the doors that play Helena Marsh and
 * Colleen Byrne): the body names the person, and the click goes where the
 * door says that person lands, so `then` is null here.
 */
export function demoRequest(target: PersonTarget): { url: '/api/demo'; body: { person: string }; then: null }
export function demoRequest(target: DemoTarget | PersonTarget): { url: '/api/demo'; body: { as: string; desk: string } | { person: string }; then: string | null }
export function demoRequest(target: DemoTarget | PersonTarget) {
  if ('person' in target) return { url: '/api/demo' as const, body: { person: target.person }, then: null }
  return { url: '/api/demo' as const, body: { as: target.as, desk: target.desk }, then: target.screen }
}

export function DemoLink({ target, label, className }: { target: DemoTarget | PersonTarget; label: string; className?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open(e: MouseEvent<HTMLAnchorElement>) {
    // A click that asks for a new tab or window is the reader's choice.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const req = demoRequest(target)
    try {
      const res = await fetch(req.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req.body),
      })
      const answer = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(answer?.error?.message ?? 'Could not open the example program.')
      // A seat was taken: counted first-party, nothing personal (./count).
      count('demo_started')
      // A person's seat lands where the door says that person does.
      router.push((req.then ?? answer?.data?.landing ?? '/dashboard') as any)
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <a href="/demo" onClick={open} className={className} aria-busy={busy || undefined}>
        {busy ? 'Opening the example program…' : label}
      </a>
      {error && <span className="text-[13px] leading-relaxed text-etyme-danger">{error}</span>}
    </span>
  )
}
