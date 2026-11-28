/**
 * A one-person firm is never asked to approve its own worker's expense.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * The founder, 2026-10-19: an expense is accepted like a week. The
 * worker's employer approves it for paying back, then each firm above
 * accepts it before it pays it, nobody accepting their own. And
 * 2026-10-26, for the week: a one-person firm is spoken to as herself and
 * never accepts her own week; once the firm above signs, her week waits
 * on the firm above her, never on herself (`lib/money/own-firm-acceptance`).
 *
 * The fifth screen walk, 2026-11-04: Colleen Byrne filed an $85 expense
 * from her own page, and Byrne Critical Care LLC's queue then asked her
 * "Colleen Byrne's expense waits for your approval", with Approve
 * expense. She is the firm and the worker: the approval would be her
 * paying herself back for her own claim, which is no check at all.
 *
 * So the expense follows the week. Where every seat at the employer that
 * may approve an expense is the worker's own, her filing stands as her
 * firm's approval: the expense is written APPROVED, by nobody, with the
 * reason in the automation log, and it goes straight to the firm above
 * her to accept. The queue never holds it for her, the page offers no
 * Approve, and the sentence she reads names the firm it waits on.
 * Wherever anybody else at the firm may approve, they do, as before.
 *
 * Who may approve is the approve route's own gate (`invoices.read`, or
 * everything) on a live seat, never the shared sample seat. Read off the
 * seats and not off the company's kind, because a one-person corporation
 * that seats a bookkeeper has somebody else to approve.
 */

import { prisma } from '@/lib/db'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'

/** The permissions the approve route asks for (`/api/expenses/actions`). */
export const APPROVES_EXPENSES = ['invoices.read', '*'] as const

/**
 * Whether every seat at a firm that may approve an expense is the
 * worker's own: at least one such seat, and none belonging to anybody
 * else. Pure.
 */
export function approvesOnlyForWorker(seats: readonly { personId: string }[], workerId: string): boolean {
  return seats.length > 0 && seats.every((s) => s.personId === workerId)
}

/** Whether this firm's approval of this worker's expense is hers alone. One read. */
export async function firmApprovesOnlyFor(companyId: string, workerId: string): Promise<boolean> {
  const seats = await prisma.context.findMany({
    where: {
      companyId,
      revokedAt: null,
      role: { permissions: { hasSome: [...APPROVES_EXPENSES] } },
      ...NOT_THE_SAMPLE_SEAT,
    },
    select: { personId: true },
  })
  return approvesOnlyForWorker(seats, workerId)
}

/**
 * Of these expenses at one firm, the ones its own worker filed where the
 * firm approves for nobody but her. For any queue that lists expenses
 * waiting on the employer: these are never put to her.
 */
export async function ownFirmExpenseIds(
  companyId: string,
  expenses: readonly { id: string; personId: string }[]
): Promise<Set<string>> {
  const workers = [...new Set(expenses.map((e) => e.personId))]
  const alone = new Set(
    (await Promise.all(workers.map(async (w) => ((await firmApprovesOnlyFor(companyId, w)) ? w : null))))
      .filter((w): w is string => w != null)
  )
  return new Set(expenses.filter((e) => alone.has(e.personId)).map((e) => e.id))
}

/** The automation log's reason for the approval nobody was asked for. */
export function standsAsApprovalSays(i: { firmName: string; personName: string; waitingOn: string | null }): string {
  return (
    `${i.firmName} is ${i.personName}’s own firm, and nobody approves their own expense, ` +
    `so ${i.personName}’s filing stands as ${i.firmName}’s approval` +
    (i.waitingOn ? ` and it goes to ${i.waitingOn} to accept.` : '.')
  )
}

/**
 * What she reads when she files it, in the second person.
 *
 * `waitingOn` is the firm that accepts it first, where any firm above is
 * billed for it. Null where no firm above pays for it: then it is her
 * firm's own cost, and `whyOwnCost` says why.
 */
export function filedAtOwnFirmSays(i: { waitingOn: string | null; whyOwnCost?: string | null }): string {
  if (i.waitingOn) {
    return `Filed. It is waiting on ${i.waitingOn} to accept it. Your firm is yours alone, so you are not asked to approve your own expense.`
  }
  return `Filed, as your own firm’s cost.${i.whyOwnCost ? ` ${i.whyOwnCost}` : ''}`
}

/**
 * Why no firm above pays for it, said to her: the agreement leaves the
 * kind out, or no agreement says.
 */
export function ownCostSays(i: { payerName: string; agreementSaid: boolean; kind: string }): string {
  const kind = i.kind.trim().toLowerCase()
  return i.agreementSaid
    ? `Your agreement with ${i.payerName} does not make ${kind} expenses billable, so ${i.payerName} is not billed for it.`
    : `No agreement between you and ${i.payerName} says which expenses are billable, so ${i.payerName} is not billed for it for now.`
}
