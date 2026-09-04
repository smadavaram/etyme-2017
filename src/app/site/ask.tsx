'use client'

import { useRef, useState } from 'react'
import { problems, ASK_COPY } from '@/lib/public-site/leads'

/**
 * The ask box.
 *
 * ── What it is not ───────────────────────────────────────────────────
 *
 * It is not a mailing list and it is not the front of a sequence.
 * Nothing automatic follows it, which is why the copy can say a person
 * reads it — a promise that costs us something is the only kind worth
 * making on a landing page.
 *
 * ── Two things it does that most of these do not ─────────────────────
 *
 * It quotes back what was typed rather than saying "invalid email". The
 * Add consultant form taught that lesson the hard way: a surname went
 * into an email field, the browser refused silently inside a modal, and
 * the person could not see why nothing happened. Here the check runs in
 * our own code and the message shows the person their own text, because
 * half the time the mistake is obvious the moment they see it.
 *
 * And the guard against scripts is a field nobody sees plus a clock,
 * rather than a rate limit on an IP address. An office of forty people
 * shares one address; refusing it refuses thirty-nine who did nothing.
 *
 * ── Why it lives in app/site ─────────────────────────────────────────
 *
 * `src/lib/domains.ts` gives the market domain `app/page` and `app/site`
 * and nothing between them, and a file with no owner fails the ownership
 * invariant on the commit that adds it. This is also where the generated
 * company sites will use it from, which is the source value
 * GENERATED_SITE is reserved for. Only the home page calls it today.
 */

type State = 'idle' | 'sending' | 'sent'

export function Ask({ source = 'HOME_PAGE' }: { source?: 'HOME_PAGE' | 'GENERATED_SITE' }) {
  // When the form appeared. A submission that beats a human typing speed
  // never rendered this page.
  const shownAt = useRef<number>(Date.now())

  const [email, setEmail] = useState('')
  const [asked, setAsked] = useState('')
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [honeypot, setHoneypot] = useState('')

  const [state, setState] = useState<State>('idle')
  const [says, setSays] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setSays(null)

    // Checked here as well as on the server, so somebody sees the
    // problem without a round trip — and in our words, with their text
    // in them.
    const found = problems({ email, name, companyName, source, asked })
    if (found.length > 0) {
      setSays(found[0].says)
      return
    }

    setState('sending')
    try {
      const res = await fetch('/api/market/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, asked, name, companyName, source,
          company_website: honeypot,
          filledInMs: Date.now() - shownAt.current,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setState('idle')
        setSays(json?.error?.message ?? 'That did not send. Try again, or write to us directly.')
        return
      }
      setState('sent')
      setSays(json?.data?.says ?? ASK_COPY.thanks)
    } catch {
      setState('idle')
      setSays('That did not send — the connection dropped somewhere. Try again.')
    }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-6">
        <p className="text-[17px] leading-relaxed text-etyme-ink">{says ?? ASK_COPY.thanks}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-etyme-muted">{ASK_COPY.after}</p>
      </div>
    )
  }

  return (
    <form onSubmit={send} noValidate className="max-w-xl">
      {/* A field a person never sees and a script fills in because it is
          there. Hidden from the page and from a screen reader, and taken
          out of the tab order — a honeypot a blind person can reach is a
          honeypot that refuses a blind person. */}
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="company_website">Company website</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <label htmlFor="ask-email" className="stat-label block">
        {ASK_COPY.emailLabel}
      </label>
      <input
        id="ask-email"
        type="text"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@yourfirm.com"
        className="mt-2 w-full rounded-lg border border-etyme-rule bg-etyme-raised px-4 py-3
                   text-[16px] text-etyme-ink placeholder:text-etyme-faint
                   focus:border-etyme-ink focus:outline-none"
      />
      <p className="mt-1.5 text-[13px] text-etyme-muted">{ASK_COPY.emailHint}</p>

      <label htmlFor="ask-what" className="stat-label mt-6 block">
        {ASK_COPY.askLabel}
      </label>
      <textarea
        id="ask-what"
        rows={3}
        value={asked}
        onChange={(e) => setAsked(e.target.value)}
        placeholder={ASK_COPY.askPlaceholder}
        className="mt-2 w-full rounded-lg border border-etyme-rule bg-etyme-raised px-4 py-3
                   text-[16px] leading-relaxed text-etyme-ink placeholder:text-etyme-faint
                   focus:border-etyme-ink focus:outline-none"
      />
      <p className="mt-1.5 text-[13px] text-etyme-muted">{ASK_COPY.askHint}</p>

      {/* Stacked at every width. Two boxes side by side on a phone read
          as first name and last name, which is how a surname ended up in
          an email field on another screen. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={ASK_COPY.namePlaceholder}
          aria-label={ASK_COPY.namePlaceholder}
          className="w-full rounded-lg border border-etyme-rule bg-etyme-raised px-4 py-3
                     text-[16px] text-etyme-ink placeholder:text-etyme-faint
                     focus:border-etyme-ink focus:outline-none"
        />
        <input
          type="text"
          autoComplete="organization"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder={ASK_COPY.companyPlaceholder}
          aria-label={ASK_COPY.companyPlaceholder}
          className="w-full rounded-lg border border-etyme-rule bg-etyme-raised px-4 py-3
                     text-[16px] text-etyme-ink placeholder:text-etyme-faint
                     focus:border-etyme-ink focus:outline-none"
        />
      </div>

      {says && (
        <p role="alert" className="mt-5 text-[15px] leading-relaxed"
           style={{ color: 'var(--color-attention)' }}>
          {says}
        </p>
      )}

      <button
        type="submit"
        disabled={state === 'sending'}
        className="mt-6 rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                   transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {state === 'sending' ? ASK_COPY.sending : ASK_COPY.button}
      </button>
    </form>
  )
}
