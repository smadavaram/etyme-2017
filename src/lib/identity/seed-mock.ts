import { prisma as db } from '@/lib/db'
import { MOCK_SECRET_REF, mockClientId, mockIssuerFor, mockMayServe } from '@/lib/identity/mock-directory'
import { verifiedDomainsOf } from '@/lib/identity/provision'

/**
 * The demo's company directory (founder, 2026-11-11, "a mock identity
 * provider ... gated to reserved demo addresses").
 *
 * Northbend Athletic gets the mock directory, turned on, under the hybrid
 * mode: its seeded people keep signing in as they did, and two people from
 * its directory sign in through it. A demo walk switches Northbend to
 * directory only and back (KNOWN-LIMITS, "the demo checks"); the seed never
 * does, because directory only would close the demo door on every seeded
 * Northbend seat, which is the rule working.
 *
 * The two people are made the way SCIM makes them (ExternalIdentity by
 * issuer and subject, a seat with source SCIM): Ines Okafor, an Owner, so
 * the walk can choose directory only from a directory session; and Mateo
 * Silva, seated as Hiring Manager through the directory group
 * "nb-hiring-managers". Writes nothing on a second seeding.
 */

export const MOCK_PEOPLE = [
  { subject: 'nb-0001', email: 'ines.okafor@northbend.example', name: 'Ines Okafor', role: 'Owner' },
  { subject: 'nb-0002', email: 'mateo.silva@northbend.example', name: 'Mateo Silva', role: 'Hiring Manager' },
] as const

export const MOCK_GROUP = { groupId: 'nb-hiring-managers', groupName: 'Northbend hiring managers', role: 'Hiring Manager' } as const

export async function seedMockDirectory(slug = 'world-nike'): Promise<{ written: boolean }> {
  const company = await db.company.findUnique({ where: { slug }, select: { id: true, slug: true } })
  if (!company) return { written: false }
  // The mock never serves a company with a registrable domain.
  if (!mockMayServe(await verifiedDomainsOf(company.id))) return { written: false }
  const issuer = mockIssuerFor(company.slug)
  if (await db.identityProvider.findUnique({ where: { companyId_issuer: { companyId: company.id, issuer } }, select: { id: true } })) {
    return { written: false }
  }
  const roles = await db.role.findMany({ where: { companyId: company.id, name: { in: ['Owner', 'Hiring Manager'] } }, select: { id: true, name: true } })
  const roleId = (name: string) => roles.find((r) => r.name === name)?.id ?? null

  await db.$transaction(async (tx) => {
    const provider = await tx.identityProvider.create({
      data: {
        companyId: company.id, type: 'OIDC', label: 'Northbend directory (mock)', issuer,
        clientId: mockClientId(company.slug), secretRef: MOCK_SECRET_REF, enabled: true,
      },
      select: { id: true },
    })
    await tx.companySignInPolicy.upsert({
      where: { companyId: company.id },
      create: { companyId: company.id, mode: 'HYBRID', jit: true, scim: true, reason: 'Seeded for the demo: the mock directory beside the seeded people.' },
      update: {},
    })
    const hm = roleId(MOCK_GROUP.role)
    if (hm) {
      await tx.directoryGroupRole.create({
        data: { companyId: company.id, identityProviderId: provider.id, groupId: MOCK_GROUP.groupId, groupName: MOCK_GROUP.groupName, roleId: hm },
      })
    }
    for (const p of MOCK_PEOPLE) {
      const person = (await tx.person.findUnique({ where: { primaryEmail: p.email }, select: { id: true } }))
        ?? (await tx.person.create({ data: { primaryEmail: p.email, name: p.name, emailVerifiedAt: new Date() }, select: { id: true } }))
      const ei = await tx.externalIdentity.create({
        data: { personId: person.id, companyId: company.id, identityProviderId: provider.id, issuer, subject: p.subject, email: p.email },
        select: { id: true },
      })
      await tx.context.create({
        data: {
          personId: person.id, companyId: company.id, type: 'EMPLOYEE', roleId: roleId(p.role), source: 'SCIM', externalIdentityId: ei.id,
          grantReason: 'Provisioned by Northbend Athletic’s directory (the demo’s mock).',
        },
      })
    }
  })
  return { written: true }
}
