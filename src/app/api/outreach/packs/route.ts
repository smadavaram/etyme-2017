import { NextRequest, NextResponse } from 'next/server'
import { queueSeat, refused } from '../../decision-items/door'
import { outreachNo } from '../door'
import { packsOf, proposePack } from '@/lib/outreach/pack'
import { PACK_LETTER_CAP } from '@/lib/outreach/pack-rules'

/**
 * GET  /api/outreach/packs  the firm's campaign packs, each with the yes it holds
 * POST /api/outreach/packs  propose one: { name, segmentId, contentKinds } raises one card for one yes
 *
 * Advanced outreach, detection (record 135). A pack sends nothing until a
 * person says yes on its card, and that yes releases this pack only. Detected
 * pushes join an approved pack that declared their segment and content kind;
 * every other push waits as a card.
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  return NextResponse.json({ data: { packs: await packsOf(seat.companyId), letterCap: PACK_LETTER_CAP } })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  const out = await proposePack({ companyId: seat.companyId, personId: seat.personId }, await request.json().catch(() => null))
  if (!out.ok) return refused(out.status, out.says, out.field)
  return NextResponse.json({ data: { id: out.id, taskId: out.taskId } }, { status: 201 })
}
