'use client'

import { useRef, useState } from 'react'
import { JOIN_BENCH_COPY, joinProblems } from '@/lib/public-site/join-bench'

/**
 * "Join the bench" on a staffing or bench firm's public page.
 *
 * Name and email, the one line about what joining means, and a button.
 * The yes is given from the letter, never here (lib/public-site/join-bench).
 */
export function JoinBench({ slug }: { slug: string }) {
  const shownAt = useRef<number>(Date.now())
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [busy, setBusy] = useState(false)
  const [says, setSays] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setSays(null)
    const wrong = joinProblems({ name, email })
    if (wrong.length > 0) {
      setSays(wrong[0].says)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/site/${encodeURIComponent(slug)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company_website: honeypot, filledInMs: Date.now() - shownAt.current }),
      })
      const json = await res.json().catch(() => ({}) as any)
      if (!res.ok) {
        setSays(json?.error?.message ?? 'That did not send. Try again in a minute.')
        return
      }
      setSent(true)
      setSays(json?.data?.says ?? null)
    } catch {
      setSays('That did not send. The connection dropped. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-etyme-ink">{says}</p>
  }

  return (
    <form onSubmit={send} noValidate className="mt-5 max-w-md">
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="join-company-website">Company website</label>
        <input
          id="join-company-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>
      <label htmlFor="join-name" className="block text-[13px] text-etyme-muted">
        {JOIN_BENCH_COPY.nameLabel}
      </label>
      <input
        id="join-name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-etyme-rule bg-etyme-raised px-4 py-2.5 text-[16px] text-etyme-ink focus:border-etyme-ink focus:outline-none"
      />
      <label htmlFor="join-email" className="mt-4 block text-[13px] text-etyme-muted">
        {JOIN_BENCH_COPY.emailLabel}
      </label>
      <input
        id="join-email"
        type="text"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-etyme-rule bg-etyme-raised px-4 py-2.5 text-[16px] text-etyme-ink focus:border-etyme-ink focus:outline-none"
      />
      {says && <p className="mt-3 text-[13px] text-etyme-attention">{says}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-5 rounded-md bg-etyme-action px-4 py-2 text-[14px] text-white disabled:opacity-50"
      >
        {busy ? JOIN_BENCH_COPY.sending : JOIN_BENCH_COPY.button}
      </button>
    </form>
  )
}
