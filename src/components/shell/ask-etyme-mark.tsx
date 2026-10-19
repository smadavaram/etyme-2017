'use client'

/**
 * The Ask Etyme mark with its number — where the bell was (founder,
 * 2026-10-13, "Notifications are deleted; Ask Etyme carries the number").
 *
 * One read for the whole shell. The header and the sidebar — drawn twice
 * on a phone, once as the rail and once in the sheet — all subscribe to
 * one store, so the page asks once when it loads and once a minute after
 * that, however many marks are on screen, and never more often
 * (`mayRefresh` in lib/owed-count).
 *
 * It asks GET /api/conversations/twin?only=owed, the greeting's own count
 * read with no side effect: a firm's seat gets the decisions queue's
 * total, a worker her greeting's cards (2026-10-19). Asking
 * GET /api/decisions left a worker's mark blank while her greeting said
 * three things needed her.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ASK_ETYME_HREF } from '@/lib/nav-table'
import { OWED_REFRESH_MS, mayRefresh, owedBadge, owedFrom, owedLabel } from '@/lib/owed-count'

let owed: number | null = null
let lastAt: number | null = null
let inFlight = false
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<(n: number | null) => void>()

function read(): void {
  const now = Date.now()
  if (inFlight || !mayRefresh(lastAt, now)) return
  inFlight = true
  lastAt = now
  fetch('/api/conversations/twin?only=owed', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => { owed = owedFrom(body) })
    // A queue that cannot be read is no number, never the last one.
    .catch(() => { owed = null })
    .finally(() => {
      inFlight = false
      listeners.forEach((f) => f(owed))
    })
}

/** What this seat owes right now, or null while unknown. Reads only when `enabled`. */
export function useOwedCount(enabled: boolean): number | null {
  const [n, setN] = useState<number | null>(owed)
  useEffect(() => {
    if (!enabled) return
    listeners.add(setN)
    setN(owed)
    if (listeners.size === 1) {
      read()
      timer = setInterval(read, OWED_REFRESH_MS)
    }
    return () => {
      listeners.delete(setN)
      if (listeners.size === 0 && timer) { clearInterval(timer); timer = null }
    }
  }, [enabled])
  return enabled ? n : null
}

/**
 * The number, in a small pill. Nothing at all when the seat owes nothing.
 * White on the filled-button violet (6.76), not on clay, which scores
 * under 4.5 at this size.
 */
export function OwedBadge({ n, className = '' }: { n: number | null; className?: string }) {
  const text = owedBadge(n)
  if (!text) return null
  return (
    <span
      aria-hidden="true"
      data-owed={text}
      className={`min-w-[18px] h-[18px] px-1 rounded-pill bg-etyme-action text-white
                  text-[10.5px] font-semibold leading-[18px] text-center tabular-nums ${className}`}
    >
      {text}
    </span>
  )
}

/**
 * Ask Etyme in the phone header, with its number (founder, 2026-10-19,
 * "Nine links, no flip"). Below md the header is the logo, this and the
 * menu icon; it opens the chat, on every page, Ask Etyme included, where
 * it is marked as the page being read. From md up it is not drawn: the
 * sidebar's own Ask Etyme entry carries the same number from the same
 * read, an inch away.
 *
 * It replaces the flip of 2026-10-13, whose second face — four squares
 * opening the desk's tables — was a second door to Today, which the menu
 * already has. The number hangs off the icon's corner, so it adds no
 * width at 375, and the label says Ask Etyme and the number, so a screen
 * reader hears both.
 */
export function AskEtymeLink({ n, here }: { n: number | null; here: boolean }) {
  const label = owedLabel(n)
  return (
    <Link
      href={ASK_ETYME_HREF as any}
      aria-label={label}
      aria-current={here ? 'page' : undefined}
      title={label}
      data-ask-etyme="header"
      className={`md:hidden relative w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-nav flex items-center justify-center
                 text-etyme-ink transition-colors hover:bg-etyme-sunk ${here ? 'bg-etyme-action-wash' : ''}`}
    >
      <ChatIcon />
      <OwedBadge n={n} className="absolute -top-1 -right-1.5" />
    </Link>
  )
}

/** A chat app's "Chats" icon: a rounded bubble, tail at the lower left, outline only. */
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8a5 5 0 0 1 5 5v3a5 5 0 0 1-5 5h-6l-5 4v-4.5A5 5 0 0 1 3 12V9a5 5 0 0 1 5-5z" />
    </svg>
  )
}
