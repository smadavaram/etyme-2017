/**
 * Two signatures on a timesheet, and what each one unlocks.
 *
 * The client approves a fact: this work happened, on these days, at this
 * site. The employer accepts a basis: this is what I will pay for.
 *
 * They look like the same act and they are not. They are different
 * assertions, made by different companies, about different things — and
 * in a forwarding chain they are almost never the same company. The end
 * client signs, the prime bills, the sub pays.
 *
 * ── What each one gates ──────────────────────────────────────────────
 *
 *   client approval    → the prime may invoice
 *   employer acceptance → the sub may run payroll
 *
 * One field for both meant a sub-vendor paying on a signature it never
 * collected, and a prime billing on one it had no right to rely on. On a
 * direct placement the two parties are the same company and both happen
 * in one click — which is why the fault was invisible for so long.
 *
 * ── Why the hours may differ ─────────────────────────────────────────
 *
 * A client approves forty hours. The employer accepts thirty-eight,
 * because two of them were travel nobody agreed to bill. Both numbers
 * are correct and they are not the same number. Keeping one of them
 * would silently overpay or underpay somebody every time it happened.
 */

export type Party = 'CLIENT' | 'EMPLOYER'

export interface Signed {
  at: Date
  byId: string
}

export interface Sheet {
  totalHours: number
  /** The client saying the work happened. */
  clientApproved: Signed | null
  /** The employer saying this is what they will pay for. */
  employerAccepted: Signed | null
  /** What the employer accepted, where it differs. Null = as approved. */
  acceptedHours: number | null
  acceptedNote: string | null
  /** True where the client and the employer are the same company. */
  direct: boolean
}

/** What may happen next, and what may not. */
export interface Gates {
  mayInvoice: boolean
  mayPay: boolean
  /** Hours to bill the client for. */
  billableHours: number
  /** Hours to pay the employee for. */
  payableHours: number
  /** Who we are still waiting on. */
  waitingOn: Party[]
  says: string
}

/**
 * Where a sheet stands.
 *
 * Billing and pay are gated separately on purpose. A prime that has the
 * client's approval may invoice while the sub is still checking what it
 * owes — those are genuinely independent, and blocking one on the other
 * would hold up cash for no reason.
 */
export function gates(s: Sheet, names: { client: string; employer: string }): Gates {
  const waitingOn: Party[] = []
  if (!s.clientApproved) waitingOn.push('CLIENT')
  if (!s.employerAccepted) waitingOn.push('EMPLOYER')

  const billableHours = s.clientApproved ? s.totalHours : 0
  const payableHours = s.employerAccepted
    ? (s.acceptedHours ?? s.totalHours)
    : 0

  return {
    mayInvoice: s.clientApproved != null,
    mayPay: s.employerAccepted != null,
    billableHours,
    payableHours,
    waitingOn,
    says: said(s, waitingOn, names, billableHours, payableHours),
  }
}

function said(
  s: Sheet,
  waiting: Party[],
  names: { client: string; employer: string },
  billable: number,
  payable: number
): string {
  if (waiting.length === 2) {
    return s.direct
      ? `${s.totalHours} hours submitted. Nobody has approved them yet.`
      : `${s.totalHours} hours submitted. Waiting on ${names.client} to approve and ${names.employer} to accept.`
  }

  if (waiting.length === 1) {
    const who = waiting[0] === 'CLIENT' ? names.client : names.employer
    return waiting[0] === 'CLIENT'
      ? `${names.employer} has accepted ${payable} hours for pay. Cannot invoice until ${who} approves.`
      : `${names.client} approved ${billable} hours, so this can be invoiced. Cannot pay until ${who} accepts.`
  }

  // Both in. The interesting case is where they disagree.
  if (billable !== payable) {
    return (
      `Billing ${billable} hours, paying ${payable}.` +
      (s.acceptedNote ? ` ${s.acceptedNote}` : '')
    )
  }

  return `${billable} hours, approved and accepted. Ready to invoice and to pay.`
}

/**
 * Whether this party may sign, and what happens if they do.
 *
 * A supplier cannot approve on the client's behalf and a client cannot
 * accept on the employer's — the whole value of two signatures is that
 * two different companies made them.
 */
export function maySign(
  party: Party,
  s: Sheet,
  isClient: boolean,
  isEmployer: boolean
): { ok: boolean; reason: string } {
  if (party === 'CLIENT') {
    if (!isClient) {
      return { ok: false, reason: 'Only the company the work was done for can approve these hours.' }
    }
    if (s.clientApproved) return { ok: false, reason: 'Already approved.' }
    return { ok: true, reason: 'Approving that this work happened.' }
  }

  if (!isEmployer) {
    return { ok: false, reason: 'Only the company that pays this person can accept these hours.' }
  }
  if (s.employerAccepted) return { ok: false, reason: 'Already accepted.' }

  // Deliberately allowed before the client signs. An employer settling a
  // fortnight's pay should not have to wait on a client's approval
  // queue, and blocking it means somebody is paid late for a reason that
  // has nothing to do with them.
  return {
    ok: true,
    reason: s.clientApproved
      ? 'Accepting these hours as the basis for pay.'
      : 'Accepting these hours for pay. The client has not approved them for billing yet.',
  }
}

/**
 * Accepting a different number, and saying so.
 *
 * The note is required when the hours differ. A silent reduction is how
 * somebody finds out they were docked two hours by reading their
 * payslip, and it is the fastest way to lose a good contractor.
 */
export function acceptWith(
  submitted: number,
  accepting: number | null,
  note: string | null
): { ok: boolean; hours: number | null; reason: string } {
  if (accepting == null || accepting === submitted) {
    return { ok: true, hours: null, reason: 'Accepted as submitted.' }
  }

  if (accepting < 0) {
    return { ok: false, hours: null, reason: 'Hours cannot be negative.' }
  }

  if (!note || note.trim().length < 3) {
    return {
      ok: false,
      hours: null,
      reason:
        `Accepting ${accepting} against ${submitted} submitted. Say why — somebody ` +
        `finding out from their payslip is how you lose a good contractor.`,
    }
  }

  return {
    ok: true,
    hours: accepting,
    reason:
      accepting > submitted
        ? `Accepting ${accepting}, more than the ${submitted} submitted. ${note.trim()}`
        : `Accepting ${accepting} of ${submitted} submitted. ${note.trim()}`,
  }
}

/**
 * A direct placement, where both signatures are the same company's.
 *
 * The common case, and it must not feel like two jobs. One press signs
 * both, and the record still holds two signatures — so a sheet approved
 * on a direct placement reads the same to the invoice engine as one
 * approved three companies away.
 */
export function signBoth(byId: string, at: Date): Pick<
  Sheet,
  'clientApproved' | 'employerAccepted'
> {
  return { clientApproved: { at, byId }, employerAccepted: { at, byId } }
}
