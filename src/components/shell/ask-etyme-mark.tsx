'use client'

/**
 * The number this seat owes — where the bell was (founder, 2026-10-13,
 * "Notifications are deleted; Ask Etyme carries the number"). Since
 * 2026-11-08 it is worn by the Ask Etyme half of the Ask Etyme |
 * Dashboard switch (components/shell/view-switch), at the top of the
 * left column and, on a phone, under the header. The header's own link
 * and its chat bubble are gone.
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
 *
 * And when the person comes back to the page (2026-11-02, conversation's
 * decided fix): the page shown again, or the window focused, reads the
 * number again unless the last read is under ten seconds old
 * (`mayReadOnReturn`). Listened for only while a mark is on screen; the
 * one-minute read stays as it was.
 */

import { useEffect, useState } from 'react'
import { OWED_CHANGED_EVENT, OWED_REFRESH_MS, OWED_SETTLE_MS, isAct, mayReadOnReturn, mayRefresh, owedBadge, owedFrom } from '@/lib/owed-count'

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
    listenForReturn(true)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (timer) { clearInterval(timer); timer = null }
      listenForReturn(false)
    }
  }
}

/** The person came back to the page: read again where the page is shown and the last read is not too recent. */
function onReturn(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (mayReadOnReturn(lastAt, Date.now())) read(true)
}

/** Hear the page being shown again and the window being focused, only while a mark is on screen. */
function listenForReturn(on: boolean): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (on) {
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
  } else {
    document.removeEventListener('visibilitychange', onReturn)
    window.removeEventListener('focus', onReturn)
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
