import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { logAccess } from '@/lib/access-log'
import { releasing, summarise, mayShow, type RollingOff } from '@/lib/releasing-soon'

/**
 * GET /api/releasing-soon
 *
 * People about to come free — the supply side of the fact that "ending
 * soon" already shows a client.
 *
 * The gap is a fortnight wide and expensive. A consultant rolls off on the
 * 28th; nobody outside their own vendor knows until the 29th, when they
 * appear on the bench. Bench time is the cost that decides whether a
 * staffing firm makes money, and the person is still working, still paid,
 * and sellable — right up until they are not.
 *
 * Two audiences, one list:
 *   ?mine=1  a vendor's own people, including those who have not agreed
 *            to be shown, because that is a conversation to have
 *   default  everybody in the network who has agreed
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'This is a company’s view of the market' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'consultants.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Seeing who is coming free needs consultants.read' } },
      { status: 403 }
    )
  }

  const mine = request.nextUrl.searchParams.get('mine') === '1'
  const horizon = Math.min(180, Math.max(7, parseInt(request.nextUrl.searchParams.get('days') ?? '90', 10)))
  const now = new Date()

  const contracts = await prisma.sellContract.findMany({
    where: {
      state: { in: ['IN_PROGRESS', 'PAUSED'] },
      endDate: { not: null, gte: now, lte: new Date(now.getTime() + horizon * 86_400_000) },
      ...(mine ? { companyId: caller.company.id } : {}),
    },
    select: {
      id: true, endDate: true, companyId: true,
      company: { select: { id: true, name: true } },
      clientCompany: { select: { name: true } },
      endClientCompany: { select: { name: true } },
      person: {
        select: {
          id: true, name: true,
          consultant: {
            select: {
              headline: true, skills: true, location: true, rateFloor: true,
              listings: {
                where: { revokedAt: null },
                select: { companyId: true, showBeforeFree: true, revokedAt: true },
              },
            },
          },
        },
      },
      // A rolloff already claimed or settled as a redeployment means they
      // are not actually coming free, and a buyer deserves to know that
      // before planning around them.
      rolloff: { select: { outcome: true, claimedById: true } },
    },
  })

  const rows: RollingOff[] = []
  // Their own people who have not agreed — shown only to their own vendor,
  // as a prompt to ask rather than as stock.
  const toAsk: { personName: string; endDate: string; reason: string }[] = []

  for (const c of contracts) {
    if (!c.endDate || !c.person.consultant) continue

    const listing = c.person.consultant.listings.find((l) => l.companyId === c.companyId)
    const consent = mayShow({
      hasLiveListing: Boolean(listing),
      listingRevoked: listing ? listing.revokedAt !== null : false,
      consultantOptedOut: listing ? listing.showBeforeFree === false : false,
    })

    if (!consent.mayShow) {
      // Only their own vendor sees that somebody exists but has not
      // agreed. To anybody else they simply are not there.
      if (mine && c.companyId === caller.company.id) {
        toAsk.push({
          personName: c.person.name,
          endDate: c.endDate.toISOString().slice(0, 10),
          reason: consent.reason,
        })
      }
      continue
    }

    rows.push({
      contractId: c.id,
      personId: c.person.id,
      personName: c.person.name,
      vendorCompanyId: c.company.id,
      vendorName: c.company.name,
      endClientName: c.endClientCompany?.name ?? c.clientCompany?.name ?? null,
      endDate: c.endDate,
      consented: true,
      headline: c.person.consultant.headline,
      skills: c.person.consultant.skills,
      location: c.person.consultant.location,
      rateFloorCents: c.person.consultant.rateFloor,
      // Already spoken for. Either somebody has claimed them or the
      // rolloff was settled as a redeployment.
      extensionLikely:
        c.rolloff?.outcome === 'REDEPLOYED' || Boolean(c.rolloff?.claimedById),
    })
  }

  const results = releasing(rows, now, horizon)

  // Every read of another person's data is logged, including this one.
  // Browsing who is coming free is still reading somebody's file.
  for (const r of results.slice(0, 50)) {
    if (r.vendorCompanyId === caller.company.id) continue
    void logAccess({
      subjectId: r.personId,
      actorPersonId: caller.person.id,
      actorCompanyId: caller.company.id,
      action: 'RELEASING_SOON_VIEW',
      allowed: true,
      reason: 'Listed as coming free, with their agreement',
    })
  }

  return NextResponse.json({
    data: {
      releases: results.map((r) => ({
        ...r,
        // Dollars out. Cents live in the database and nowhere else.
        rateFloor: r.rateFloorCents === null ? null : r.rateFloorCents / 100,
        rateFloorCents: undefined,
      })),
      ...summarise(results),
      horizonDays: horizon,
      // Only ever populated for a vendor looking at their own people.
      toAsk: mine ? toAsk : [],
      mine,
    },
  })
}
