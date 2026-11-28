import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { writeRecordAction } from '@/lib/record-ledger'
import { queueSeat, refused, refusalOf } from '../../../decision-items/door'
import { dayFrom, entityFor, refuseUnlessKeeper, text } from '../../checklist-items/read'
import { filingCalendar, followFilingDay } from '../../access-file-sync'

/**
 * PATCH /api/compliance/immigration-petitions/:id   { filedOn?, stage?, actingEntityId? }
 *
 * Record 112, chain 3. Records what the employer's counsel reports: the day
 * it was filed and where it stands. A filing day starts, or moves, the public
 * access file's due day in the same save (chain 6), and moves the stage to FILED
 * unless the body names one. Etyme files nothing. Needs governance.read.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const notKeeper = await refuseUnlessKeeper(seat, request, 'Recording where a petition stands is for HR and the compliance officer at your firm.')
  if (notKeeper) return notKeeper
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const petition = await prisma.petition.findFirst({ where: { id, companyId: seat.companyId } })
  if (!petition) return refused(404, 'There is no such petition at your firm.')
  const entity = entityFor(seat, body.actingEntityId)
  if (!entity.ok) return refused(422, entity.says, 'actingEntityId')
  const data: { filedOn?: Date; stage?: string } = {}
  const bits: string[] = []
  if (body.filedOn !== undefined) {
    const d = dayFrom(body.filedOn)
    if (!d) return refused(422, 'Say the filing day as year-month-day, for example 2026-11-23.', 'filedOn')
    data.filedOn = d; bits.push(`filed on ${d.toISOString().slice(0, 10)}`)
  }
  if (body.stage !== undefined) {
    const s = text(body.stage)
    if (!s) return refused(422, 'Say where the petition stands.', 'stage')
    data.stage = s; bits.push(`stage ${s.toLowerCase().replace(/_/g, ' ')}`)
  }
  if (data.filedOn && data.stage === undefined) { data.stage = 'FILED'; bits.push('stage filed') }
  if (bits.length === 0) return refused(422, 'Say the filing day or where the petition stands.', 'filedOn')
  const calendar = data.filedOn ? await filingCalendar(seat.companyId, data.filedOn) : null
  const person = data.filedOn ? (await prisma.person.findUnique({ where: { id: petition.personId }, select: { name: true } }))?.name ?? 'the person' : ''
  try {
    await prisma.$transaction(async (tx) => {
      await tx.petition.update({ where: { id }, data })
      await writeRecordAction(tx, { companyId: seat.companyId, recordType: 'Petition', recordId: id, action: 'PETITION_UPDATED', summary: `Recorded the petition as ${bits.join(', ')}.`, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
      if (data.filedOn && calendar) await followFilingDay(tx, { companyId: seat.companyId, petitionId: id, person, filedOn: data.filedOn, calendar, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
    })
  } catch (e) {
    return refusalOf(e)
  }
  return NextResponse.json({ data: { id, message: data.filedOn ? 'Saved. The petition is filed, and its public access file is tracked from that day.' : 'Saved.' } })
}
