import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail, getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { isExcludedDomain } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { defaultPostureFor, maySeeOutside } from '@/lib/walls'
import { mayRegisterWithEmail, rolesFor } from '@/lib/company-defaults'

/**
 * POST /api/companies
 *
 * Creates a new company. Mirrors BUILD.md §3 — Onboarding and §4.A.
 *
 * Flow:
 *   1. Slug from domain, collision-numbered, reserved list checked
 *   2. Creates Company, 7 default Roles, owner Context
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

const DEFAULT_ROLES = [
  { name: 'Owner', permissions: ['*'], isDefault: true },
  {
    name: 'Admin',
    permissions: [
      'consultants.read', 'consultants.write', 'consultants.cost',
      'requirements.read', 'requirements.write',
      'submissions.read', 'submissions.create',
      'assignments.read', 'assignments.write',
      'timesheets.read', 'timesheets.approve',
      'invoices.read', 'invoices.issue',
      'payments.record',
      'vendors.read', 'vendors.manage',
      'team.manage', 'settings.manage',
      'utilization.read', 'margin.read',
      'compliance.read', 'imports.run',
    ],
    isDefault: true,
  },
  {
    name: 'Recruiter',
    permissions: [
      'consultants.read', 'consultants.write',
      'requirements.read',
      'submissions.read', 'submissions.create',
      'assignments.read',
      'timesheets.read',
      'vendors.read',
    ],
    isDefault: true,
  },
  {
    name: 'Accountant',
    permissions: [
      'timesheets.read', 'timesheets.approve',
      'invoices.read', 'invoices.issue',
      'payments.record',
      'pnl.read',
    ],
    isDefault: true,
  },
  {
    name: 'Project Manager',
    permissions: [
      'consultants.read',
      'requirements.read', 'requirements.write',
      'submissions.read',
      'assignments.read',
      'timesheets.read', 'timesheets.approve',
      'utilization.read',
    ],
    isDefault: true,
  },
  {
    name: 'Resource Manager',
    permissions: [
      'consultants.read', 'consultants.write',
      'requirements.read',
      'submissions.read', 'submissions.create',
      'assignments.read', 'assignments.write',
      'utilization.read',
    ],
    isDefault: true,
  },
  {
    name: 'Compliance Officer',
    permissions: [
      'consultants.read', 'assignments.read', 'timesheets.read',
      'compliance.read',
    ],
    isDefault: true,
  },
] as const

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

  const baseSlug = slugify(name)

  if (RESERVED_SLUGS.has(baseSlug)) {
    return NextResponse.json(
      { error: { code: 'SLUG_RESERVED', message: `The name "${name}" is reserved. Please choose another.`, field: 'name' } },
      { status: 422 }
    )
  }

  // Domain from the authenticated user's email — unless it is a personal
  // one, which proves nothing about any company and must not be recorded
  // as if it did. gmail.com marked domainVerified would be a lie the
  // whole identity model then repeats.
  const domain = personalEmail ? null : email.split('@')[1]?.toLowerCase() ?? null

  try {
    const slug = await uniqueSlug(baseSlug)

    // One transaction: Company + 7 Roles + owner Person (find or create) + owner Context + AutomationLog
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the company
      const company = await tx.company.create({
        data: {
          name: name.trim(),
          slug,
          domain,
          domainVerified: !personalEmail, // OAuth proves a work domain; gmail proves nothing
          kind: kind as 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP',
          // Same rule as onboarding: a delivery firm or an enterprise
          // starts closed to all but named people.
          outsideAccess: defaultPostureFor(kind),
          siteLiveAt: new Date(),
        },
      })

      // 2. Roles for this KIND of company. Every kind was getting the
      // same seven vendor roles — rolesFor() existed, was tested, and
      // this route never called it. A one-person consultant corp gets
      // one role: Owner. It is their company.
      const seeds =
        kind === 'CONSULTANT_CORP'
          ? rolesFor('CONSULTANT_CORP').map((r) => ({
              name: r.name,
              permissions: r.permissions,
              isDefault: false,
            }))
          : DEFAULT_ROLES
      const roles = await Promise.all(
        seeds.map((r) =>
          tx.role.create({
            data: {
              companyId: company.id,
              name: r.name,
              permissions: [...r.permissions],
              isDefault: r.isDefault,
            },
          })
        )
      )

      const ownerRole = roles.find((r) => r.name === 'Owner')!

      // 3. Find or create the person for this email
      let person = await tx.person.findUnique({
        where: { primaryEmail: email },
      })

      if (!person) {
        person = await tx.person.create({
          data: {
            name: email.split('@')[0],
            primaryEmail: email,
          },
        })
      }

      // 4. Create owner Context — grants Owner role on this company
      const context = await tx.context.create({
        data: {
          personId: person.id,
          type: 'EMPLOYEE',
          companyId: company.id,
          roleId: ownerRole.id,
        },
      })

      // 5. The owner of a consultant corporation IS its consultant.
      //
      // Without this they would register and face an empty bench with an
      // Add consultant form asking about themselves in the third person.
      // The listing is granted at creation — the grant rule protects a
      // consultant from a company marketing them without consent, and
      // consenting to your own one-person company is what registering it
      // means.
      if (kind === 'CONSULTANT_CORP') {
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
          reason: 'User registered a new company via the onboarding flow',
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
    })

    // ── The register, where the caller said what this firm is to them ──
    //
    // The dashboard's Add company modal reuses this route, and until now
    // it created a standalone company with no relationship to anybody —
    // a logo in a list. Where the caller is signed in with a company and
    // said what the new firm is to them (CLIENT, SUPPLIER, PRIME, MSP),
    // the register row is written here, in the same request, because a
    // relationship recorded later is a relationship usually not recorded.
    const relationship = String(body?.relationship ?? '')
    if (['CLIENT', 'SUPPLIER', 'PRIME', 'MSP'].includes(relationship)) {
      const { caller } = await getCallerContext(request)
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
        context: {
          id: result.context.id,
          type: result.context.type,
          role: 'Owner',
        },
        message: `${result.company.name} created at ${result.company.slug}.etyme.com`,
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
    console.error('Company creation failed:', err)
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
  // This handed every authenticated caller the whole platform directory —
  // every company, its domain, its type. Harmless-looking and not: a
  // consultant on somebody's bench got the client list, and a walled
  // delivery firm's engineers got the supplier list, which is precisely
  // what the outside-access setting exists to stop.
  //
  // Three answers now, by who is asking:
  //
  //   a consultant   — the benches they are on, and nothing else
  //   a walled firm  — their own company
  //   a vendor       — the directory, which is their market
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const visible = await directoryScope(caller)

  const companies = await prisma.company.findMany({
    // Demo and real are separate universes.
    //
    // A visitor looking around must not see a customer's name in the
    // directory, and a customer must not see a stranger's sandbox. The
    // partition is on the flag rather than on a guess about the name,
    // because "looks like demo data" is exactly the judgement nobody
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

/**
 * Which companies this caller may see in the directory.
 *
 * A consultant sees the benches they have joined and the places they are
 * placed — the companies they already have dealings with. Not the market.
 * They are in it, they do not shop it.
 *
 * A firm whose outside access is shut sees itself. Everybody else sees the
 * directory, because for a staffing vendor that directory IS the business.
 */
async function directoryScope(
  caller: import('@/lib/api-context').CallerContext
): Promise<Record<string, unknown> | undefined> {
  if (isConsultantSeat(caller)) {
    const [benches, placements] = await Promise.all([
      prisma.benchListing.findMany({
        where: { consultant: { personId: caller.person.id }, revokedAt: null },
        select: { companyId: true },
      }),
      prisma.sellContract.findMany({
        where: { personId: caller.person.id },
        select: { companyId: true, clientCompanyId: true, endClientCompanyId: true },
      }),
    ])

    const ids = new Set<string>()
    for (const b of benches) ids.add(b.companyId)
    for (const c of placements) {
      ids.add(c.companyId)
      ids.add(c.clientCompanyId)
      if (c.endClientCompanyId) ids.add(c.endClientCompanyId)
    }

    return { id: { in: [...ids] } }
  }

  if (!caller.company) return { id: { in: [] } }

  // A demo sees its own sandbox and nothing else.
  //
  // Demo and real are separate universes — a visitor must never see a
  // customer's name and a customer must never see a stranger's sandbox —
  // and one visitor has no business seeing another's either. Somebody
  // looking around should find their own company and the client they bill,
  // not seven copies of a demo client belonging to strangers.
  if (caller.company.isDemo) {
    const dealings = await prisma.sellContract.findMany({
      where: { companyId: caller.company.id },
      select: { clientCompanyId: true, endClientCompanyId: true },
    })

    const mine = new Set<string>([caller.company.id])
    for (const c of dealings) {
      mine.add(c.clientCompanyId)
      if (c.endClientCompanyId) mine.add(c.endClientCompanyId)
    }

    return { id: { in: [...mine] } }
  }

  const outside = maySeeOutside({
    posture: caller.company.outsideAccess,
    permissions: caller.permissions,
  })

  // A real company never sees a sandbox, however open its posture.
  return outside.ok ? { isDemo: false } : { id: caller.company.id }
}
