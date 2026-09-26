/**
 * Re-key the automation log rows written under a name nothing declares.
 *
 * ── What was wrong with the old names ────────────────────────────────
 *
 * Four money routes built their action out of pieces, so the governance
 * ladder in `src/lib/autonomy.ts` never knew those rows existed. Making
 * the names literal fixes every row written from here on. This is about
 * the rows already written.
 *
 * Two of the four kept their names, because they were already in the
 * app's own voice and only invisible: `RESERVE_PAY_OUT`,
 * `RESERVE_FORFEIT`, and the five `COLLECTIONS_*`. Nothing to do there,
 * which is the point of keeping them.
 *
 * Two did not:
 *
 *   expense.submit   →  EXPENSE_SUBMITTED
 *   expense.approve  →  EXPENSE_APPROVED
 *   expense.reject   →  EXPENSE_REJECTED
 *
 *     Lowercase and dotted, in nobody else's convention. Nothing else in
 *     the table is written this way, so these rows could not be queried
 *     beside TIMESHEET_APPROVED, which is the same shape of act.
 *
 *   CONTRACT_VERIFY    →  CONTRACT_VERIFICATION_REQUESTED
 *   CONTRACT_ACTIVATE  →  CONTRACT_ACTIVATED
 *   CONTRACT_PAUSE     →  CONTRACT_PAUSED
 *   CONTRACT_RESUME    →  CONTRACT_RESUMED
 *   CONTRACT_COMPLETE  →  CONTRACT_COMPLETED
 *   CONTRACT_CANCEL    →  CONTRACT_CANCELLED
 *
 *     The imperative, where the ladder beside them already holds
 *     CONTRACT_CREATED and CONTRACT_EXTENDED and every other name in it
 *     records something that happened. An audit row is not an
 *     instruction.
 *
 * ── Why re-keying an audit trail is the right answer here ────────────
 *
 * It is not obviously right, and the repository has precedent both ways:
 * `scripts/retire-due-cycles.mjs` swept rows that were actively
 * misleading, and `src/lib/cycle-kinds.ts` deliberately kept retired
 * names so old rows still render. The dividing line between those two is
 * whether a human reads the value.
 *
 * A cycle kind is rendered — "Invoice due" appears on a placement
 * timeline — so retiring the name in place is the only way old history
 * stays readable. An automation log action is not rendered anywhere:
 * `readRow` shows the summary, the reason, the level and whether it can
 * be undone, and never the action code. So re-keying changes nothing any
 * person will ever read.
 *
 * Leaving them, by contrast, makes a false statement to a person.
 * `decidedBy` returns UNRECORDED for a name with no entry and `readRow`
 * gives it no kind and no rung, so every historical expense approval
 * renders as "This action has no place in the ladder yet" — which is a
 * claim about our own governance that is not true of the act.
 *
 * The obvious third option — declare the retired names in the ladder
 * alongside the new ones — is closed by the ladder's own second rule:
 * "the ladder claims nothing the code does not actually write" fails on
 * any name no route writes. And `src/lib/autonomy.ts` already argues
 * this way for itself: a level is our own description of our own
 * behavior, so "if we relabel one, we described it wrong before, and we
 * want every historical row to read the corrected level".
 *
 * ── Nothing is erased ────────────────────────────────────────────────
 *
 * Only the key changes. The summary, the reason, the payload, the actor,
 * the timestamps and the reversible flag are left exactly as they were,
 * and each row gains `payload.actionWas` so the row itself still says
 * what it was written as. One fact added, none removed.
 *
 * `actionWas` rather than a word of my own, because
 * `scripts/rename-suspend-action.mjs` reached the same answer for
 * `ACCESS_SUSPENDD` on the same day and two names for one fact is the
 * inconsistency both scripts exist to end.
 *
 * ── Running it ───────────────────────────────────────────────────────
 *
 *   node scripts/rename-automation-actions.mjs            counts, changes nothing
 *   node scripts/rename-automation-actions.mjs --apply    re-keys
 *
 * Counting first is the default because a step whose only mode is
 * destructive eventually runs against the wrong database. It is safe to
 * run twice: a row already carrying the new name is not matched.
 */

import { PrismaClient } from '@prisma/client'

const RENAMES = {
  'expense.submit': 'EXPENSE_SUBMITTED',
  'expense.approve': 'EXPENSE_APPROVED',
  'expense.reject': 'EXPENSE_REJECTED',
  CONTRACT_VERIFY: 'CONTRACT_VERIFICATION_REQUESTED',
  CONTRACT_ACTIVATE: 'CONTRACT_ACTIVATED',
  CONTRACT_PAUSE: 'CONTRACT_PAUSED',
  CONTRACT_RESUME: 'CONTRACT_RESUMED',
  CONTRACT_COMPLETE: 'CONTRACT_COMPLETED',
  CONTRACT_CANCEL: 'CONTRACT_CANCELLED',
}

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

try {
  let total = 0

  for (const [was, now] of Object.entries(RENAMES)) {
    const rows = await prisma.automationLog.findMany({
      where: { action: was },
      select: { id: true, payload: true },
    })
    total += rows.length
    if (rows.length === 0) continue

    console.log(`${rows.length} row(s)  ${was}  →  ${now}`)
    if (!apply) continue

    for (const row of rows) {
      const payload =
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? { ...row.payload, actionWas: was }
          : { actionWas: was, payloadWas: row.payload ?? null }

      await prisma.automationLog.update({
        where: { id: row.id },
        data: { action: now, payload },
      })
    }
  }

  if (total === 0) {
    console.log('No rows under a retired name. Nothing to do.')
  } else if (!apply) {
    console.log(`\n${total} row(s) would be re-keyed. Run again with --apply.`)
  } else {
    console.log(`\n${total} row(s) re-keyed, each carrying payload.actionWas.`)
  }
} finally {
  await prisma.$disconnect()
}
