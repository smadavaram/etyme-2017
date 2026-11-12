import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ownerOnlyLineAt } from '@/lib/owner-proof'
import { appUrl } from '@/lib/app-url'
import { companyPolicy } from '@/lib/identity/read'
import { modeSays } from '@/lib/identity/policy'
import { IDENTITY_EVENTS, readIdentityReason } from '@/lib/identity/ledger'
import { isMockIssuer } from '@/lib/identity/mock-directory'
import { verifiedDomainsOf } from '@/lib/identity/provision'
import { hasPermission } from '@/lib/permissions'
import { recordAccess, recordRefusal } from '@/lib/access-log'
import { signInSeat, type SignInSeat } from '../gate'

/**
 * GET /api/settings/sign-in/overview — everything Settings → Sign-in draws
 *
 * The mode and its sentence, the verified domains, the directory (never its
 * secret: only whether one is set), SCIM and its token's last four
 * characters, the group-to-role rows, the people seated here and how, and
 * the company's recent identity events, read back from the access log.
 * Owners and Admins only.
 */
export async function GET(request: NextRequest) {
  const s = await signInSeat(request, false)
  if ('error' in s && s.error) return s.error
  const { company, roleName, caller } = s as SignInSeat
  // Owners and Admins both hold settings.manage; a role edited to drop it reads nothing here.
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    await recordRefusal([{ companyId: company.id }], { action: 'PROFILE_VIEW', actorPersonId: caller.person.id, actorCompanyId: company.id, reason: 'Refused reading Settings, Sign-in (its people and their sessions): the seat does not hold settings.manage.' })
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `How ${company.name}'s people sign in is read by a seat that manages its settings.` } }, { status: 403 })
  }
  const [p, provider, token, groups, roles, domains, people, events] = await Promise.all([
    companyPolicy(company.id),
    prisma.identityProvider.findFirst({
      where: { companyId: company.id }, orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, label: true, issuer: true, clientId: true, metadataUrl: true, entityId: true, certificate: true, secretRef: true, secretSealed: true, subjectClaim: true, emailClaim: true, groupsClaim: true, enabled: true, updatedAt: true },
    }),
    prisma.scimToken.findFirst({ where: { companyId: company.id, revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { last4: true, createdAt: true, lastUsedAt: true } }),
    prisma.directoryGroupRole.findMany({ where: { companyId: company.id }, select: { id: true, groupId: true, groupName: true, setAt: true, role: { select: { id: true, name: true } } }, orderBy: { setAt: 'asc' } }),
    prisma.role.findMany({ where: { companyId: company.id, NOT: { name: 'Owner' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    verifiedDomainsOf(company.id),
    prisma.context.findMany({
      where: { companyId: company.id, revokedAt: null }, take: 200, orderBy: { grantedAt: 'asc' },
      select: { id: true, source: true, suspendedAt: true, person: { select: { id: true, name: true, primaryEmail: true, sessionsEndedAt: true } }, role: { select: { name: true } } },
    }),
    prisma.accessLog.findMany({
      where: { actorCompanyId: company.id, action: { in: [...IDENTITY_EVENTS] } }, orderBy: { at: 'desc' }, take: 40,
      select: { id: true, at: true, action: true, allowed: true, reason: true },
    }),
  ])
  // The people listed are read, so the read is in the log (bulk, not awaited).
  void recordAccess(people.map((c) => ({ personId: c.person.id })), { action: 'PROFILE_VIEW', actorPersonId: caller.person.id, actorCompanyId: company.id, reason: 'Settings, Sign-in: who is seated and how' }).catch(() => undefined)
  return NextResponse.json({
    data: {
      mode: p.policy.mode,
      effective: p.effective,
      says: modeSays(p.effective, company.name),
      jit: p.row?.jit ?? false,
      scim: p.row?.scim ?? false,
      requiredAssurance: p.row?.requiredAssurance ?? null,
      dataRegion: p.row?.dataRegion ?? null,
      requireDirectorySuppliers: p.row?.requireDirectorySuppliers ?? false,
      setBy: p.row?.setBy ?? null, setAt: p.row?.setAt ?? null, reason: p.row?.reason ?? null,
      mayChange: roleName === 'Owner',
      // Beside the form for an Admin: the gate's sentence with its link where no
      // Owner is verified yet, else the Owner-only sentence (lib/owner-gate).
      ownerLine: roleName === 'Owner' ? null : await ownerOnlyLineAt(company.id, 'SIGN_IN_MODE'),
      slug: (await prisma.company.findUniqueOrThrow({ where: { id: company.id }, select: { slug: true } })).slug,
      domains,
      directory: provider ? {
        type: provider.type, label: provider.label, issuer: provider.issuer, clientId: provider.clientId, metadataUrl: provider.metadataUrl,
        entityId: provider.entityId, hasCertificate: Boolean(provider.certificate),
        secret: provider.secretRef ? `in the secret store as ${provider.secretRef}` : provider.secretSealed ? 'set, locked' : 'not set',
        subjectClaim: provider.subjectClaim, emailClaim: provider.emailClaim, groupsClaim: provider.groupsClaim,
        enabled: provider.enabled, isMock: isMockIssuer(provider.issuer), updatedAt: provider.updatedAt,
      } : null,
      scimBase: `${appUrl()}/scim/v2`,
      scimToken: token,
      groups: groups.map((g) => ({ id: g.id, groupId: g.groupId, groupName: g.groupName, role: g.role.name, roleId: g.role.id, setAt: g.setAt })),
      roles,
      people: people.map((c) => ({ contextId: c.id, personId: c.person.id, name: c.person.name, email: c.person.primaryEmail, role: c.role?.name ?? null, source: c.source, paused: Boolean(c.suspendedAt), sessionsEndedAt: c.person.sessionsEndedAt })),
      events: events.map((e) => {
        const r = readIdentityReason(e.reason)
        return { id: e.id, at: e.at, action: e.action, allowed: e.allowed, surface: r?.surface ?? null, policy: r?.policy ?? null, says: r?.says ?? e.reason ?? '' }
      }),
    },
  })
}
