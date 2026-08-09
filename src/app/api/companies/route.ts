import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions, isExcludedDomain } from '@/lib/auth'

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
  { name: 'Owner', permissions: ['*'] },
  { name: 'Admin', permissions: ['consultants.read', 'consultants.write', 'requirements.read', 'requirements.write', 'submissions.read', 'submissions.create', 'assignments.read', 'assignments.write', 'timesheets.read', 'timesheets.approve', 'invoices.read', 'invoices.issue', 'vendors.read', 'vendors.manage', 'team.manage', 'settings.manage'] },
  { name: 'Recruiter', permissions: ['consultants.read', 'consultants.write', 'requirements.read', 'submissions.read', 'submissions.create', 'assignments.read', 'timesheets.read', 'vendors.read'] },
  { name: 'Accountant', permissions: ['timesheets.read', 'timesheets.approve', 'invoices.read', 'invoices.issue', 'payments.record', 'pnl.read'] },
  { name: 'Project Manager', permissions: ['consultants.read', 'requirements.read', 'requirements.write', 'submissions.read', 'assignments.read', 'timesheets.read', 'timesheets.approve', 'utilization.read'] },
  { name: 'Resource Manager', permissions: ['consultants.read', 'consultants.write', 'requirements.read', 'submissions.read', 'submissions.create', 'assignments.read', 'assignments.write', 'utilization.read'] },
  { name: 'Compliance Officer', permissions: ['consultants.read', 'assignments.read', 'timesheets.read'] },
] as const

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  // Personal email domains cannot register companies
  if (isExcludedDomain(session.user.email)) {
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

  const slug = slugify(name)

  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: { code: 'SLUG_RESERVED', message: `The name "${name}" is reserved. Please choose another.`, field: 'name' } },
      { status: 422 }
    )
  }

  // TODO: Check slug collision in DB, append number if needed
  // TODO: Create Company, 7 Roles, owner Context in one transaction
  // TODO: Fire siteGenerate background job
  // TODO: Write AutomationLog: "Company created with 7 default roles"

  return NextResponse.json({
    data: {
      company: {
        id: 'placeholder',
        name: name.trim(),
        slug,
        kind,
        siteLiveAt: new Date().toISOString(),
        networkVerifiedAt: null,
      },
      roles: DEFAULT_ROLES.map((r) => ({ name: r.name, permissionCount: r.permissions.length })),
      message: `${name} created at ${slug}.etyme.com`,
    },
  })
}

/**
 * GET /api/companies/slug-available?slug=
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

  // TODO: Check DB for existing company with this slug

  return NextResponse.json({
    data: {
      slug: normalized,
      available: !reserved,
      reason: reserved ? 'This name is reserved' : null,
    },
  })
}
