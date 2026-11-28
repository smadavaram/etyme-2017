import { prisma } from '@/lib/db'
import { mockIssuerFor, mockMayServe } from '@/lib/identity/mock-directory'
import { verifiedDomainsOf } from '@/lib/identity/provision'

/**
 * The mock directory's own reads (KNOWN-LIMITS, "the mock directory"). Its
 * people are the directory identities Etyme holds under its issuer: the
 * mock keeps nothing of its own, so it can never show a state Etyme does
 * not hold, and turning somebody off at the mock is the same act a real
 * directory performs by SCIM.
 */
export async function mockCompany(slug: string): Promise<{ id: string; name: string; slug: string; providerId: string; issuer: string; domains: string[] } | null> {
  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } })
  if (!company) return null
  const issuer = mockIssuerFor(company.slug)
  const [provider, domains] = await Promise.all([
    prisma.identityProvider.findFirst({ where: { companyId: company.id, issuer, enabled: true }, select: { id: true } }),
    verifiedDomainsOf(company.id),
  ])
  if (!provider || !mockMayServe(domains)) return null
  return { ...company, providerId: provider.id, issuer, domains }
}

export async function mockPeople(companyId: string, issuer: string) {
  return prisma.externalIdentity.findMany({
    where: { companyId, issuer },
    select: { id: true, subject: true, email: true, disabledAt: true, person: { select: { name: true } } },
    orderBy: { email: 'asc' },
  })
}
