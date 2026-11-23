import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { writeRecordAction } from '@/lib/record-ledger'
import { PETITION_LINES } from '@/lib/agents/checklist-rules'
import { queueSeat, refused, refusalOf } from '../../decision-items/door'
import { dayFrom, entityFor, text } from '../checklist-items/read'

/**
 * GET  /api/compliance/immigration-petitions   the firm's petitions, each with its paper lines and what is missing
 * POST /api/compliance/immigration-petitions   { personId, kind, stage?, filedOn?, actingEntityId? } start one petition's checklist
 *
 * Record 112, chain 3. One record per petition, each dependent paper its own
 * line; complete only when every line is met. Etyme files nothing and keeps
 * no paper's contents: a line holds a label, a state and a reference.
 * Needs consultants.write. A person at this firm only.
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'consultants.write') && !seat.ownerOrAdmin) return refused(403, 'Petitions are read by whoever looks after paperwork at your firm.')
  const petitions = await prisma.petition.findMany({ where: { companyId: seat.companyId }, orderBy: { createdAt: 'desc' }, take: 200 })
  const items = await prisma.checklistItem.findMany({ where: { companyId: seat.companyId, kind: 'PETITION_PAPER', ownerId: { in: petitions.map((p) => p.id) } }, orderBy: { createdAt: 'asc' } })
  const people = await prisma.person.findMany({ where: { id: { in: petitions.map((p) => p.personId) } }, select: { id: true, name: true } })
  return NextResponse.json({
    data: {
      petitions: petitions.map((p) => {
        const own = items.filter((i) => i.ownerId === p.id)
        return {
          id: p.id, person: people.find((x) => x.id === p.personId)?.name ?? null, kind: p.kind, stage: p.stage, filedOn: p.filedOn?.toISOString().slice(0, 10) ?? null,
          lines: own.map((i) => ({ id: i.id, label: i.label, state: i.state, reference: i.actualValue, signatoryPersonId: i.signatoryPersonId })),
          complete: own.length > 0 && own.every((i) => i.state === 'MET'),
        }
      }),
    },
  })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'consultants.write')) return refused(403, 'Starting a petition’s checklist is for whoever looks after paperwork at your firm.')
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const personId = text(body.personId)
  const kind = text(body.kind)
  if (!personId) return refused(422, 'Choose the person the petition is for.', 'personId')
  if (!kind) return refused(422, 'Say what kind of petition this is.', 'kind')
  const filedOnRaw = text(body.filedOn)
  const filedOn = filedOnRaw ? dayFrom(filedOnRaw) : null
  if (filedOnRaw && !filedOn) return refused(422, 'Say the filing day as year-month-day, for example 2026-11-23.', 'filedOn')
  const entity = entityFor(seat, body.actingEntityId)
  if (!entity.ok) return refused(422, entity.says, 'actingEntityId')
  // Only a person this firm employs or holds on its bench.
  const known = (await prisma.context.count({ where: { companyId: seat.companyId, personId, revokedAt: null } }))
    + (await prisma.benchListing.count({ where: { companyId: seat.companyId, consultant: { personId } } }))
  if (known === 0) return refused(422, 'That person is not on your payroll or your bench, so a petition cannot be kept for them here.', 'personId')
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { name: true } })
  try {
    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.petition.create({ data: { companyId: seat.companyId, personId, kind, stage: text(body.stage) || 'PREPARING', filedOn, employerCompanyId: seat.companyId } })
      await tx.checklistItem.createMany({ data: PETITION_LINES.map((l) => ({ companyId: seat.companyId, ownerType: 'Petition', ownerId: p.id, kind: 'PETITION_PAPER' as const, label: l.label })) })
      await writeRecordAction(tx, { companyId: seat.companyId, recordType: 'Petition', recordId: p.id, action: 'PETITION_STARTED', summary: `Started the checklist for ${person?.name ?? 'the person'}’s ${kind.toLowerCase().replace(/_/g, ' ')} petition: ${PETITION_LINES.length} papers, each its own line.`, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
      return p
    })
    return NextResponse.json({ data: { id: created.id, message: 'Saved. Each paper is its own line. The petition is complete when every line is on hand.' } }, { status: 201 })
  } catch (e) {
    return refusalOf(e)
  }
}
