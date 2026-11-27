import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { recordTimeline, aboutPayroll, PAYROLL_LEDGER_READS } from '@/lib/record-ledger'
import { hasPermission } from '@/lib/permissions'
import { DECISION_RECORD, ageOf, firmZone, todayIn, decideDecision, mayDecide, mayReadProof, proofIsFor, type ProofLink } from '@/lib/decision-items'
import { isRecordType, readDecideAsk, readNeeds, recordViewHref, proofLabelOf } from '@/lib/decision-queue'
import { findOnBook } from '@/app/api/records/lookup'
import { queueSeat, refused, refusalOf, logRefusal } from '../door'
import { isChainProof, chainProofLink } from '../../money-loop/proof-link'
import { approvalRefusal, approveByPerson, proposalOfReviewCard } from '@/lib/proposals/approve'

/**
 * GET  /api/decision-items/[id] — one decision, its proof, and the record of it (A3, A4)
 * POST /api/decision-items/[id] — Approve, Send back or Reject, { verdict, reason, actingEntityId }
 *
 * Record 107, Flow A. Send back and Reject need a one-line reason. The
 * decider picks the entity where the firm has any. The act and its ledger
 * row are lib/decision-items. A decision a disputed month opened states
 * payroll amounts in its proof and history, so those are read only by a
 * seat the proof rule allows that also reads payroll, and decided only
 * from one.
 */

type Params = { params: Promise<{ id: string }> }

const NOT_HERE = 'There is no such decision at this firm.'

export async function GET(request: NextRequest, { params }: Params) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const { id } = await params
  const item = await prisma.decisionItem.findFirst({
    where: { id, companyId: seat.companyId },
    include: { ownerPerson: { select: { name: true } }, actingEntity: { select: { name: true } }, sentBackBy: { select: { name: true } } },
  })
  if (!item) {
    const other = await prisma.decisionItem.findUnique({ where: { id }, select: { companyId: true } })
    await logRefusal(seat, { companyId: other?.companyId ?? seat.companyId }, `Refused a decision that is not on ${seat.caller.company!.name}’s queue (${id}).`)
    return refused(404, NOT_HERE)
  }
  const zone = await firmZone(seat.companyId)
  const ageDays = ageOf(item, todayIn(zone), zone)
  const payroll = aboutPayroll(item.proofLinks)
  const readsPayroll = hasPermission(seat.caller.permissions, PAYROLL_LEDGER_READS)
  const mayAct = item.state === 'OPEN' && (!payroll || readsPayroll) && mayDecide({ ownerPersonId: item.ownerPersonId, deciderPersonId: seat.personId, deciderRoleNames: [seat.roleName] }) === null
  const actedBy = (await prisma.recordAction.findMany({
    where: { companyId: seat.companyId, recordType: DECISION_RECORD, recordId: item.id, action: { in: ['SENT_BACK', 'APPROVED', 'REJECTED'] } },
    select: { personId: true },
  })).map((r) => r.personId)
  if (!mayReadProof({ ownerPersonId: item.ownerPersonId, readerPersonId: seat.personId, readerRoleNames: [seat.roleName], actedBy, aboutPayroll: payroll, readsPayroll })) {
    // Another seat at the firm reads the question and who may read the proof; nothing else.
    return NextResponse.json({
      data: {
        id: item.id, question: item.question, state: item.state, ownerName: item.ownerPerson.name,
        entityName: item.actingEntity?.name ?? null, openedOn: item.openedOn, ageDays,
        proofHidden: proofIsFor(item.ownerPerson.name, payroll), proof: null, proofLinks: [], timeline: [], decision: null,
        sentBackReason: null, sentBackBy: null, sentBackAt: null, verdictNote: null, mayAct: false, entities: seat.entities,
      },
    })
  }
  const links = ((item.proofLinks ?? []) as unknown as ProofLink[])
  const proofLinks = await Promise.all(links.map(async (l) => {
    // A disputed month (Flow B): the consultant and the month, opening that placement's month.
    if (isChainProof(l.recordType)) return chainProofLink(seat.companyId, seat.caller.permissions, l.recordId)
    const label = proofLabelOf(l.recordType)
    // A line is drawn as a link only where this seat may open what it names; elsewhere it is left out, never a dead link.
    const needs = isRecordType(l.recordType) ? readNeeds(l.recordType) : null
    const opens = isRecordType(l.recordType) && (needs === null || hasPermission(seat.caller.permissions, needs))
    const found = opens && isRecordType(l.recordType) ? await findOnBook(seat.companyId, l.recordType, l.recordId) : null
    return { recordType: l.recordType, recordId: l.recordId, label, name: found?.name ?? null, href: recordViewHref(l.recordType, l.recordId) }
  }))
  const timeline = (await recordTimeline(seat.companyId, DECISION_RECORD, item.id)).map((r) => ({
    id: r.id, action: r.action, summary: r.summary, at: r.createdAt, personName: r.person.name, entityName: r.actingEntity?.name ?? null, heldAs: r.heldAs,
  }))
  const closing = [...timeline].reverse().find((r) => r.action === 'APPROVED' || r.action === 'REJECTED') ?? null
  return NextResponse.json({
    data: {
      id: item.id, question: item.question, proof: item.proof, proofLinks, state: item.state,
      ownerName: item.ownerPerson.name, entityName: item.actingEntity?.name ?? null,
      openedOn: item.openedOn, ageDays, proofHidden: null,
      sentBackReason: item.sentBackReason, sentBackBy: item.sentBackBy?.name ?? null, sentBackAt: item.sentBackAt,
      verdictNote: item.verdictNote,
      decision: closing ? { verdict: item.state, personName: closing.personName, entityName: closing.entityName, heldAs: closing.heldAs, at: closing.at, reason: item.verdictNote } : null,
      timeline, mayAct, entities: seat.entities,
    },
  })
}

export async function POST(request: NextRequest, { params }: Params) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const { id } = await params
  const read = readDecideAsk(await request.json().catch(() => ({})), seat.entities.length > 1)
  if (!read.ok) return refused(422, read.says, read.field)
  try {
    // The proposals agent's card (record 124): her yes on it is her own approval of the proposal, under the same rule as the proposal's own Approve.
    const proposalId = read.ask.verdict === 'APPROVE' ? await proposalOfReviewCard(seat.companyId, id) : null
    if (proposalId) {
      if (!hasPermission(seat.caller.permissions, 'submissions.create')) return refused(403, 'Approving a proposal needs a seat that may put proposals forward.')
      const no = await approvalRefusal(seat.companyId, proposalId)
      if (no) return refused(409, no)
    }
    const item = await decideDecision({
      companyId: seat.companyId, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: read.ask.actingEntityId,
      decisionId: id, verdict: read.ask.verdict, note: read.ask.reason,
    })
    if (proposalId) {
      const done = await approveByPerson({ companyId: seat.companyId, proposalId, personId: seat.personId })
      if (!done.ok) return refused(409, done.says)
    }
    const message = read.ask.verdict === 'SEND_BACK' ? 'Sent back. It stays on the queue with your reason.' : read.ask.verdict === 'APPROVE' ? 'Approved and recorded.' : 'Rejected and recorded.'
    return NextResponse.json({ data: { id: item.id, state: item.state, message } })
  } catch (e) {
    return refusalOf(e)
  }
}
