import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { addedSays, benchClosedSays, notAtACompany } from '@/lib/bench-filter'
import { addRefusalSays, askedExistingSays } from '@/lib/consultant-portfolio'
import { askOntoBench } from '@/lib/consultant-portfolio/bench-ask'
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
 *   workAuth    — work authorization code (US_CITIZEN, GC, H1B, etc.)
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
      { error: { code: 'FORBIDDEN', message: benchClosedSays(caller.company?.name) } },
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

  // Work authorization filter
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
                termsEngagementType: true,
                termsPayRateCents: true,
                termsAgreedAt: true,
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
            // The terms stated at listing: the kind is not money, the pay is.
            termsEngagementType: l.termsEngagementType,
            termsPayRateCents: showRate ? l.termsPayRateCents : undefined,
            termsAgreed: l.termsAgreedAt != null,
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
 * Asks a person onto the bench through `askOntoBench`, the one function
 * the public page's "Join the bench" calls too: Person and
 * ConsultantProfile only where none exists, and a BenchListing (MARKETING
 * unless the firm says otherwise) born INVITED. The consultant must say
 * yes before submissions can reference it.
 *
 * Optional terms (2026-10-06): `termsEngagementType` and
 * `termsPayRateCents`, what the firm would pay them when it places them,
 * checked by demand's `checkStatedTerms` and agreed only by their own yes.
 *
 * Requires consultants.write permission.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Adding a consultant is for the recruiters, the resource manager, HR or the owner. Ask one of them.' } },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: notAtACompany('list of consultants') } },
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
    // Marketing unless the firm says otherwise. Retaining is a claim to
    // carry somebody between assignments, and a person has one retained
    // bench — so it is a choice a firm makes, not a default it falls
    // into. As the silent default it kept every new consultant from ever
    // reaching a partner, and the listing door already defaulted the
    // other way, so one firm got two answers.
    tier = 'MARKETING',
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

  // One ask, from either door (`askOntoBench`): somebody who already has
  // a record is asked on it, never made again (onboarding walk,
  // 2026-10-27: Maya Brooks signed up herself and adding her was refused);
  // a live ask or a yes is not asked again; a no stands; a listing taken
  // back is asked afresh. Every listing is an invitation only the person
  // answers, and nobody is seated at the firm before that yes.
  try {
    const firm = { id: companyId, name: caller.company!.name }
    const out = await askOntoBench({
      firm,
      name,
      email,
      by: { personId: caller.person.id },
      tier: tier as 'RETAINED' | 'MARKETING',
      rateMin: rateMin != null ? parseInt(String(rateMin), 10) : null,
      rateMax: rateMax != null ? parseInt(String(rateMax), 10) : null,
      statedTerms: { engagementType: body.termsEngagementType, payRateCents: body.termsPayRateCents },
      newProfile: {
        headline,
        skills,
        location,
        workAuth,
        rateFloor: rateFloor != null ? parseInt(String(rateFloor), 10) : null,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
      },
    })

    if (out.kind === 'NOTHING') {
      return NextResponse.json(
        { error: { code: out.path, message: addRefusalSays(out.path, out.person.name, firm.name), field: 'email' } },
        { status: 409 }
      )
    }
    if (out.kind === 'REFUSED') {
      return NextResponse.json(
        { error: { code: out.code, message: out.says, field: out.field } },
        { status: 422 }
      )
    }
    if (out.kind === 'RACED') {
      return NextResponse.json(
        { error: { code: 'ADDED_A_MOMENT_AGO', message: 'That address got a record a moment ago. Add them again and they are asked onto your bench on the record they have.', field: 'email' } },
        { status: 409 }
      )
    }

    const listing = {
      id: out.listing.id,
      tier: out.listing.tier,
      rateMin: out.listing.rateMin,
      rateMax: out.listing.rateMax,
      status: out.listing.state,
      termsEngagementType: out.listing.termsEngagementType,
      termsPayRateCents: out.listing.termsPayRateCents,
      termsStatedAt: out.listing.termsStatedAt?.toISOString() ?? null,
      termsAgreedAt: null,
    }
    const person = { id: out.person.id, name: out.person.name, email: out.person.primaryEmail }
    const termsSays = out.termsSays ? ` ${out.termsSays}` : ''

    if (out.path !== 'NEW') {
      const again = out.path === 'ASK_AGAIN'
      return NextResponse.json(
        {
          data: {
            asked: true,
            consultant: { id: out.profile.id, personId: out.person.id, person },
            listing,
            message: askedExistingSays({ name: out.person.name, firm: firm.name, emailed: out.mail === 'EMAILED', kept: out.mail === 'KEPT', again }) + termsSays,
          },
        },
        { status: again ? 200 : 201 }
      )
    }

    return NextResponse.json(
      {
        data: {
          consultant: {
            id: out.profile.id,
            personId: out.person.id,
            person,
            headline: out.profile.headline,
            skills: out.profile.skills,
            location: out.profile.location,
            workAuth: out.profile.workAuth,
            availableFrom: out.profile.availableFrom?.toISOString() ?? null,
            visibility: out.profile.visibility,
          },
          listing,
          // What adding them did, in a sentence: the ask went, and nothing
          // reaches past the firm until they say yes.
          message: addedSays({
            name: out.person.name,
            firm: firm.name,
            tier: out.listing.tier,
            emailed: out.mail === 'EMAILED',
            kept: out.mail === 'KEPT',
          }) + termsSays,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    reportError('Asking somebody onto the bench failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The ask did not go out. Please try again.' } },
      { status: 500 }
    )
  }
}
