import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { writeRecordAction } from '@/lib/record-ledger'
import { daysOffFor } from '@/lib/days-off'
import { loadCompanyHolidays } from '@/lib/holidays'
import { noticeEndsOn, removedEarly } from '@/lib/agents/checklist-rules'
import { queueSeat, refused, refusalOf } from '../../../decision-items/door'
import { dayFrom, entityFor, refuseUnlessKeeper, text } from '../../checklist-items/read'
import { removalDayAsk } from '../../asks'

/**
 * PATCH /api/compliance/notice-postings/:id   { takenDownOn, reason?, actingEntityId? } a person records the removal
 *
 * Record 112, chain 6. A removal before the required period ended is
 * allowed and needs a reason, which goes on the record: warn, capture a
 * reason, proceed. A removal before the posting day is not a day.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const notKeeper = await refuseUnlessKeeper(seat, request, 'Recording that a notice came down is for HR and the compliance officer at your firm.')
  if (notKeeper) return notKeeper
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const notice = await prisma.noticePosting.findFirst({ where: { id, companyId: seat.companyId } })
  if (!notice) return refused(404, 'There is no such notice at your firm.')
  if (notice.takenDownOn) return refused(409, 'This notice is already recorded as taken down.')
  const ask = removalDayAsk(body)
  if (ask) return refused(422, ask.says, ask.field)
  const removedOn = dayFrom(body.takenDownOn)!
  if (removedOn < notice.postedOn) return refused(422, 'A notice cannot come down before the day it went up.', 'takenDownOn')
  const entity = entityFor(seat, body.actingEntityId)
  if (!entity.ok) return refused(422, entity.says, 'actingEntityId')
  const year = removedOn.getUTCFullYear()
  const endsOn = noticeEndsOn(notice.postedOn, await daysOffFor(seat.companyId), await loadCompanyHolidays(seat.companyId, year - 1, year + 1))
  const early = removedEarly(removedOn, endsOn)
  const reason = text(body.reason)
  if (early && !reason) return refused(422, `The required posting period ends ${endsOn.toISOString().slice(0, 10)}. Say why the notice came down sooner; it goes on the record.`, 'reason')
  try {
    await prisma.$transaction(async (tx) => {
      await tx.noticePosting.update({ where: { id }, data: { takenDownOn: removedOn, removedById: seat.personId } })
      await writeRecordAction(tx, { companyId: seat.companyId, recordType: 'NoticePosting', recordId: id, action: early ? 'NOTICE_REMOVED_EARLY' : 'NOTICE_REMOVED', summary: early ? `Recorded the ${notice.kind} notice as taken down on ${removedOn.toISOString().slice(0, 10)}, before its period ended ${endsOn.toISOString().slice(0, 10)}. Reason: ${reason}` : `Recorded the ${notice.kind} notice as taken down on ${removedOn.toISOString().slice(0, 10)}.`, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
    })
  } catch (e) {
    return refusalOf(e)
  }
  return NextResponse.json({ data: { id, early, message: early ? 'Saved, with your reason. It came down before the required period ended.' : 'Saved. The notice is recorded as taken down.' } })
}
