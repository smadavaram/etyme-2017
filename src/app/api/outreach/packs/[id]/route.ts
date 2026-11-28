import { NextRequest, NextResponse } from 'next/server'
import { queueSeat, refused } from '../../../decision-items/door'
import { outreachNo } from '../../door'
import { closePack } from '@/lib/outreach/pack'

/**
 * DELETE /api/outreach/packs/:id  close the pack: letters already sent stand, none more go
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  const { id } = await params
  const out = await closePack(seat.companyId, id)
  if (!out.ok) return refused(out.status, out.says)
  return NextResponse.json({ data: { closed: true } })
}
