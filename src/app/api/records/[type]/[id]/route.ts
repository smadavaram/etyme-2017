import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { logAccess } from '@/lib/access-log'
import { recordTimeline, aboutPayroll, PAYROLL_RECORD, PAYROLL_RECORDS, PAYROLL_LEDGER_READS } from '@/lib/record-ledger'
import { DECISION_RECORD, mayReadProof, proofIsFor } from '@/lib/decision-items'
import { agentByWords, NOT_ON_YOUR_BOOK, cannotReadSays, isRecordType, ledgerBeganSays, mayOpenOwnPage, ownPageOf, readNeeds } from '@/lib/decision-queue'
import { findOnBook, subjectOf, factsOf, monthPageOf } from '../../lookup'
import { queueSeat, refused, logRefusal } from '../../../decision-items/door'

/**
 * GET /api/records/[type]/[id] — one record with its whole ledger history (A6)
 *
 * Record 107, Flow A. Opened from a proof link or a ledger row. A record
 * not on the firm's own book, or of a kind the seat may not read (its own
 * list's permission, `readNeeds`; a decision by the proof rule), is
 * refused in a sentence, logged before it is sent (`recordRefusal`). A
 * person's record read is logged too. The record's own key fields sit
 * above its history, and an empty history says when the ledger began.
 *
 * A consultant's month (a MoneyChain) is a record this page opens, for a
 * seat that reads payroll: the consultant, the client, the month, its
 * state, the stated amounts, a link to that placement's month, and its
 * ledger. A decision a disputed month opened is read by the proof rule
 * and only from a seat that reads payroll.
 */

type Params = { params: Promise<{ type: string; id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const { type, id } = await params
  if (!isRecordType(type)) return refused(404, 'That is not a kind of record this page opens.')
  const action = type === 'Person' ? 'PROFILE_VIEW' as const : PAYROLL_RECORDS.includes(type) ? 'PAYROLL_VIEW' as const : 'CONTRACT_VIEW' as const
  const needs = readNeeds(type)
  const lacks = needs !== null && !hasPermission(seat.caller.permissions, needs)
  const found = lacks ? null : await findOnBook(seat.companyId, type, id)
  let why = lacks ? cannotReadSays(type) : NOT_ON_YOUR_BOOK
  let refuse = !found
  if (found && type === 'DecisionItem') {
    const item = await prisma.decisionItem.findUniqueOrThrow({ where: { id }, select: { ownerPersonId: true, proofLinks: true, ownerPerson: { select: { name: true } } } })
    const payroll = aboutPayroll(item.proofLinks)
    const actedBy = (await prisma.recordAction.findMany({
      where: { companyId: seat.companyId, recordType: DECISION_RECORD, recordId: id, action: { in: ['SENT_BACK', 'APPROVED', 'REJECTED'] } },
      select: { personId: true },
    })).map((r) => r.personId)
    if (!mayReadProof({ ownerPersonId: item.ownerPersonId, readerPersonId: seat.personId, readerRoleNames: [seat.roleName], actedBy, aboutPayroll: payroll, readsPayroll: hasPermission(seat.caller.permissions, PAYROLL_LEDGER_READS) })) {
      refuse = true
      why = proofIsFor(item.ownerPerson.name, payroll)
    }
  }
  if (refuse) {
    const subject = (await subjectOf(type, id)) ?? { companyId: seat.companyId }
    await logRefusal(seat, subject, `Refused the record view of ${type} ${id}: ${why}`, action)
    return refused(403, why)
  }
  if (type === 'Person') {
    logAccess({ subjectId: id, actorPersonId: seat.personId, actorCompanyId: seat.companyId, action, reason: 'Opened the person’s record view, with its ledger history.' })
  }
  const monthPage = type === PAYROLL_RECORD ? await monthPageOf(id) : null
  if (monthPage && monthPage.personId !== seat.personId) {
    logAccess({ subjectId: monthPage.personId, actorPersonId: seat.personId, actorCompanyId: seat.companyId, action, reason: 'Opened the record view of the consultant’s month, with its stated amounts and its ledger.' })
  }
  const [rows, facts, first] = await Promise.all([
    recordTimeline(seat.companyId, type, id),
    factsOf(type, id),
    prisma.recordAction.findFirst({ where: { companyId: seat.companyId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])
  return NextResponse.json({
    data: {
      type, id, name: found!.name, ownPage: monthPage ? { href: monthPage.href, words: monthPage.words } : mayOpenOwnPage(type, seat.caller.permissions) ? ownPageOf(type, id) : null, facts,
      emptySays: rows.length === 0 ? ledgerBeganSays(first?.createdAt ?? null) : null,
      timeline: rows.map((r) => ({ id: r.id, at: r.createdAt, action: r.action, summary: r.summary, personName: r.person.name, entityName: r.actingEntity?.name ?? null, heldAs: r.heldAs, agentKey: r.agentKey, by: r.agentKey ? agentByWords(r.agentKey, r.person.name) : r.person.name })),
    },
  })
}
