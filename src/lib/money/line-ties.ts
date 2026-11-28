import { prisma } from '@/lib/db'
import { workTogether } from '@/lib/company-create'
import { notYoursToNameSays } from '@/lib/off-system'

/**
 * Who a contract line may name on the other side, when the other side is a
 * firm on Etyme (review, 2026-11-13: "a firm on Etyme is never tied to you
 * from your side alone").
 *
 * A sell line naming a firm as the client puts the seller on that firm's
 * supplier list (`suppliersOf` reads every sell line billed to it), and
 * routes weeks and bills to it. So the buying side has to show on the
 * client's side, the same rule an agreement where the caller sells
 * follows (`/api/contracts/agreements`): the two work together
 * (`workTogether`, which never counts a register row the caller wrote
 * itself), and something says the client buys from the seller.
 *
 * A buy line naming a firm as the supplier needs the two to work
 * together, or a buy line between them already on file. A firm that is
 * not on Etyme yet is the caller's own record and is not read here.
 */

type Db = typeof prisma

/**
 * Whether the client buys from the seller, read from what the client side
 * wrote or answered: an agreement naming the client as the client, the
 * client's own register naming the seller as a supplier or a prime (a
 * trade-link yes writes that row), an order the client issued to the
 * seller, or a job the client sent the seller. A sell line already on file
 * between the two also counts, so a pair that already bills keeps billing
 * exactly as before.
 */
export async function clientBuysFrom(sellerId: string, clientId: string, db: Db = prisma): Promise<boolean> {
  if (sellerId === clientId) return false
  const hit =
    (await db.masterAgreement.findFirst({ where: { vendorId: sellerId, clientId }, select: { id: true } })) ??
    (await db.counterparty.findFirst({
      where: { companyId: clientId, otherCompanyId: sellerId, relationship: { in: ['SUPPLIER', 'PRIME'] } },
      select: { id: true },
    })) ??
    (await db.workOrder.findFirst({ where: { issuedById: clientId, issuedToId: sellerId }, select: { id: true } })) ??
    (await db.requirementInvitation.findFirst({ where: { toCompanyId: sellerId, requirement: { companyId: clientId } }, select: { id: true } })) ??
    (await db.sellContract.findFirst({ where: { companyId: sellerId, clientCompanyId: clientId }, select: { id: true } }))
  return hit !== null
}

/** Whether the buyer may name this firm on Etyme as the supplier of a buy line. */
export async function mayBuyFromFirm(buyerId: string, supplierId: string, db: Db = prisma): Promise<boolean> {
  if (buyerId === supplierId) return false
  if (await workTogether(buyerId, supplierId, db)) return true
  return (await db.buyContract.findFirst({ where: { companyId: buyerId, vendorCompanyId: supplierId }, select: { id: true } })) !== null
}

export type LineTieVerdict = { ok: true } | { ok: false; says: string }

/**
 * The answer for a sell line naming a firm on Etyme as the client. Where
 * the two work together the caller already deals with the firm, so the
 * sentence may name it; otherwise it is answered like an id that is not
 * there.
 */
export function sellLineTie(input: { clientName: string; together: boolean; buys: boolean }): LineTieVerdict {
  if (input.together && input.buys) return { ok: true }
  if (input.together) return { ok: false, says: notBuyingYetSays(input.clientName) }
  return { ok: false, says: notYoursToNameSays('client') }
}

/** The answer for a buy line naming a firm on Etyme as the supplier. */
export function buyLineTie(input: { allowed: boolean }): LineTieVerdict {
  return input.allowed ? { ok: true } : { ok: false, says: notYoursToNameSays('supplier') }
}

export function notBuyingYetSays(clientName: string): string {
  return (
    `Nothing on Etyme shows ${clientName} buying from you yet, so you cannot bill them on a line. ` +
    'Ask them to link with you as their supplier from Companies, then record it.'
  )
}
