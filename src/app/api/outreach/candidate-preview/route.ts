import { NextRequest, NextResponse } from 'next/server'
import { queueSeat, refused } from '../../decision-items/door'
import { candidateOutreachNotYours, candidateSuggestions, previewCandidateBatch } from '@/lib/outreach/candidate-batch'

/**
 * GET  /api/outreach/candidate-preview  how many candidates would get a letter, and how many are held; no name and no address
 * POST /api/outreach/candidate-preview  the drafted letter, who gets it and who is held and why. Writes nothing.
 *
 * Candidates, Outreach (record 117). Only people the firm keeps who have a
 * standing yes to updates on their own record are ever listed.
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const notYours = candidateOutreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  return NextResponse.json({ data: await candidateSuggestions(seat.companyId) })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const notYours = candidateOutreachNotYours(seat.caller)
  if (notYours) return refused(403, notYours)
  const out = await previewCandidateBatch(seat.companyId, await request.json().catch(() => null), seat.personId)
  return NextResponse.json({ data: out.data })
}
