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
  MSP: 'MSP · Managed program',
  GSI: 'GSI · Delivery',
}

export type SidebarIdentity = {
  companyKind: SessionState['company'] extends infer C
    ? C extends { kind: infer K } ? K | null : null
    : null
  isConsultant: boolean
  /** Also somebody the work is about — their firm's menu plus "You". */
  worker: boolean
  /** What the seat holds; undefined means the menu is not filtered yet. */
  permissions?: readonly string[] | null
  companyName?: string
  companyLabel?: string
  /**
   * Whose workspace this is when it is not a company's.
   *
   * A consultant with no firm — nobody employs them, nobody lists them
   * — has a company of null, and the rail used to fall back to a
   * hard-coded design placeholder, so Marisol Quintero's own page named
   * a bench vendor in the seeded world she has never met. A fabricated
   * firm printed under somebody's own name is worse than a blank.
   */
  personName?: string
  pending: boolean
}

export function sidebarPropsFrom(
  session: Pick<SessionState, 'company' | 'contextType' | 'loading' | 'isWorker' | 'permissions'> &
    // Optional, so a fixture that describes a seat without naming the
    // person still type-checks. Only ever read where there is no
    // company to name.
    Partial<Pick<SessionState, 'person'>>
): SidebarIdentity {
  // While the session loads, the frame without nav items — rather than
  // flashing the wrong company's navigation.
  if (session.loading) {
    return { companyKind: 'VENDOR', isConsultant: false, worker: false, pending: true }
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
    // A seat's type says who employs them; it does not say whether the
    // work is about them. Karthik Menon's only context is EMPLOYEE at a
    // systems integrator and he is the person on the placement, so this
    // is read off the work (`ownPage`) and never off contextType.
    //
    // Never both at once: somebody whose seat already IS the consultant
    // seat reads CONSULTANT_NAV, which carries these pages already.
    worker: !isConsultant && session.isWorker,
    // The label stays the firm's. He is Teleworld staff with a real
    // seat, and calling him a consultant would be the mirror image of
    // the bug this fixes.
    companyName: session.company?.name,
    // Theirs, for the case where there is no firm to name.
    personName: session.person?.name,
    companyLabel: isConsultant ? 'Consultant' : kind ? (KIND_LABEL[kind] ?? 'Vendor') : 'Consultant',
    permissions: session.permissions,
    pending: false,
  }
}
