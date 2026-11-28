import { prisma } from '@/lib/db'
import { suppliersFrom, type Suppliers } from '@/lib/counterparty'

/**
 * Who this buyer buys from — the one answer for the purchase-order
 * supplier picker and for the check that refuses an order to anybody
 * else. The rule is `suppliersFrom` in `lib/counterparty`; this file
 * only reads the rows it needs.
 *
 * `buyerId` is whose book the order is on: the client's where a program
 * office acts in the client's seat, the caller's own otherwise. The
 * caller decides that (`writingDesk` in `lib/money/seated-books`), so
 * the picker and the write read the same book.
 */
export async function suppliersOf(buyerId: string, now: Date = new Date()): Promise<Suppliers> {
  const [sells, agreements, register, buys, blocks] = await Promise.all([
    prisma.sellContract.findMany({ where: { clientCompanyId: buyerId }, select: { companyId: true } }),
    prisma.masterAgreement.findMany({ where: { clientId: buyerId }, select: { vendorId: true } }),
    prisma.counterparty.findMany({
      where: { companyId: buyerId },
      select: { otherCompanyId: true, relationship: true, status: true },
    }),
    prisma.buyContract.findMany({ where: { companyId: buyerId }, select: { vendorCompanyId: true } }),
    prisma.blacklist.findMany({
      where: {
        companyId: buyerId, targetType: 'COMPANY', liftedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { targetId: true },
    }),
  ])
  return suppliersFrom({
    buyerId,
    sellersPaid: sells.map((s) => s.companyId),
    agreementVendors: agreements.map((a) => a.vendorId),
    register,
    buysFrom: buys.map((b) => b.vendorCompanyId),
    blacklisted: blocks.map((b) => b.targetId),
  })
}
