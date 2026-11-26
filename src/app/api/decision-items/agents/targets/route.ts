import { NextRequest, NextResponse } from 'next/server'
import { readTargetAsk, mayTarget, setTarget } from '@/lib/skills/performance-read'
import { queueSeat, refused, refusalOf } from '../../door'

/**
 * PUT /api/decision-items/agents/targets
 *   { subjectKind: 'SKILL' | 'AGENT', subjectKey, period: 'DAY' | 'WEEK' | 'MONTH', target: whole number | null, actingEntityId }
 *
 * The Owner's own number for a skill or an agent (records 123, 125). Only
 * the Owner sets it; an Admin reads the panel and is refused here in a
 * sentence. A null target clears it back to a dash. Every change is a row
 * on the ledger (TARGET_SET). A company's target is read and written only
 * under its own seat.
 */

export async function PUT(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const who = mayTarget(seat.roleName)
  if (who) return refused(403, who)
  const body = await request.json().catch(() => ({}))
  const read = readTargetAsk(body)
  if (!read.ok) return refused(422, read.says, read.field)
  const entity = typeof body?.actingEntityId === 'string' && body.actingEntityId.trim() ? body.actingEntityId.trim() : seat.entities.length === 1 ? seat.entities[0].id : null
  if (seat.entities.length > 1 && !entity) return refused(422, 'This company has legal entities. Choose which one this change is made for.', 'actingEntityId')
  try {
    const ask = await setTarget({ companyId: seat.companyId, roleName: seat.roleName, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity, ask: read.ask })
    return NextResponse.json({ data: ask })
  } catch (e) {
    return refusalOf(e)
  }
}
