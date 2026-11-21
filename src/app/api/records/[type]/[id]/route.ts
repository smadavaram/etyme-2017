import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { logAccess } from '@/lib/access-log'
import { recordTimeline } from '@/lib/record-ledger'
import { NOT_ON_YOUR_BOOK, isRecordType, ownPageOf, readNeeds } from '@/lib/decision-queue'
import { findOnBook, subjectOf } from '../../lookup'
import { queueSeat, refused, logRefusal } from '../../../decision-items/door'

/**
 * GET /api/records/[type]/[id] — one record with its whole ledger history (A6)
 *
 * Record 107, Flow A. Opened from a proof link or a ledger row. A record
 * not on the firm's own book is refused in a sentence, and the refusal is
 * logged before it is sent (`recordRefusal`). A person's record read is
 * logged too.
 */

type Params = { params: Promise<{ type: string; id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const { type, id } = await params
  if (!isRecordType(type)) return refused(404, 'That is not a kind of record this page opens.')
  const action = type === 'Person' ? 'PROFILE_VIEW' as const : 'CONTRACT_VIEW' as const
  const needs = readNeeds(type)
  const found = needs && !hasPermission(seat.caller.permissions, needs) ? null : await findOnBook(seat.companyId, type, id)
  if (!found) {
    const subject = (await subjectOf(type, id)) ?? { companyId: seat.companyId }
    const why = needs && !hasPermission(seat.caller.permissions, needs) ? 'Your seat cannot read bills or invoice receipts.' : NOT_ON_YOUR_BOOK
    await logRefusal(seat, subject, `Refused the record view of ${type} ${id}: ${why}`, action)
    return refused(403, why)
  }
  if (type === 'Person') {
    logAccess({ subjectId: id, actorPersonId: seat.personId, actorCompanyId: seat.companyId, action, reason: 'Opened the person’s record view, with its ledger history.' })
  }
  const rows = await recordTimeline(seat.companyId, type, id)
  return NextResponse.json({
    data: {
      type, id, name: found.name, ownPage: ownPageOf(type, id),
      timeline: rows.map((r) => ({ id: r.id, at: r.createdAt, action: r.action, summary: r.summary, personName: r.person.name, entityName: r.actingEntity?.name ?? null, heldAs: r.heldAs, agentKey: r.agentKey })),
    },
  })
}
