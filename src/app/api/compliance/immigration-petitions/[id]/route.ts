import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { writeRecordAction } from '@/lib/record-ledger'
import { queueSeat, refused, refusalOf } from '../../../decision-items/door'
import { dayFrom, entityFor, text } from '../../checklist-items/read'

/**
 * PATCH /api/compliance/immigration-petitions/:id   { filedOn?, stage?, actingEntityId? }
 *
 * Record 112, chain 3. Records what the employer's counsel reports: the day
 * it was filed and where it stands. A filing day starts the public access
 * file's clock (chain 6). Etyme files nothing. Needs consultants.write.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'consultants.write')) return refused(403, 'Recording where a petition stands is for whoever looks after paperwork at your firm.')
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
  if (bits.length === 0) return refused(422, 'Say the filing day or where the petition stands.', 'filedOn')
  try {
    await prisma.$transaction(async (tx) => {
      await tx.petition.update({ where: { id }, data })
      await writeRecordAction(tx, { companyId: seat.companyId, recordType: 'Petition', recordId: id, action: 'PETITION_UPDATED', summary: `Recorded the petition as ${bits.join(', ')}.`, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
    })
  } catch (e) {
    return refusalOf(e)
  }
  return NextResponse.json({ data: { id, message: 'Saved.' } })
}
