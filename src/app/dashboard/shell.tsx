'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/shell/sidebar'

/**
 * Dashboard shell wrapper — detects company type from the route
 * and renders the appropriate sidebar.
 *
 * In production, companyKind would come from the user's active context
 * (stored in the session). For now, we detect it from the URL:
 *   /dashboard/program    → CLIENT sidebar (Terumo BCT)
 *   /dashboard/alumni     → CLIENT sidebar
 *   /dashboard/tenure     → CLIENT sidebar
 *   /dashboard/compliance → CLIENT sidebar
 *   everything else       → VENDOR sidebar (Cloudepa Inc.)
 */

const CLIENT_ROUTES = ['/dashboard/program', '/dashboard/alumni', '/dashboard/tenure', '/dashboard/compliance']

export function DashboardShell() {
  const pathname = usePathname()

  const isClientView = CLIENT_ROUTES.some(r => pathname.startsWith(r))

  if (isClientView) {
    return (
      <Sidebar
        companyKind="CLIENT"
        companyName="Terumo BCT"
        companyLabel="Client · Medical devices"
      />
    )
  }

  return <Sidebar companyKind="VENDOR" />
}
