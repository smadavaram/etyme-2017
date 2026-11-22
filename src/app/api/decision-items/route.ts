import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { listDecisions, openDecision, ownersOnOffer } from '@/lib/decision-items'
import { PROOF_TYPES, mayOpenDecision, readNeeds, readOpenAsk, cannotReadSays } from '@/lib/decision-queue'
import { findOnBook } from '@/app/api/records/lookup'
import { queueSeat, refused, refusalOf } from './door'

/**
 * GET  /api/decision-items?state=open|decided — the firm's decisions, oldest first (A2)
 * POST /api/decision-items                    — open one; the Owner or an Admin (A2's form)
 *
 * Record 107, Flow A. The rules are lib/decision-items and
 * lib/decision-queue; every open writes a row on the record ledger.
 */

export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const decided = request.nextUrl.searchParams.get('state') === 'decided'
  // Every working seat reads the rows; the proof is read on the item's page, by those it is for.
  const items = (await listDecisions(seat.companyId, { state: decided ? 'decided' : 'open' }))
    .map((d) => ({
      id: d.id, question: d.question, ownerName: d.ownerName, entityName: d.entityName, ageDays: d.ageDays,
      openedOn: d.openedOn, state: d.state, sentBackReason: d.sentBackReason, sentBackBy: d.sentBackBy?.name ?? null,
      decidedBy: d.decidedBy?.name ?? null, decidedAt: d.decidedAt,
    }))
  const mayOpen = mayOpenDecision(seat.roleName) === null
  // Exactly the people openDecision accepts as owner: a working seat at this firm.
  const people = mayOpen ? await ownersOnOffer(seat.companyId) : []
  return NextResponse.json({
    data: {
      items, mayOpen, people, entities: seat.entities,
      proofTypes: PROOF_TYPES.filter((p) => { const n = readNeeds(p.type); return !n || hasPermission(seat.caller.permissions, n) }),
    },
  })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const who = mayOpenDecision(seat.roleName)
  if (who) return refused(403, who)
  const read = readOpenAsk(await request.json().catch(() => ({})), seat.entities.length > 0)
  if (!read.ok) return refused(422, read.says, read.field)
  // Every proof link is to a record on this firm's own book, and one this seat may read.
  for (const l of read.ask.proofLinks) {
    const needs = readNeeds(l.recordType)
    if (needs && !hasPermission(seat.caller.permissions, needs)) return refused(403, `${cannotReadSays(l.recordType)} So it cannot link one as proof.`, 'proofLinks')
    if (!(await findOnBook(seat.companyId, l.recordType, l.recordId))) return refused(422, 'A proof link points at a record that is not on your firm’s book. Choose one from the list.', 'proofLinks')
  }
  try {
    const item = await openDecision({
      companyId: seat.companyId, personId: seat.personId, heldAs: seat.heldAs,
      actingEntityId: read.ask.actingEntityId, question: read.ask.question, ownerPersonId: read.ask.ownerPersonId,
      openedOn: read.ask.openedOn, proof: read.ask.proof, proofLinks: read.ask.proofLinks,
    })
    return NextResponse.json({ data: { id: item.id, message: 'Opened. It is on the decision queue.' } }, { status: 201 })
  } catch (e) {
    return refusalOf(e)
  }
}
