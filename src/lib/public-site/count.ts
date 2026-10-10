'use client'

import type { MarketEvent } from './market-events'

/**
 * Count one thing a visitor did, first-party, and never in the way.
 *
 * The visit id is random hex made in this tab and kept in sessionStorage,
 * so it ends when the tab does and is never sent anywhere but
 * `/api/market/events`. `sendBeacon` where the browser has it, so a click
 * that leaves the page is still counted; a fetch with keepalive where it
 * does not. A failure is swallowed: a count is never worth a broken
 * button.
 */
export function visitId(): string {
  try {
    const kept = window.sessionStorage.getItem('etyme.visit')
    if (kept && /^[a-f0-9]{32}$/.test(kept)) return kept
    const bytes = new Uint8Array(16)
    window.crypto.getRandomValues(bytes)
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    window.sessionStorage.setItem('etyme.visit', id)
    return id
  } catch {
    return ''
  }
}

export function count(event: MarketEvent): void {
  try {
    const visit = visitId()
    if (!visit) return
    const body = JSON.stringify({ event, page: window.location.pathname, visit })
    if (navigator.sendBeacon?.('/api/market/events', new Blob([body], { type: 'application/json' }))) return
    void fetch('/api/market/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {
    // Counting never stops the click.
  }
}
