import { NextRequest, NextResponse } from 'next/server'
import { queueSeat, refused } from '../../../decision-items/door'
import { outreachNo } from '../../door'
import { archiveSegment, defOf, readSegment } from '@/lib/outreach/segment'
import { describeSegment } from '@/lib/outreach/segment-rules'
import { prisma } from '@/lib/db'
import { candidateOutreachNotYours } from '@/lib/outreach/candidate-batch'

/**
 * GET    /api/outreach/segments/:id  who is in the segment now, read fresh from the record
 * DELETE /api/outreach/segments/:id  archive it (refused while an open pack writes to it)
 *
 * A candidate is named only if she has a standing yes to updates; the ones who
 * match without one are counted and never named. No address is returned.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  const { id } = await params
  const row = await prisma.outreachSegment.findFirst({ where: { id, companyId: seat.companyId } })
  if (!row) return refused(404, 'That segment is not one of this firm’s.')
  const def = defOf(row)
  if (def.role === 'CANDIDATE') {
    const no = candidateOutreachNotYours(seat.caller)
    if (no) return refused(403, no)
  }
  const read = await readSegment(seat.companyId, def, seat.personId)
  return NextResponse.json({
    data: {
      id: row.id, name: row.name, says: describeSegment(def), definition: def, archived: row.archivedAt !== null,
      count: read.members.length, withoutYes: read.withoutYes,
      members: read.members.map((m) => ({ name: m.name, companyName: m.companyName })),
      held: read.held,
    },
  })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  const { id } = await params
  const out = await archiveSegment(seat.companyId, id)
  if (!out.ok) return refused(out.status, out.says)
  return NextResponse.json({ data: { archived: true } })
}
