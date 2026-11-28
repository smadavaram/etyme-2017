import { NextRequest, NextResponse } from 'next/server'
import { queueSeat, refused } from '../../decision-items/door'
import { candidateOutreachNotYours, createCandidateBatch } from '@/lib/outreach/candidate-batch'

/**
 * POST /api/outreach/candidate-batches  raise an update batch to candidates: the letters, one task and one card for the one yes
 *
 * Candidates, Outreach (record 117). Nothing is sent by this route: the batch
 * is sent by the outreach agent, only after a person says yes on the card,
 * only with the agent On and Outreach on, and only to a candidate whose yes to
 * updates still stands the moment her letter's turn comes. The batch is read
 * back at /api/outreach/batches/:id like any other.
 */
export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const notYours = candidateOutreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  const out = await createCandidateBatch({ companyId: seat.companyId, personId: seat.personId }, await request.json().catch(() => null))
  if (!out.ok) return refused(out.status, out.says, out.field)
  return NextResponse.json({ data: { id: out.id, candidates: out.candidates, held: out.held } }, { status: 201 })
}
