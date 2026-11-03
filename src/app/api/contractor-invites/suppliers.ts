import { prisma } from '@/lib/db'
import { supplierChoice, type SupplierChoice } from '@/lib/contractor-invite'

/**
 * The client's own suppliers, each with whether it may take somebody on
 * and, where not, the sentence why. One read for the picker on
 * Contractors, the `pick` action and the person's own link, so a firm the
 * screen offers is a firm the route accepts.
 */
export type SupplierOption = { companyId: string; name: string } & SupplierChoice

export async function supplierOptions(companyId: string, now: Date, onlyId?: string): Promise<SupplierOption[]> {
  const [rows, blocks] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId, relationship: 'SUPPLIER', ...(onlyId ? { otherCompanyId: onlyId } : {}) },
      select: { tier: true, status: true, otherCompany: { select: { id: true, name: true } } },
      orderBy: { otherCompany: { name: 'asc' } },
    }),
    prisma.blacklist.findMany({
      where: {
        companyId, targetType: 'COMPANY', liftedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(onlyId ? { targetId: onlyId } : {}),
      },
      select: { targetId: true, reason: true },
    }),
  ])
  const blockedBy = new Map(blocks.map((b) => [b.targetId, b.reason]))
  return rows.map((r) => ({
    companyId: r.otherCompany.id,
    name: r.otherCompany.name,
    ...supplierChoice({ name: r.otherCompany.name, tier: r.tier, status: r.status, blocked: blockedBy.has(r.otherCompany.id), blockedReason: blockedBy.get(r.otherCompany.id) ?? null }),
  }))
}
