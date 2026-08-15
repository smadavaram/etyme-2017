import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { isExcludedDomain } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

  // Personal email domains cannot register companies
  if (isExcludedDomain(email)) {
    return NextResponse.json(
      {
        error: {
          code: 'PERSONAL_EMAIL',
          message:
            'Company registration requires a work email. Personal domains (gmail, yahoo, etc.) are not accepted.',
        },
      },
      { status: 422 }
    )
  }

  const body = await request.json()
  const { name, kind = 'VENDOR' } = body

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Company name is required (min 2 characters)', field: 'name' } },
      { status: 422 }
    )
  }

  const validKinds = ['VENDOR', 'CLIENT', 'MSP', 'GSI']
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

  // Domain from the authenticated user's email
  const domain = email.split('@')[1]?.toLowerCase() ?? null

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
          domainVerified: true, // came from OAuth
          kind: kind as 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI',
          siteLiveAt: new Date(),
        },
      })

      // 2. Create 7 default roles
      const roles = await Promise.all(
        DEFAULT_ROLES.map((r) =>
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

      // 5. AutomationLog — "Company created with 7 default roles"
      await tx.automationLog.create({
        data: {
          companyId: company.id,
          action: 'COMPANY_CREATED',
          summary: `Company "${company.name}" created at ${slug}.etyme.com with 7 default roles`,
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
 * GET /api/companies?slug=
 *
 * Check slug availability.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')

  if (!slug) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'slug parameter is required' } },
      { status: 422 }
    )
  }

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
