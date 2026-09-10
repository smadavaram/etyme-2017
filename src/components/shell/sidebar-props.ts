import type { SessionState } from '@/components/session-provider'

/**
 * The sidebar's props, read off the session.
 *
 * Two surfaces render the same navigation — the rail on a desktop and
 * the sheet that slides in on a phone — and the moment each worked out
 * the company kind for itself they could disagree, and one of them would
 * show a client the vendor's menu. So the reading is done once, here,
 * and both surfaces take the result.
 */

const KIND_LABEL: Record<string, string> = {
  VENDOR: 'Vendor',
  CLIENT: 'Client · Enterprise',
  MSP: 'MSP · Managed programme',
  GSI: 'GSI · Delivery',
}

export type SidebarIdentity = {
  companyKind: SessionState['company'] extends infer C
    ? C extends { kind: infer K } ? K | null : null
    : null
  isConsultant: boolean
  companyName?: string
  companyLabel?: string
  pending: boolean
}

export function sidebarPropsFrom(
  session: Pick<SessionState, 'company' | 'contextType' | 'loading'>
): SidebarIdentity {
  // While the session loads, the frame without nav items — rather than
  // flashing the wrong company's navigation.
  if (session.loading) {
    return { companyKind: 'VENDOR', isConsultant: false, pending: true }
  }

  // Null, not a default. A person with no company is a consultant, and
  // guessing "vendor" for them showed the third side of this marketplace
  // somebody else's navigation.
  const kind = session.company?.kind ?? null
  // Somebody on a bench belongs to a vendor without being of it.
  const isConsultant = session.contextType === 'CONSULTANT'

  return {
    companyKind: kind,
    isConsultant,
    companyName: session.company?.name,
    companyLabel: isConsultant ? 'Consultant' : kind ? (KIND_LABEL[kind] ?? 'Vendor') : 'Consultant',
    pending: false,
  }
}
