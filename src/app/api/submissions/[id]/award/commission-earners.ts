/**
 * Who earns the award's default commissions, and the award's call to
 * money's writer.
 *
 * CLAUDE.md, "Commission is an object on the sell line and on the buy
 * line" (the founder, 2026-11-08): a sales commission sits on the sell
 * line and is earned by whoever sold the deal; a recruiting commission
 * sits on the buy line and is earned by whoever recruited the person. The
 * award writes the firm's default rows (`writeDefaultCommissions` in
 * lib/money/commission-write, from `Company.commissionDefaults`, shipped
 * as none) and this decides only the two names.
 *
 *   - **Recruited by**: the seat that put the person forward
 *     (`Submission.submittedById`, written by every door since
 *     2026-11-08). Null on older rows, and then nobody is named.
 *   - **Sold by**: the job's owner, where that person holds a seat at the
 *     firm whose sell line this is; else the account manager on that
 *     firm's own record of the client relationship (the person who put
 *     the client on its register, where they hold the Account Manager
 *     role there). Never a guess beyond that: a firm with three account
 *     managers and no owner on the job is told nobody was named.
 *
 * A missing person or rate writes nothing and is said in the award's
 * result. It never refuses the award: a placement is not held up because
 * a firm has not named who sold it.
 */

import { prisma } from '@/lib/db'
import { writeDefaultCommissions } from '@/lib/money/commission-write'

/** The role that holds a client relationship at a staffing firm. */
export const ACCOUNT_MANAGER_ROLE = 'Account Manager'

export interface SoldByFacts {
  /** The job's owner, else whoever raised it, and whether they sit at the selling firm. */
  jobOwner: { personId: string; seatedAtSeller: boolean } | null
  /** Who put the client on the selling firm's register, and whether they are its account manager. */
  relationship: { personId: string; isAccountManager: boolean } | null
}

/** Who sold the deal, or null where nobody is named. Pure. */
export function soldBy(f: SoldByFacts): string | null {
  if (f.jobOwner?.seatedAtSeller) return f.jobOwner.personId
  if (f.relationship?.isAccountManager) return f.relationship.personId
  return null
}

/** Who recruited the person: the seat that put them forward. Pure. */
export function recruitedBy(submission: { submittedById: string | null }): string | null {
  return submission.submittedById ?? null
}

/** What the award's result says about its commissions. */
export interface AwardCommissions {
  written: number
  /** One sentence per default the award could not write; empty where all were, or none was set. */
  notWritten: string[]
}

/**
 * Read who sold and who recruited, and write the firm's default rows.
 * Never throws: a commission that could not be written is said, and the
 * award stands.
 */
export async function awardCommissions(a: {
  sellingFirmId: string
  clientFirmId: string
  sellContractId: string
  buyContractId: string | null
  startDate: Date
  submittedById: string | null
  job: { ownerId: string | null; raisedById: string | null }
  setById: string
}): Promise<AwardCommissions> {
  try {
    const owner = a.job.ownerId ?? a.job.raisedById
    const [ownerSeat, relation] = await Promise.all([
      owner
        ? prisma.context.findFirst({ where: { personId: owner, companyId: a.sellingFirmId, revokedAt: null }, select: { id: true } })
        : null,
      prisma.counterparty.findFirst({
        where: { companyId: a.sellingFirmId, otherCompanyId: a.clientFirmId, relationship: { in: ['CLIENT', 'PRIME', 'MSP'] }, createdById: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { createdById: true },
      }),
    ])
    const amSeat = relation?.createdById
      ? await prisma.context.findFirst({
          where: { personId: relation.createdById, companyId: a.sellingFirmId, revokedAt: null, role: { name: ACCOUNT_MANAGER_ROLE } },
          select: { id: true },
        })
      : null
    const sold = soldBy({
      jobOwner: owner ? { personId: owner, seatedAtSeller: !!ownerSeat } : null,
      relationship: relation?.createdById ? { personId: relation.createdById, isAccountManager: !!amSeat } : null,
    })
    const out = await writeDefaultCommissions(a.sellingFirmId, {
      sellContractId: a.sellContractId,
      buyContractId: a.buyContractId,
      soldById: sold,
      recruitedById: recruitedBy({ submittedById: a.submittedById }),
      startDate: a.startDate,
      setById: a.setById,
    })
    return { written: out.written.length, notWritten: out.notWritten }
  } catch {
    return { written: 0, notWritten: ['The default commissions could not be written. The award stands; set them on the line.'] }
  }
}
