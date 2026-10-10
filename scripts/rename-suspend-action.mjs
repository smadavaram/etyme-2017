/**
 * Correct the misspelled action on seat-suspension rows in the automation
 * log, once.
 *
 * ── What was wrong ───────────────────────────────────────────────────
 *
 * `POST /api/access/:contextId` built its automation-log action by
 * interpolation — `ACCESS_${action.toUpperCase()}D`. Revoke and reinstate
 * came out right by luck. Suspend came out ACCESS_SUSPENDD, and that is
 * what has been written for every paused seat for as long as the route
 * has existed. The route now spells all three out.
 *
 * ── Why these rows are corrected rather than left ────────────────────
 *
 * Rewriting an audit log is not obviously right, and it is not what this
 * does. `AutomationLog` testifies through `summary`, `reason`, `payload`,
 * `createdAt` and `reversible` — "Dana Whitlock paused Priya Raghunathan's
 * access (Recruiter)", on a day, for a reason, reversible. Every one of
 * those is true and none of them is touched here. `action` is not
 * testimony; it is the key the row is filed under, and this one was filed
 * under a misspelling.
 *
 * Left alone, the damage is a false negative in a compliance record: a
 * reviewer asking a company to show every seat it has ever suspended gets
 * an empty answer for everything before today, which reads as "this
 * company has never suspended anybody". A log that under-reports is the
 * failure the log exists to prevent. The alternative — teaching the
 * ladder to answer to ACCESS_SUSPENDD — would carry the typo permanently
 * in the inventory shown to a buyer asking how autonomous this product
 * is, and would leave two names for one act forever.
 *
 * ── Why it is not silent ─────────────────────────────────────────────
 *
 * An UPDATE on an audit table that leaves no trace is exactly the
 * dishonesty the table guards against. So every corrected row keeps
 * `payload.actionWas = 'ACCESS_SUSPENDD'`. Nothing is erased: the row
 * still says what was originally written against it, and a reader who
 * wonders why a September row is spelled one way and an August row
 * another can see the answer on the row rather than in a script that ran
 * once. A row already carrying `actionWas` is skipped, so running this
 * twice changes nothing.
 *
 * ── Running it ───────────────────────────────────────────────────────
 *
 *   node scripts/rename-suspend-action.mjs            counts, changes nothing
 *   node scripts/rename-suspend-action.mjs --apply    corrects them
 *
 * Counting first is the default because a step that only ever writes
 * eventually runs against the wrong database.
 */

import { PrismaClient } from '@prisma/client'

const MISSPELLED = 'ACCESS_SUSPENDD'
const CORRECT = 'ACCESS_SUSPENDED'

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

try {
  const rows = await prisma.automationLog.findMany({
    where: { action: MISSPELLED },
    select: { id: true, payload: true, createdAt: true, summary: true },
    orderBy: { createdAt: 'asc' },
  })

  if (rows.length === 0) {
    console.log(`No ${MISSPELLED} rows. Nothing to correct.`)
  } else {
    const first = rows[0].createdAt.toISOString().slice(0, 10)
    const last = rows[rows.length - 1].createdAt.toISOString().slice(0, 10)
    console.log(
      `${rows.length} suspension row(s) filed under ${MISSPELLED}, between ${first} and ${last}.`
    )
    console.log(`They will be filed under ${CORRECT}, each keeping actionWas="${MISSPELLED}" on its payload.`)
    console.log('Nothing else on any row changes — not the summary, not the reason, not the date.')
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.createdAt.toISOString().slice(0, 10)}  ${r.summary}`)
    }
    if (rows.length > 5) console.log(`  … and ${rows.length - 5} more`)
  }

  if (!apply) {
    console.log('Nothing was changed. Run again with --apply to correct them.')
  } else {
    let corrected = 0
    for (const r of rows) {
      const payload = r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
        ? { ...r.payload }
        : {}
      // Already corrected on an earlier run. Leave it: overwriting actionWas
      // would lose the original spelling, which is the whole point of it.
      if (payload.actionWas) continue
      payload.actionWas = MISSPELLED
      await prisma.automationLog.update({
        where: { id: r.id },
        data: { action: CORRECT, payload },
      })
      corrected++
    }
    console.log(`Corrected ${corrected}. Each row still says what it was filed under before.`)
  }
} finally {
  await prisma.$disconnect()
}
