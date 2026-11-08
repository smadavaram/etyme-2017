import { prisma } from '@/lib/db'
import type { VerificationType } from '@prisma/client'
import { supplierChoice, lapsedCoverSays, type SupplierChoice } from '@/lib/contractor-invite'
import { COVER_THAT_STOPS_WORK } from '@/lib/document-stages'

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
  // Each firm's cover, read today (the founder's tester, 2026-11-08): a
  // certificate that lapsed holds the firm back with the day it lapsed.
  const firmIds = rows.map((r) => r.otherCompany.id)
  const certificates = firmIds.length
    ? await prisma.verification.findMany({
        where: {
          companyId: { in: firmIds },
          type: { in: [...new Set([...COVER_THAT_STOPS_WORK, 'INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'])] as VerificationType[] },
        },
        select: { companyId: true, type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true },
      })
    : []
  const coverOf = (id: string) => certificates.filter((c) => c.companyId === id).map((c) => ({ ...c, type: String(c.type), status: String(c.status) }))
  return rows.map((r) => ({
    companyId: r.otherCompany.id,
    name: r.otherCompany.name,
    ...supplierChoice({ name: r.otherCompany.name, tier: r.tier, status: r.status, blocked: blockedBy.has(r.otherCompany.id), blockedReason: blockedBy.get(r.otherCompany.id) ?? null, lapsed: lapsedCoverSays(r.otherCompany.name, coverOf(r.otherCompany.id), now) }),
  }))
}
