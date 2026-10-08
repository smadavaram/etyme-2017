import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getSessionEmail, getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { isExcludedDomain } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { directoryScope, directoryCopy, type Reader } from '@/lib/directory-scope'
import { dealingsOf } from './dealings'
import { mayRegisterWithEmail } from '@/lib/company-defaults'
import { createCompany } from '@/lib/company-create'
import { mayAddCompany } from '@/lib/counterparty'

/**
 * POST /api/companies
 *
 * Creates a new company. Mirrors BUILD.md §3 — Onboarding and §4.A.
 *
 * Flow:
 *   1. Slug from domain, collision-numbered, reserved list checked
 *   2. Creates the company through lib/company-create — the pack, roles
 *      for its kind, head office and holidays first sign-in gives — and
 *      the owner's seat where the caller is founding their own firm
 *   3. Sets siteLiveAt = now
 *   4. Fires AI site generation (background job)
 *   5. networkVerifiedAt stays null until manual verification
 *
 * The 90-second promise: satisfied at siteLiveAt.
 * Everything after is enrichment and skippable.
 */

const RESERVED_SLUGS = new Set([
  'api',
  'app',
  'admin',
  'login',
  'signup',
  'dashboard',
  'settings',
  'www',
  'mail',
  'help',
  'support',
  'blog',
  'docs',
  'status',
  'etyme',
])

// The seven hard-coded staffing-agency roles that used to live here are
// retired: every kind of company now gets the roles for what it is, from
// rolesFor(kind), through lib/company-create — the same function first
// sign-in uses (founder, 2026-10-07).

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

/**
 * Generates a unique slug by checking for collisions and appending a number.
 * Mirrors the 2017 create_slug with collision numbering.
 */
async function uniqueSlug(base: string): Promise<string> {
  // Check if base slug exists
  const existing = await prisma.company.findUnique({ where: { slug: base } })
  if (!existing) return base

  // Find the highest numbered collision
  const like = `${base}-%`
  const collisions = await prisma.company.findMany({
    where: { slug: { startsWith: `${base}-` } },
    select: { slug: true },
  })

  let max = 0
  for (const c of collisions) {
    const suffix = c.slug.slice(base.length + 1)
    const n = parseInt(suffix, 10)
    if (!isNaN(n) && n > max) max = n
  }

  return `${base}-${max + 1}`
}

export async function POST(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const body = await request.json()
  const { name, kind = 'VENDOR' } = body

  // Personal email cannot claim a company domain — but a consultant's
  // own corporation claims no domain at all, and a one-person shop on
  // gmail is how a one-person shop actually runs. The rule lives in
  // mayRegisterWithEmail so the reasoning is tested, not folklore.
  const personalEmail = isExcludedDomain(email)
  const registration = mayRegisterWithEmail(kind, personalEmail)
  if (!registration.ok) {
    return NextResponse.json(
      { error: { code: 'PERSONAL_EMAIL', message: registration.says } },
      { status: 422 }
    )
  }

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Company name is required (min 2 characters)', field: 'name' } },
      { status: 422 }
    )
  }

  const validKinds = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']
  if (!validKinds.includes(kind)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `Invalid kind. Must be one of: ${validKinds.join(', ')}`, field: 'kind' } },
      { status: 422 }
    )
  }

  // ── Founding a firm, or writing down one you trade with ──────────
  //
  // One button, two acts, and they were the same act until the walk of
  // 2026-09-21 found an integrator's W2 create a company from inside
  // his employer's app and be silently re-seated into it as Owner. The
  // rule is `mayAddCompany` in lib/counterparty; this route enforces it.
  const { caller: seatedCaller } = await getCallerContext(request)
  const adding = mayAddCompany({
    seatedAt: seatedCaller?.company
      ? { id: seatedCaller.company.id, name: seatedCaller.company.name }
      : null,
    permissions: seatedCaller?.permissions ?? [],
    relationship: body?.relationship ?? null,
  })
  if (!adding.ok) {
    return NextResponse.json(
      { error: { code: 'NOT_YOURS_TO_ADD', message: adding.says } },
      { status: 403 }
    )
  }

  const baseSlug = slugify(name)

  if (RESERVED_SLUGS.has(baseSlug)) {
    return NextResponse.json(
      { error: { code: 'SLUG_RESERVED', message: `The name "${name}" is reserved. Please choose another.`, field: 'name' } },
      { status: 422 }
    )
  }

  // Domain from the authenticated user's email — unless it is a personal
  // one, which proves nothing about any company and must not be recorded
  // as if it did. And only where the caller is founding their own firm:
  // a counterparty written down from inside a seat is not on the caller's
  // domain, and recording it there as verified would hand the caller's
  // colleagues to somebody else's company the next time they signed in.
  const domain = personalEmail || !adding.ownsIt ? null : email.split('@')[1]?.toLowerCase() ?? null

  try {
    const slug = await uniqueSlug(baseSlug)

    const result = await prisma.$transaction(async (tx) => {
      // The person first, because the company's owner seat and its domain
      // claim name them.
      let person = await tx.person.findUnique({ where: { primaryEmail: email } })
      if (!person) {
        person = await tx.person.create({ data: { name: email.split('@')[0], primaryEmail: email } })
      }

      // 1–2. The company and everything it needs to start, made the one
      // way. Seated as Owner only where this is somebody registering a
      // firm of their own: recording a counterparty seats nobody, because
      // contexts are read most-recently-granted first and granting `*` on
      // a client of ours moved the creator's whole identity off their
      // employer.
      const made = await createCompany(
        {
          name,
          kind: kind as 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP',
          slug,
          domain,
          country: body?.country ?? null,
          currency: body?.currency ?? null,
          byPersonId: person.id,
          seatAsOwner: adding.ownsIt,
          claimDomain: adding.ownsIt,
          startsSetup: adding.ownsIt,
        },
        tx
      )
      const company = await tx.company.findUniqueOrThrow({ where: { id: made.company.id } })
      const roles = made.roles
      const context = made.ownerContextId
        ? await tx.context.findUniqueOrThrow({ where: { id: made.ownerContextId } })
        : null

      // 5. The owner of a consultant corporation IS its consultant.
      //
      // Without this they would register and face an empty bench with an
      // Add consultant form asking about themselves in the third person.
      // The listing is granted at creation — the grant rule protects a
      // consultant from a company marketing them without consent, and
      // consenting to your own one-person company is what registering it
      // means.
      // The owner of a consultant corporation IS its consultant — but
      // only where they registered it themselves. A recruiter writing
      // down a contractor's own limited company is not consenting to be
      // marketed on anybody's bench.
      if (kind === 'CONSULTANT_CORP' && adding.ownsIt) {
        const profile = await tx.consultantProfile.upsert({
          where: { personId: person.id },
          update: { ownCompanyId: company.id },
          create: {
            personId: person.id,
            ownCompanyId: company.id,
          },
        })
        await tx.benchListing.create({
          data: {
            consultantId: profile.id,
            companyId: company.id,
            tier: 'RETAINED',
          },
        })
      }

      // AutomationLog — what was created, honestly counted
      await tx.automationLog.create({
        data: {
          companyId: company.id,
          action: 'COMPANY_CREATED',
          summary: `Company "${company.name}" created at ${slug}.etyme.com with ${roles.length} role${roles.length === 1 ? '' : 's'}`,
          reason: adding.ownsIt
            ? 'User registered a new company of their own and was seated as its owner'
            : `Recorded on ${seatedCaller?.company?.name ?? 'the caller'}'s register as a counterparty; nobody was seated there`,
          payload: {
            personId: person.id,
            email,
            roleCount: roles.length,
            kind: company.kind,
          },
          reversible: false,
        },
      })

      return { company, roles, person, context }
    }, { timeout: 20_000 })

    // ── The register, where the caller said what this firm is to them ──
    //
    // The dashboard's Add company modal reuses this route, and until now
    // it created a standalone company with no relationship to anybody —
    // a logo in a list. Where the caller is signed in with a company and
    // said what the new firm is to them (CLIENT, SUPPLIER, PRIME, MSP),
    // the register row is written here, in the same request, because a
    // relationship recorded later is a relationship usually not recorded.
    // Required, not optional, where the caller is seated: `mayAddCompany`
    // refused above without it, because a company on the register with
    // no relationship on it is a name nothing can point at.
    const relationship = String(body?.relationship ?? '')
    if (['CLIENT', 'SUPPLIER', 'PRIME', 'MSP'].includes(relationship)) {
      const caller = seatedCaller
      const ownCompanyId = caller?.company?.id
      if (ownCompanyId && ownCompanyId !== result.company.id) {
        await prisma.counterparty.upsert({
          where: {
            companyId_otherCompanyId_relationship: {
              companyId: ownCompanyId,
              otherCompanyId: result.company.id,
              relationship,
            },
          },
          update: {},
          create: {
            companyId: ownCompanyId,
            otherCompanyId: result.company.id,
            relationship,
            status: body?.prospect === true ? 'PROSPECT' : 'ACTIVE',
            createdById: caller.person.id,
          },
        })
      }
    }

    return NextResponse.json({
      data: {
        company: {
          id: result.company.id,
          name: result.company.name,
          slug: result.company.slug,
          kind: result.company.kind,
          domain: result.company.domain,
          siteLiveAt: result.company.siteLiveAt?.toISOString() ?? null,
          networkVerifiedAt: null,
        },
        roles: result.roles.map((r) => ({
          id: r.id,
          name: r.name,
          permissionCount: r.permissions.length,
        })),
        context: result.context
          ? { id: result.context.id, type: result.context.type, role: 'Owner' }
          : null,
        // What just happened, in the words the rule used, so the screen
        // does not have to guess whether the creator is now its owner.
        says: adding.says,
        message: adding.ownsIt
          ? `${result.company.name} created at ${result.company.slug}.etyme.com`
          : `${result.company.name} is on your register.`,
      },
    })
  } catch (err: any) {
    // Handle unique constraint violations (slug race, domain collision)
    if (err?.code === 'P2002') {
      const target = err?.meta?.target
      if (target?.includes('slug')) {
        return NextResponse.json(
          { error: { code: 'SLUG_TAKEN', message: 'This company name is already taken. Please choose another.', field: 'name' } },
          { status: 409 }
        )
      }
      if (target?.includes('domain')) {
        return NextResponse.json(
          { error: { code: 'DOMAIN_TAKEN', message: 'A company with this domain already exists.', field: 'domain' } },
          { status: 409 }
        )
      }
    }
    reportError('Company creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Company creation failed. Please try again.' } },
      { status: 500 }
    )
  }
}

/**
 * GET /api/companies
 *
 * Without ?slug= → list all companies (admin / operate view).
 * With ?slug=    → check slug availability (onboarding).
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')

  // ── Slug availability check ─────────────────────────
  if (slug) {
    const normalized = slugify(slug)
    const reserved = RESERVED_SLUGS.has(normalized)

    if (reserved) {
      return NextResponse.json({
        data: { slug: normalized, available: false, reason: 'This name is reserved' },
      })
    }

    const existing = await prisma.company.findUnique({
      where: { slug: normalized },
      select: { id: true },
    })

    return NextResponse.json({
      data: {
        slug: normalized,
        available: !existing,
        reason: existing ? 'This name is already taken' : null,
      },
    })
  }

  // ── List companies ──────────────────────────────────
  //
  // The register of who this caller trades with — never the platform.
  //
  // This handed every authenticated caller the whole directory: every
  // company, its slug, its domain. The walk of 2026-09-21 read all
  // twenty-seven to Northbend Athletic's program manager, to Techpeple's
  // owner two rungs down somebody else's chain, and to a one-person
  // nursing corporation. The rule and the reasoning are in
  // `lib/directory-scope`; what is gathered here is the evidence for it.
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const reader = readerFor(caller)
  const verdict = directoryScope(reader)

  const visible =
    verdict.reach === 'ALL'
      ? undefined
      : { id: { in: [...(await dealingsOf(caller, verdict.includesOwn))] } }

  const companies = await prisma.company.findMany({
    // Demo and real are separate universes.
    //
    // A visitor looking around must not see a customer's name in the
    // directory, and a customer must not see a stranger's sandbox. The
    // partition is on the flag rather than on a guess about the name,
    // because "looks like demo data" is exactly the judgment nobody
    // should be making about somebody's real book.
    where: visible,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      entityType: true,
      domain: true,
      domainVerified: true,
      currency: true,
      siteLiveAt: true,
      networkVerifiedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    data: {
      // What this list is, for the reader in front of it. The page was
      // headed "Manage vendor, client, MSP, and GSI companies on the
      // platform" for everybody, which is a platform administrator's
      // sentence shown to a nurse's own corporation.
      scope: {
        says: verdict.says,
        ...directoryCopy(caller.company?.kind as any ?? null),
      },
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        kind: c.kind,
        entityType: c.entityType,
        domain: c.domain,
        domainVerified: c.domainVerified,
        currency: c.currency,
        siteLiveAt: c.siteLiveAt?.toISOString() ?? null,
        networkVerifiedAt: c.networkVerifiedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    },
  })
}

/** Which kind of reader is asking, in `lib/directory-scope`'s words. */
function readerFor(caller: import('@/lib/api-context').CallerContext): Reader {
  if (caller.staff) return { as: 'STAFF' }
  if (isConsultantSeat(caller)) return { as: 'CONSULTANT' }
  if (!caller.company) return { as: 'NOBODY' }
  return {
    as: 'COMPANY',
    kind: caller.company.kind as any,
    isDemo: Boolean(caller.company.isDemo),
  }
}
