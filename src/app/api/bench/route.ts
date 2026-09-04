import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext } from '@/lib/api-context'
import { maySeeOutside } from '@/lib/walls'
import { emit } from '@/lib/events'
import {
  hasPermission,
  canReadCostAggregates,
  type FieldContext,
} from '@/lib/permissions'
import { logBulkAccess } from '@/lib/access-log'

/**
 * GET /api/bench
 *
 * Returns BenchListings grouped by tier. BUILD.md §3 — Supply.
 *
 * Query params:
 *   scope  — mine | company | network (default: company)
 *
 * Scopes:
 *   mine     — only the caller's own listings (consultant view)
 *   company  — all listings belonging to the caller's company
 *   network  — listings shared to the caller's company via partnerships
 *
 * Rate fields are filtered by consultants.cost permission.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'You need consultants.read permission' } },
      { status: 403 }
    )
  }

  const scope = request.nextUrl.searchParams.get('scope')?.trim() || 'company'
  const validScopes = ['mine', 'company', 'network']
  if (!validScopes.includes(scope)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `scope must be one of: ${validScopes.join(', ')}`, field: 'scope' } },
      { status: 422 }
    )
  }

  const companyId = caller.company?.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let where: any = { revokedAt: null }

  if (scope === 'mine') {
    // Listings for the caller's own consultant profile
    const profile = await prisma.consultantProfile.findUnique({
      where: { personId: caller.person.id },
      select: { id: true },
    })

    if (!profile) {
      return NextResponse.json({
        data: {
          scope,
          tiers: { RETAINED: [], MARKETING: [] },
          totals: { RETAINED: 0, MARKETING: 0, total: 0 },
        },
      })
    }

    where.consultantId = profile.id
  } else if (scope === 'company') {
    if (!companyId) {
      return NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Active context must be associated with a company' } },
        { status: 403 }
      )
    }
    where.companyId = companyId
  } else if (scope === 'network') {
    // Everything below this line is other companies' people. At a delivery
    // firm that is the contractor desk's business and nobody else's, so
    // the wall is checked before the query rather than after it.
    const outside = maySeeOutside({
      posture: caller.company?.outsideAccess ?? 'NAMED_ONLY',
      permissions: caller.permissions,
    })
    if (!outside.ok) {
      // Recorded. An owner who has closed the door should be able to see
      // who keeps trying it, and a refusal nobody can count is a control
      // nobody can review.
      void emit({
        type: 'network.refused',
        companyId: caller.company?.id ?? null,
        subjectType: 'Market',
        subjectId: caller.company?.id ?? 'unknown',
        actorPersonId: caller.person.id,
        payload: { surface: 'bench.network', reason: outside.reason },
      })
      return NextResponse.json(
        { error: { code: 'OUTSIDE_CLOSED', message: outside.reason } },
        { status: 403 }
      )
    }

    if (!companyId) {
      return NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Active context must be associated with a company' } },
        { status: 403 }
      )
    }

    // Network bench: the firms on the caller's own counterparty register,
    // and the firms that hold the caller on theirs. Partnership — the old
    // model here — was never written by anything in the product's life,
    // so this scope silently returned empty for every company that ever
    // existed. Reading the register makes it real: put a firm on your
    // register and their shared bench appears.
    const [mine, theirs] = await Promise.all([
      prisma.counterparty.findMany({
        where: { companyId, status: 'ACTIVE' },
        select: { otherCompanyId: true },
      }),
      prisma.counterparty.findMany({
        where: { otherCompanyId: companyId, status: 'ACTIVE' },
        select: { companyId: true },
      }),
    ])

    const partnerIds = [
      ...new Set([...mine.map((c) => c.otherCompanyId), ...theirs.map((c) => c.companyId)]),
    ]

    if (partnerIds.length === 0) {
      return NextResponse.json({
        data: {
          scope,
          tiers: { RETAINED: [], MARKETING: [] },
          totals: { RETAINED: 0, MARKETING: 0, total: 0 },
        },
      })
    }

    // Network scope shows only MARKETING tier listings from partners
    where.companyId = { in: partnerIds }
    where.tier = 'MARKETING'
  }

  const listings = await prisma.benchListing.findMany({
    where,
    include: {
      consultant: {
        include: {
          person: {
            select: { id: true, name: true, primaryEmail: true },
          },
        },
      },
      company: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { grantedAt: 'desc' },
  })

  // Field-level filtering
  const fieldCtx: FieldContext = {
    permissions: caller.permissions,
    isSubject: false,
  }
  const showCost = canReadCostAggregates(fieldCtx)

  // Group by tier
  const grouped: Record<string, any[]> = { RETAINED: [], MARKETING: [] }

  for (const l of listings) {
    const isSubject = l.consultant.personId === caller.person.id
    const showRate = isSubject || showCost

    const item = {
      id: l.id,
      tier: l.tier,
      rateMin: showRate ? l.rateMin : undefined,
      rateMax: showRate ? l.rateMax : undefined,
      grantedAt: l.grantedAt.toISOString(),
      company: {
        id: l.company.id,
        name: l.company.name,
        slug: l.company.slug,
      },
      consultant: {
        id: l.consultant.id,
        personId: l.consultant.personId,
        person: {
          id: l.consultant.person.id,
          name: l.consultant.person.name,
          email: l.consultant.person.primaryEmail,
        },
        headline: l.consultant.headline,
        skills: l.consultant.skills,
        location: l.consultant.location,
        workAuth: l.consultant.workAuth,
        rateFloor: showRate ? l.consultant.rateFloor : undefined,
        availableFrom: l.consultant.availableFrom?.toISOString() ?? null,
        visibility: l.consultant.visibility,
      },
    }

    const tier = l.tier as string
    if (!grouped[tier]) grouped[tier] = []
    grouped[tier].push(item)
  }

  // CLAUDE.md: "Every read of another person's data writes an AccessLog row"
  const otherPersonIds = listings
    .filter((l) => l.consultant.personId !== caller.person.id)
    .map((l) => l.consultant.personId)

  if (otherPersonIds.length > 0) {
    logBulkAccess(otherPersonIds, {
      actorPersonId: caller.person.id,
      actorCompanyId: companyId ?? undefined,
      action: 'TALENT_VIEW_ANON',
      reason: `Bench listing view (scope=${scope})`,
    })
  }

  return NextResponse.json({
    data: {
      scope,
      tiers: grouped,
      totals: {
        RETAINED: grouped.RETAINED?.length ?? 0,
        MARKETING: grouped.MARKETING?.length ?? 0,
        total: listings.length,
      },
    },
  })
}
