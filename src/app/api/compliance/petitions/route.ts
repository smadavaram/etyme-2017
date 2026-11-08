import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { MOVES, MOVE_WORDS, statusWord } from '@/lib/visa-petition'
import { possessive } from '@/lib/requisition-approval'
import { employerNamedNote } from '@/lib/document-stages/worker-class'
import { CPT_RECORD } from '@/lib/document-stages/worker-class-facts'

/**
 * GET  /api/compliance/petitions            the petitions of people on our books
 * POST /api/compliance/petitions            file one: { personId, type, country, filedAt?, worksiteAddress?, notes? }
 *                                           or record a student's CPT page: { personId, type: 'F1_CPT',
 *                                           employerNamed, authorizedFrom, authorizedTo }
 *
 * An H-1B filed here is filed by the caller's firm, and the FILED event
 * says so ("Employer named: <firm>."), because the start reads which firm
 * petitioned (lib/document-stages/worker-class) and no column holds it
 * yet. A transfer petition is one more H-1B filed by the new employer:
 * its filing receipt is what portability rests on (INA 214(n)).
 *
 * A CPT page is not a petition: the school's designated official
 * endorsed the I-20 for one employer between two dates (8 CFR
 * 214.2(f)(10)(i)), and the firm records what the page says. It is kept
 * here, as type F1_CPT, because it is a status record with dates and a
 * watch, and nothing else holds one.
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
  const notes = typeof body.notes === 'string' ? body.notes : null

  if (type === CPT_RECORD) {
    const employerNamed = typeof body.employerNamed === 'string' ? body.employerNamed.trim() : ''
    const from = body.authorizedFrom ? new Date(body.authorizedFrom) : null
    const to = body.authorizedTo ? new Date(body.authorizedTo) : null
    if (!employerNamed) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: `Say which employer ${possessive(person.name)} CPT page names, as the school wrote it.`, field: 'employerNamed' } }, { status: 422 })
    }
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Give the dates the school authorized the CPT from and to, as printed on the I-20.', field: !from || Number.isNaN(from.getTime()) ? 'authorizedFrom' : 'authorizedTo' } }, { status: 422 })
    }
    if (to.getTime() < from.getTime()) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'The CPT cannot end before it starts. Check the dates on the I-20.', field: 'authorizedTo' } }, { status: 422 })
    }
    const page = await prisma.visaPetition.create({
      data: {
        personId, type, country, status: 'ACTIVE', filedAt: from, approvedAt: from, expiresAt: to,
        events: { create: { eventType: 'FILED', occurredAt: from, notes: employerNamedNote(employerNamed, notes ?? `CPT authorized by the school, recorded by ${caller.company!.name}.`) } },
      },
      select: { id: true },
    })
    return NextResponse.json(
      { data: { id: page.id, status: 'ACTIVE', says: `${possessive(person.name)} CPT for ${employerNamed} is on the record, ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}.` } },
      { status: 201 }
    )
  }

  const petition = await prisma.visaPetition.create({
    data: {
      personId, type, country, status: 'FILED', filedAt,
      worksiteAddress: typeof body.worksiteAddress === 'string' ? body.worksiteAddress : null,
      petitionedArea: typeof body.petitionedArea === 'string' ? body.petitionedArea : null,
      // Which firm filed it, in the words the start reads (no column holds it yet).
      events: { create: { eventType: 'FILED', occurredAt: filedAt, notes: type === 'H1B' ? employerNamedNote(caller.company!.name, notes) : notes } },
    },
    select: { id: true },
  })

  return NextResponse.json(
    { data: { id: petition.id, status: 'FILED', says: `${possessive(person.name)} ${type} is filed. Record what happens to it from here.` } },
    { status: 201 }
  )
}
