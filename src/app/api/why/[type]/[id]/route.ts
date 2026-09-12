import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { unitsVisibleTo } from '@/lib/walls'
import {
  whyContract, whyConsultant, whyRequirement, refusalText, type Viewer,
} from '@/lib/why'

/**
 * GET /api/why/:type/:id            — why can I see this, or why not
 * GET /api/why/:type/:id?person=…   — why can they, which is the real question
 *
 * The second form is the one an administrator actually has. Somebody says
 * "I can't see the Nike contract", and today the only way to answer is to
 * read four rule sets and guess. This answers it, in the words the person
 * would need, and says which of the two things to change.
 *
 * Answering about somebody else needs team.manage and only works for
 * people at your own company — the explanation names their role, their
 * account and their company's settings, which is not a thing to hand to a
 * stranger.
 */

async function viewerFor(personId: string, companyId: string | null): Promise<Viewer | null> {
  const context = await prisma.context.findFirst({
    where: {
      personId,
      revokedAt: null,
      suspendedAt: null,
      ...(companyId ? { companyId } : {}),
    },
    orderBy: { grantedAt: 'desc' },
    include: {
      person: { select: { name: true } },
      company: { select: { id: true, name: true, outsideAccess: true, accountWalls: true } },
      role: { select: { permissions: true } },
      orgUnit: { select: { id: true, name: true } },
    },
  })
  if (!context) return null

  let unitsVisible: string[] | null = null
  if (context.company?.accountWalls && context.orgUnitId) {
    const units = await prisma.orgUnit.findMany({
      where: { companyId: context.company.id },
      select: { id: true, parentId: true },
    })
    const childrenOf = new Map<string, string[]>()
    for (const u of units) {
      if (!u.parentId) continue
      childrenOf.set(u.parentId, [...(childrenOf.get(u.parentId) ?? []), u.id])
    }
    unitsVisible = unitsVisibleTo({ walls: true, unitId: context.orgUnitId, childrenOf })
  }

  return {
    personId,
    name: context.person.name,
    companyId: context.company?.id ?? null,
    companyName: context.company?.name,
    outsideAccess: context.company?.outsideAccess ?? 'NAMED_ONLY',
    permissions: (context.role?.permissions as string[]) ?? [],
    orgUnitId: context.orgUnitId,
    unitsVisible,
    unitName: context.orgUnit?.name ?? null,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { type, id } = await params
  const about = request.nextUrl.searchParams.get('person')

  // Asking about somebody else is an administrator's question, and it is
  // answered only about their own colleagues.
  if (about && about !== caller.person.id) {
    if (!hasPermission(caller.permissions, 'team.manage')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Asking why somebody else can or cannot see something needs team.manage.',
          },
        },
        { status: 403 }
      )
    }
    const theirs = await prisma.context.findFirst({
      where: { personId: about, companyId: caller.company?.id ?? '__none__', revokedAt: null },
      select: { id: true },
    })
    if (!theirs) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'That person does not hold a seat at your company.' } },
        { status: 404 }
      )
    }
  }

  const viewer = about
    ? await viewerFor(about, caller.company?.id ?? null)
    : await viewerFor(caller.person.id, caller.company?.id ?? null)

  if (!viewer) {
    return NextResponse.json(
      { error: { code: 'NO_CONTEXT', message: 'That person has no live seat to answer for.' } },
      { status: 404 }
    )
  }

  switch (type) {
    case 'contract': {
      const c = await prisma.sellContract.findUnique({
        where: { id },
        select: {
          personId: true, companyId: true, clientCompanyId: true,
          endClientCompanyId: true, deliveryUnitId: true, orgUnitId: true,
          person: { select: { name: true } },
          company: { select: { name: true } },
        },
      })
      if (!c) return notFound('placement')
      const why = whyContract(viewer, c)
      return answer(why, viewer, `${c.person.name}’s placement through ${c.company.name}`)
    }

    case 'consultant': {
      const p = await prisma.consultantProfile.findUnique({
        where: { id },
        select: {
          personId: true,
          person: {
            select: {
              name: true,
              contexts: { where: { revokedAt: null }, select: { companyId: true } },
            },
          },
          listings: { where: { revokedAt: null }, select: { companyId: true } },
        },
      })
      if (!p) return notFound('person')
      const why = whyConsultant(viewer, {
        personId: p.personId,
        listedTo: p.listings.map((l) => l.companyId),
        worksAt: p.person.contexts.map((c) => c.companyId).filter((x): x is string => x !== null),
      })
      return answer(why, viewer, p.person.name)
    }

    case 'requirement': {
      const r = await prisma.requirement.findUnique({
        where: { id },
        select: {
          companyId: true, openToNetwork: true, status: true, endClientVisible: true,
          title: true,
          invitations: { select: { toCompanyId: true } },
        },
      })
      if (!r) return notFound('role')
      const why = whyRequirement(viewer, {
        companyId: r.companyId,
        openToNetwork: r.openToNetwork,
        status: r.status,
        invited: r.invitations.map((i) => i.toCompanyId),
        endClientVisible: r.endClientVisible,
      })
      return answer(why, viewer, r.title)
    }

    default:
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Ask about a contract, a consultant or a requirement.',
          },
        },
        { status: 422 }
      )
  }
}

function notFound(what: string) {
  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: `No ${what} by that id.` } },
    { status: 404 }
  )
}

function answer(
  why: ReturnType<typeof whyContract>,
  viewer: Viewer,
  subject: string
) {
  return NextResponse.json({
    data: {
      subject,
      person: { id: viewer.personId, name: viewer.name },
      visible: why.visible,
      // The sentence to put on screen. Everything else is the working.
      said: refusalText(why),
      because: why.because,
      fix: why.fix,
      checks: why.checks,
      hidden: why.hidden,
    },
  })
}
