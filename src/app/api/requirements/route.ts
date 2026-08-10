import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/requirements
 *
 * List requirements. BUILD.md: scope=mine|network, sort=priority|recent, q, page
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const url = request.nextUrl
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))
  const q = url.searchParams.get('q') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const sort = url.searchParams.get('sort') ?? 'recent'
  const companyId = url.searchParams.get('companyId') ?? undefined

  const where: any = {}

  if (companyId) {
    where.companyId = companyId
  }

  if (status) {
    where.status = status.toUpperCase()
  }

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { skills: { hasSome: q.split(',').map((s) => s.trim()) } },
    ]
  }

  const orderBy: any =
    sort === 'priority'
      ? [{ status: 'asc' }, { createdAt: 'desc' }]
      : { createdAt: 'desc' }

  const [requirements, total] = await Promise.all([
    prisma.requirement.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { submissions: true, matches: true, invitations: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.requirement.count({ where }),
  ])

  return NextResponse.json({
    data: {
      requirements: requirements.map((r) => ({
        id: r.id,
        title: r.title,
        skills: r.skills,
        location: r.location,
        billMin: r.billMin,
        billMax: r.billMax,
        months: r.months,
        startDate: r.startDate?.toISOString() ?? null,
        status: r.status,
        source: r.source,
        company: r.company,
        counts: {
          submissions: r._count.submissions,
          matches: r._count.matches,
          invitations: r._count.invitations,
        },
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  })
}

/**
 * POST /api/requirements
 *
 * Manual create. BUILD.md: "manual create"
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const body = await request.json()
  const { companyId, title, skills, location, billMin, billMax, months, startDate, msaId } = body

  if (!companyId || typeof companyId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'companyId is required', field: 'companyId' } },
      { status: 422 }
    )
  }

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Title is required (min 3 characters)', field: 'title' } },
      { status: 422 }
    )
  }

  // Verify company exists
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  })

  if (!company) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
      { status: 404 }
    )
  }

  const requirement = await prisma.requirement.create({
    data: {
      companyId,
      title: title.trim(),
      skills: Array.isArray(skills) ? skills : [],
      location: location ?? null,
      billMin: billMin ?? null,
      billMax: billMax ?? null,
      months: months ?? null,
      startDate: startDate ? new Date(startDate) : null,
      msaId: msaId ?? null,
      status: 'OPEN',
      source: 'MANUAL',
    },
  })

  return NextResponse.json({
    data: {
      requirement: {
        id: requirement.id,
        title: requirement.title,
        skills: requirement.skills,
        status: requirement.status,
        createdAt: requirement.createdAt.toISOString(),
      },
      message: `Requirement "${requirement.title}" created`,
    },
  }, { status: 201 })
}
