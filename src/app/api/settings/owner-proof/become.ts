/**
 * The write behind "Become Owner": the domain proof recorded with who and
 * when (the person proof is already a row), the seat moved to Owner where
 * it is an Admin's, and the company marked as having a verified Owner, in
 * one transaction with the row in the log.
 */
import { prisma } from '@/lib/db'
import { proofFactsAt, proofStanding, mayBecomeOwner, type BecomeVerdict } from '@/lib/owner-proof'
import { ownerRoleId } from '../owners/act'
import { ADMIN_ROLE, ADMIN_PERMISSIONS, isNarrowedAdmin } from '@/lib/company-defaults'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * A company formed under the proof rule starts with the full Admin so it
 * works at once (lib/company-defaults FOUNDING_ADMIN). The moment its first
 * Owner is verified the Admin role narrows to people, roles, settings and
 * integrations, recorded like the Owner's own "Narrow Admin" press. A
 * company formed before the rule, or one whose Admin is already narrowed,
 * is left alone. Returns whether it narrowed.
 */
export async function narrowFoundingAdmin(
  tx: Tx,
  input: { companyId: string; companyName: string; byPersonId: string; personName: string; firstVerification: boolean; underRule: boolean },
): Promise<boolean> {
  if (!input.firstVerification || !input.underRule) return false
  const admin = await tx.role.findFirst({ where: { companyId: input.companyId, name: ADMIN_ROLE }, select: { id: true, permissions: true } })
  if (!admin || isNarrowedAdmin(admin.permissions)) return false
  await tx.role.update({ where: { id: admin.id }, data: { permissions: [...ADMIN_PERMISSIONS] } })
  await tx.automationLog.create({
    data: {
      companyId: input.companyId,
      action: 'ADMIN_NARROWED',
      summary: `The Admin role at ${input.companyName} narrowed to people, roles, settings and integrations when ${input.personName} became its verified Owner`,
      reason: 'A company formed under the proof rule keeps the full Admin only until its first Owner is verified.',
      payload: { roleId: admin.id, was: admin.permissions, now: [...ADMIN_PERMISSIONS], byPersonId: input.byPersonId },
      reversible: true,
    },
  })
  return true
}

export async function becomeOwner(input: {
  companyId: string
  contextId: string
  personId: string
  personName: string
  /** Who pressed it: the person, or a Superadmin seating a one-person firm's own person. */
  byPersonId: string
}): Promise<{ ok: true; says: string } | Extract<BecomeVerdict, { ok: false }>> {
  const [company, seat, owners, facts] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { name: true, ownerProofRequiredAt: true, ownerVerifiedAt: true } }),
    prisma.context.findFirst({
      where: { id: input.contextId, companyId: input.companyId, personId: input.personId, revokedAt: null },
      select: { id: true, suspendedAt: true, role: { select: { name: true } } },
    }),
    prisma.context.count({ where: { companyId: input.companyId, revokedAt: null, suspendedAt: null, role: { name: 'Owner' } } }),
    proofFactsAt(input.companyId, input.personId),
  ])
  const standing = proofStanding(facts)
  const v = mayBecomeOwner({
    gate: company, standing, seatRole: seat?.role?.name ?? null, seatLive: !!seat && !seat.suspendedAt,
    liveOwners: owners, companyName: company.name,
  })
  if (!v.ok) return v
  const now = new Date()
  let narrowed = false
  await prisma.$transaction(async (tx) => {
    if (standing.needsDomain) {
      await tx.ownerProof.create({
        data: {
          companyId: input.companyId, personId: input.personId, kind: 'DOMAIN',
          source: facts.dnsDomain ? 'DNS' : 'DIRECTORY',
          reference: facts.dnsDomain ?? facts.directory,
          confirmed: true, recordedById: input.byPersonId, recordedAt: now,
        },
      })
    }
    if (v.reseat) {
      await tx.context.update({
        where: { id: input.contextId },
        data: { roleId: await ownerRoleId(tx, input.companyId), grantedById: input.byPersonId, grantedAt: now, grantReason: 'Became the Owner on both proofs', expiresAt: null },
      })
    }
    if (!company.ownerVerifiedAt) {
      await tx.company.update({ where: { id: input.companyId }, data: { ownerVerifiedAt: now, ownerVerifiedById: input.personId } })
    }
    narrowed = await narrowFoundingAdmin(tx, {
      companyId: input.companyId, companyName: company.name, byPersonId: input.byPersonId, personName: input.personName,
      firstVerification: !company.ownerVerifiedAt, underRule: company.ownerProofRequiredAt !== null,
    })
    await tx.automationLog.create({
      data: {
        companyId: input.companyId,
        action: 'OWNER_VERIFIED',
        summary: v.reseat
          ? `${input.personName} became the Owner of ${company.name} on both proofs`
          : `${input.personName} recorded both proofs as an Owner of ${company.name}`,
        reason: [standing.needsDomain ? standing.domain.says : null, standing.person.says].filter(Boolean).join(' '),
        payload: { personId: input.personId, contextId: input.contextId, reseated: v.reseat, at: now.toISOString() },
        reversible: false,
      },
    })
  })
  return {
    ok: true,
    says: v.reseat
      ? `You are the Owner of ${company.name}. Paying, bank details, signing, the company type, the sign-in mode and giving access by team are open.${narrowed ? ' Admins now hold people, roles, settings and integrations; give money or contract work through Finance, AP & Payroll or Contract Manager.' : ''}`
      : `Both proofs are recorded for you at ${company.name}.`,
  }
}
