/**
 * Every firm that signed up is on Etyme. Say so, once.
 *
 *   npx tsx scripts/backfill-claimed-at.ts            # how many it would claim
 *   npx tsx scripts/backfill-claimed-at.ts --write    # claim them
 *
 * Run by hand against a database, with DATABASE_URL set, after the deploy
 * that carries `createCompany` setting `claimedAt` (2026-10-19). Until
 * then every signed-up firm read as a shell — "not on Etyme" — because
 * nothing wrote the column. A company where somebody holds a seat with a
 * role is claimed on the day it was made; a shell nobody has joined is
 * left alone. Safe to run twice: the second run finds nothing.
 *
 * Where nobody holds DATABASE_URL (production), staff run the same rule
 * through POST /api/staff/backfill-claimed-at with the CRON_SECRET bearer:
 * it counts by default and marks on {"write": true}.
 *
 * The rule lives in `claimSignedUpFirms` (src/lib/company-create.ts), so
 * the integration suite tests the same SQL this runs.
 */
import { PrismaClient } from '@prisma/client'
import { claimSignedUpFirms } from '../src/lib/company-create'

async function main() {
  const write = process.argv.includes('--write')
  const db = new PrismaClient()
  try {
    const r = await claimSignedUpFirms(db, { write })
    console.log(
      write
        ? `backfill-claimed-at: ${r.claimed} of ${r.found} signed-up firms marked as on Etyme.`
        : `backfill-claimed-at: ${r.found} signed-up firms read as not on Etyme. Run again with --write to put them right.`
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error('backfill-claimed-at: failed.', err)
  process.exit(1)
})
