import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { writeRecordAction } from '@/lib/record-ledger'
import { daysOffFor } from '@/lib/days-off'
import { loadCompanyHolidays } from '@/lib/holidays'
import { PROPOSED_NOTICE_WORKING_DAYS, noticeEndsOn } from '@/lib/agents/checklist-rules'
import { queueSeat, logRefusal, refused, refusalOf } from '../../decision-items/door'
import { dayFrom, entityFor, mayKeepPapers, refuseUnlessKeeper, text } from '../checklist-items/read'
import { noticePostedAsk } from '../asks'

/**
 * GET  /api/compliance/notice-postings   the firm's notices, each with the day its required posting period ends
 * POST /api/compliance/notice-postings   { kind, locationId, postedOn, fileRef?, actingEntityId? } a person records a notice posted
 *
 * Record 112, chain 6. A person posts the notice and records it here; the
 * compliance watch counts the required period (10 working days, proposed)
 * and opens a card when it ends so a person takes it down and records the
 * removal. Etyme publishes and removes nothing. Needs governance.read (HR, the Compliance Officer, an Owner or an Admin).
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'governance.read') && !seat.ownerOrAdmin) {
    await logRefusal(seat, { companyId: seat.companyId }, `Refused the read of ${request.nextUrl.pathname} to a seat that does not look after it.`)
    return refused(403, 'Posted notices are read by HR and the compliance officer at your firm.')
  }
  const rows = await prisma.noticePosting.findMany({ where: { companyId: seat.companyId }, orderBy: { postedOn: 'desc' }, take: 200 })
  const year = new Date().getUTCFullYear()
  const mayRecord = true // the read is already HR's and the compliance officer's
  const [daysOff, holidays, sites] = await Promise.all([
    daysOffFor(seat.companyId), loadCompanyHolidays(seat.companyId, year - 1, year + 1),
    prisma.companyLocation.findMany({ where: { companyId: seat.companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }),
  ])
  return NextResponse.json({
    data: {
      notices: rows.map((r) => ({
        id: r.id, kind: r.kind, site: sites.find((s) => s.id === r.locationId)?.name ?? null, postedOn: r.postedOn.toISOString().slice(0, 10),
        periodEndsOn: noticeEndsOn(r.postedOn, daysOff, holidays).toISOString().slice(0, 10), takenDownOn: r.takenDownOn?.toISOString().slice(0, 10) ?? null, fileRef: r.fileRef,
      })),
      sites, entities: seat.entities, mayRecord,
      // A proposal, not a confirmed rule: the screen says so beside the period.
      rules: { noticeWorkingDays: PROPOSED_NOTICE_WORKING_DAYS, confirmed: false },
    },
  })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const notKeeper = await refuseUnlessKeeper(seat, request, 'Recording a posted notice is for HR and the compliance officer at your firm.')
  if (notKeeper) return notKeeper
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const ask = noticePostedAsk(body)
  if (ask) return refused(422, ask.says, ask.field)
  const kind = text(body.kind)
  const site = await prisma.companyLocation.findFirst({ where: { id: text(body.locationId), companyId: seat.companyId }, select: { id: true, name: true } })
  if (!site) return refused(422, 'Choose the site where the notice was posted. It must be one of your firm’s sites.', 'locationId')
  const postedOn = dayFrom(body.postedOn)!
  const entity = entityFor(seat, body.actingEntityId)
  if (!entity.ok) return refused(422, entity.says, 'actingEntityId')
  try {
    const row = await prisma.$transaction(async (tx) => {
      const n = await tx.noticePosting.create({ data: { companyId: seat.companyId, kind, locationId: site.id, postedOn, postedById: seat.personId, fileRef: text(body.fileRef) || null } })
      await writeRecordAction(tx, { companyId: seat.companyId, recordType: 'NoticePosting', recordId: n.id, action: 'NOTICE_POSTED', summary: `Recorded a ${kind} notice posted at ${site.name} on ${postedOn.toISOString().slice(0, 10)}.`, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id })
      return n
    })
    return NextResponse.json({ data: { id: row.id, message: 'Saved. You are told when the required posting period ends, so the notice can come down.' } }, { status: 201 })
  } catch (e) {
    return refusalOf(e)
  }
}
