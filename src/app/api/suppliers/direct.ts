import { prisma } from '@/lib/db'

/**
 * The firms a company buys from directly — its own supplier register.
 *
 * The same union `GET /api/suppliers` draws: an agreement with the firm,
 * a standing set on it, an invitation sent to it, a contract it bills
 * this company on, or an onboarding this company approved. A firm this
 * company reaches only through a prime is none of those — its contract is
 * with the prime — so it is never here.
 *
 * Read by the release door, which sent Northbend Athletic's job to
 * whatever id it was handed: the panel offered CloudEPA, Computer
 * Systems' sub-vendor, out of the whole company directory, and the door
 * took it. A sub-vendor's name is the prime's to keep (CLAUDE.md,
 * 2026-09-17), and a job sent to it would be the client going round the
 * prime.
 */
export async function directSupplierIds(companyId: string): Promise<Set<string>> {
  const [agreements, standings, invites, lines, approved] = await Promise.all([
    prisma.masterAgreement.findMany({ where: { clientId: companyId }, select: { vendorId: true } }),
    prisma.counterparty.findMany({
      where: { companyId, relationship: 'SUPPLIER' },
      select: { otherCompanyId: true },
    }),
    prisma.supplierInvite.findMany({ where: { byId: companyId, state: { not: 'REVOKED' } }, select: { companyId: true } }),
    prisma.sellContract.findMany({ where: { clientCompanyId: companyId }, select: { companyId: true }, distinct: ['companyId'] }),
    prisma.supplierRequest.findMany({
      where: { companyId, state: 'APPROVED', firmCompanyId: { not: null } },
      select: { firmCompanyId: true },
    }),
  ])
  return new Set<string>([
    ...agreements.map((a) => a.vendorId),
    ...standings.map((s) => s.otherCompanyId!).filter(Boolean),
    ...invites.map((i) => i.companyId),
    ...lines.map((l) => l.companyId),
    ...approved.map((r) => r.firmCompanyId!).filter(Boolean),
  ])
}

/**
 * The firms a company reaches only through somebody else: a firm with a
 * contract for work at this company's sites, billed to a firm other than
 * this company, and no direct relationship of its own. In a chain that
 * is the prime's sub-vendor — the name the prime keeps.
 *
 * A firm with no history here at all is not in this set: it is simply
 * new, and releasing to a new firm is the program office's call.
 */
export async function reachedOnlyThrough(companyId: string): Promise<Set<string>> {
  const [below, own] = await Promise.all([
    prisma.sellContract.findMany({
      where: { endClientCompanyId: companyId, clientCompanyId: { not: companyId } },
      select: { companyId: true },
      distinct: ['companyId'],
    }),
    directSupplierIds(companyId),
  ])
  return new Set(below.map((b) => b.companyId).filter((id) => !own.has(id)))
}
