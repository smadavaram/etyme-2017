/**
 * Withdrawing a draft bill: the weeks go back to being billable.
 *
 * ── Why this exists (release walk, 2026-10-18) ───────────────────────
 *
 * The supplier's twin drafts a bill on the agreement's billing date
 * (`lib/money/supplier-bills`). Until this file, a draft that nobody sent
 * held its weeks for good: Submit refused a draft, the Bills page refused
 * the same weeks again because they were on a bill, nothing removed a
 * draft, and the twin drafted nothing more for that placement while one
 * waited. Revenue stuck, at the sixteen seeded suppliers where only the
 * Owner sends bills and after any "Not now".
 *
 * So a person holding `invoices.issue` at the firm that raised a draft
 * may withdraw it, with a reason. Withdrawing undoes exactly what drafting
 * wrote, and nothing else:
 *
 *   - the draft's lines and the draft itself are deleted;
 *   - an expense it carried goes back to approved and unbilled;
 *   - a milestone it carried goes back to accepted;
 *   - an overtime decision stamped billed by a draft written before the
 *     stamp moved to sending is un-stamped, unless another bill still
 *     carries that week;
 *   - the draft's "drafted" log row is marked reversed and an INVOICE_DRAFT_WITHDRAWN row
 *     says who withdrew it and why;
 *   - the twin's ledger records a person's no to its draft, with the
 *     draft's key, so the twin's next run may draft the period again.
 *
 * A bill that has been raised or sent is never withdrawn here: a sent bill
 * is the customer's document too, and is corrected with a credit note.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { fromUnits } from '@/lib/money-display'
import { closeOvertaken, ledger } from '@/lib/twin/ledger'

type Tx = Prisma.TransactionClient

export type WithdrawResult =
  | { ok: true; number: string; says: string; draftKey: string | null }
  | { ok: false; status: 404 | 409 | 422; code: string; says: string }

/** Whether this firm may withdraw this bill now, and the sentence where not. Reads only. */
export async function mayBeWithdrawn(
  invoiceId: string,
  companyId: string,
  reason: string | null | undefined
): Promise<{ ok: true; number: string } | Extract<WithdrawResult, { ok: false }>> {
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, ...invoicesRaisedBy(companyId) },
    select: { id: true, number: true, status: true, _count: { select: { payments: true, creditNotes: true } } },
  })
  if (!inv) {
    return { ok: false, status: 404, code: 'NOT_FOUND', says: 'No such bill of yours. A draft is withdrawn by the firm that raised it.' }
  }
  if (inv.status !== 'DRAFT') {
    return {
      ok: false, status: 409, code: 'INVALID_STATE',
      says: inv.status === 'ISSUED'
        ? `Bill ${inv.number} has been raised, so it is not a draft and cannot be withdrawn.`
        : `Bill ${inv.number} has been sent, so it cannot be withdrawn. A sent bill is corrected with a credit note.`,
    }
  }
  if (inv._count.payments > 0 || inv._count.creditNotes > 0) {
    return { ok: false, status: 409, code: 'INVALID_STATE', says: `Bill ${inv.number} has money recorded against it, so it cannot be withdrawn.` }
  }
  if (!reason || !reason.trim()) {
    return { ok: false, status: 422, code: 'VALIDATION', says: `Say why bill ${inv.number} is being withdrawn, so whoever reads the trail knows.` }
  }
  return { ok: true, number: inv.number }
}

/**
 * Withdraw the draft, in one transaction, then write the twin's ledger
 * line. The caller has already asked `mayBeWithdrawn`; this asks again
 * inside the transaction, so a draft sent a moment ago is refused.
 */
export async function withdrawDraft(a: {
  invoiceId: string
  companyId: string
  by: { personId: string; name: string }
  reason: string
  now?: Date
}): Promise<WithdrawResult> {
  const pre = await mayBeWithdrawn(a.invoiceId, a.companyId, a.reason)
  if (!pre.ok) return pre
  const now = a.now ?? new Date()
  const reason = a.reason.trim()

  // The twin's draft entry, where the twin drafted it: its key frees the
  // period for the next run, and its parties go on the ledger line.
  const drafted = await prisma.twinAction.findFirst({
    where: {
      companyId: a.companyId, action: 'bill.draft', outcome: 'PERFORMED', actorType: 'TWIN',
      payload: { path: ['result', 'invoiceId'], equals: a.invoiceId },
    },
    select: {
      id: true, twinKind: true, onAuthorityOfRole: true, authorityPersonId: true, roleContractId: true,
      roleContractVersion: true, tier: true, entityType: true, entityId: true, partyCompanyIds: true,
      dedupKey: true, ruleCited: true,
    },
    orderBy: { ts: 'desc' },
  })

  let out: { number: string; total: number; currency: string }
  try {
    out = await prisma.$transaction(async (tx) => withdrawInTx(tx, { ...a, reason, now }))
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('ALREADY_MOVED')) {
      return { ok: false, status: 409, code: 'INVALID_STATE', says: `Bill ${pre.number} was sent a moment ago by somebody else, so it cannot be withdrawn.` }
    }
    throw err
  }

  // A person's no to the twin's draft, on the twin's own ledger: the
  // answer an auditor reads beside the draft, with the key that lets the
  // next run draft the period again (`billsDueAt`).
  // Ask Etyme's open question about sending it was closed as overtaken
  // inside the withdrawal's own transaction (`closeOvertaken` in the
  // ledger), so nothing is left to answer here.
  if (drafted) {
    // Through the ledger's own door, which never throws and reports to
    // staff where it cannot write: the draft is already gone either way.
    await ledger({
      companyId: a.companyId,
      twinKind: drafted.twinKind,
      actorType: 'PERSON',
      actorId: a.by.personId,
      onAuthorityOfRole: drafted.onAuthorityOfRole,
      authorityPersonId: drafted.authorityPersonId,
      roleContractId: drafted.roleContractId,
      roleContractVersion: drafted.roleContractVersion,
      tier: drafted.tier,
      outcome: 'REJECTED',
      action: 'bill.draft',
      entityType: drafted.entityType,
      entityId: drafted.entityId,
      partyCompanyIds: drafted.partyCompanyIds,
      ruleCited: drafted.ruleCited,
      rationale: `${a.by.name} withdrew draft bill ${out.number}: ${reason}`.slice(0, 1000),
      surface: 'WEB',
      payload: {
        withdrawn: true, invoiceId: a.invoiceId, invoiceNumber: out.number, reason,
        withdrawnByPersonId: a.by.personId, draftKey: drafted.dedupKey, draftedIn: drafted.id,
      },
      dedupKey: null,
    })
  }

  return {
    ok: true,
    number: out.number,
    draftKey: drafted?.dedupKey ?? null,
    says: `Draft bill ${out.number} (${fromUnits(out.total, out.currency)}) is withdrawn. Its weeks can be billed again from the Bills page or by Ask Etyme’s next run.`,
  }
}

async function withdrawInTx(
  tx: Tx,
  a: { invoiceId: string; companyId: string; by: { personId: string; name: string }; reason: string; now: Date }
): Promise<{ number: string; total: number; currency: string }> {
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: a.invoiceId },
    select: {
      id: true, number: true, status: true, total: true, currency: true,
      invoiceLines: { select: { timesheetId: true, expenseId: true, milestoneId: true } },
    },
  })
  if (inv.status !== 'DRAFT') throw new Error(`ALREADY_MOVED:${inv.status}`)

  const timesheetIds = [...new Set(inv.invoiceLines.map((l) => l.timesheetId).filter((x): x is string => !!x))]
  const expenseIds = inv.invoiceLines.map((l) => l.expenseId).filter((x): x is string => !!x)
  const milestoneIds = inv.invoiceLines.map((l) => l.milestoneId).filter((x): x is string => !!x)

  // What drafting stamped, unstamped.
  if (expenseIds.length > 0) {
    await tx.expense.updateMany({
      where: { id: { in: expenseIds }, invoiceId: inv.id, status: 'INVOICED' },
      data: { status: 'APPROVED', invoiceId: null },
    })
  }
  if (milestoneIds.length > 0) {
    await tx.orderMilestone.updateMany({ where: { id: { in: milestoneIds }, status: 'INVOICED' }, data: { status: 'ACCEPTED' } })
  }
  if (timesheetIds.length > 0) {
    // A draft written before the stamp moved to sending stamped its
    // weeks' overtime answers billed. A week another bill still carries
    // keeps its stamp: that bill was priced on the answer.
    const elsewhere = await tx.invoiceLine.findMany({
      where: { timesheetId: { in: timesheetIds }, invoiceId: { not: inv.id } },
      select: { timesheetId: true },
    })
    const kept = new Set(elsewhere.map((l) => l.timesheetId))
    const free = timesheetIds.filter((id) => !kept.has(id))
    if (free.length > 0) {
      await tx.overtimeDecision.updateMany({ where: { timesheetId: { in: free }, billedAt: { not: null } }, data: { billedAt: null } })
    }
  }

  // The lines and the draft. Only a draft still a draft: a Send pressed a
  // moment ago finds it moved, and this refuses.
  await tx.invoiceLine.deleteMany({ where: { invoiceId: inv.id } })
  await tx.invoiceMatchOverride.deleteMany({ where: { invoiceId: inv.id } })
  const gone = await tx.invoice.deleteMany({ where: { id: inv.id, status: 'DRAFT' } })
  if (gone.count !== 1) throw new Error('ALREADY_MOVED')

  // The trail: the draft's own row marked reversed, and who and why.
  const draftedLog = await tx.automationLog.findFirst({
    where: { companyId: a.companyId, action: 'INVOICE_GENERATED', reversedAt: null, payload: { path: ['invoiceId'], equals: inv.id } },
    select: { id: true, summary: true },
    orderBy: { at: 'asc' },
  })
  if (draftedLog) await tx.automationLog.update({ where: { id: draftedLog.id }, data: { reversedAt: a.now } })
  await tx.automationLog.create({
    data: {
      companyId: a.companyId,
      action: 'INVOICE_DRAFT_WITHDRAWN',
      summary: `Draft bill ${inv.number} withdrawn: ${fromUnits(Number(inv.total), inv.currency)}, ${timesheetIds.length} week(s) billable again`,
      reason: `${a.by.name} withdrew draft bill ${inv.number}: ${a.reason}`.slice(0, 1000),
      payload: {
        reversedEntryId: draftedLog?.id ?? null, originalAction: 'INVOICE_GENERATED',
        invoiceId: inv.id, invoiceNumber: inv.number, withdrawnByPersonId: a.by.personId, reason: a.reason,
        timesheetIds, expenseIds, milestoneIds,
      },
      reversible: false,
    },
  })

  // Ask Etyme's open question about sending it is overtaken: there is
  // nothing left to send. Closed unanswered, never as the person's no.
  await closeOvertaken(tx, {
    companyId: a.companyId, entity: { type: 'Invoice', id: inv.id }, action: 'bill.send',
    what: `Withdrawn by ${a.by.name}: ${a.reason}`, by: a.by, now: a.now,
  })

  return { number: inv.number, total: Number(inv.total), currency: inv.currency }
}
