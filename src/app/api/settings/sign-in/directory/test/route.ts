import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { discoveryFor } from '@/lib/identity/directory'
import { signInSeat, type SignInSeat } from '../../gate'

/**
 * POST /api/settings/sign-in/directory/test — runs discovery only
 *
 * Reads the directory's discovery document and checks its issuer and
 * addresses. Signs nobody in, sends no secret. Owners and Admins.
 */
export async function POST(request: NextRequest) {
  const s = await signInSeat(request, false)
  if ('error' in s && s.error) return s.error
  const { company } = s as SignInSeat
  const p = await prisma.identityProvider.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: 'asc' }, select: { type: true, issuer: true, metadataUrl: true } })
  if (!p) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Set up the directory first.' } }, { status: 404 })
  if (p.type === 'SAML') return NextResponse.json({ data: { ok: false, says: 'SAML is stored and not built yet, so there is nothing to test in this pass.' } })
  const d = await discoveryFor(p)
  return NextResponse.json({ data: d.ok ? { ok: true, says: `The directory answered: it signs as ${d.doc.issuer}.` } : { ok: false, says: d.says } })
}
