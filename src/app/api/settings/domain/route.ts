import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { setupDoor } from '../setup/door'
import { connectDomainView, type DomainClaimRow } from '@/lib/domains-owned'

/**
 * GET /api/settings/domain — the "Connect your domain" screen, for the
 * Owner and the Admin (the setup checklist's door). It reads the company's
 * claims and says where each stands. Claiming and checking go through the
 * one DNS proof the setup item already has, PUT /api/settings/setup/domain,
 * so the setup item and this screen cannot disagree.
 */
export async function GET(request: NextRequest) {
  const door = await setupDoor(request, 'Connecting your domain')
  if (door.error) return door.error
  const companyId = door.caller.company.id
  const [c, claims] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, domain: true, domainVerified: true } }),
    prisma.companyDomain.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, domain: true, verifiedAt: true, verifiedVia: true, proofToken: true },
    }),
  ])
  const rows: DomainClaimRow[] = [
    // A domain the company held as verified before claims existed.
    ...(c.domain && !claims.some((d) => d.domain === c.domain) && !/\.(example|invalid|local|test)$/.test(c.domain)
      ? [{ id: null, domain: c.domain, verifiedAt: null, verifiedVia: null, proofToken: null, verified: c.domainVerified }]
      : []),
    ...claims,
  ]
  return NextResponse.json({ data: { company: c.name, ...connectDomainView(rows) } })
}
