/**
 * Give every question already asked on a firm's public page its record.
 *
 *   npx tsx scripts/backfill-page-asks.ts            # counts only; writes nothing
 *   npx tsx scripts/backfill-page-asks.ts --write    # makes the records
 *
 * Run by hand against a database, with DATABASE_URL set, after the deploy
 * that carries the PageAsk table (record 102, item 1). Before it, the
 * public Ask box wrote only a notice for each seat; the first notice of
 * each question (data.pageAsk = 'FIRST') becomes one OPEN record at the
 * firm that was asked, so the questions lost to view are listed again.
 * The copies sent to the other seats are not counted. Safe to run twice:
 * a record names the notice it was made from, and the second run makes none.
 *
 * Production is run the way `backfill-claimed-at` is: from a machine that
 * holds production's DATABASE_URL, dry run first, then --write. The rule
 * is `backfillPageAsks` in src/lib/page-asks.ts, so the integration suite
 * tests the same code this runs.
 */
import { PrismaClient } from '@prisma/client'
import { backfillPageAsks } from '../src/lib/page-asks'

async function main() {
  const write = process.argv.includes('--write')
  const db = new PrismaClient()
  try {
    const r = await backfillPageAsks(db, { write })
    console.log(
      `backfill-page-asks: ${r.found} questions stored as notices, ${r.already} already have a record, ` +
        `${write ? `${r.made} records made` : `${r.made} records would be made. Run again with --write to make them`}.`
    )
    if (r.unreadable.length > 0) {
      console.log(`backfill-page-asks: ${r.unreadable.length} could not be read as a question and were left alone: ${r.unreadable.join(', ')}`)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error('backfill-page-asks: failed.', err)
  process.exit(1)
})
