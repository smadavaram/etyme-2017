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
 *
 * And it reads again after an act (2026-10-26). Today said "Two things
 * need you" while the mark beside it still said 3, because nothing
 * between the minutes told it. Now every call this page makes is watched
 * as it comes back, and a successful write to the app's own API — a card
 * answered, a week approved, a receipt paid — reads the number again a
 * moment later (`isAct` in lib/owed-count decides). A screen with an act
 * that is not such a call fires `announceOwedChanged()` instead. Several
 * acts in a burst are one read, and a read already out is followed by
 * one more rather than a second at once.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ASK_ETYME_HREF } from '@/lib/nav-table'
import { OWED_CHANGED_EVENT, OWED_REFRESH_MS, OWED_SETTLE_MS, isAct, mayRefresh, owedBadge, owedFrom, owedLabel } from '@/lib/owed-count'

let owed: number | null = null
let lastAt: number | null = null
let inFlight = false
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<(n: number | null) => void>()
/** An act came back while a read was out: read once more when it lands. */
let again = false
let settle: ReturnType<typeof setTimeout> | null = null
let watching = false

/** `forced`: an act just changed what this seat owes, so the minute does not apply. */
function read(forced = false): void {
  const now = Date.now()
  if (inFlight) {
    if (forced) again = true
    return
  }
  if (!forced && !mayRefresh(lastAt, now)) return
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
      if (again) { again = false; read(true) }
    })
}

/** Read shortly after the last act, so a burst is one read; nothing when no mark is on screen. */
function afterAct(): void {
  if (listeners.size === 0) return
  if (settle) clearTimeout(settle)
  settle = setTimeout(() => { settle = null; read(true) }, OWED_SETTLE_MS)
}

/**
 * Watch every call this page makes as it comes back, once per page. The
 * request and the response pass through untouched; the watcher only
 * looks, and a fault in looking never reaches the caller.
 */
function watchActs(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener(OWED_CHANGED_EVENT, afterAct)
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init)
    try {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (isAct(method, url, res.status, window.location.origin)) afterAct()
    } catch { /* looking failed; the call stands */ }
    return res
  }
}

/**
 * Hear the number: now, on every read, and after every act. The first
 * listener starts the reads; the last one to leave stops them. Returns
 * the way to stop listening.
 */
export function subscribeOwed(listener: (n: number | null) => void): () => void {
  watchActs()
  listeners.add(listener)
  listener(owed)
  if (listeners.size === 1) {
    read()
    timer = setInterval(read, OWED_REFRESH_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) { clearInterval(timer); timer = null }
  }
}

/** What this seat owes right now, or null while unknown. Reads only when `enabled`. */
export function useOwedCount(enabled: boolean): number | null {
  const [n, setN] = useState<number | null>(owed)
  useEffect(() => {
    if (!enabled) return
    return subscribeOwed(setN)
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
