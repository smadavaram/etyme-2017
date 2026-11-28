import { isSent } from '@/lib/money/bill-state'

/**
 * Which bills the "Overdue bill" row counts: sent to the firm that pays
 * it, owed, and past its due date.
 *
 * The row counted ISSUED and PARTIALLY_PAID. ISSUED is a bill raised on
 * the Bills page and never sent (`lib/money/bill-state`), and nobody owes
 * a bill they were never sent, so Tapin's AR was told to chase a bill
 * Brightmoor had never received (the second Tapin walk, 2026-10-31). And
 * SUBMITTED, a bill sent and not paid at all, was never on the list, so
 * the one bill that was really overdue was the one nobody was told about.
 *
 * Held and disputed bills are sent too, and each has its own row: a
 * dispute is the payer's move to answer (`./disputed-bill`), and a hold
 * is the payer's decision, not a late payment.
 */
export const OVERDUE_BILL_STATUSES: readonly string[] = ['SUBMITTED', 'PARTIALLY_PAID'].filter(isSent)
