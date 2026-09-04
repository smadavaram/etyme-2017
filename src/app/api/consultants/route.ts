import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext } from '@/lib/api-context'
import {
  hasPermission,
  canReadPayRate,
  canReadCostAggregates,
  type FieldContext,
} from '@/lib/permissions'

/**
 * GET /api/consultants
 *
 * List consultants visible to the caller's company. BUILD.md §3 — Supply.
 *
 * Query params:
 *   q           — free text search against name, headline, skills
 *   skills      — comma-separated skill filter (AND match)
 *   availability — ISO date; only consultants available on or before
 *   workAuth    — work authorisation code (US_CITIZEN, GC, H1B, etc.)
 *   tier        — bench tier filter (RETAINED | MARKETING)
 *   page        — 1-based page number (default 1)
 *   limit       — page size (default 25, max 100)
 *
 * Field filtering: pay rates and rate floors are stripped unless the caller
 * holds consultants.cost (BUILD.md §2).
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

  const sp = request.nextUrl.searchParams
  const q = sp.get('q')?.trim() || null
  const skillsParam = sp.get('skills')?.trim() || null
  const availability = sp.get('availability')?.trim() || null
  const workAuth = sp.get('workAuth')?.trim() || null
  const tier = sp.get('tier')?.trim() || null
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '25', 10) || 25))
  const skip = (page - 1) * limit

  const skills = skillsParam
    ? skillsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null

  // Build Prisma where clause
  // A caller sees consultants who have a BenchListing granted to their company,
  // OR consultants that belong to their own company (via Context).
  const companyId = caller.company?.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  const andClauses: any[] = []

  // Visibility: only consultants the caller's company can see
  // (those with active bench listings to this company, or same-company consultants)
  if (companyId) {
    andClauses.push({
      OR: [
        {
          listings: {
            some: {
              companyId,
              revokedAt: null,
              ...(tier ? { tier: tier as 'RETAINED' | 'MARKETING' } : {}),
            },
          },
        },
        {
          person: {
            contexts: {
              some: {
                companyId,
                revokedAt: null,
              },
            },
          },
        },
      ],
    })
  }

  // Free text search
  if (q) {
    andClauses.push({
      OR: [
        { person: { name: { contains: q, mode: 'insensitive' } } },
        { headline: { contains: q, mode: 'insensitive' } },
        { skills: { hasSome: [q] } },
      ],
    })
  }

  // Skill filter (AND — consultant must have all listed skills)
  if (skills && skills.length > 0) {
    andClauses.push({ skills: { hasEvery: skills } })
  }

  // Availability filter
  if (availability) {
    const availDate = new Date(availability)
    if (!isNaN(availDate.getTime())) {
      andClauses.push({
        OR: [
          { availableFrom: null },
          { availableFrom: { lte: availDate } },
        ],
      })
    }
  }

  // Work authorisation filter
  if (workAuth) {
    andClauses.push({ workAuth })
  }

  if (andClauses.length > 0) {
    where.AND = andClauses
  }

  const [total, profiles] = await Promise.all([
    prisma.consultantProfile.count({ where }),
    prisma.consultantProfile.findMany({
      where,
      include: {
        person: {
          select: { id: true, name: true, primaryEmail: true },
        },
        listings: companyId
          ? {
              where: { companyId, revokedAt: null },
              select: {
                id: true,
                tier: true,
                rateMin: true,
                rateMax: true,
                grantedAt: true,
              },
            }
          : false,
      },
      orderBy: { person: { name: 'asc' } },
      skip,
      take: limit,
    }),
  ])

  // Field-level filtering
  const fieldCtx: FieldContext = {
    permissions: caller.permissions,
    isSubject: false,
  }
  const canSeeCost = canReadCostAggregates(fieldCtx)

  const data = profiles.map((p) => {
    const isSubject = p.personId === caller.person.id
    const showRate = isSubject || canSeeCost

    return {
      id: p.id,
      personId: p.personId,
      person: {
        id: p.person.id,
        name: p.person.name,
        email: p.person.primaryEmail,
      },
      headline: p.headline,
      skills: p.skills,
      location: p.location,
      workAuth: p.workAuth,
      rateFloor: showRate ? p.rateFloor : undefined,
      availableFrom: p.availableFrom?.toISOString() ?? null,
      visibility: p.visibility,
      listings: Array.isArray(p.listings)
        ? p.listings.map((l) => ({
            id: l.id,
            tier: l.tier,
            rateMin: showRate ? l.rateMin : undefined,
            rateMax: showRate ? l.rateMax : undefined,
            grantedAt: l.grantedAt.toISOString(),
          }))
        : [],
    }
  })

  return NextResponse.json({
    data: {
      consultants: data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  })
}

/**
 * POST /api/consultants
 *
 * Create a consultant by hand. BUILD.md §3 — Supply.
 *
 * Creates: Person + ConsultantProfile + BenchListing (RETAINED, pending grant).
 * The consultant must grant the listing before submissions can reference it.
 *
 * Requires consultants.write permission.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'You need consultants.write permission' } },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Active context must be associated with a company' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const {
    name,
    email,
    headline,
    skills = [],
    location,
    workAuth,
    rateFloor,
    availableFrom,
    tier = 'RETAINED',
    rateMin,
    rateMax,
  } = body

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'name is required (min 2 characters)', field: 'name' } },
      { status: 422 }
    )
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A valid email is required', field: 'email' } },
      { status: 422 }
    )
  }

  if (!Array.isArray(skills)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'skills must be an array of strings', field: 'skills' } },
      { status: 422 }
    )
  }

  const validTiers = ['RETAINED', 'MARKETING']
  if (!validTiers.includes(tier)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `tier must be one of: ${validTiers.join(', ')}`, field: 'tier' } },
      { status: 422 }
    )
  }

  if (workAuth) {
    const validWorkAuth = ['US_CITIZEN', 'GC', 'H1B', 'OPT', 'GBP_SW', 'EAD', 'TN', 'L1']
    if (!validWorkAuth.includes(workAuth)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: `workAuth must be one of: ${validWorkAuth.join(', ')}`, field: 'workAuth' } },
        { status: 422 }
      )
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create the Person
      let person = await tx.person.findUnique({
        where: { primaryEmail: email.toLowerCase().trim() },
      })

      if (!person) {
        person = await tx.person.create({
          data: {
            name: name.trim(),
            primaryEmail: email.toLowerCase().trim(),
          },
        })
      }

      // 2. Check if ConsultantProfile already exists
      const existingProfile = await tx.consultantProfile.findUnique({
        where: { personId: person.id },
      })

      if (existingProfile) {
        throw new Error('PROFILE_EXISTS')
      }

      // 3. Create ConsultantProfile
      const profile = await tx.consultantProfile.create({
        data: {
          personId: person.id,
          headline: headline?.trim() || null,
          skills: skills.map((s: string) => s.trim()).filter(Boolean),
          location: location?.trim() || null,
          workAuth: workAuth || null,
          rateFloor: rateFloor != null ? parseInt(String(rateFloor), 10) : null,
          availableFrom: availableFrom ? new Date(availableFrom) : null,
          visibility: 'INTERNAL',
        },
      })

      // 4. Create BenchListing — pending until the consultant grants it.
      //    grantedAt is set to epoch-zero as a sentinel; the grant endpoint
      //    sets the real timestamp. revokedAt is NOT set because the listing
      //    is in a "pending" state (not yet granted, not yet revoked).
      //    A pending listing has grantedAt in the past but is conceptually
      //    waiting for the consultant to confirm.
      const listing = await tx.benchListing.create({
        data: {
          consultantId: profile.id,
          companyId,
          tier: tier as 'RETAINED' | 'MARKETING',
          rateMin: rateMin != null ? parseInt(String(rateMin), 10) : null,
          rateMax: rateMax != null ? parseInt(String(rateMax), 10) : null,
        },
      })

      // 5. Create a CONSULTANT context on this company for the person
      await tx.context.create({
        data: {
          personId: person.id,
          type: 'CONSULTANT',
          companyId,
        },
      })

      // 6. AutomationLog
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'CONSULTANT_CREATED',
          summary: `Consultant "${person.name}" added with ${skills.length} skills, ${tier} bench listing`,
          reason: 'Manual consultant creation via API',
          payload: {
            personId: person.id,
            profileId: profile.id,
            listingId: listing.id,
            createdBy: caller.person.id,
          },
          reversible: true,
        },
      })

      return { person, profile, listing }
    })

    return NextResponse.json(
      {
        data: {
          consultant: {
            id: result.profile.id,
            personId: result.person.id,
            person: {
              id: result.person.id,
              name: result.person.name,
              email: result.person.primaryEmail,
            },
            headline: result.profile.headline,
            skills: result.profile.skills,
            location: result.profile.location,
            workAuth: result.profile.workAuth,
            availableFrom: result.profile.availableFrom?.toISOString() ?? null,
            visibility: result.profile.visibility,
          },
          listing: {
            id: result.listing.id,
            tier: result.listing.tier,
            rateMin: result.listing.rateMin,
            rateMax: result.listing.rateMax,
            status: 'PENDING_GRANT',
          },
          message: `Consultant "${result.person.name}" created. Bench listing is pending consultant grant.`,
        },
      },
      { status: 201 }
    )
  } catch (err: any) {
    if (err?.message === 'PROFILE_EXISTS') {
      return NextResponse.json(
        { error: { code: 'ALREADY_EXISTS', message: 'A consultant profile already exists for this person', field: 'email' } },
        { status: 409 }
      )
    }
    if (err?.code === 'P2002') {
      const target = err?.meta?.target
      if (target?.includes('primaryEmail')) {
        return NextResponse.json(
          { error: { code: 'DUPLICATE_EMAIL', message: 'A person with this email already exists', field: 'email' } },
          { status: 409 }
        )
      }
      if (target?.includes('consultantId') && target?.includes('companyId')) {
        return NextResponse.json(
          { error: { code: 'LISTING_EXISTS', message: 'A bench listing already exists for this consultant at this company' } },
          { status: 409 }
        )
      }
    }
    console.error('Consultant creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Consultant creation failed. Please try again.' } },
      { status: 500 }
    )
  }
}
