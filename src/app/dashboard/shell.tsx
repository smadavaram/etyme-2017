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
  const { company, contextType, loading } = useSession()

  // While the session loads, render the sidebar frame without nav items
  // rather than flashing the wrong company's navigation.
  if (loading) {
    return <Sidebar companyKind="VENDOR" pending />
  }

  // Null, not a default. A person with no company is a consultant, and
  // guessing "vendor" for them showed the third side of this marketplace
  // somebody else's navigation.
  const kind = company?.kind ?? null
  // Somebody on a bench belongs to a vendor without being of it.
  const isConsultant = contextType === 'CONSULTANT'

  return (
    <Sidebar
      companyKind={kind}
      isConsultant={isConsultant}
      companyName={company?.name}
      companyLabel={isConsultant ? 'Consultant' : kind ? (KIND_LABEL[kind] ?? 'Vendor') : 'Consultant'}
    />
  )
}
