import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readiness, saysToVendor } from '@/lib/profile-readiness'
import { getCallerContext } from '@/lib/api-context'
import { maySeeOutside } from '@/lib/walls'
import { emit } from '@/lib/events'
import {
  hasPermission,
  canReadCostAggregates,
  type FieldContext,
} from '@/lib/permissions'
import { logBulkAccess } from '@/lib/access-log'
import {
  standingOf,
  rosterSummary,
  mayMarket,
  type RosterPerson,
} from '@/lib/consultant-portfolio'
import { NETWORK_VISIBLE, whoSees } from '@/lib/shared-consultant'

/**
 * GET /api/bench
 *
 * Returns BenchListings grouped by tier. BUILD.md §3 — Supply.
 *
 * Query params:
 *   scope  — mine | company | payroll | network (default: company)
 *
 * Scopes:
 *   mine     — only the caller's own listings (consultant view)
 *   company  — all listings belonging to the caller's company
 *   payroll  — the firm's own roster: the people it employs, and what each
 *              is on right now. Not listings — see below.
 *   network  — listings shared to the caller's company via partnerships
 *
 * Rate fields are filtered by consultants.cost permission.
 *
 * ── Why `payroll` is a scope here and not a table of its own ──────────
 *
 * Three of these four scopes answer "who has agreed to let us market
 * them". `payroll` answers "who do we employ", and CLAUDE.md is explicit
 * that the second is not the first:
 *
 *   > **Its own bench**: employees between projects, visible to the
 *   > delivery managers and HR who allocate them. Not a `BenchListing` —
 *   > that is a consultant consenting to be sold; this is an employer's
 *   > roster.
 *
 * It lives on this route because it is the same screen's question — a
 * delivery manager at an integrator opens Bench to find out who is free,
 * and at that firm the answer is mostly its own payroll. Teleworld
 * Solutions holds five live EMPLOYEE seats and read "TOTAL 0
 * consultants" on its own Consultants page, because every talent surface
 * read listings.
 *
 * The answer carries `roster`, never `tiers`, so nothing can read a
 * roster as a set of listings by accident. Consent does not travel
 * between the two: a roster row says whether that person granted a
 * listing, and where they have not, nothing on the surface markets them.
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
  const validScopes = ['mine', 'company', 'payroll', 'network']
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
  } else if (scope === 'payroll') {
    if (!companyId) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_COMPANY',
            message:
              'A payroll belongs to a company. Sign in at the firm whose people you are looking for.',
          },
        },
        { status: 403 }
      )
    }
    return NextResponse.json({ data: await rosterFor(companyId) })
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

    // Network scope shows partners what the person agreed to and the
    // partner chose to market: granted, live, MARKETING. It used to read
    // the tier alone, so a listing nobody had answered — or one the
    // person had declined — was shown to every firm on the register.
    where = { ...where, ...NETWORK_VISIBLE, companyId: { in: partnerIds } }
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

  const now = new Date()

  // How many CVs each of them has, counted once.
  //
  // Readiness needs it and a per-row query would be a scan per person.
  const resumeCounts = new Map<string, number>()
  if (listings.length > 0) {
    const counted = await prisma.resume.groupBy({
      by: ['personId'],
      where: { personId: { in: listings.map((l) => l.consultant.personId) } },
      _count: { _all: true },
    })
    for (const c of counted) resumeCounts.set(c.personId, c._count._all)
  }

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
      // Whether they have actually agreed to be marketed.
      //
      // The gate refuses a submission on an unanswered invitation, and
      // until this was returned the bench gave a recruiter no warning —
      // the row looked identical to a consented one and the refusal
      // arrived later, at the submission, phrased as a surprise.
      consent: l.state,
      // How far this listing reaches, from its consent and its tier —
      // never from the profile's `visibility`, which one vendor sets for
      // every vendor and which nothing on this screen may read as consent.
      reach: whoSees({ tier: l.tier, state: l.state, revokedAt: l.revokedAt }).reach,
      reachSays: whoSees({ tier: l.tier, state: l.state, revokedAt: l.revokedAt }).says,
      invitedAt: l.invitedAt?.toISOString() ?? null,
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
      // Whether this record is finished enough to sell.
      //
      // 2017 kept nine boolean columns for this and a profile was
      // invisible until all nine were set. Derived here instead, so it
      // cannot disagree with the record it describes and needs no
      // migration when a step is added — and narrowed to what a client
      // genuinely cannot decide without, because the all-or-nothing
      // version is why benches filled with records nobody finished.
      ready: (() => {
        const r = readiness(
          {
            name: l.consultant.person.name,
            email: l.consultant.person.primaryEmail,
            headline: l.consultant.headline,
            skills: l.consultant.skills,
            location: l.consultant.location,
            workAuth: l.consultant.workAuth,
            rateFloorCents: l.consultant.rateFloor,
            availableFrom: l.consultant.availableFrom,
            resumeCount: resumeCounts.get(l.consultant.personId) ?? 0,
            confirmedAt: l.consultant.confirmedAt,
            ownCompanyId: l.consultant.ownCompanyId,
          },
          now
        )
        return {
          marketable: r.marketable,
          blocking: r.blocking,
          weakening: r.weakening,
          // The consultant reads their own coaching on their own page;
          // a recruiter reads whether they can send this person.
          says: isSubject ? r.says : saysToVendor(r, l.consultant.person.name),
          next: r.next?.label ?? null,
        }
      })(),
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

/**
 * The firm's own roster, read off the work rather than off a listing.
 *
 * ── What decides a person's standing ─────────────────────────────────
 *
 * A contract with their name on it, and nothing else. Every staffer of
 * every firm holds an EMPLOYEE context — a client's own bookkeeper has
 * one — so a seat cannot tell a validation engineer from the firm's
 * owner, and `lib/consultant-portfolio` refuses to guess. What it does
 * instead is say, per person: on a project, starting soon, between
 * projects, or nothing on the record. The last is not a claim that
 * somebody is free, which is why the firm's owner never lands on a
 * capacity number.
 *
 * Two sources, because a firm's own person can appear on either leg:
 * the **sell** line is the firm billing a client for them, and the
 * **buy** line is the firm paying them. A W2 has a buy line and no
 * purchase order behind it — `BuyContract.workOrderId` is nullable for
 * exactly that reason — so the buy leg is read through
 * `BuyContractCandidate`, which is where the person actually sits.
 *
 * ── No AccessLog row, and the reason ─────────────────────────────────
 *
 * The same reason `/api/submissions/own-people` writes none: these are
 * not another party's people. Logging a firm reading its own payroll
 * would bury the reads that matter, which is what the log is for.
 */
async function rosterFor(companyId: string) {
  const now = new Date()

  // Live means live. A revoked, suspended or expired seat is somebody the
  // firm no longer employs — read the same way the submit door reads it,
  // so the two surfaces cannot disagree about who works here.
  const seats = await prisma.context.findMany({
    where: {
      companyId,
      type: 'EMPLOYEE',
      revokedAt: null,
      suspendedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      personId: true,
      grantReason: true,
      role: { select: { name: true } },
      person: {
        select: {
          id: true,
          name: true,
          primaryEmail: true,
          consultant: {
            select: {
              skills: true,
              headline: true,
              location: true,
              workAuth: true,
              // Whether they granted THIS firm a listing. Nothing else
              // decides whether this screen may market them.
              listings: {
                where: { companyId, revokedAt: null, state: 'GRANTED' },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  })

  // One row per person. Two seats at one firm — a delivery seat and a
  // desk — is ordinary and is still one employee.
  const byPerson = new Map<
    string,
    RosterPerson & { email: string | null; headline: string | null; location: string | null; workAuth: string | null }
  >()
  for (const seat of seats) {
    const existing = byPerson.get(seat.personId)
    if (existing) {
      if (!existing.seat && seat.role?.name) existing.seat = seat.role.name
      if (!existing.practice && seat.grantReason) existing.practice = seat.grantReason
      continue
    }
    byPerson.set(seat.personId, {
      personId: seat.personId,
      name: seat.person.name,
      seat: seat.role?.name ?? null,
      practice: seat.grantReason ?? null,
      skills: seat.person.consultant?.skills ?? [],
      listed: (seat.person.consultant?.listings.length ?? 0) > 0,
      lines: [],
      email: seat.person.primaryEmail,
      headline: seat.person.consultant?.headline ?? null,
      location: seat.person.consultant?.location ?? null,
      workAuth: seat.person.consultant?.workAuth ?? null,
    })
  }

  const personIds = [...byPerson.keys()]

  if (personIds.length > 0) {
    // A contract that is DRAFT or CANCELLED is not work and says nothing
    // about where somebody is. PENDING_VERIFICATION and VERIFIED are
    // papered and not started, which is what STARTING_SOON is for.
    const [sells, buys] = await Promise.all([
      prisma.sellContract.findMany({
        where: {
          companyId,
          personId: { in: personIds },
          state: { in: ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] },
        },
        select: {
          personId: true,
          state: true,
          startDate: true,
          endDate: true,
          clientCompany: { select: { name: true } },
          endClientCompany: { select: { name: true } },
        },
      }),
      prisma.buyContractCandidate.findMany({
        where: {
          personId: { in: personIds },
          state: { in: ['ACTIVE', 'ENDED'] },
          buyContract: {
            companyId,
            state: { in: ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] },
          },
        },
        select: {
          personId: true,
          startDate: true,
          endDate: true,
          state: true,
          buyContract: { select: { state: true } },
        },
      }),
    ])

    for (const c of sells) {
      byPerson.get(c.personId)?.lines.push({
        live: c.state === 'IN_PROGRESS' || c.state === 'PAUSED',
        paused: c.state === 'PAUSED',
        startsOn: c.startDate ?? null,
        endsOn: c.endDate ?? null,
        // Where the work is. The firm's own contract, so its own
        // counterparty is its own to read — the end client where it is
        // named, else the firm it bills.
        clientName: c.endClientCompany?.name ?? c.clientCompany?.name ?? null,
      })
    }

    for (const b of buys) {
      const state = b.buyContract.state
      byPerson.get(b.personId)?.lines.push({
        live: b.state === 'ACTIVE' && (state === 'IN_PROGRESS' || state === 'PAUSED'),
        paused: state === 'PAUSED',
        startsOn: b.startDate ?? null,
        endsOn: b.endDate ?? null,
        // A buy line pays the person; it names no client. Silence here is
        // correct and is not a missing name.
        clientName: null,
      })
    }
  }

  const rows = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name))
  const summary = rosterSummary(rows, now)

  return {
    scope: 'payroll' as const,
    roster: rows.map((r) => {
      const standing = standingOf(r, now)
      const market = mayMarket(r)
      return {
        personId: r.personId,
        name: r.name,
        email: r.email,
        seat: r.seat,
        practice: r.practice,
        headline: r.headline,
        location: r.location,
        workAuth: r.workAuth,
        skills: r.skills,
        listed: r.listed,
        standing: standing.standing,
        says: standing.says,
        freeForDays: standing.freeForDays,
        on: standing.on,
        free: standing.free,
        // Sent per row rather than derived on the screen, so the screen
        // cannot draw a Submit button the submit door would refuse.
        mayMarket: market.ok,
        marketSays: market.says,
      }
    }),
    summary,
  }
}
