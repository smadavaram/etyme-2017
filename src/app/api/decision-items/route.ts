import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { listDecisions, openDecision } from '@/lib/decision-items'
import { PROOF_TYPES, mayOpenDecision, readNeeds, readOpenAsk } from '@/lib/decision-queue'
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
  const all = await listDecisions(seat.companyId)
  const items = all
    .filter((d) => (decided ? d.state !== 'OPEN' : d.state === 'OPEN'))
    .map((d) => ({
      id: d.id, question: d.question, ownerName: d.ownerName, entityName: d.entityName, ageDays: d.ageDays,
      openedOn: d.openedOn, state: d.state, sentBackReason: d.sentBackReason, sentBackBy: d.sentBackBy?.name ?? null,
      decidedBy: d.decidedBy?.name ?? null, decidedAt: d.decidedAt,
    }))
  const mayOpen = mayOpenDecision(seat.roleName) === null
  const people = mayOpen
    ? await prisma.person.findMany({
        where: { contexts: { some: { companyId: seat.companyId, revokedAt: null } } },
        select: { id: true, name: true }, orderBy: { name: 'asc' },
      })
    : []
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
    if (needs && !hasPermission(seat.caller.permissions, needs)) return refused(403, 'Your seat cannot read bills or invoice receipts, so it cannot link one as proof.', 'proofLinks')
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
