'use client'

/**
 * Ask Etyme | Dashboard — one switch at the top of the left column, in
 * both views (founder, 2026-11-08, "One app, two tabs"). On a phone it is
 * the first row under the header.
 *
 * It replaces the header's Ask Etyme link: the number this seat owes sits
 * on the Ask Etyme half, from the one read every mark shares
 * (`useOwedCount`), so the switch and the greeting cannot disagree.
 *
 * Each person's last tab is remembered on the device. The first time a
 * browser opens the app for a person (the sign-in and demo doors land in
 * Ask Etyme), a person whose first tab is Dashboard is taken there: their
 * last choice, or, before they have made one, Dashboard for a role that
 * clears a queue all day (`firstTabFor` in lib/nav-table).
 */

import Link from 'next/link'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { OwedBadge } from '@/components/shell/ask-etyme-mark'
import { owedLabel } from '@/lib/owed-count'
import { useSession } from '@/components/session-provider'
import { deskOf } from '@/components/shell/sidebar-props'
import { ASK_ETYME_HREF, firstTabFor, readTab, tabKey, viewOf, type ShellView } from '@/lib/nav-table'

const SEEN_KEY = 'etyme_tab_landed'

function stored(get: () => string | null): string | null {
  try { return get() } catch { return null }
}

/**
 * The two tabs. `dashboardHref` is the first link of the seat's own
 * Dashboard menu; `owed` the seat's number.
 */
export function ViewSwitch({
  dashboardHref,
  owed,
  roomy = false,
  className = '',
}: {
  dashboardHref: string
  owed: number | null
  /** A thumb-sized row, on a phone. */
  roomy?: boolean
  className?: string
}) {
  const view = viewOf(usePathname())
  const tab = (here: boolean) =>
    `flex-1 flex items-center justify-center gap-1.5 rounded-nav ${roomy ? 'h-9 text-[14px]' : 'h-8 text-[13px]'}
     transition-colors duration-fast
     ${here ? 'bg-etyme-raised text-etyme-ink font-medium shadow-lift' : 'text-etyme-muted hover:text-etyme-ink'}`
  return (
    <nav aria-label="Ask Etyme or Dashboard" data-view-switch className={`flex gap-1 p-1 rounded-nav bg-etyme-sunk ${className}`}>
      <Link
        href={ASK_ETYME_HREF as any}
        aria-current={view === 'ask' ? 'page' : undefined}
        aria-label={owedLabel(owed)}
        className={tab(view === 'ask')}
      >
        <span>Ask Etyme</span>
        <OwedBadge n={owed} />
      </Link>
      <Link
        href={dashboardHref as any}
        aria-current={view === 'dashboard' ? 'page' : undefined}
        className={tab(view === 'dashboard')}
      >
        Dashboard
      </Link>
    </nav>
  )
}

/**
 * Remembers the tab a person is on, and opens on their first tab once a
 * browser session. Drawn once, by the header, which is on every page.
 */
export function useRememberedTab(dashboardHref: string, enabled: boolean): void {
  const pathname = usePathname()
  const router = useRouter()
  const session = useSession()
  const view: ShellView = viewOf(pathname)
  const personId = session.person?.id ?? null
  const roleName = deskOf(session).roleName
  useEffect(() => {
    if (!enabled || session.loading || typeof window === 'undefined') return
    const key = tabKey(personId)
    const seen = `${SEEN_KEY}:${personId ?? 'anyone'}:${roleName ?? ''}`
    if (!stored(() => window.sessionStorage.getItem(seen))) {
      stored(() => { window.sessionStorage.setItem(seen, '1'); return null })
      const first = firstTabFor(roleName, readTab(stored(() => window.localStorage.getItem(key))))
      // Only where the door landed them: a link to a page opens that page.
      if (first === 'dashboard' && pathname === ASK_ETYME_HREF && !window.location.search) {
        router.replace(dashboardHref as any)
        return
      }
    }
    stored(() => { window.localStorage.setItem(key, view); return null })
  }, [enabled, session.loading, personId, roleName, view, pathname, dashboardHref, router])
}
