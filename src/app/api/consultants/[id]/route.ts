import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { contractScopeFor, matchScopeFor, maySeeListing } from '@/lib/shared-consultant'
import { getCallerContext } from '@/lib/api-context'
import {
  hasPermission,
  canReadPayRate,
  canReadBillRate,
  canReadCostAggregates,
  type FieldContext,
} from '@/lib/permissions'

/**
 * GET /api/consultants/:id
 *
 * Full consultant profile, field-filtered by the caller's permissions.
 * BUILD.md §3 — Supply.
 *
 * CLAUDE.md invariant: every read of another person's data writes an
 * AccessLog row, including refusals.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  if (!hasPermission(caller.permissions, 'consultants.read')) {
    // Log the refusal — "including refusals" per CLAUDE.md
    // We don't know the subject yet, but we can try to find them
    const profile = await prisma.consultantProfile.findUnique({
      where: { id },
      select: { personId: true },
    })
    if (profile) {
      await prisma.accessLog.create({
        data: {
          subjectId: profile.personId,
          actorPersonId: caller.person.id,
          actorCompanyId: caller.company?.id ?? null,
          action: 'PROFILE_VIEW',
          allowed: false,
          reason: 'Caller lacks consultants.read permission',
        },
      })
    }
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'You need consultants.read permission' } },
      { status: 403 }
    )
  }

  const profile = await prisma.consultantProfile.findUnique({
    where: { id },
    include: {
      person: {
        select: {
          id: true,
          name: true,
          primaryEmail: true,
          createdAt: true,
        },
      },
      listings: {
        where: { revokedAt: null },
        select: {
          id: true,
          companyId: true,
          tier: true,
          rateMin: true,
          rateMax: true,
          grantedAt: true,
        },
      },
      matches: {
        // Matches against requirements this caller can actually see.
        //
        // A match names a role somebody is being considered for. Left
        // unscoped it tells a rival agency which client is looking at
        // their shared consultant and how well they scored — the same leak
        // as the contract list, one relation over.
        where: matchScopeFor({ isSubject: false, companyId: caller.company?.id }) ?? {},
        select: {
          id: true,
          requirementId: true,
          score: true,
          confidence: true,
          factors: true,
          basis: true,
          unknowns: true,
          computedAt: true,
        },
        orderBy: { computedAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!profile) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Consultant not found' } },
      { status: 404 }
    )
  }

  const isSubject = profile.personId === caller.person.id
  const companyId = caller.company?.id

  // A caller with no company is a consultant. They may see their own
  // matches and nobody else's; the query above could not know whose
  // profile this was yet.
  const matches = companyId || isSubject ? profile.matches : []

  // Write AccessLog — every read of another person's data
  if (!isSubject) {
    await prisma.accessLog.create({
      data: {
        subjectId: profile.personId,
        actorPersonId: caller.person.id,
        actorCompanyId: companyId ?? null,
        action: 'PROFILE_VIEW',
        allowed: true,
      },
    })
  }

  // Field-level filtering
  const fieldCtx: FieldContext = {
    permissions: caller.permissions,
    isSubject,
  }
  const showPayRate = canReadPayRate(fieldCtx)
  const showCost = canReadCostAggregates(fieldCtx)

  // Filter listings to only those visible to the caller's company
  // (their own company's listings, or listings from the consultant themselves)
  const visibleListings = profile.listings.filter((l) =>
    maySeeListing({ isSubject, companyId }, l.companyId)
  )

  // Active sell contracts for this consultant (if caller has assignments.read)
  let contracts: any[] = []
  if (hasPermission(caller.permissions, 'assignments.read')) {
    const rawContracts = await prisma.sellContract.findMany({
      where: {
        personId: profile.personId,
        state: { in: ['IN_PROGRESS', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
        // Only contracts this caller is actually party to. A consultant is
        // on several benches at once, and this read used to hand every
        // placement they have ever had to any of them.
        ...contractScopeFor({ isSubject, companyId }),
      },
      select: {
        id: true,
        billRate: true,
        billCurrency: true,
        state: true,
        startDate: true,
        endDate: true,
        clientCompany: { select: { id: true, name: true } },
        endClientCompany: { select: { id: true, name: true } },
        workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
      },
      orderBy: { startDate: 'desc' },
    })

    const billCtx: FieldContext = {
      permissions: caller.permissions,
      isSubject,
    }

    contracts = rawContracts.map((c) => ({
      id: c.id,
      billRate: canReadBillRate(billCtx) ? c.billRate : undefined,
      billCurrency: c.billCurrency,
      state: c.state,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate?.toISOString() ?? null,
      clientCompany: c.clientCompany,
      endClientCompany: c.endClientCompany,
      workLocation: c.workLocation,
    }))
  }

  return NextResponse.json({
    data: {
      consultant: {
        id: profile.id,
        personId: profile.personId,
        person: {
          id: profile.person.id,
          name: profile.person.name,
          email: profile.person.primaryEmail,
          createdAt: profile.person.createdAt.toISOString(),
        },
        headline: profile.headline,
        skills: profile.skills,
        location: profile.location,
        workAuth: profile.workAuth,
        rateFloor: showCost ? profile.rateFloor : undefined,
        availableFrom: profile.availableFrom?.toISOString() ?? null,
        visibility: profile.visibility,
        listings: visibleListings.map((l) => ({
          id: l.id,
          companyId: l.companyId,
          tier: l.tier,
          rateMin: showCost ? l.rateMin : undefined,
          rateMax: showCost ? l.rateMax : undefined,
          grantedAt: l.grantedAt.toISOString(),
        })),
        matches: matches.map((m) => ({
          id: m.id,
          requirementId: m.requirementId,
          score: m.score,
          confidence: m.confidence,
          factors: m.factors,
          basis: m.basis,
          unknowns: m.unknowns,
          computedAt: m.computedAt.toISOString(),
        })),
        contracts,
      },
    },
  })
}

/**
 * PATCH /api/consultants/:id
 *
 * Update a consultant profile. BUILD.md §3 — Supply.
 *
 * Only updatable fields are accepted; personId and id are immutable.
 * Requires consultants.write permission.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'You need consultants.write permission' } },
      { status: 403 }
    )
  }

  const profile = await prisma.consultantProfile.findUnique({
    where: { id },
    select: {
      id: true,
      personId: true,
      person: { select: { name: true } },
    },
  })

  if (!profile) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Consultant not found' } },
      { status: 404 }
    )
  }

  // Verify the caller's company has a relationship with this consultant
  // (either same company context or an active bench listing)
  const companyId = caller.company?.id
  const isSubject = profile.personId === caller.person.id

  if (!isSubject && companyId) {
    const hasRelationship = await prisma.$transaction(async (tx) => {
      const hasContext = await tx.context.findFirst({
        where: { personId: profile.personId, companyId, revokedAt: null },
        select: { id: true },
      })
      if (hasContext) return true

      const hasListing = await tx.benchListing.findFirst({
        where: { consultant: { personId: profile.personId }, companyId, revokedAt: null },
        select: { id: true },
      })
      return !!hasListing
    })

    if (!hasRelationship) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You can only update consultants associated with your company' } },
        { status: 403 }
      )
    }
  }

  const body = await request.json()
  const allowedFields = ['headline', 'skills', 'location', 'workAuth', 'rateFloor', 'availableFrom', 'visibility']
  const updateData: Record<string, any> = {}

  for (const field of allowedFields) {
    if (field in body) {
      if (field === 'skills') {
        if (!Array.isArray(body.skills)) {
          return NextResponse.json(
            { error: { code: 'VALIDATION', message: 'skills must be an array of strings', field: 'skills' } },
            { status: 422 }
          )
        }
        updateData.skills = body.skills.map((s: string) => String(s).trim()).filter(Boolean)
      } else if (field === 'rateFloor') {
        // Only the consultant themselves or someone with consultants.cost can set rateFloor
        const canSetRate = isSubject || hasPermission(caller.permissions, 'consultants.cost')
        if (!canSetRate) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: 'Only the consultant or someone with consultants.cost can set rateFloor', field: 'rateFloor' } },
            { status: 403 }
          )
        }
        updateData.rateFloor = body.rateFloor != null ? parseInt(String(body.rateFloor), 10) : null
      } else if (field === 'availableFrom') {
        updateData.availableFrom = body.availableFrom ? new Date(body.availableFrom) : null
      } else if (field === 'visibility') {
        const validVisibility = ['INTERNAL', 'FEED', 'CLIENT_VISIBLE', 'VERIFIED']
        if (!validVisibility.includes(body.visibility)) {
          return NextResponse.json(
            { error: { code: 'VALIDATION', message: `visibility must be one of: ${validVisibility.join(', ')}`, field: 'visibility' } },
            { status: 422 }
          )
        }
        updateData.visibility = body.visibility
      } else if (field === 'workAuth') {
        if (body.workAuth !== null) {
          const validWorkAuth = ['US_CITIZEN', 'GC', 'H1B', 'OPT', 'GBP_SW', 'EAD', 'TN', 'L1']
          if (!validWorkAuth.includes(body.workAuth)) {
            return NextResponse.json(
              { error: { code: 'VALIDATION', message: `workAuth must be one of: ${validWorkAuth.join(', ')}`, field: 'workAuth' } },
              { status: 422 }
            )
          }
        }
        updateData.workAuth = body.workAuth
      } else {
        updateData[field] = typeof body[field] === 'string' ? body[field].trim() : body[field]
      }
    }
  }

  // Also allow updating the person's name
  let personUpdate: { name: string } | null = null
  if ('name' in body && typeof body.name === 'string' && body.name.trim().length >= 2) {
    personUpdate = { name: body.name.trim() }
  }

  if (Object.keys(updateData).length === 0 && !personUpdate) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'No valid fields to update' } },
      { status: 422 }
    )
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.consultantProfile.update({
        where: { id },
        data: updateData,
        include: {
          person: { select: { id: true, name: true, primaryEmail: true } },
        },
      })

      if (personUpdate) {
        await tx.person.update({
          where: { id: profile.personId },
          data: personUpdate,
        })
        updatedProfile.person.name = personUpdate.name
      }

      return updatedProfile
    })

    return NextResponse.json({
      data: {
        consultant: {
          id: updated.id,
          personId: updated.personId,
          person: {
            id: updated.person.id,
            name: updated.person.name,
            email: updated.person.primaryEmail,
          },
          headline: updated.headline,
          skills: updated.skills,
          location: updated.location,
          workAuth: updated.workAuth,
          availableFrom: updated.availableFrom?.toISOString() ?? null,
          visibility: updated.visibility,
        },
      },
    })
  } catch (err: any) {
    console.error('Consultant update failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Consultant update failed. Please try again.' } },
      { status: 500 }
    )
  }
}
