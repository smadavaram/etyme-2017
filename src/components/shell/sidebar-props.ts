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
  /** The company is a made-up one, decided on the server (lib/demo-company). */
  demo?: boolean
  pending: boolean
}

export function sidebarPropsFrom(
  session: Pick<SessionState, 'company' | 'contextType' | 'loading' | 'isWorker' | 'permissions'> &
    // Optional, so a fixture that describes a seat without naming the
    // person still type-checks. Only ever read where there is no
    // company to name.
    // Optional too: a fixture describing a seat need not know about a
    // program office's desk, and almost nobody holds one.
    Partial<Pick<SessionState, 'person' | 'seat' | 'isDemo'>>
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
    // "Demo" in front of a made-up company's name, never a person's.
    demo: Boolean(session.isDemo && session.company),
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
    // role's permissions, never the office's. Read through `deskOf`, so
    // the + button and ⌘K cannot read it another way.
    permissions: deskOf(session).permissions,
    pending: false,
  }
}

/**
 * The desk this person is acting at, as the three doors into a page see it.
 *
 * The sidebar, the + button and ⌘K are three doors into the same pages,
 * and CLAUDE.md is plain that they are filtered from one answer: a menu
 * entry the route will refuse is a menu entry that lies. The sidebar read
 * the seat; the header read the session's own company, so Kestrel MSP,
 * seated at Talvern Medical's compliance desk, was offered Kestrel's own
 * "Add consultant" and "New contract" over Talvern's book, and Talvern's
 * routes refused both. Found by an outside review of the live demo,
 * 2026-10-05.
 *
 * So the answer is here, once:
 *  - `menuKind` is the kind whose menu is drawn — a seated office reads
 *    the client's, because it is reading the client's book;
 *  - `permissions` are the seat's where there is a seat — the client's own
 *    role — and the person's own everywhere else.
 *
 * A page that gates a button on a permission reads it from here too, for
 * the same reason (`requisitions/page.tsx`'s "Raise one" is the first).
 */
export interface Desk {
  /** The firm's own kind, whatever desk it sits at. */
  companyKind: SidebarIdentity['companyKind']
  /** The kind whose menu this desk reads: the client's, at a client's desk. */
  menuKind: SidebarIdentity['companyKind']
  isConsultant: boolean
  /** Also somebody the work is about. */
  worker: boolean
  permissions: readonly string[]
  seatedAtClient: string | null
}

export function deskOf(
  session: Pick<SessionState, 'company' | 'contextType' | 'isWorker' | 'permissions'> &
    Partial<Pick<SessionState, 'seat'>>
): Desk {
  const companyKind = session.company?.kind ?? null
  const isConsultant = session.contextType === 'CONSULTANT'
  const seat = session.seat ?? null
  return {
    companyKind,
    menuKind: seat && !isConsultant && companyKind ? 'CLIENT' : companyKind,
    isConsultant,
    worker: !isConsultant && session.isWorker,
    permissions: seat ? seat.permissions : session.permissions,
    seatedAtClient: seat?.clientName ?? null,
  }
}
