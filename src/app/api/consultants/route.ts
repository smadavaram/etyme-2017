import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { invitation } from '@/lib/bench-consent'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { askByEmail } from './ask-by-email'
import { addedSays, benchClosedSays, listingTermsFrom, termsShown, notAtACompany } from '@/lib/bench-filter'
import { addPath, addRefusalSays, askedExistingSays } from '@/lib/consultant-portfolio'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
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
 * Creates: Person + ConsultantProfile + BenchListing (MARKETING unless
 * the firm says otherwise, pending grant). The consultant must grant the
 * listing before submissions can reference it.
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

  // Somebody who already has a record is asked, never made again
  // (onboarding walk, 2026-10-27). Maya Brooks signed up herself; adding
  // her was refused "A consultant profile already exists" and there was
  // no other way to ask her. The same invitation and the same yes as the
  // bench's own request door, on the record she already has: no second
  // person, no second profile, her own name kept, and no seat at the firm
  // before she answers.
  const existing = await prisma.person.findUnique({
    where: { primaryEmail: email.toLowerCase().trim() },
    select: {
      id: true,
      name: true,
      primaryEmail: true,
      consultant: {
        select: {
          id: true,
          rateFloor: true,
          ownCompany: { select: { id: true, name: true } },
          listings: { where: { companyId }, select: { id: true, state: true, revokedAt: true } },
        },
      },
    },
  })
  if (existing?.consultant) {
    return askExisting({
      caller,
      companyId,
      person: existing,
      profile: existing.consultant,
      body,
      tier,
      rateMin,
      rateMax,
    })
  }

  // What the firm says it would pay them, where it says anything. A
  // person added here has no company of their own on record yet, so
  // "through their own company" is refused in the terms page's sentence.
  const terms = listingTermsFrom(
    { engagementType: body.termsEngagementType, payRateCents: body.termsPayRateCents },
    {
      personName: name.trim(),
      firmName: caller.company!.name,
      ownCompany: null,
      statedById: caller.person.id,
      now: new Date(),
    }
  )
  if (!terms.ok) {
    return NextResponse.json(
      { error: { code: terms.code, message: terms.says, field: terms.field } },
      { status: 422 }
    )
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

      // 4. Create the BenchListing as an invitation.
      //
      // The comment here used to describe an epoch-zero sentinel marking
      // a listing "pending until the consultant grants it". No such
      // sentinel was ever written: grantedAt was not set at all, so it
      // defaulted to now() and every listing was born granted. The
      // intent was recorded twice — here and in the other create path's
      // automation log — and built neither time.
      //
      // BenchListing.state carries it now. INVITED, and only the
      // consultant moves it.
      const listing = await tx.benchListing.create({
        data: {
          consultantId: profile.id,
          companyId,
          tier: tier as 'RETAINED' | 'MARKETING',
          rateMin: rateMin != null ? parseInt(String(rateMin), 10) : null,
          rateMax: rateMax != null ? parseInt(String(rateMax), 10) : null,
          ...invitation(new Date()),
          ...terms.fields,
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
            termsEngagementType: terms.fields.termsEngagementType,
            termsPayRateCents: terms.fields.termsPayRateCents,
          },
          reversible: true,
        },
      })

      return { person, profile, listing }
    })

    // Ask them, in the vendor's name.
    //
    // Outside the transaction: a slow mail provider must not roll back a
    // consultant who was correctly created. The invitation is recorded
    // either way and can be resent.
    const url = inviteUrl(result.listing.id)
    const msg = inviteText({
      personName: result.person.name,
      vendorName: caller.company!.name,
      url,
      // The terms stated on the listing, so the email names what a yes agrees.
      terms: termsShown(result.listing, caller.company!.name),
    })
    // Said as it went: emailed only where an email could leave; where none
    // can, the link is kept on the notice for staff and the screen says so.
    const mail = await askByEmail({
      companyId, personId: result.person.id, to: result.person.primaryEmail, url,
      subject: msg.subject, body: msg.body, listingId: result.listing.id,
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
            status: result.listing.state,
            termsEngagementType: result.listing.termsEngagementType,
            termsPayRateCents: result.listing.termsPayRateCents,
            termsStatedAt: result.listing.termsStatedAt?.toISOString() ?? null,
            termsAgreedAt: null,
          },
          // What adding them did, in a sentence: the ask went, and nothing
          // reaches past the firm until they say yes.
          message: addedSays({
            name: result.person.name,
            firm: caller.company!.name,
            tier: result.listing.tier,
            emailed: mail === 'EMAILED',
            kept: mail === 'KEPT',
          }) + (terms.says ? ` ${terms.says}` : ''),
        },
      },
      { status: 201 }
    )
  } catch (err: any) {
    if (err?.message === 'PROFILE_EXISTS') {
      return NextResponse.json(
        { error: { code: 'ADDED_A_MOMENT_AGO', message: 'That address got a record a moment ago. Add them again and they are asked onto your bench on the record they have.', field: 'email' } },
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
    reportError('Consultant creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Consultant creation failed. Please try again.' } },
      { status: 500 }
    )
  }
}

/**
 * "Add consultant" for somebody who already has a record: the bench's
 * invitation, on that record. The same rule as `POST /api/bench/listings`
 * — a live ask or a yes is not asked again, a no stands, a listing taken
 * back is asked afresh — and the same log line, so the firm hears the
 * answer the same way (`tellTheFirm` reads `requestedBy`).
 */
async function askExisting(o: {
  caller: CallerContext
  companyId: string
  person: { id: string; name: string; primaryEmail: string | null }
  profile: {
    id: string
    rateFloor: number | null
    ownCompany: { id: string; name: string } | null
    listings: { id: string; state: string; revokedAt: Date | null }[]
  }
  body: Record<string, unknown>
  tier: string
  rateMin: unknown
  rateMax: unknown
}) {
  const { caller, companyId, person, profile } = o
  const firm = caller.company!.name
  const listing = profile.listings[0] ?? null
  const path = addPath({ profileExists: true, listing })
  const refusal = addRefusalSays(path, person.name, firm)
  if (refusal) {
    return NextResponse.json(
      { error: { code: path, message: refusal, field: 'email' } },
      { status: 409 }
    )
  }

  // The floor is the person's own; no ask goes out below it.
  const max = o.rateMax != null ? parseInt(String(o.rateMax), 10) : null
  const min = o.rateMin != null ? parseInt(String(o.rateMin), 10) : null
  if (profile.rateFloor != null && max != null && max < profile.rateFloor) {
    return NextResponse.json(
      { error: { code: 'BELOW_RATE_FLOOR', message: `The top of that range is below the lowest rate ${person.name} has said they will take.`, field: 'rateMax' } },
      { status: 422 }
    )
  }

  const terms = listingTermsFrom(
    { engagementType: o.body.termsEngagementType, payRateCents: o.body.termsPayRateCents },
    { personName: person.name, firmName: firm, ownCompany: profile.ownCompany ?? null, statedById: caller.person.id, now: new Date() }
  )
  if (!terms.ok) {
    return NextResponse.json({ error: { code: terms.code, message: terms.says, field: terms.field } }, { status: 422 })
  }

  try {
    const again = path === 'ASK_AGAIN'
    const asked = await prisma.$transaction(async (tx) => {
      const data = {
        tier: o.tier as 'RETAINED' | 'MARKETING',
        rateMin: min,
        rateMax: max,
        ...invitation(new Date()),
        ...terms.fields,
      }
      const row = again
        ? await tx.benchListing.update({
            where: { id: listing!.id },
            // Asked again, not restored: revoking is never a suggestion.
            data: { ...data, revokedAt: null, declinedNote: null },
          })
        : await tx.benchListing.create({ data: { consultantId: profile.id, companyId, ...data } })
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'BENCH_LISTING_REQUESTED',
          summary: `${o.tier} bench listing requested for "${person.name}", who already has a record. Pending their answer.`,
          reason: 'Add consultant with the address of somebody already on Etyme: asked on their own record, never a second one.',
          payload: {
            listingId: row.id,
            consultantId: profile.id,
            personId: person.id,
            requestedBy: caller.person.id,
            tier: o.tier,
            fromAddConsultant: true,
            termsEngagementType: terms.fields.termsEngagementType,
            termsPayRateCents: terms.fields.termsPayRateCents,
          },
          reversible: true,
        },
      })
      return row
    })

    const url = inviteUrl(asked.id)
    const msg = inviteText({ personName: person.name, vendorName: firm, url, terms: termsShown(asked, firm) })
    const mail = await askByEmail({
      companyId, personId: person.id, to: person.primaryEmail, url,
      subject: msg.subject, body: msg.body, listingId: asked.id,
    })

    return NextResponse.json(
      {
        data: {
          asked: true,
          consultant: { id: profile.id, personId: person.id, person: { id: person.id, name: person.name, email: person.primaryEmail } },
          listing: {
            id: asked.id,
            tier: asked.tier,
            rateMin: asked.rateMin,
            rateMax: asked.rateMax,
            status: asked.state,
            termsEngagementType: asked.termsEngagementType,
            termsPayRateCents: asked.termsPayRateCents,
            termsStatedAt: asked.termsStatedAt?.toISOString() ?? null,
            termsAgreedAt: null,
          },
          message: askedExistingSays({ name: person.name, firm, emailed: mail === 'EMAILED', kept: mail === 'KEPT', again }) + (terms.says ? ` ${terms.says}` : ''),
        },
      },
      { status: again ? 200 : 201 }
    )
  } catch (err) {
    reportError('Asking an existing person onto a bench failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The ask did not go out. Please try again.' } },
      { status: 500 }
    )
  }
}
