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
 *     firm whose sell line this is; else the account manager the firm
 *     named on its record of the client (`Counterparty.accountManagerId`,
 *     written from the Companies screen); and only where it named none,
 *     the person who put the client on its register, where they hold the
 *     Account Manager role there. Never a guess beyond that: a firm with three account
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
  /**
   * The account manager the selling firm named on its record of the
   * client (`Counterparty.accountManagerId`), and whether they still hold
   * a seat there. Null where nobody was named.
   */
  namedAccountManager?: { personId: string; seatedAtSeller: boolean } | null
  /** Who put the client on the selling firm's register, and whether they are its account manager. */
  relationship: { personId: string; isAccountManager: boolean } | null
}

/**
 * Who sold the deal, or null where nobody is named. Pure.
 *
 * The job's owner at the selling firm first; then the account manager the
 * firm named on the client relationship; and only where it named none,
 * whoever recorded the client while holding the Account Manager role. A
 * named account manager who has left the firm is not replaced by a guess.
 */
export function soldBy(f: SoldByFacts): string | null {
  if (f.jobOwner?.seatedAtSeller) return f.jobOwner.personId
  if (f.namedAccountManager) return f.namedAccountManager.seatedAtSeller ? f.namedAccountManager.personId : null
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
      prisma.counterparty.findMany({
        where: { companyId: a.sellingFirmId, otherCompanyId: a.clientFirmId, relationship: { in: ['CLIENT', 'PRIME', 'MSP'] } },
        orderBy: { createdAt: 'asc' },
        select: { accountManagerId: true, createdById: true },
      }),
    ])
    // The account manager the firm named on the relationship is read first;
    // who recorded the client is read only where nobody was named.
    const named = relation.find((r) => r.accountManagerId)?.accountManagerId ?? null
    const recorder = named ? null : relation.find((r) => r.createdById)?.createdById ?? null
    const [namedSeat, amSeat] = await Promise.all([
      named
        ? prisma.context.findFirst({ where: { personId: named, companyId: a.sellingFirmId, revokedAt: null }, select: { id: true } })
        : null,
      recorder
        ? prisma.context.findFirst({
            where: { personId: recorder, companyId: a.sellingFirmId, revokedAt: null, role: { name: ACCOUNT_MANAGER_ROLE } },
            select: { id: true },
          })
        : null,
    ])
    const sold = soldBy({
      jobOwner: owner ? { personId: owner, seatedAtSeller: !!ownerSeat } : null,
      namedAccountManager: named ? { personId: named, seatedAtSeller: !!namedSeat } : null,
      relationship: recorder ? { personId: recorder, isAccountManager: !!amSeat } : null,
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
