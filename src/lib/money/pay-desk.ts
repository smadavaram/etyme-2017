import { hasPermission } from '@/lib/permissions'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'

/**
 * Who is offered Pay — and what everybody else reads in its place.
 *
 * ── The failure this exists for ──────────────────────────────────────
 *
 * An outside review, 2026-10-05: a client's Program Manager opened an
 * invoice receipt that had passed the three-way check, saw "Pay", pressed
 * it, and was refused. The role holds `invoices.read` and not
 * `payments.record`, and every payment route gates on `payments.record`.
 * The list drew Pay from the check alone; the invoice page drew the pay
 * form from the invoice's side of the ledger alone; the payment-run
 * buttons on Accounts payable were drawn for anybody who could open the
 * tab. A button the route will refuse is a button that lies.
 *
 * ── Judged the way the route judges ──────────────────────────────────
 *
 * The routes read the permissions of the seat the reader is acting in:
 * the client's own role where a program office sits at a client's desk
 * and reads the client's book, the reader's own role everywhere else
 * (`lib/money/seated-books`). `payDeskPermissions` picks the same set,
 * from the session the sidebar reads, so the menu, the button and the
 * route cannot disagree. Where a page says it is reading a client's book
 * and the session holds no seat, the answer is null — nothing is offered
 * rather than the office's own permissions being guessed onto the
 * client's money.
 *
 * ── The sentence, not a disabled button ──────────────────────────────
 *
 * A reader who may not pay still reads what is owed — the figures stay
 * on the page — and is told which desk pays it. The desks are read off
 * the default roles for the company's kind, never a list kept here, and
 * a role whose desk is the whole firm (it manages the team) is not named,
 * because "ask your owner" is not who pays an invoice receipt. The
 * permission's machine name never reaches the sentence.
 *
 * No React and no database in here.
 */

export type Side = 'PAYABLE' | 'RECEIVABLE'

export interface SeatLike {
  clientName: string
  roleName?: string | null
  permissions: readonly string[]
}

/** The roles, by default, whose desk pays — never the whole-firm desks. */
export function desksThatPay(kind: CompanyKind | null | undefined): string[] {
  if (!kind) return []
  return rolesFor(kind)
    .filter((r) => !r.isOwner)
    .filter((r) => hasPermission(r.permissions, 'payments.record'))
    // Owner and Admin hold everything, team.manage among it. Naming them
    // would make "who pays" read as "whoever runs the company".
    .filter((r) => !hasPermission(r.permissions, 'team.manage'))
    .map((r) => r.name)
}

/** "AP Clerk", "AP Clerk or Finance", "A, B or C". */
function either(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/**
 * Which permissions decide, from the session.
 *
 * `readingInASeat` is the page's own verdict on whose book it is showing
 * (the API's `reading.inASeat`); the invoice page, which has no switch,
 * reads a seat whenever the session holds one.
 */
export function payDeskPermissions(input: {
  own: readonly string[] | null | undefined
  seat: Pick<SeatLike, 'permissions'> | null | undefined
  readingInASeat: boolean
}): readonly string[] | null {
  if (input.readingInASeat) return input.seat ? input.seat.permissions : null
  return input.own ?? null
}

export type PayDeskVerdict =
  | { mayPay: true; says: null }
  /** `says` is null only where the seat is not known yet. */
  | { mayPay: false; says: string | null }

export function payDesk(input: {
  permissions: readonly string[] | null | undefined
  companyKind: CompanyKind | null | undefined
  companyName?: string | null
  /** Present only when the page is reading a client's book from a seat. */
  seat?: Pick<SeatLike, 'clientName' | 'roleName'> | null
  side: Side
}): PayDeskVerdict {
  if (input.permissions == null) return { mayPay: false, says: null }
  if (hasPermission(input.permissions, 'payments.record')) return { mayPay: true, says: null }

  if (input.seat) {
    // A seat is always at a client, and the desk that pays there is the client's.
    const desks = either(desksThatPay('CLIENT'))
    const client = input.seat.clientName
    const desk = input.seat.roleName ? `${input.seat.roleName} desk` : 'desk it granted you'
    return {
      mayPay: false,
      says:
        `${client} seated you at its ${desk}, and that desk does not pay invoice receipts. ` +
        `${desks ? `${client}'s ${desks} pays them` : `${client} pays them itself`}, or ${client} ` +
        `can seat you at a desk that pays.`,
    }
  }

  const desks = either(desksThatPay(input.companyKind))
  const at = input.companyName ? ` at ${input.companyName}` : ''
  if (input.side === 'RECEIVABLE') {
    return {
      mayPay: false,
      says:
        `Recording what a client paid belongs to the ${desks || 'finance'} desk${at}. ` +
        `Your desk reads what is owed and does not record it.`,
    }
  }
  return {
    mayPay: false,
    says:
      `The ${desks || 'finance'} desk${at} pays invoice receipts. Your desk reads what is owed ` +
      `and when it is due, and does not pay it.`,
  }
}

export type RunDeskVerdict =
  | { mayRun: true; says: null; readsRuns: true }
  /**
   * `readsRuns` is false only in a client's seat, where the route would
   * answer with the office's own runs under the client's banner.
   */
  | { mayRun: false; says: string | null; readsRuns: boolean }

/**
 * May this reader assemble, approve or release a payment run?
 *
 * A payment run is drawn from the reader's own firm's book — the route
 * reads its own company and its own role, and there is no seated run
 * yet. So a program office reading a client's payables is not offered a
 * run at all: a run assembled there would be its own firm's money under
 * the client's banner.
 */
export function runDesk(input: {
  permissions: readonly string[] | null | undefined
  companyKind: CompanyKind | null | undefined
  inASeat: { clientName: string } | null
}): RunDeskVerdict {
  if (input.inASeat) {
    return {
      mayRun: false,
      readsRuns: false,
      says:
        `A payment run is drawn from your own firm's book, and a run for ` +
        `${input.inASeat.clientName} is not built yet. ${input.inASeat.clientName} pays its ` +
        `suppliers from its own desk; switch to your own books to run your firm's payments.`,
    }
  }
  if (input.permissions == null) return { mayRun: false, says: null, readsRuns: true }
  if (hasPermission(input.permissions, 'payments.record')) return { mayRun: true, says: null, readsRuns: true }
  const desks = either(desksThatPay(input.companyKind))
  return {
    mayRun: false,
    readsRuns: true,
    says:
      `Payment runs are assembled, approved and released by the ${desks || 'finance'} desk. ` +
      `Your desk reads what would go and what went, and does not run it.`,
  }
}
