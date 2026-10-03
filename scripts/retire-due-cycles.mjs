/**
 * Clear away the invoice-due and vendor-bill-due cycles, once.
 *
 * ── Why they are going ───────────────────────────────────────────────
 *
 * A cycle is money that moves on a schedule decided in advance. A
 * payment term is not that: it is a clock a document starts, and only
 * the document knows when it started. `Invoice.dueAt` and
 * `VendorBill.dueAt` are that answer, computed from the term and from
 * the day the paper was actually received. INVOICE_DUE and
 * VENDOR_BILL_DUE were a second answer to the same question, generated
 * months ahead on the 28th and the 15th, and the two disagreed by
 * construction. See src/lib/cycle-kinds.ts for the whole argument.
 *
 * Nothing generates either kind now. This clears what earlier versions
 * of the engine already wrote, because leaving them is worse than
 * either removing or keeping them: the placement timeline would go on
 * calling a guessed date overdue while the invoice next to it says
 * something else, and the founder's rule is that a plausible wrong
 * number is worse than a blank.
 *
 * ── What it does and does not touch ──────────────────────────────────
 *
 * Deletes the uncompleted rows only. An uncompleted row is a claim
 * about a future date nobody can stand behind, and the document behind
 * it carries the real one.
 *
 * Leaves the completed rows alone. Those say a thing happened on a day,
 * which is true, and `categoryOf`/`labelOf` still render them as
 * "Invoice due" and "Vendor bill due" so a history does not turn into
 * enum names. Deleting a true record to tidy a list is a rewrite of
 * history, not a cleanup.
 *
 * ── Running it ───────────────────────────────────────────────────────
 *
 *   node scripts/retire-due-cycles.mjs            counts, deletes nothing
 *   node scripts/retire-due-cycles.mjs --apply    deletes
 *
 * Counting first is the default because a destructive step whose only
 * mode is destructive eventually runs against the wrong database.
 */

import { PrismaClient } from '@prisma/client'

const RETIRED = ['INVOICE_DUE', 'VENDOR_BILL_DUE']
const apply = process.argv.includes('--apply')

const prisma = new PrismaClient()

try {
  const open = await prisma.cycle.count({
    where: { kind: { in: RETIRED }, completedAt: null },
  })
  const done = await prisma.cycle.count({
    where: { kind: { in: RETIRED }, NOT: { completedAt: null } },
  })

  console.log(`${open} uncompleted due-cycle row(s) to remove.`)
  console.log(`${done} completed row(s) kept — they record something that happened.`)

  if (!apply) {
    console.log('Nothing was changed. Run again with --apply to remove them.')
  } else {
    const { count } = await prisma.cycle.deleteMany({
      where: { kind: { in: RETIRED }, completedAt: null },
    })
    console.log(`Removed ${count}. What each contract is owed and when is on the invoice and the bill.`)
  }
} finally {
  await prisma.$disconnect()
}
