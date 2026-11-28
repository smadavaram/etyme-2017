import type { PrismaClient } from '@prisma/client'
import { dataSealKeySet, openTaxId, taxIdToWrite } from '@/lib/sensitive'

/**
 * Move every tax ID written before record 99 off the plain column
 * (scripts/seal-sensitive.ts). Counts by default; with `write` it seals
 * each one, opens the sealed value again, and empties the plain column
 * only where the sealed one opens to the same number. A row that does not
 * verify keeps its plain value and is counted as failed. Safe to run
 * twice: the second run finds nothing.
 */
export async function sealPlainTaxIds(
  db: Pick<PrismaClient, 'company' | 'remitTo'>,
  o: { write: boolean },
  env: Record<string, string | undefined> = process.env,
): Promise<{ found: number; sealed: number; failed: number; says: string | null }> {
  const where = { taxId: { not: null } }
  const [companies, remits] = await Promise.all([
    db.company.findMany({ where, select: { id: true, taxId: true } }),
    db.remitTo.findMany({ where, select: { id: true, taxId: true } }),
  ])
  const rows = [
    ...companies.map((r) => ({ ...r, table: 'company' as const })),
    ...remits.map((r) => ({ ...r, table: 'remitTo' as const })),
  ].filter((r) => r.taxId && r.taxId.trim())
  if (!o.write) return { found: rows.length, sealed: 0, failed: 0, says: null }
  if (!dataSealKeySet(env)) return { found: rows.length, sealed: 0, failed: 0, says: 'No data key is set, so nothing was sealed.' }
  let sealed = 0
  let failed = 0
  for (const r of rows) {
    const plain = r.taxId!.trim()
    const w = taxIdToWrite(plain, env)
    if (!w.ok || openTaxId({ taxIdSealed: w.data.taxIdSealed }, env) !== plain) { failed++; continue }
    const data = { taxIdSealed: w.data.taxIdSealed, taxIdLast4: w.data.taxIdLast4 }
    // Sealed first, then checked as written, then the plain column emptied.
    if (r.table === 'company') {
      const back = await db.company.update({ where: { id: r.id }, data, select: { taxIdSealed: true } })
      if (openTaxId(back, env) !== plain) { failed++; continue }
      await db.company.update({ where: { id: r.id }, data: { taxId: null } })
    } else {
      const back = await db.remitTo.update({ where: { id: r.id }, data, select: { taxIdSealed: true } })
      if (openTaxId(back, env) !== plain) { failed++; continue }
      await db.remitTo.update({ where: { id: r.id }, data: { taxId: null } })
    }
    sealed++
  }
  return { found: rows.length, sealed, failed, says: null }
}
