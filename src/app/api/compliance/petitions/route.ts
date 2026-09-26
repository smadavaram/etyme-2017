import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { MOVES, MOVE_WORDS, statusWord } from '@/lib/visa-petition'

/**
 * GET  /api/compliance/petitions            the petitions of people on our books
 * POST /api/compliance/petitions            file one: { personId, type, country, filedAt?, worksiteAddress?, notes? }
 *
 * Whose petitions a company sees: the people it employs or lists on its
 * bench. A client sees none through here — a client's exposure is the
 * work-authorization check on the contract, not the petition file.
 */
async function ourPeople(companyId: string): Promise<string[]> {
  const [seats, bench] = await Promise.all([
    prisma.context.findMany({ where: { companyId, revokedAt: null }, select: { personId: true } }),
    prisma.benchListing.findMany({ where: { companyId, state: 'GRANTED' }, select: { consultant: { select: { personId: true } } } }),
  ])
  return [...new Set([...seats.map((s) => s.personId), ...bench.map((b) => b.consultant.personId)])]
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Visa petitions')
  if (notStaff) return notStaff

  const people = await ourPeople(caller.company!.id)
  const personId = request.nextUrl.searchParams.get('personId')
  const rows = await prisma.visaPetition.findMany({
    where: { personId: personId ? (people.includes(personId) ? personId : '__none__') : { in: people } },
    include: {
      person: { select: { id: true, name: true } },
      events: { orderBy: { occurredAt: 'desc' }, select: { eventType: true, occurredAt: true, notes: true } },
    },
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }],
  })
  return NextResponse.json({
    data: {
      petitions: rows.map((p) => ({
        id: p.id,
        person: p.person,
        type: p.type,
        country: p.country,
        status: p.status,
        word: statusWord(p.status),
        filedAt: p.filedAt?.toISOString() ?? null,
        approvedAt: p.approvedAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        worksiteAddress: p.worksiteAddress,
        moves: (MOVES[p.status] ?? []).map((m) => ({ move: m, word: MOVE_WORDS[m] })),
        events: p.events.map((e) => ({ what: e.eventType, when: e.occurredAt.toISOString(), notes: e.notes })),
      })),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Filing a petition')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Filing a petition is for whoever looks after the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const type = typeof body.type === 'string' ? body.type.trim().toUpperCase() : ''
  const country = typeof body.country === 'string' ? body.country.trim().toUpperCase() : 'US'
  if (!personId || !type) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say who it is for and which visa.' } }, { status: 422 })
  }
  const people = await ourPeople(caller.company!.id)
  if (!people.includes(personId)) {
    return NextResponse.json({ error: { code: 'NOT_YOURS', message: 'That person is not on your books.' } }, { status: 403 })
  }
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId }, select: { name: true } })
  const filedAt = body.filedAt ? new Date(body.filedAt) : new Date()

  const petition = await prisma.visaPetition.create({
    data: {
      personId, type, country, status: 'FILED', filedAt,
      worksiteAddress: typeof body.worksiteAddress === 'string' ? body.worksiteAddress : null,
      petitionedArea: typeof body.petitionedArea === 'string' ? body.petitionedArea : null,
      events: { create: { eventType: 'FILED', occurredAt: filedAt, notes: typeof body.notes === 'string' ? body.notes : null } },
    },
    select: { id: true },
  })

  return NextResponse.json(
    { data: { id: petition.id, status: 'FILED', says: `${person.name}'s ${type} is filed. Record what happens to it from here.` } },
    { status: 201 }
  )
}
