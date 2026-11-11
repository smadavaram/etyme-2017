import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import { companyPolicy } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { newScimToken } from '@/lib/identity/scim'
import { signInSeat, type SignInSeat } from '../gate'

/**
 * POST   /api/settings/sign-in/scim — issue a SCIM token, replacing any before it; shown once
 * DELETE /api/settings/sign-in/scim — revoke it
 *
 * Only the token's sha256 and last four characters are kept. The Owner
 * issues and revokes; SSO_CONFIGURED is written with each.
 */
export async function POST(request: NextRequest) {
  const s = await signInSeat(request, true)
  if ('error' in s && s.error) return s.error
  const { company, by, caller } = s as SignInSeat
  const t = newScimToken()
  const policy = (await companyPolicy(company.id)).effective
  await prisma.$transaction(async (tx) => {
    await tx.scimToken.updateMany({ where: { companyId: company.id, revokedAt: null }, data: { revokedAt: new Date(), revokedById: by } })
    await tx.scimToken.create({ data: { companyId: company.id, tokenHash: t.tokenHash, last4: t.last4, createdById: by, label: 'Settings, Sign-in' } })
    await recordIdentityEvent({
      event: 'SSO_CONFIGURED', companyId: company.id, actorPersonId: by, subject: { companyId: company.id }, policy, surface: 'WEB',
      says: `${caller.person.name} issued a SCIM token ending ${t.last4} for ${company.name}; any earlier token stopped working.`,
    }, tx)
  })
  return NextResponse.json({ data: { token: t.token, last4: t.last4, base: `${appUrl()}/scim/v2`, says: 'Copy this token now. It is shown once and never again.' } }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: NextRequest) {
  const s = await signInSeat(request, true)
  if ('error' in s && s.error) return s.error
  const { company, by, caller } = s as SignInSeat
  const policy = (await companyPolicy(company.id)).effective
  const n = await prisma.$transaction(async (tx) => {
    const r = await tx.scimToken.updateMany({ where: { companyId: company.id, revokedAt: null }, data: { revokedAt: new Date(), revokedById: by } })
    if (r.count) {
      await recordIdentityEvent({ event: 'SSO_CONFIGURED', companyId: company.id, actorPersonId: by, subject: { companyId: company.id }, policy, surface: 'WEB', says: `${caller.person.name} revoked ${company.name}'s SCIM token.` }, tx)
    }
    return r.count
  })
  return NextResponse.json({ data: { says: n ? 'The SCIM token is revoked.' : 'There was no SCIM token to revoke.' } })
}
