import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { benchClosedSays, mayBrowseBench, mayWriteWant, readWant, wantSays } from '@/lib/bench-filter'

/**
 * GET  /api/bench/wants — "What we need": this firm's open asks, the open
 *      asks of the firms it already trades with, and the desks an offer
 *      may be sent to.
 * POST /api/bench/wants — write an ask: skills, places, a rate range in
 *      cents an hour, and at most one receiving desk (a role or a person).
 *
 * CLAUDE.md, "The bench is the difference" (2026-09-30): what a firm asks
 * its partners to offer is "What we need", at the top of Partner bench.
 * Partners are the firms on either side of an ACTIVE counterparty row —
 * the same register Partner bench reads — so an ask travels one rung at a
 * time and never to a firm this one does not trade with. A client is
 * refused both ways in a sentence: it does not browse a bench.
 *
 * Who receives an offer is a desk at the asking firm. A partner reads the
 * desk's name — "the Recruiter desk", or a person's name — and nothing
 * else about the firm's people.
 */

type Caller = NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>

function refuse(code: string, message: string, status = 403) {
  return NextResponse.json({ error: { code, message } }, { status })
}

async function partnersOf(companyId: string): Promise<string[]> {
  const [mine, theirs] = await Promise.all([
    prisma.counterparty.findMany({ where: { companyId, status: 'ACTIVE' }, select: { otherCompanyId: true } }),
    prisma.counterparty.findMany({ where: { otherCompanyId: companyId, status: 'ACTIVE' }, select: { companyId: true } }),
  ])
  return [...new Set([...mine.map((c) => c.otherCompanyId), ...theirs.map((c) => c.companyId)])].filter((id) => id !== companyId)
}

const WANT_SELECT = {
  id: true, companyId: true, skills: true, places: true, rateMinCents: true, rateMaxCents: true, currency: true,
  createdAt: true,
  receivingRole: { select: { id: true, name: true } },
  receivingPerson: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  company: { select: { name: true } },
} as const

function shape(w: any) {
  return {
    id: w.id,
    firm: w.company.name,
    skills: w.skills,
    places: w.places,
    rateMinCents: w.rateMinCents,
    rateMaxCents: w.rateMaxCents,
    currency: w.currency,
    receivingRole: w.receivingRole,
    receivingPerson: w.receivingPerson,
    writtenBy: w.createdBy.name,
    createdAt: w.createdAt.toISOString(),
    says: wantSays({
      skills: w.skills, places: w.places, rateMinCents: w.rateMinCents, rateMaxCents: w.rateMaxCents,
      currency: w.currency, roleName: w.receivingRole?.name ?? null, personName: w.receivingPerson?.name ?? null,
    }),
  }
}

/** The checks both verbs share; null when the caller may read. */
function readRefusal(caller: Caller) {
  if (!hasPermission(caller.permissions, 'consultants.read')) {
    return refuse('FORBIDDEN', benchClosedSays(caller.company?.name ?? 'your firm'))
  }
  const browse = mayBrowseBench({ companyKind: caller.company?.kind ?? null, scope: 'network' })
  if (!browse.ok) return refuse(browse.code, browse.says)
  if (!caller.company?.id) return refuse('NO_COMPANY', 'What a firm needs belongs to a firm. Sign in at the firm you are asking for.')
  return null
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const no = readRefusal(caller)
  if (no) return no
  const companyId = caller.company!.id

  const partnerIds = await partnersOf(companyId)
  const [ours, theirs, roles, seats] = await Promise.all([
    prisma.benchWant.findMany({ where: { companyId, closedAt: null }, select: WANT_SELECT, orderBy: { createdAt: 'desc' } }),
    partnerIds.length
      ? prisma.benchWant.findMany({
          // A client's row never reaches here: a client cannot write one.
          where: { companyId: { in: partnerIds }, closedAt: null, company: { kind: { not: 'CLIENT' } } },
          select: WANT_SELECT,
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
    prisma.role.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.context.findMany({
      where: { companyId, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null },
      select: { person: { select: { id: true, name: true } } },
    }),
  ])
  const people = [...new Map(seats.map((s) => [s.person.id, s.person])).values()].sort((a, b) => a.name.localeCompare(b.name))
  const may = mayWriteWant({ companyKind: caller.company?.kind ?? null, writesPeople: hasPermission(caller.permissions, 'consultants.write') })

  return NextResponse.json({
    data: {
      ours: ours.map(shape),
      partners: theirs.map(shape),
      desks: { roles, people },
      mayWrite: may.ok,
      writeSays: may.ok ? null : may.says,
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const no = readRefusal(caller)
  if (no) return no
  const may = mayWriteWant({ companyKind: caller.company?.kind ?? null, writesPeople: hasPermission(caller.permissions, 'consultants.write') })
  if (!may.ok) return refuse('FORBIDDEN', may.says)
  const companyId = caller.company!.id

  const read = readWant(await request.json().catch(() => null))
  if (!read.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: read.says, field: read.field } }, { status: 422 })
  const w = read.want

  // The desk must be this firm's own: a role it holds, or a person seated here.
  if (w.receivingRoleId && !(await prisma.role.findFirst({ where: { id: w.receivingRoleId, companyId }, select: { id: true } }))) {
    return refuse('VALIDATION', 'That role is not one of your firm’s. Choose a desk from the list.', 422)
  }
  if (
    w.receivingPersonId &&
    !(await prisma.context.findFirst({ where: { personId: w.receivingPersonId, companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } }))
  ) {
    return refuse('VALIDATION', 'That person does not work at your firm. Choose somebody from the list.', 422)
  }

  try {
    const made = await prisma.benchWant.create({
      data: { companyId, ...w, currency: 'USD', createdById: caller.person.id },
      select: WANT_SELECT,
    })
    const row = shape(made)
    return NextResponse.json(
      { data: { want: row, message: `Saved. Firms you trade with now read: ${row.says}.` } },
      { status: 201 }
    )
  } catch (err) {
    reportError('Saving what a firm needs failed:', err)
    return refuse('INTERNAL', 'Nothing was saved. Try again.', 500)
  }
}
