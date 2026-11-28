import { NextRequest, NextResponse } from 'next/server'
import { queueSeat, refused } from '../../decision-items/door'
import { outreachNo } from '../door'
import { saveSegment, segmentsOf } from '@/lib/outreach/segment'

/**
 * GET  /api/outreach/segments  the firm's saved segments, each in words
 * POST /api/outreach/segments  save one: { name, role, skills?, location?, stage?, activeWithinDays?, quietForDays? }
 *
 * Advanced outreach, detection (record 135). A segment is a saved question
 * about the firm's own record, never a copied list: who is in it is read
 * again each time, and only people who agreed to hear from the firm are ever
 * in it. Nothing is sent by this route.
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  return NextResponse.json({ data: { segments: await segmentsOf(seat.companyId) } })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const no = outreachNo(seat)
  if (no) return no
  const out = await saveSegment({ companyId: seat.companyId, personId: seat.personId }, await request.json().catch(() => null))
  if (!out.ok) return refused(out.status, out.says, out.field)
  return NextResponse.json({ data: { id: out.id } }, { status: 201 })
}
