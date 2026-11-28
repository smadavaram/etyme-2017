import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { PROOF_TYPES, mayOpenDecision, readNeeds, cannotReadSays, type ProofType } from '@/lib/decision-queue'
import { recordsOnBook } from '@/app/api/records/lookup'
import { queueSeat, refused } from '../door'

/**
 * GET /api/decision-items/records?type=&q= — records on the firm's own book
 * that a proof may link to (A2's form). The Owner or an Admin, who opens
 * decisions; bills and invoice receipts only for a seat that reads them.
 */
export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const who = mayOpenDecision(seat.roleName)
  if (who) return refused(403, who)
  const type = request.nextUrl.searchParams.get('type') ?? ''
  if (!PROOF_TYPES.some((p) => p.type === type)) return refused(422, 'Choose a kind of record from the list.')
  const needs = readNeeds(type as ProofType)
  if (needs && !hasPermission(seat.caller.permissions, needs)) return refused(403, `${cannotReadSays(type as ProofType)} So it cannot link one as proof.`)
  const records = await recordsOnBook(seat.companyId, type as ProofType, request.nextUrl.searchParams.get('q') ?? '')
  return NextResponse.json({ data: { records } })
}
