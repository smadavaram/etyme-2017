/**
 * Whether a firm is running its own business on the record: the pricing
 * test (`runsOwnBusiness`, record 126) read from the database. A line it
 * supplies that is past draft, or a bill it issued. Being a user inside
 * another firm's record never counts.
 *
 * Its own file so the affiliate engine can ask a yes or a no and never
 * read a line itself (`affiliate-isolation.test.ts`).
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { runsOwnBusiness } from '@/lib/money/pricing'

export async function firmRunsOwnBusiness(companyId: string, db: PrismaClient | Prisma.TransactionClient): Promise<boolean> {
  const [lines, bills] = await Promise.all([
    db.sellContract.count({ where: { companyId, state: { not: 'DRAFT' } } }),
    db.invoice.count({ where: { issuedAt: { not: null }, ...(invoicesRaisedBy(companyId) as Prisma.InvoiceWhereInput) } }),
  ])
  return runsOwnBusiness(lines, bills)
}
