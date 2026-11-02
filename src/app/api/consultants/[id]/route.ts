import { NextRequest, NextResponse } from 'next/server'
import { benchClosedSays } from '@/lib/bench-filter'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { accessActor, logAccess, recordRefusal } from '@/lib/access-log'
import { firmViewPatch, hasOwnAccount, profileEditPlan, readAsTheFirm } from '@/lib/consultant-portfolio/firm-view'
import { readProfileEdit } from '@/lib/consultant-portfolio/forms'
import { contractScopeFor, matchScopeFor, maySeeListing } from '@/lib/shared-consultant'
import { getCallerContext } from '@/lib/api-context'
import {
  askTheDesk,
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
      await recordRefusal([profile.personId], {
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id,
        action: 'PROFILE_VIEW',
        allowed: false,
        reason: 'Refused: the reader’s role does not read the people this firm has on its books.',
      })
    }
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: benchClosedSays(caller.company?.name) } },
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
    logAccess({
      subjectId: profile.personId,
      actorPersonId: caller.person.id,
      actorCompanyId: companyId,
      action: 'PROFILE_VIEW',
      allowed: true,
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
 * Change a consultant record, or this firm's own view of the person.
 * BUILD.md §3 — Supply. Requires consultants.write.
 *
 * A consultant is a person, not a record a firm owns (the second Tapin
 * walk, 2026-10-30: Tapin could rewrite the profile of somebody with an
 * account of their own, and every firm that lists her read Tapin's words
 * as hers). So `profileEditPlan` (lib/consultant-portfolio/firm-view)
 * decides where an edit goes before anything is written:
 *
 *  - the person changes their own record;
 *  - a firm changes the record only while it is the firm's to keep — no
 *    account of their own, and no other firm lists them — and what it
 *    typed is kept on its listing too, so its own list shows it;
 *  - otherwise the firm's title, skills, place and note go on its own
 *    listing (`firmHeadline`, `firmSkills`, `firmLocation`, `firmNotes`),
 *    and their name, work authorization, free date, lowest rate and
 *    visibility are refused in a sentence, with nothing written.
 *
 * A refusal is logged before it is sent (`recordRefusal`); a change by a
 * firm is logged too. Both are filed as PROFILE_VIEW, the read the change
 * makes, with the reason saying it was a change: the log's actions are a
 * fixed list in lib/access-log, which is not supply's to extend.
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
      { error: { code: 'FORBIDDEN', message: 'Changing a consultant’s record or putting them on the bench is for the recruiters, the resource manager, HR or the owner. Ask one of them.' } },
      { status: 403 }
    )
  }

  const companyId = caller.company?.id ?? null

  const profile = await prisma.consultantProfile.findUnique({
    where: { id },
    select: {
      id: true,
      personId: true,
      headline: true,
      skills: true,
      location: true,
      person: {
        select: {
          name: true,
          passwordHash: true,
          _count: {
            select: {
              credentials: true,
              // The seat a person is given on signing in (lib/own-seat).
              contexts: { where: { type: 'CONSULTANT', companyId: null } },
            },
          },
        },
      },
      // This firm's listing, and how many other firms list them: read as
      // two counts so nothing about another firm's listing leaves here.
      listings: {
        where: { companyId: companyId ?? '', revokedAt: null },
        select: { id: true, firmHeadline: true, firmSkills: true, firmLocation: true, firmNotes: true },
      },
      _count: {
        select: { listings: { where: { revokedAt: null, ...(companyId ? { companyId: { not: companyId } } : {}) } } },
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
  const listing = profile.listings[0] ?? null

  // The firm must know them: a seat here, or a listing not taken back.
  if (!isSubject) {
    const hasContext = companyId
      ? await prisma.context.findFirst({
          where: { personId: profile.personId, companyId, revokedAt: null },
          select: { id: true },
        })
      : null
    if (!hasContext && !listing) {
      await recordRefusal([profile.personId], {
        ...accessActor(caller),
        action: 'PROFILE_VIEW',
        reason: 'Refused a change to their record: the firm neither employs this person nor lists them.',
      })
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: `${profile.person.name} is not one of ${caller.company?.name ?? 'your company'}’s people, so there is nothing here for you to change.` } },
        { status: 403 }
      )
    }
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Send the changes as fields.' } },
      { status: 422 }
    )
  }

  // ── Read the fields, checking each as before ──────────────────────
  // The same reader the drawer's forms are tested against (`readProfileEdit`,
  // lib/consultant-portfolio/forms), so a field refused here is one they draw.
  const edit = readProfileEdit(body)
  if (!edit.ok) {
    return NextResponse.json(
      { error: { code: edit.code, message: edit.message, field: edit.field } },
      { status: 422 }
    )
  }
  const { updateData, personUpdate, fields } = edit

  // ── Where the edit may go ─────────────────────────────────────────
  const plan = profileEditPlan({
    isSubject,
    ownAccount: hasOwnAccount({
      passwordSet: Boolean(profile.person.passwordHash),
      signIns: profile.person._count.credentials,
      ownSeats: profile.person._count.contexts,
    }),
    otherFirms: profile._count.listings,
    hasListing: listing != null,
    name: profile.person.name,
    firm: caller.company?.name ?? 'your company',
    fields,
  })

  if (!plan.ok) {
    await recordRefusal([profile.personId], {
      ...accessActor(caller),
      action: 'PROFILE_VIEW',
      reason: `Refused a change to their record: ${plan.says}`,
    })
    return NextResponse.json(
      { error: { code: plan.code, message: plan.says, field: plan.field } },
      { status: 403 }
    )
  }

  if (!plan.profile && !plan.listing) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'No valid fields to update' } },
      { status: 422 }
    )
  }

  // The lowest rate is pay: the person's own, or a role that reads pay.
  if (plan.profile && 'rateFloor' in updateData && !isSubject && !hasPermission(caller.permissions, 'consultants.cost')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'Only the consultant can set their own lowest rate, or a role that sees what each person costs. ' +
            askTheDesk({
              doing: 'Setting somebody else’s lowest rate',
              needs: 'consultants.cost',
              kind: caller.company?.kind ?? null,
              companyName: caller.company?.name ?? null,
            }),
          field: 'rateFloor',
        },
      },
      { status: 403 }
    )
  }

  try {
    const written = await prisma.$transaction(async (tx) => {
      const own = plan.profile && Object.keys(updateData).length > 0
        ? await tx.consultantProfile.update({
            where: { id },
            data: updateData,
            select: { headline: true, skills: true, location: true },
          })
        : { headline: profile.headline, skills: profile.skills, location: profile.location }
      if (plan.profile && personUpdate) {
        await tx.person.update({ where: { id: profile.personId }, data: personUpdate })
      }
      const view = plan.listing && listing
        ? await tx.benchListing.update({
            where: { id: listing.id },
            data: firmViewPatch(body),
            select: { firmHeadline: true, firmSkills: true, firmLocation: true, firmNotes: true },
          })
        : listing
      return { own, view }
    })

    if (!isSubject) {
      logAccess({
        subjectId: profile.personId,
        ...accessActor(caller),
        action: 'PROFILE_VIEW',
        allowed: true,
        reason: plan.profile ? 'Changed the consultant record the firm keeps' : 'Changed the firm’s own view on its bench listing',
      })
    }

    // What this firm now reads about them: its own view first, theirs beside.
    const read = readAsTheFirm(written.own, isSubject ? null : written.view)
    return NextResponse.json({
      data: {
        consultant: {
          id: profile.id,
          personId: profile.personId,
          name: personUpdate && plan.profile ? personUpdate.name : profile.person.name,
          headline: read.headline,
          skills: read.skills,
          location: read.location,
          notes: read.notes,
          own: read.own,
        },
        kept: plan.profile && plan.listing ? 'BOTH' : plan.profile ? 'PROFILE' : 'LISTING',
        message: plan.says,
      },
    })
  } catch (err: any) {
    reportError('Consultant update failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Consultant update failed. Please try again.' } },
      { status: 500 }
    )
  }
}
