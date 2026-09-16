import { prisma } from '@/lib/db'

/**
 * The amendment trail: what the agreement said, each time it changed.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * `PATCH /api/program/agreements/[id]` used to overwrite payment days,
 * the margin floor, the capacity, the currency and the signature date in
 * place. So "what were the payment days on 3 March" — the only question
 * that matters when a client disputes an invoice — had no answer. The
 * agreement said what it said today and nothing said otherwise.
 *
 * `RateHistory` and `ApprovalRuleVersion` already solve this for rates
 * and for approval rules, and both store the values rather than a diff.
 * This follows them.
 *
 * ── Why the baseline is backfilled ───────────────────────────────────
 *
 * Every agreement on file was written before this table existed, so the
 * first amendment to one of them would leave a trail that begins after
 * the change — a record that answers "what did it become" and not "what
 * was it". `ensureBaseline` writes version 1 from the row as it stood
 * before the first amendment, with a reason that says plainly it was
 * reconstructed rather than observed. An honest gap named is worth more
 * than a trail that looks complete and is not.
 */

/** RECORDED · AMENDED · SIGNED · DOCUMENT_ATTACHED · RENEWED · EXPIRED · TERMINATED */
export type TrailAction =
  | 'RECORDED'
  | 'AMENDED'
  | 'SIGNED'
  | 'DOCUMENT_ATTACHED'
  | 'RENEWED'
  | 'EXPIRED'
  | 'TERMINATED'

/** The columns a version row keeps. Read from the agreement, never typed. */
const TERM_COLUMNS = {
  paymentTerms: true,
  paymentTermsFrom: true,
  currency: true,
  minMarginPct: true,
  capacity: true,
  effectiveDate: true,
  expiresAt: true,
  renewalKind: true,
  renewalMonths: true,
  noticeDays: true,
  status: true,
  signedAt: true,
  executedFileName: true,
} as const

export type TermSnapshot = {
  paymentTerms: number
  paymentTermsFrom: string
  currency: string
  minMarginPct: number | null
  capacity: number | null
  effectiveDate: Date | null
  expiresAt: Date | null
  renewalKind: string
  renewalMonths: number | null
  noticeDays: number | null
  status: string
  signedAt: Date | null
  executedFileName: string | null
}

/** The agreement's terms as they stand right now. */
export async function currentTerms(agreementId: string): Promise<TermSnapshot | null> {
  return prisma.masterAgreement.findUnique({
    where: { id: agreementId },
    select: TERM_COLUMNS,
  })
}

/**
 * Make sure the trail starts before the change that is about to happen.
 *
 * Takes the terms as they stood BEFORE the caller's change, so version 1
 * is what the agreement actually said. Does nothing when a trail already
 * exists.
 */
export async function ensureBaseline(
  agreementId: string,
  before: TermSnapshot,
  recordedAt: Date
): Promise<void> {
  const existing = await prisma.masterAgreementVersion.count({ where: { agreementId } })
  if (existing > 0) return

  await prisma.masterAgreementVersion.create({
    data: {
      agreementId,
      version: 1,
      ...before,
      action: 'RECORDED',
      changed: [],
      changedById: null,
      reason:
        'The terms as they stood when the amendment trail was first kept. ' +
        'Reconstructed from the agreement, not observed at the time.',
      changedAt: recordedAt,
    },
  })
}

/**
 * Write what the agreement says now, as the next version.
 *
 * Called after the update, so the row it snapshots is the new truth. The
 * version number is read and incremented in the same call rather than
 * counted, because two amendments in the same second would otherwise both
 * be "version 4" and the unique index would refuse the second — which is
 * the correct outcome, and the caller is told rather than left with a
 * silent five hundred.
 */
export async function recordVersion(params: {
  agreementId: string
  action: TrailAction
  /** Which terms moved, in the trade's words. Empty for a signature. */
  changed: string[]
  changedById: string | null
  reason: string | null
}): Promise<{ version: number } | null> {
  const after = await currentTerms(params.agreementId)
  if (!after) return null

  const last = await prisma.masterAgreementVersion.findFirst({
    where: { agreementId: params.agreementId },
    orderBy: { version: 'desc' },
    select: { version: true },
  })

  const version = (last?.version ?? 0) + 1

  await prisma.masterAgreementVersion.create({
    data: {
      agreementId: params.agreementId,
      version,
      ...after,
      action: params.action,
      changed: params.changed,
      changedById: params.changedById,
      reason: params.reason,
    },
  })

  return { version }
}
