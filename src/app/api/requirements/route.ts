import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail, getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { requirementScope } from '@/lib/resolve-client-company'
import { prisma } from '@/lib/db'

/**
 * GET /api/requirements
 *
 * List requirements. BUILD.md: scope=mine|network, sort=priority|recent, q, page
 */
export async function GET(request: NextRequest) {
  const { caller, error: contextError } = await getCallerContext(request)
  if (contextError) return contextError

  if (!hasPermission(caller.permissions, 'requirements.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Reading open roles needs requirements.read' } },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))
  const q = url.searchParams.get('q') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const sort = url.searchParams.get('sort') ?? 'recent'
  const companyId = url.searchParams.get('companyId') ?? undefined

  const id = url.searchParams.get('id') ?? undefined

  const mineId = caller.company?.id ?? '__none__'

  // Who may see which demand.
  //
  // This listed every requirement on the platform to anybody signed in —
  // title, skills, location and both ends of the rate band — with no
  // company filter at all. A competitor could read the whole demand side
  // of somebody else's business, and an employee could read their own
  // firm's client work from the next desk.
  //
  // Three legitimate readers: the company that raised it, a supplier who
  // was invited to it, and — where the raiser deliberately opened it —
  // anybody who is allowed to look outside their own company at all.
  // Composed once, in resolve-client-company, so the single-role surfaces
  // inherit the same rule rather than reassembling four fifths of it.
  const scope = requirementScope(caller)
  if (!scope) {
    return NextResponse.json({
      data: { requirements: [], pagination: { page, limit, total: 0, totalPages: 0 } },
    })
  }

  const where: any = { ...scope }

  if (id) {
    where.id = id
  }

  if (companyId) {
    where.companyId = companyId
  }

  if (status) {
    where.status = status.toUpperCase()
  }

  if (q) {
    // AND, not OR. Assigning to where.OR here would have replaced the
    // visibility clause above with a search clause and shown everything.
    where.AND = [
      {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { skills: { hasSome: q.split(',').map((s) => s.trim()) } },
        ],
      },
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
        endClientCompany: { select: { id: true, name: true } },
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
        // The buyer's own band. What a supplier may charge lives on their
        // invitation precisely so no recipient reads another's number, and
        // this is the buyer's ceiling rather than anybody's offer.
        billMin: r.companyId === mineId ? r.billMin : undefined,
        billMax: r.companyId === mineId ? r.billMax : undefined,
        months: r.months,
        startDate: r.startDate?.toISOString() ?? null,
        status: r.status,
        source: r.source,
        marginClass: r.marginClass,
        rateVisible: r.rateVisible,
        company: r.company,
        // Naming the end client hands a supplier the relationship and a
        // competitor the account. Off unless the firm that holds it said
        // otherwise, exactly like the rate band above.
        endClientCompany:
          r.companyId === mineId || r.endClientVisible ? r.endClientCompany : null,
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
  // The full context rather than just an address, because this needs to
  // know which company the caller belongs to — see below.
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { companyId, title, skills, location, billMin, billMax, months, startDate, msaId, marginClass, rateVisible } = body

  // The caller's own company, unless they said otherwise — and they may
  // not say otherwise.
  //
  // Two things were wrong here. This demanded companyId from the body
  // and the New requirement form never sent it, so raising a
  // requirement through the screen was impossible: 422 "companyId is
  // required", shown to a person as those words. Every page rendered,
  // every test passed, and the button did not work.
  //
  // And it was taken on trust. The check below confirms the company
  // exists; nothing confirmed it was the caller's, so anybody signed in
  // could raise a requirement under anybody else's name.
  //
  // Taking it from the session fixes both. An MSP raising one on a
  // client's behalf is a real case and not this one — it needs a
  // recorded relationship saying so, and inventing that silently here
  // is how the hole got made.
  const mine = caller.company?.id
  if (!mine) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'You need to belong to a company to raise a requirement.' } },
      { status: 403 }
    )
  }
  if (companyId && companyId !== mine) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'You can only raise a requirement for your own company.',
          field: 'companyId',
        },
      },
      { status: 403 }
    )
  }

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Title is required (min 3 characters)', field: 'title' } },
      { status: 422 }
    )
  }

  // Verify company exists

  const requirement = await prisma.requirement.create({
    data: {
      companyId: mine,
      // A vendor answering somebody else's advert is not raising a
      // requisition against their own budget. Approval belongs to whoever
      // owns the demand, and on most of these roles that is not them.
      //
      // Left DRAFT — which is what happened — every award against it was
      // blocked forever. The requisition path set this; the vendor path
      // never did, so the vendor's own roles could never be filled.
      approvalState: 'AUTO_APPROVED',
      // Where the work is, when it is known. Usually it is not: a prime
      // hides the client so their NDA holds.
      endClientCompanyId:
        typeof body.endClientCompanyId === 'string' ? body.endClientCompanyId : null,
      // Who it is worked through — the prime who posted it, or the client
      // direct. Without it there is nobody to submit to.
      payerCompanyId:
        typeof body.payerCompanyId === 'string' ? body.payerCompanyId : null,
      title: title.trim(),
      skills: Array.isArray(skills) ? skills : [],
      location: location ?? null,
      billMin: billMin ?? null,
      billMax: billMax ?? null,
      months: months ?? null,
      startDate: startDate ? new Date(startDate) : null,
      msaId: msaId ?? null,
      marginClass: marginClass ?? null,
      rateVisible: rateVisible === true,
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
