import { NextRequest, NextResponse } from 'next/server'
import { queueSeat, refused } from '../../decision-items/door'
import { createDirectLetter } from '@/lib/outreach/party-letters'
import { outreachNotYours } from '@/lib/outreach/rules-of-access'

/**
 * POST /api/letters/direct  write to one contact: the letter, one task and one card for the one yes
 *
 * Basic outreach is core (record 135), reached from the party's ledger. It
 * does not wait for the Outreach switch. Nothing is sent by this route: the
 * letter is sent by the outreach agent, only after a person says yes on the
 * card, only with the agent On, only to a contact the firm itself recorded at
 * a company it trades with, and never to somebody who unsubscribed.
 * A refusal is one sentence naming the field.
 */
export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const notYours = outreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  const out = await createDirectLetter({ companyId: seat.companyId, personId: seat.personId }, await request.json().catch(() => null))
  if (!out.ok) return refused(out.status, out.says, out.field)
  return NextResponse.json({ data: { id: out.id } }, { status: 201 })
}
