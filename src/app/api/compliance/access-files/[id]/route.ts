import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { writeRecordAction } from '@/lib/record-ledger'
import { approvedLate } from '@/lib/agents/checklist-rules'
import { queueSeat, refused, refusalOf } from '../../../decision-items/door'
import { dayFrom, entityFor, text } from '../../checklist-items/read'
import { readyDayAsk } from '../../asks'

/**
 * PATCH /api/compliance/access-files/:id   { readyOn, reason?, actingEntityId? } a person approves the public access file
 *
 * Record 112, chain 6. The agent tracks the day the file is due (within one
 * working day of the filing, proposed); a person approves it. Approving
 * after the due day is allowed and needs a reason, on the record: warn,
 * capture a reason, proceed. Etyme publishes nothing.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'consultants.write')) return refused(403, 'Approving a public access file is for whoever looks after paperwork at your firm.')
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const file = await prisma.publicAccessFile.findFirst({ where: { id, companyId: seat.companyId } })
  if (!file) return refused(404, 'There is no such public access file at your firm.')
  if (file.approvedById) return refused(409, 'This file is already approved.')
  const ask = readyDayAsk(body)
  if (ask) return refused(422, ask.says, ask.field)
  const readyOn = dayFrom(body.readyOn)!
  const entity = entityFor(seat, body.actingEntityId)
  if (!entity.ok) return refused(422, entity.says, 'actingEntityId')
  const late = approvedLate(readyOn, file.readyBy)
  const reason = text(body.reason)
  if (late && !reason) return refused(422, `The file was due ${file.readyBy.toISOString().slice(0, 10)}. Say why it was ready later; it goes on the record.`, 'reason')
  try {
    await prisma.$transaction(async (tx) => {
      await tx.publicAccessFile.update({ where: { id }, data: { readyOn, approvedById: seat.personId } })
      await writeRecordAction(tx, { companyId: seat.companyId, recordType: 'PublicAccessFile', recordId: file.id, action: late ? 'ACCESS_FILE_APPROVED_LATE' : 'ACCESS_FILE_APPROVED', summary: late ? `Approved the public access file, ready ${readyOn.toISOString().slice(0, 10)}, after its due day ${file.readyBy.toISOString().slice(0, 10)}. Reason: ${reason}` : `Approved the public access file, ready ${readyOn.toISOString().slice(0, 10)}.`, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
    })
  } catch (e) {
    return refusalOf(e)
  }
  return NextResponse.json({ data: { id, late, message: late ? 'Saved, with your reason. It was ready after its due day.' : 'Saved. The file is approved.' } })
}
