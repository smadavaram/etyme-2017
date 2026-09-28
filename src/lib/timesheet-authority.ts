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
 *   The person who worked the hours enters them, and nobody else does.
 *   Nobody else's word about what somebody did is worth more than theirs.
 *
 *   The vendor who employs them used to be allowed to enter on their
 *   behalf. Withdrawn by the founder, 2026-09-28 — "worker files their own
 *   week only" (CLAUDE.md, "One week, filed once by the worker, signed at
 *   the top"). A week typed in by the firm that is paid on it is the firm
 *   vouching for its own invoice, and in a chain it was also how one week
 *   came to be keyed twice, once per rung.
 *
 *   The buyer approves. Approval is the client saying the work happened,
 *   which is the whole point of the control, so a vendor approving their
 *   own timesheet would be marking their own homework.
 */
import { askTheDesk } from '@/lib/permissions'


export interface Parties {
  /** The person the timesheet belongs to. */
  personId: string
  /** Their name, for the refusal. Optional: without it the sentence says "the person who worked them". */
  personName?: string | null
  /** The vendor selling the work. */
  vendorCompanyId: string
  /** Who is billed. */
  clientCompanyId: string
  /** Where the work happens, when that differs. */
  endClientCompanyId: string | null
}

export interface Actor {
  personId: string
  companyId: string | null | undefined
  permissions: readonly string[]
  /**
   * Only for the refusal, and both optional: a caller that does not pass
   * them gets the same sentence with "your company" in it rather than a
   * blank or a key. Which desks sign hours depends on what kind of firm
   * it is — a client's hiring manager, a supplier's account manager —
   * and `askTheDesk` needs the kind to say so.
   */
  companyKind?: string | null
  companyName?: string | null
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

  // Everybody else, the employer included, whatever they hold. The
  // sentence says who can and where, because "you may not" alone sends a
  // recruiter back to typing the hours into an email instead.
  const who = t.personName?.trim() || 'the person who worked them'
  return {
    ok: false,
    reason:
      t.personName?.trim()
        ? `Only ${who} can file their week. Ask them to file it from their own page.`
        : 'Only the person who worked these hours can file them. Ask them to file the week from their own page.',
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
  if (!holds(a, 'timesheets.approve')) {
    // Not "needs the timesheets.approve permission". A key is a thing
    // nobody can grant themselves and it says nothing about what to do;
    // `askTheDesk` names the desks at this kind of firm that sign hours.
    return {
      ok: false,
      reason: askTheDesk({
        doing: 'Signing hours off',
        needs: 'timesheets.approve',
        kind: a.companyKind ?? null,
        companyName: a.companyName ?? null,
      }),
    }
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
