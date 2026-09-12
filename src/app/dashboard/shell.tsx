'use client'

import { Sidebar } from '@/components/shell/sidebar'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { useSession } from '@/components/session-provider'

/**
 * Dashboard shell wrapper — renders the sidebar for the caller's
 * actual company, taken from their active context via /api/me.
 *
 * This used to guess from the URL: four paths were "client routes" and
 * everything else got the vendor sidebar, so a client clicking
 * "Placements" was thrown back into the vendor nav. The session is the
 * authority now, so the nav stays put wherever they navigate.
 *
 * The reading of session → sidebar props lives in sidebar-props.ts so
 * the phone's slide-in menu (components/shell/mobile-nav) shows exactly
 * this navigation and not a second guess at it.
 */
export function DashboardShell() {
  const session = useSession()
  return <Sidebar {...sidebarPropsFrom(session)} />
}
