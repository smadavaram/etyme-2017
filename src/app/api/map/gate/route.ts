import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionEmail } from '@/lib/api-context'
import { reservedDomain } from '@/lib/demo-company'
import { demoEmail } from '@/lib/password'
import { seatOpens } from '@/lib/map-gate'

/**
 * GET /api/map/gate
 *
 * Whether the signed-in person may open /map: the Owner or Admin of a
 * company that is not seeded (lib/map-gate). The middleware asks this,
 * because the edge cannot reach the database. Says only yes or no.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const email = await getSessionEmail()
  if (!email || demoEmail(email)) return NextResponse.json({ data: { open: false, signedIn: !!email } })
  const seats = await prisma.context.findMany({
    where: { person: { primaryEmail: email }, revokedAt: null, companyId: { not: null } },
    select: { role: { select: { name: true } }, company: { select: { isDemo: true, domain: true } } },
  })
  const open = seatOpens(seats.map((s) => ({
    role: s.role?.name ?? null,
    seed: !s.company || s.company.isDemo || reservedDomain(s.company.domain),
  })))
  return NextResponse.json({ data: { open, signedIn: true } })
}
