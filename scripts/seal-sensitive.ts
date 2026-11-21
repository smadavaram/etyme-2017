/**
 * Seal every tax ID written before record 99 (2026-11-18).
 *
 *   npx tsx scripts/seal-sensitive.ts            # how many plain tax IDs there are
 *   npx tsx scripts/seal-sensitive.ts --write    # seal them, then empty the plain column
 *
 * Run by hand, with DATABASE_URL and ETYME_DATA_SEAL_KEY set to the same
 * key the deployment holds. A dry run by default. The plain column is
 * emptied only after the sealed value opens to the same number. The rule
 * is `sealPlainTaxIds` in src/lib/sensitive-backfill.ts, which the
 * integration suite tests.
 */
import { PrismaClient } from '@prisma/client'
import { sealPlainTaxIds } from '../src/lib/sensitive-backfill'

async function main() {
  const write = process.argv.includes('--write')
  const db = new PrismaClient()
  try {
    const r = await sealPlainTaxIds(db, { write })
    console.log(
      r.says
        ? `seal-sensitive: ${r.found} plain tax IDs found. ${r.says}`
        : write
          ? `seal-sensitive: ${r.sealed} of ${r.found} tax IDs sealed; ${r.failed} did not verify and kept their plain value.`
          : `seal-sensitive: ${r.found} tax IDs are stored in plain text. Run again with --write to seal them.`
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error('seal-sensitive: failed.', err instanceof Error ? err.message : 'unknown error')
  process.exit(1)
})
