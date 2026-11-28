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
 * PATCH /api/compliance/notice-postings/:id   { measuredFromOn, actingEntityId? } a person enters the filing day the notice is measured against (alone, or with a removal)
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
  const filing = text(body.measuredFromOn) ? dayFrom(body.measuredFromOn) : null
  if (text(body.measuredFromOn) && !filing) return refused(422, 'Say the filing day as year-month-day, for example 2026-11-23.', 'measuredFromOn')
  const removing = !!text(body.takenDownOn) || !filing
  if (removing && notice.takenDownOn) return refused(409, 'This notice is already recorded as taken down.')
  const entity = entityFor(seat, body.actingEntityId)
  if (!entity.ok) return refused(422, entity.says, 'actingEntityId')
  const stamp = { companyId: seat.companyId, recordType: 'NoticePosting', recordId: id, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id }
  let early = false
  try {
    if (removing) {
      const ask = removalDayAsk(body)
      if (ask) return refused(422, ask.says, ask.field)
      const removedOn = dayFrom(body.takenDownOn)!
      if (removedOn < notice.postedOn) return refused(422, 'A notice cannot come down before the day it went up.', 'takenDownOn')
      const year = removedOn.getUTCFullYear()
      const endsOn = noticeEndsOn(notice.postedOn, await daysOffFor(seat.companyId), await loadCompanyHolidays(seat.companyId, year - 1, year + 1))
      early = removedEarly(removedOn, endsOn)
      const reason = text(body.reason)
      if (early && !reason) return refused(422, `The required posting period ends ${endsOn.toISOString().slice(0, 10)}. Say why the notice came down sooner; it goes on the record.`, 'reason')
      await prisma.$transaction(async (tx) => {
        await tx.noticePosting.update({ where: { id }, data: { takenDownOn: removedOn, removedById: seat.personId, ...(filing ? { measuredFromOn: filing } : {}) } })
        await writeRecordAction(tx, { ...stamp, action: early ? 'NOTICE_REMOVED_EARLY' : 'NOTICE_REMOVED', summary: early ? `Recorded the ${notice.kind} notice as taken down on ${removedOn.toISOString().slice(0, 10)}, before its period ended ${endsOn.toISOString().slice(0, 10)}. Reason: ${reason}` : `Recorded the ${notice.kind} notice as taken down on ${removedOn.toISOString().slice(0, 10)}.` })
        if (filing) await writeRecordAction(tx, { ...stamp, action: 'NOTICE_FILING_DAY_RECORDED', summary: `Recorded ${filing.toISOString().slice(0, 10)} as the filing day the ${notice.kind} notice is measured against.` })
      })
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.noticePosting.update({ where: { id }, data: { measuredFromOn: filing } })
        await writeRecordAction(tx, { ...stamp, action: 'NOTICE_FILING_DAY_RECORDED', summary: `Recorded ${filing!.toISOString().slice(0, 10)} as the filing day the ${notice.kind} notice is measured against.` })
      })
      return NextResponse.json({ data: { id, early: false, message: 'Saved. The notice is measured against that filing day.' } })
    }
  } catch (e) {
    return refusalOf(e)
  }
  return NextResponse.json({ data: { id, early, message: early ? 'Saved, with your reason. It came down before the required period ended.' : 'Saved. The notice is recorded as taken down.' } })
}
