import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'

/**
 * A payment the rules refused, kept like any other refusal.
 *
 * Every door that pays — a supplier's invoice paid from its row or from the
 * chat, a typed-in invoice receipt paid from its row, a payment run
 * released, a run's confirmation marked paid — writes one PAYMENT_REFUSED
 * row before the refusal is sent, when the refusal is a rule's: the
 * three-way check did not pass, the supplier's bank details were not
 * checked, or the company was still waiting for a verified Owner. A
 * mistyped amount or a missing reference is a form being filled in, not a
 * rule refusing money, and writes nothing here.
 *
 * Nothing was paid, so the row says so and cannot be undone. The name is
 * written out at each `automationLog.create` below, where the ladder's
 * reader sees it (src/lib/autonomy.ts, ENFORCEMENT).
 */

export type PaymentRefusedDoor =
  /** A supplier's invoice, paid from its row, the chat's Pay card or the twin's yes. */
  | 'INVOICE_PAY'
  /** A typed-in invoice receipt, paid from its row. */
  | 'RECEIPT_PAY'
  /** A payment run released ("Mark it paid"). */
  | 'RUN_RELEASE'
  /** A run's confirmation from the payer's own system. */
  | 'RUN_CONFIRM'

export type PaymentRefusedWhy = 'MATCH_FAILED' | 'BANK_NOT_CHECKED' | 'OWNER_NOT_VERIFIED'

export interface PaymentRefused {
  /** The paying company, whose log it is. */
  companyId: string
  /** The person who pressed, where one did. */
  byPersonId: string | null
  door: PaymentRefusedDoor
  why: PaymentRefusedWhy
  /** The sentence the person was told, word for word. */
  says: string
  invoiceId?: string | null
  vendorBillId?: string | null
  runId?: string | null
  /** The document's number, where there is one, for the summary. */
  number?: string | null
}

const DOOR_WORDS: Record<PaymentRefusedDoor, string> = {
  INVOICE_PAY: 'pay an invoice receipt',
  RECEIPT_PAY: 'pay a typed-in invoice receipt',
  RUN_RELEASE: 'release a payment run',
  RUN_CONFIRM: 'mark a payment run paid from its confirmation',
}

const WHY_WORDS: Record<PaymentRefusedWhy, string> = {
  MATCH_FAILED: 'it did not pass the three-way check',
  BANK_NOT_CHECKED: 'the supplier’s bank details were not checked',
  OWNER_NOT_VERIFIED: 'the company is still waiting for a verified Owner',
}

/** What a payment refusal is: a code a rule gave, or none. */
export function refusalWhy(code: string | null | undefined): PaymentRefusedWhy | null {
  if (code === 'BANK_NOT_CHECKED' || code === 'OWNER_NOT_VERIFIED') return code
  // A check that failed, a check that could not run, and a week nobody
  // accepted behind a typed-in receipt are all the three-way check saying no.
  if (code === 'MATCH_FAILED' || code === 'NOT_CHECKED' || code === 'WEEK_NOT_ACCEPTED') return 'MATCH_FAILED'
  return null
}

/** Everything on the row but its name, which is written at each create below. */
function rowOf(r: PaymentRefused) {
  const doc = r.number ? ` (${r.number})` : ''
  return {
    companyId: r.companyId,
    summary: `A try to ${DOOR_WORDS[r.door]}${doc} was refused: ${WHY_WORDS[r.why]}. Nothing was paid.`,
    reason: r.says,
    payload: {
      door: r.door,
      why: r.why,
      byPersonId: r.byPersonId,
      invoiceId: r.invoiceId ?? null,
      vendorBillId: r.vendorBillId ?? null,
      runId: r.runId ?? null,
      number: r.number ?? null,
    },
    // Nothing happened, so there is nothing to put back.
    reversible: false,
  }
}

/**
 * Write the row on a transaction the caller holds: the one payment
 * functions refuse inside theirs, and the row commits with it.
 */
export async function logPaymentRefusedIn(
  tx: Pick<Prisma.TransactionClient, 'automationLog'>,
  r: PaymentRefused,
): Promise<void> {
  await tx.automationLog.create({ data: { ...rowOf(r), action: 'PAYMENT_REFUSED' } })
}

/**
 * Write the row before the route sends the refusal. Awaited, and it never
 * throws: if the row cannot be written, staff are told and the refusal
 * still stands.
 */
export async function logPaymentRefused(r: PaymentRefused): Promise<void> {
  try {
    await prisma.automationLog.create({ data: { ...rowOf(r), action: 'PAYMENT_REFUSED' } })
  } catch (err) {
    await reportError('Recording a refused payment failed:', err, { companyId: r.companyId })
  }
}
