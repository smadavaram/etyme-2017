/**
 * A colleague's seat, with the Member role at once.
 *
 * Decided by the founder, 2026-10-07: a colleague who signs in on a
 * claimed domain gets a seat with a default role at once, and the owner
 * is told who joined and what to give them. Member reads the holder's own
 * work and nothing else (lib/company-defaults), so a stranger who shares a
 * domain learns nothing about the firm, and a real colleague is not left
 * looking at a page that refuses them while somebody remembers to act.
 *
 * Two doors seat a colleague this way: a Microsoft or Google sign-in on a
 * claimed domain (`app/api/onboarding`), and a password sign-up naming a
 * company's Etyme address from the owner's own email domain
 * (`lib/password-door`). One function, so both seat the same way.
 *
 * A company formed before Member existed gets it here, the same way the
 * access screen would give it to them (ensureDefaultRoles).
 */

import { prisma } from '@/lib/db'
import { MEMBER_ROLE } from '@/lib/company-defaults'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { tellOwnerSomebodyJoined } from '@/lib/notify/joined'

export async function seatAsMember(personId: string, companyId: string): Promise<{ roleName: string }> {
  // Always, not only when Member is missing: a company formed before
  // 2026-10-08 holds a Member that read the firm's contracts and hours,
  // and the colleague arriving now is seated on the corrected one.
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { kind: true } })
  await ensureDefaultRoles(companyId, company?.kind ?? 'VENDOR')
  const role = await prisma.role.findFirst({ where: { companyId, name: MEMBER_ROLE }, select: { id: true } })
  await prisma.context.create({
    data: { personId, type: 'EMPLOYEE', companyId, roleId: role?.id ?? null },
  })
  // Conversation's notice: every owner and admin, and the joiner. Never throws.
  void tellOwnerSomebodyJoined(companyId, personId, MEMBER_ROLE)
  return { roleName: MEMBER_ROLE }
}
