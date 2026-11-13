import { prisma } from '@/lib/db'
import { suppliersOf } from '@/lib/suppliers-of'
import { supplierStanding, firmNameKey, type Suppliers } from '@/lib/counterparty'
import { mayWriteOrder, type CompanyStanding } from '@/lib/off-system'
import { standingWith } from '@/app/api/companies/positions'

/**
 * Who a purchase order on a loaded sheet goes to, read the way
 * POST /api/purchase-orders reads it, never a second rule.
 *
 * The sheet names the supplier by name. It was looked up by that name
 * across every company on Etyme and the first hit took the order, so a
 * firm could write an order to another firm's record, to a firm on Etyme
 * it does not work with, or to a record of its own that holds no Supplier
 * position (review, 2026-11-13). Now the name is matched only among the
 * firms this buyer may write an order to: its own suppliers
 * (`suppliersOf`, the picker's own answer, blocked ones included so the
 * block is said) and the records it made itself. The one match then goes
 * through `mayWriteOrder` with `standingWith`, exactly as the route does.
 */

export interface OrderSellerCandidate extends CompanyStanding {
  kind: string
  listedById: string | null
}

export type OrderSellerPick =
  | { ok: true; seller: OrderSellerCandidate }
  | { ok: false; code: 'NO_SUCH_SUPPLIER' | 'TWO_OF_ONE_NAME'; says: string }

/**
 * The one candidate whose name is the one typed, any capitals, spaces or
 * punctuation. Only the name the caller typed is echoed. Pure.
 */
export function pickOrderSeller(typed: string, candidates: readonly OrderSellerCandidate[]): OrderSellerPick {
  const key = firmNameKey(typed)
  const hits = key ? candidates.filter((c) => firmNameKey(c.name) === key) : []
  if (hits.length === 1) return { ok: true, seller: hits[0] }
  if (hits.length > 1) {
    return {
      ok: false, code: 'TWO_OF_ONE_NAME',
      says: `Two companies on your list are called "${typed}". Raise this order from Purchase orders, where you pick which one.`,
    }
  }
  return {
    ok: false, code: 'NO_SUCH_SUPPLIER',
    says: `None of your suppliers is called "${typed}". Add it on Companies and extend it to Supplier, then load this row again.`,
  }
}

/** The companies a sheet's orders may name, read once per load. */
export async function orderSellerCandidates(buyerId: string): Promise<{ suppliers: Suppliers; candidates: OrderSellerCandidate[] }> {
  const suppliers = await suppliersOf(buyerId)
  const ids = [...suppliers.ids, ...suppliers.blocked].filter((id) => id !== buyerId)
  const candidates = await prisma.company.findMany({
    where: { OR: [{ id: { in: ids } }, { listedById: buyerId, claimedAt: null }] },
    select: { id: true, name: true, kind: true, claimedAt: true, listedById: true },
  })
  return { suppliers, candidates }
}

export type OrderSellerVerdict =
  | { ok: true; seller: OrderSellerCandidate }
  | { ok: false; says: string; subjectId: string }

/**
 * May this buyer write this row's order, and to whom. A refusal carries
 * the sentence for the row and whose record it is logged against: the
 * seller where one was found, else the buyer itself, so a name that
 * matched nobody of the buyer's is never tied to anybody.
 */
export async function orderSellerFor(
  buyer: CompanyStanding,
  typed: string,
  read: { suppliers: Suppliers; candidates: readonly OrderSellerCandidate[] },
): Promise<OrderSellerVerdict> {
  const pick = pickOrderSeller(typed, read.candidates)
  if (!pick.ok) return { ok: false, says: pick.says, subjectId: buyer.id }
  const seller = pick.seller
  const allowed = mayWriteOrder({
    callerCompanyId: buyer.id,
    buyer,
    seller,
    sellerStanding: supplierStanding(read.suppliers, seller.id),
    sellerHeld: await standingWith(buyer.id, seller),
  })
  if (!allowed.ok) return { ok: false, says: allowed.says, subjectId: seller.id }
  return { ok: true, seller }
}
