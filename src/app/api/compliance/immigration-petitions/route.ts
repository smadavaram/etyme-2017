import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { writeRecordAction } from '@/lib/record-ledger'
import { petitionListFor, petitionWords } from '@/lib/agents/checklist-rules'
import { ownersOnOffer } from '@/lib/decision-items'
import { queueSeat, logRefusal, refused, refusalOf } from '../../decision-items/door'
import { dayFrom, entityFor, mayKeepPapers, refuseUnlessKeeper, text } from '../checklist-items/read'
import { startPetitionAsk } from '../asks'
import { filingCalendar, followFilingDay } from '../access-file-sync'

/**
 * GET  /api/compliance/immigration-petitions   the firm's petitions, each with its paper lines and what is missing
 * POST /api/compliance/immigration-petitions   { personId, kind, stage?, filedOn?, actingEntityId? } start one petition's checklist
 *
 * Record 112, chain 3. One record per petition, each dependent paper its own
 * line; complete only when every line is met. Etyme files nothing and keeps
 * no paper's contents: a line holds a label, a state and a reference.
 * Needs governance.read (HR, the Compliance Officer, an Owner or an Admin). A person at this firm only.
 */
/** A petition's papers keep the order its type's list names them in, whatever was saved last; a line not on the list sorts last. */
const lineOrder = (kind: string, label: string) => { const lines = petitionListFor(kind).lines; const i = lines.findIndex((l) => l.label === label); return i < 0 ? lines.length : i }

export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'governance.read') && !seat.ownerOrAdmin) {
    await logRefusal(seat, { companyId: seat.companyId }, `Refused the read of ${request.nextUrl.pathname} to a seat that does not look after it.`)
    return refused(403, 'Petitions are read by HR and the compliance officer at your firm.')
  }
  const petitions = await prisma.petition.findMany({ where: { companyId: seat.companyId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 200 })
  const items = await prisma.checklistItem.findMany({ where: { companyId: seat.companyId, kind: 'PETITION_PAPER', ownerId: { in: petitions.map((p) => p.id) } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  const signatoryIds = items.map((i) => i.signatoryPersonId).filter((x): x is string => !!x)
  const people = await prisma.person.findMany({ where: { id: { in: [...petitions.map((p) => p.personId), ...signatoryIds] } }, select: { id: true, name: true } })
  const mayWrite = mayKeepPapers(seat)
  // Who a petition may be started for: this firm's own people and its bench, as the POST accepts.
  const [seats, benched, signatories] = mayWrite ? await Promise.all([
    prisma.context.findMany({ where: { companyId: seat.companyId, revokedAt: null, type: { in: ['EMPLOYEE', 'CONSULTANT'] } }, select: { personId: true }, take: 500 }),
    prisma.benchListing.findMany({ where: { companyId: seat.companyId }, select: { consultant: { select: { personId: true } } }, take: 500 }),
    ownersOnOffer(seat.companyId),
  ]) : [[], [], []]
  const startable = await prisma.person.findMany({ where: { id: { in: [...seats.map((s) => s.personId), ...benched.map((b) => b.consultant.personId)] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  return NextResponse.json({
    data: {
      petitions: petitions.map((p) => {
        const own = items.filter((i) => i.ownerId === p.id)
        const list = petitionListFor(p.kind)
        const SIGNED = new Set<string>(list.lines.filter((l) => l.signature).map((l) => l.label))
        return {
          id: p.id, person: people.find((x) => x.id === p.personId)?.name ?? null, kind: p.kind, stage: p.stage, filedOn: p.filedOn?.toISOString().slice(0, 10) ?? null,
          lines: [...own].sort((a, b) => lineOrder(p.kind, a.label) - lineOrder(p.kind, b.label) || a.id.localeCompare(b.id)).map((i) => ({ id: i.id, label: i.label, state: i.state, reference: i.actualValue, signatoryPersonId: i.signatoryPersonId, signatoryName: people.find((x) => x.id === i.signatoryPersonId)?.name ?? null, needsSignature: SIGNED.has(i.label) })),
          listConfirmed: list.confirmed,
          complete: own.length > 0 && own.every((i) => i.state === 'MET'),
        }
      }),
      entities: seat.entities, mayRecord: mayWrite, people: startable, signatories,
    },
  })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const notKeeper = await refuseUnlessKeeper(seat, request, 'Starting a petition’s checklist is for HR and the compliance officer at your firm.')
  if (notKeeper) return notKeeper
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const ask = startPetitionAsk(body)
  if (ask) return refused(422, ask.says, ask.field)
  const personId = text(body.personId)
  const kind = text(body.kind)
  const filedOn = text(body.filedOn) ? dayFrom(body.filedOn) : null
  const entity = entityFor(seat, body.actingEntityId)
  if (!entity.ok) return refused(422, entity.says, 'actingEntityId')
  // Only a person this firm employs or holds on its bench.
  const known = (await prisma.context.count({ where: { companyId: seat.companyId, personId, revokedAt: null } }))
    + (await prisma.benchListing.count({ where: { companyId: seat.companyId, consultant: { personId } } }))
  if (known === 0) return refused(422, 'That person is not on your payroll or your bench, so a petition cannot be kept for them here.', 'personId')
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { name: true } })
  const list = petitionListFor(kind)
  const calendar = filedOn ? await filingCalendar(seat.companyId, filedOn) : null
  try {
    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.petition.create({ data: { companyId: seat.companyId, personId, kind, stage: text(body.stage) || (filedOn ? 'FILED' : 'PREPARING'), filedOn, employerCompanyId: seat.companyId } })
      await tx.checklistItem.createMany({ data: list.lines.map((l) => ({ companyId: seat.companyId, ownerType: 'Petition', ownerId: p.id, kind: 'PETITION_PAPER' as const, label: l.label })) })
      await writeRecordAction(tx, { companyId: seat.companyId, recordType: 'Petition', recordId: p.id, action: 'PETITION_STARTED', summary: `Started the checklist for ${person?.name ?? 'the person'}’s ${petitionWords(kind)}: ${list.lines.length} papers from the ${list.key === 'H1B' ? 'H-1B' : 'general'} list, each its own line.${list.confirmed ? '' : ' The list is a proposal; regulatory has not confirmed it.'}`, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
      if (filedOn && calendar) await followFilingDay(tx, { companyId: seat.companyId, petitionId: p.id, person: person?.name ?? 'the person', filedOn, calendar, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
      return p
    })
    return NextResponse.json({ data: { id: created.id, message: filedOn ? 'Saved. Each paper is its own line, and the public access file is tracked from the filing day.' : 'Saved. Each paper is its own line. The petition is complete when every line is on hand.' } }, { status: 201 })
  } catch (e) {
    return refusalOf(e)
  }
}
