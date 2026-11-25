import { outreachNotYours } from '@/lib/outreach/rules-of-access'
import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { queueSeat, refused } from '../../decision-items/door'
import { previewBatch, suggestions } from '@/lib/outreach/batch'
import { AUDIENCES, AUDIENCE_LABELS } from '@/lib/outreach/audience-rules'
import { OFFER_KINDS, OFFER_LABELS } from '@/lib/outreach/offer-rules'

/**
 * GET  /api/outreach/preview  what the Outreach screen offers: the audiences, the offers, and a hot list drafted from the people the firm has said yes to showing
 * POST /api/outreach/preview  the drafted letter, who gets it and who is held and why. Writes nothing.
 *
 * Companies, Outreach (record 117). A firm's own register and rolodex only.
 * Asks for the same permission as the batches route, so the menu link and
 * both routes agree.
 */

export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  // The permission the menu link names, read here; then the one rule that also refuses a client.
  if (!hasPermission(seat.caller.permissions, 'vendors.read')) return refused(403, outreachNotYours(seat.caller)!)
  const notYours = outreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  return NextResponse.json({
    data: {
      audiences: AUDIENCES.map((key) => ({ key, label: AUDIENCE_LABELS[key] })),
      offers: OFFER_KINDS.map((key) => ({ key, label: OFFER_LABELS[key] })),
      ...(await suggestions(seat.companyId)),
    },
  })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  // The permission the menu link names, read here; then the one rule that also refuses a client.
  if (!hasPermission(seat.caller.permissions, 'vendors.read')) return refused(403, outreachNotYours(seat.caller)!)
  const notYours = outreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  const body = await request.json().catch(() => null)
  const out = await previewBatch(seat.companyId, body)
  if (!out.ok) return refused(out.status, out.says, out.field)
  return NextResponse.json({ data: out.data })
}
