import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getSessionEmail, getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { isExcludedDomain } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { defaultPostureFor } from '@/lib/walls'
import { directoryScope, directoryCopy, type Reader } from '@/lib/directory-scope'
import { mayRegisterWithEmail, rolesFor } from '@/lib/company-defaults'
import { mayAddCompany } from '@/lib/counterparty'

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

      // 4. Owner Context — only where this is somebody registering a
      //    firm of their own. Recording a counterparty seats nobody:
      //    a client of ours is not a company we own, and granting the
      //    creator `*` on it moved their whole identity off their
      //    employer, because contexts are read most-recently-granted
      //    first.
      const context = adding.ownsIt
        ? await tx.context.create({
            data: {
              personId: person.id,
              type: 'EMPLOYEE',
              companyId: company.id,
              roleId: ownerRole.id,
            },
          })
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
    })

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
  // twenty-seven to Northbend Athletic's program manager, to CloudEPA's
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

/**
 * Every company this caller has dealings with.
 *
 * Six ways a relationship exists, and a name is readable if any one of
 * them does: the caller's own register, an agreement either way, a sell
 * contract either way, a buy contract either way, a requirement
 * invitation either way, and a program-office desk held or granted.
 *
 * A consultant is the seventh case and a different question — the
 * benches that list them and the places they are placed — because a
 * person has no register.
 */
async function dealingsOf(
  caller: import('@/lib/api-context').CallerContext,
  includesOwn: boolean
): Promise<Set<string>> {
  const ids = new Set<string>()

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
    for (const b of benches) ids.add(b.companyId)
    for (const c of placements) {
      ids.add(c.companyId)
      ids.add(c.clientCompanyId)
      if (c.endClientCompanyId) ids.add(c.endClientCompanyId)
    }
    return ids
  }

  const me = caller.company?.id
  if (!me) return ids
  if (includesOwn) ids.add(me)

  const [register, agreements, sells, buys, invitations, seats] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId: me },
      select: { otherCompanyId: true },
    }),
    prisma.masterAgreement.findMany({
      where: { OR: [{ clientId: me }, { vendorId: me }] },
      select: { clientId: true, vendorId: true },
    }),
    prisma.sellContract.findMany({
      where: { OR: [{ companyId: me }, { clientCompanyId: me }, { endClientCompanyId: me }] },
      select: { companyId: true, clientCompanyId: true, endClientCompanyId: true },
    }),
    prisma.buyContract.findMany({
      where: { OR: [{ companyId: me }, { vendorCompanyId: me }] },
      select: { companyId: true, vendorCompanyId: true },
    }),
    prisma.requirementInvitation.findMany({
      where: { OR: [{ fromCompanyId: me }, { toCompanyId: me }] },
      select: { fromCompanyId: true, toCompanyId: true },
    }),
    prisma.programSeat.findMany({
      where: { OR: [{ officeCompanyId: me }, { clientCompanyId: me }] },
      select: { officeCompanyId: true, clientCompanyId: true },
    }),
  ])

  for (const r of register) ids.add(r.otherCompanyId)
  for (const a of agreements) { ids.add(a.clientId); ids.add(a.vendorId) }
  for (const c of sells) {
    ids.add(c.companyId)
    ids.add(c.clientCompanyId)
    if (c.endClientCompanyId) ids.add(c.endClientCompanyId)
  }
  for (const c of buys) { ids.add(c.companyId); if (c.vendorCompanyId) ids.add(c.vendorCompanyId) }
  for (const i of invitations) { ids.add(i.fromCompanyId); ids.add(i.toCompanyId) }
  for (const s of seats) { ids.add(s.officeCompanyId); ids.add(s.clientCompanyId) }

  // A sandbox and a real book are separate universes, whatever else is
  // true: a visitor must never read a customer's name and a customer
  // must never read a stranger's sandbox. Dealings never cross the line
  // today; this is the belt on top of the braces.
  if (!includesOwn) ids.delete(me)
  return ids
}
