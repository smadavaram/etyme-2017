/**
 * Old bank checks, given to the payer the record names (record 87,
 * 2026-11-17). Run before money's payment gate reads each payer's own
 * check, so a check one payer really made keeps counting for it.
 *
 *   npx tsx scripts/bank-check-carry-over.ts            # the report: writes nothing
 *   npx tsx scripts/bank-check-carry-over.ts --write    # the carry-over
 *
 * Run by hand against a database, with DATABASE_URL set. Never by the
 * build, a route or a cron. The report lists, for every set of payment
 * details checked the old way, which payer the record names
 * (`verifiedByCompanyId`, or the payer whose supplier walk marked the bank
 * item at the moment the check was stamped) and which it cannot. The
 * carry-over writes a `BankCheck` for each one named, and nothing for the
 * rest. Safe to run twice: the second run finds nothing to write.
 *
 * The rule lives in `oldChecksReport` and `carryOverOldChecks`
 * (src/lib/vendor-master-read.ts), so the integration suite tests the
 * code this runs.
 */
import { PrismaClient } from '@prisma/client'
import { oldChecksReport, carryOverOldChecks, bankCheckReport } from '../src/lib/vendor-master-read'
import { oldChecksSummary } from '../src/lib/vendor-master'

async function main() {
  const write = process.argv.includes('--write')
  const db = new PrismaClient()
  try {
    const report = await oldChecksReport(db as never)
    for (const r of report) {
      console.log(
        r.payerId === null
          ? `${r.remitToId}  supplier ${r.supplierId}  payer unknown  (${r.why})`
          : `${r.remitToId}  supplier ${r.supplierId}  payer ${r.payerId}  from ${r.from}${r.carried ? '  (already carried)' : ''}`,
      )
    }
    const n = await carryOverOldChecks(db as never, { write })
    console.log(
      write
        ? `bank-check-carry-over: ${n.carried} of ${n.named} old checks written as the named payer's own; ${n.unplaced} name no payer and count for nobody.`
        : `bank-check-carry-over: ${oldChecksSummary({ named: n.named, unplaced: n.unplaced, held: (await bankCheckReport(db as never)).held }, { script: true })}`,
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error('bank-check-carry-over: failed.', err)
  process.exit(1)
})
