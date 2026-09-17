/**
 * What kind of submission this is, and what the person is told about it.
 *
 * ── Why this file is here rather than in src/lib ─────────────────────
 *
 * It is pure arithmetic and it belongs beside the route that uses it:
 * `src/lib` has no `lib/submission-*` fragment claimed by any domain in
 * `lib/domains.ts`, and a new file nobody owns fails the ownership
 * invariant on the commit that adds it. `app/api/submissions` is
 * etyme-demand's, the same way `app/api/program/agreements/verdict.ts`
 * sits beside its route. No database is touched from here.
 *
 * ── What INTERNAL actually means ─────────────────────────────────────
 *
 * `SubmissionKind.INTERNAL` has been in the schema since it was written
 * and nothing computed it correctly. The route read it as "the firm
 * receiving this is the firm sending it" — a condition the route already
 * refuses one screen earlier with NO_RECIPIENT, because a submission to
 * yourself has nobody to submit to. So the branch was unreachable and
 * the meaning was wrong.
 *
 * INTERNAL means **the person is our own employee**. A prime, a GSI or
 * an MSP sells to a client and buys either from a sub-vendor by purchase
 * order or from its own W2 payroll with no purchase order at all. The
 * buy side always knew this — `BuyContract.purchaseOrderId` is nullable
 * for exactly this reason — and the sell side did not.
 *
 * ── Why employment beats the bench tier ──────────────────────────────
 *
 * A firm can employ somebody and also hold a bench listing on them; an
 * employer that benches its own staff between projects is ordinary. The
 * kind describes where the person comes from commercially, and payroll
 * is the strongest answer available: it decides whether the award writes
 * a W2 leg or a corp-to-corp leg, and a listing does not change that.
 */

export type Kind = 'INTERNAL' | 'BENCH' | 'NETWORK'

export interface Ownership {
  /**
   * Whether the submitting firm holds a live EMPLOYEE context for this
   * person — the firm's own W2, on its own payroll.
   */
  employedByUs: boolean
  /**
   * The tier of the bench listing the submitting firm holds, if any.
   * Null where there is none, which is the ordinary case for an
   * employee: nobody asks an employee for permission to be marketed.
   */
  listingTier: string | null
}

/**
 * The kind, computed from ownership and never accepted from a client.
 *
 * Three answers, in the order the money reads them:
 *
 *   INTERNAL  our own employee, so the buy leg is payroll and no
 *             purchase order is raised to them
 *   BENCH     somebody we have retained, so we carry them
 *   NETWORK   somebody another firm holds, so we buy them
 */
export function submissionKind(o: Ownership): Kind {
  if (o.employedByUs) return 'INTERNAL'
  if (o.listingTier === 'RETAINED') return 'BENCH'
  return 'NETWORK'
}

/**
 * What the employee is told, in the sentence they read.
 *
 * Told, not asked. The employment contract is the consent to be
 * assigned — nobody asks an employee's permission to staff them on a
 * project — but being recorded on a client's site, with tenure and
 * paperwork attached, is not nothing. So there is a message and there is
 * no button on it, and the sentence has to be clear that nothing is
 * waiting on them.
 *
 * A consultant on somebody's bench gets a different message, with a
 * consent ask attached. This one deliberately has none.
 */
export function tellEmployee(input: {
  employerName: string
  clientName: string
  roleTitle: string
}): string {
  return (
    `${input.employerName} has put you forward to ${input.clientName} for ${input.roleTitle}. ` +
    `You are on ${input.employerName}'s payroll, so this is part of how you are staffed and ` +
    `there is nothing for you to accept. Ask your manager if you have questions about the role.`
  )
}

/**
 * The refusal when a client is on this person's do-not-submit list.
 *
 * Being employed by the submitting firm does not override it. An
 * employer may skip the bench listing; it may not skip a block, and the
 * sentence is word for word the one `decideSubmission` gives every other
 * firm, so a refusal reads the same however it was reached.
 *
 * It names nobody else on purpose. A person's reason for not wanting to
 * go somewhere is their own, and half of them are "that is where I work
 * at the moment".
 */
export function blockedSays(): string {
  return 'This person cannot be submitted to this client.'
}
