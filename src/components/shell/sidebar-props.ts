import type { SessionState } from '@/components/session-provider'
import { kindLabel } from '@/lib/parties'

/**
 * The sidebar's props, read off the session.
 *
 * Two surfaces render the same navigation — the rail on a desktop and
 * the sheet that slides in on a phone — and the moment each worked out
 * the company kind for itself they could disagree, and one of them would
 * show a client the vendor's menu. So the reading is done once, here,
 * and both surfaces take the result.
 */

export type SidebarIdentity = {
  companyKind: SessionState['company'] extends infer C
    ? C extends { kind: infer K } ? K | null : null
    : null
  isConsultant: boolean
  /** Also somebody the work is about — their firm's menu plus "You". */
  worker: boolean
  /** What the seat holds; undefined means the menu is not filtered yet. */
  permissions?: readonly string[] | null
  /** The client whose desk this firm is acting at, if any. */
  seatedAtClient?: string | null
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
    // Optional too: a fixture describing a seat need not know about a
    // program office's desk, and almost nobody holds one.
    Partial<Pick<SessionState, 'person' | 'seat'>>
): SidebarIdentity {
  // While the session loads, the frame without nav items — rather than
  // flashing the wrong company's navigation.
  if (session.loading) {
    return { companyKind: 'VENDOR', isConsultant: false, worker: false, seatedAtClient: null, pending: true }
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
    // The client this firm is acting at, if a client granted it a desk.
    // The menu follows the book: a program office at somebody else's
    // desk reads that client's sections, under that client's own role.
    seatedAtClient: session.seat?.clientName ?? null,
    // Theirs, for the case where there is no firm to name.
    personName: session.person?.name,
    // Whose desk, said plainly, where it is not this firm's own. "MSP ·
    // Managed program" over a client's workforce named the reader and
    // not the book; a seated office reads the client's name and the
    // desk it was granted, which is what the money pages already say in
    // their banner.
    companyLabel: session.seat
      ? `At ${session.seat.clientName}${session.seat.roleName ? ` · ${session.seat.roleName}` : ''}`
      : isConsultant ? 'Consultant' : kindLabel(kind),
    // A seat is exactly the desk the client granted: the client's own
    // role's permissions, never the office's.
    permissions: session.seat ? session.seat.permissions : session.permissions,
    pending: false,
  }
}
