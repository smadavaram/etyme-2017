'use client'

import { Sidebar } from '@/components/shell/sidebar'
import { useSession } from '@/components/session-provider'

/**
 * Dashboard shell wrapper — renders the sidebar for the caller's
 * actual company, taken from their active context via /api/me.
 *
 * This used to guess from the URL: four paths were "client routes" and
 * everything else got the vendor sidebar, so a client clicking
 * "Placements" was thrown back into the vendor nav. The session is the
 * authority now, so the nav stays put wherever they navigate.
 */

const KIND_LABEL: Record<string, string> = {
  VENDOR: 'Vendor',
  CLIENT: 'Client · Enterprise',
  MSP: 'MSP · Managed programme',
  GSI: 'GSI · Delivery',
}

export function DashboardShell() {
  const { company, loading } = useSession()

  // While the session loads, render the sidebar frame without nav items
  // rather than flashing the wrong company's navigation.
  if (loading) {
    return <Sidebar companyKind="VENDOR" pending />
  }

  const kind = company?.kind ?? 'VENDOR'

  return (
    <Sidebar
      companyKind={kind}
      companyName={company?.name}
      companyLabel={KIND_LABEL[kind] ?? 'Vendor'}
    />
  )
}
