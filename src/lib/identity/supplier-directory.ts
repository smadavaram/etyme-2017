import { prisma } from '@/lib/db'
import { effectiveMode, type EffectiveMode } from '@/lib/identity/policy'

/**
 * A client that approves only suppliers whose people all sign in through
 * their own directory (founder, 2026-11-11, "Hybrid is the Owner's
 * choice": "a client may require directory-only suppliers, which is then
 * checked when it approves one").
 *
 * WARN, capture a reason, proceed (Addendum E): a supplier's sign-in mode
 * is not a legally grounded block, so the approval says so in a sentence
 * and goes ahead once somebody gives the reason. Read by the supplier
 * approval, which is etyme-demand's route (`app/api/supplier-requests`);
 * this file decides and words it, the route asks for and keeps the reason.
 */

/** The sentence, or null where nothing needs saying. Pure. */
export function directorySupplierWarning(a: { clientName: string; requires: boolean; supplierName: string; supplierMode: EffectiveMode }): string | null {
  if (!a.requires || a.supplierMode === 'SSO_ONLY') return null
  const how = a.supplierMode === 'HYBRID'
    ? 'lets some of its people sign in on public addresses'
    : a.supplierMode === 'INVITE_ONLY' ? 'signs its people in by invitation, not through its own directory' : 'has not chosen to sign its people in through its own directory'
  return `${a.clientName} approves only suppliers whose people sign in through their own directory, and ${a.supplierName} ${how}. Say why you are approving it anyway; the reason is kept with the approval.`
}

/** The same question, read from the record for one client and one supplier. */
export async function supplierDirectoryCheck(clientCompanyId: string, supplierCompanyId: string): Promise<string | null> {
  const [client, supplier, clientPolicy, supplierPolicy, supplierDirs] = await Promise.all([
    prisma.company.findUnique({ where: { id: clientCompanyId }, select: { name: true } }),
    prisma.company.findUnique({ where: { id: supplierCompanyId }, select: { name: true } }),
    prisma.companySignInPolicy.findUnique({ where: { companyId: clientCompanyId }, select: { requireDirectorySuppliers: true } }),
    prisma.companySignInPolicy.findUnique({ where: { companyId: supplierCompanyId }, select: { mode: true } }),
    prisma.identityProvider.findMany({ where: { companyId: supplierCompanyId, enabled: true }, select: { issuer: true } }),
  ])
  if (!client || !supplier) return null
  const mode = effectiveMode({ companyId: supplierCompanyId, companyName: supplier.name, mode: (supplierPolicy?.mode as any) ?? null, issuers: supplierDirs.map((d) => d.issuer) })
  return directorySupplierWarning({ clientName: client.name, requires: clientPolicy?.requireDirectorySuppliers === true, supplierName: supplier.name, supplierMode: mode })
}
