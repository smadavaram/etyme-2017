/**
 * Who may enter an hour, and who may approve one.
 *
 * An approved timesheet is the goods receipt. Everything downstream rests
 * on it: the invoice, the three-way match, the payment, the margin. It is
 * the most consequential write in the system and it was the least
 * defended — approving required only that somebody be signed in, so any
 * account on the platform could approve any timesheet on any contract at
 * any company.
 *
 * Three parties have a legitimate claim on a timesheet and they want
 * different things:
 *
 *   The person who worked the hours enters them. Nobody else's word about
 *   what somebody did is worth more than theirs.
 *
 *   The vendor who employs them may enter on their behalf — a consultant
 *   on a client site with no laptop is a real case, and the alternative is
 *   the hours arriving by email and being typed in anyway.
 *
 *   The buyer approves. Approval is the client saying the work happened,
 *   which is the whole point of the control, so a vendor approving their
 *   own timesheet would be marking their own homework.
 */

export interface Parties {
  /** The person the timesheet belongs to. */
  personId: string
  /** The vendor selling the work. */
  vendorCompanyId: string
  /** Who is billed. */
  clientCompanyId: string
  /** Where the work happens, when that differs. */
  endClientCompanyId: string | null
  /**
   * The one person a delivery manager named to approve this contract's
   * hours, on the employer's side — SellContract.approverPersonId.
   * Null on every contract that has not named one, which is most of
   * them; those keep approving exactly as they always have.
   */
  approverPersonId?: string | null
}

export interface Actor {
  personId: string
  companyId: string | null | undefined
  permissions: readonly string[]
}

export interface Verdict {
  ok: boolean
  reason: string
}

function holds(a: Actor, p: string): boolean {
  return a.permissions.includes('*') || a.permissions.includes(p)
}

/** Whether this actor may enter or submit these hours. */
export function mayEnter(a: Actor, t: Parties): Verdict {
  if (a.personId === t.personId) return { ok: true, reason: 'Their own hours.' }

  if (a.companyId === t.vendorCompanyId && holds(a, 'timesheets.read')) {
    // On behalf of somebody on their own bench. Recorded as such, because
    // "who said these hours happened" is the first question asked when a
    // timesheet is disputed.
    return { ok: true, reason: 'Entered by their agency on their behalf.' }
  }

  return {
    ok: false,
    reason: 'Only the person who worked these hours, or the agency that employs them, can enter them.',
  }
}

/**
 * Whether this actor may approve or reject.
 *
 * The buyer's side only. A vendor approving their own submission turns the
 * goods receipt into a formality, and every control downstream inherits
 * that weakness quietly.
 */
export function mayApprove(a: Actor, t: Parties): Verdict {
  // A team lead named on this specific contract may approve it — on the
  // employer's side, for this contract only, and without needing the
  // blanket timesheets.approve permission at all. This is the narrower
  // path a delivery manager hands somebody instead of company-wide
  // reach: "manage and approve timesheets for the project," not
  // "approve anything at Infosys."
  if (t.approverPersonId != null && a.personId === t.approverPersonId) {
    return { ok: true, reason: 'The team lead named on this contract.' }
  }

  if (!holds(a, 'timesheets.approve')) {
    return { ok: false, reason: 'Approving hours needs the timesheets.approve permission.' }
  }

  const buyerSide =
    a.companyId === t.clientCompanyId ||
    (t.endClientCompanyId !== null && a.companyId === t.endClientCompanyId)

  if (buyerSide) return { ok: true, reason: 'The buyer approving work done for them.' }

  // A vendor with no client on the platform still has to be able to close
  // their own week, and refusing would stop billing altogether. Allowed,
  // and only where the buyer is genuinely not here to do it.
  if (a.companyId === t.vendorCompanyId) {
    return { ok: true, reason: 'Approved by the agency, because the buyer is not on Etyme.' }
  }

  return {
    ok: false,
    reason: 'Only the company being billed for this work can approve it.',
  }
}

/** Nobody may approve their own hours, whatever else they hold. */
export function approvingOwnHours(a: Actor, t: Parties): boolean {
  return a.personId === t.personId
}
