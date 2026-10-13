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
import { EtymeMark } from '@/components/logo'
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

/** The header's mark: one icon-sized link to Ask Etyme, the number on its corner. */
export function AskEtymeMarkLink({ n }: { n: number | null }) {
  const label = owedLabel(n)
  return (
    <Link
      href={ASK_ETYME_HREF as any}
      aria-label={label}
      title={label}
      className="relative w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-nav flex items-center justify-center
                 transition-colors hover:bg-etyme-sunk"
    >
      <EtymeMark size={18} />
      <OwedBadge n={n} className="absolute -top-1 -right-1" />
    </Link>
  )
}
