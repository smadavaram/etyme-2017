import { outreachNotYours } from '@/lib/outreach/rules-of-access'
import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { queueSeat, refused } from '../../decision-items/door'
import { batchesOf, createBatch } from '@/lib/outreach/batch'
import { readBatchAsk } from '@/lib/outreach/batch-rules'

/**
 * GET  /api/outreach/batches  the firm's outreach batches, newest first
 * POST /api/outreach/batches  raise a batch: the letters, one task and one card for the one yes
 *
 * Companies, Outreach (record 117). Nothing is sent by this route: the
 * batch is sent by the outreach agent, only after a person says yes on the
 * card, only with the agent On, to the contacts the firm itself recorded
 * at companies on its own register. A refusal is one sentence.
 */

export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  // The permission the menu link names, read here; then the one rule that also refuses a client.
  if (!hasPermission(seat.caller.permissions, 'vendors.read')) return refused(403, outreachNotYours(seat.caller)!)
  const notYours = outreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  return NextResponse.json({ data: { batches: await batchesOf(seat.companyId) } })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  // The permission the menu link names, read here; then the one rule that also refuses a client.
  if (!hasPermission(seat.caller.permissions, 'vendors.read')) return refused(403, outreachNotYours(seat.caller)!)
  const notYours = outreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  const body = await request.json().catch(() => null)
  const asked = readBatchAsk(body)
  if (!asked.ok) return refused(422, asked.says, asked.field)
  const out = await createBatch({ companyId: seat.companyId, personId: seat.personId }, body)
  if (!out.ok) return refused(out.status, out.says, out.field)
  return NextResponse.json({ data: { id: out.id, contacts: out.contacts, held: out.held } }, { status: 201 })
}
