import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isMine } from '@/lib/counterparty'
import { workTogether } from '@/lib/company-create'

type Db = Prisma.TransactionClient | typeof prisma

/** What a company door answers for an id it will not speak about, and for an id that does not exist. */
export const NOT_ON_YOUR_LIST = 'That company is not on your Companies list.'

/**
 * Whether `me` has any business with this company at all: it is a record
 * `me` made and nobody has claimed, `me` holds it on its own register, or
 * the two work together (`workTogether`, which never counts a row `me`
 * wrote itself). A door that answers a company by id answers every other
 * company exactly as it answers an id that does not exist, so nobody
 * learns a stranger's name, its Kind or that it is on Etyme by guessing
 * ids (review, 2026-11-13).
 */
export async function dealsWith(
  me: string,
  company: { id: string; claimedAt: Date | null; listedById: string | null },
  db: Db = prisma,
): Promise<boolean> {
  if (company.id === me) return true
  if (isMine(company, me)) return true
  if (await db.counterparty.findFirst({ where: { companyId: me, otherCompanyId: company.id }, select: { id: true } })) return true
  return workTogether(me, company.id, db)
}
