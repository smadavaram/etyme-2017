'use client'

/**
 * The Ask Etyme mark with its number — where the bell was (founder,
 * 2026-10-13, "Notifications are deleted; Ask Etyme carries the number").
 *
 * One read for the whole shell. The header and the sidebar — drawn twice
 * on a phone, once as the rail and once in the sheet — all subscribe to
 * one store, so the page asks GET /api/decisions once when it loads and
 * once a minute after that, however many marks are on screen, and never
 * more often (`mayRefresh` in lib/owed-count).
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
  fetch('/api/decisions', { cache: 'no-store' })
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
 * The flip (founder, 2026-10-13, "One icon flips between the two
 * screens"). One icon-sized control on the right of the header, in the
 * same slot on every page, for a seat whose menu pins Ask Etyme. On a
 * dashboard page it is a chat bubble wearing the number and opens Ask
 * Etyme; on Ask Etyme it is four squares and opens the desk's own Today
 * tables. The number hangs off the icon's corner, so it adds no width at
 * 375, and the label says Ask Etyme and the number, so a screen reader
 * hears both. The logo carries nothing: it is the logo.
 */
export function AskEtymeFlip({
  n, onAskEtyme, dashboardHref,
}: { n: number | null; onAskEtyme: boolean; dashboardHref: string }) {
  const label = onAskEtyme ? 'Dashboard' : owedLabel(n)
  return (
    <Link
      href={(onAskEtyme ? dashboardHref : ASK_ETYME_HREF) as any}
      aria-label={label}
      title={label}
      data-flip={onAskEtyme ? 'dashboard' : 'ask-etyme'}
      className="relative w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-nav flex items-center justify-center
                 text-etyme-ink transition-colors hover:bg-etyme-sunk"
    >
      {onAskEtyme ? <DashboardIcon /> : <ChatIcon />}
      {!onAskEtyme && <OwedBadge n={n} className="absolute -top-1 -right-1.5" />}
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

/** The desk's tables: four rounded squares. */
function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
