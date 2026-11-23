import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { writeRecordAction } from '@/lib/record-ledger'
import { firmSeats, seatAtFirm } from '@/lib/decision-items'
import { judgeContractItem } from '@/lib/agents/checklist-rules'
import { queueSeat, refused, refusalOf } from '../../../decision-items/door'
import { entityFor, text } from '../read'

/**
 * POST /api/compliance/checklist-items/:id
 *
 * Record 112, chain 3. A checklist item changes only by a person's act:
 *  { action: 'RECORD_SIGNED', paperReference, agreedValue? }   a contract item: a signed paper says what
 *       the agreed value is. Without agreedValue, the paper says what the line says now. Needs assignments.write.
 *  { action: 'MARK_MET', paperReference }                       a petition paper is on hand. Needs consultants.write.
 *  { action: 'SET_SIGNATORY', signatoryPersonId }               who signs this petition paper. Needs consultants.write.
 * The agent never calls this. Etyme signs nothing: the route records that a
 * person holds the signed paper, with its reference. Every act is a row on
 * the record ledger under the person's own name and role.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const item = await prisma.checklistItem.findFirst({ where: { id, companyId: seat.companyId } })
  if (!item) return refused(404, 'There is no such checklist item at your firm.')
  const entity = entityFor(seat, body.actingEntityId)
  if (!entity.ok) return refused(422, entity.says, 'actingEntityId')
  // The ledger row goes on the record the paper is about: the placement for a contract item, the checklist paper itself for a petition paper.
  const on = item.kind === 'CONTRACT_TERM' ? { recordType: 'SellContract', recordId: item.ownerId } : { recordType: 'ChecklistItem', recordId: item.id }
  const stamp = { companyId: seat.companyId, ...on, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity.id }
  const action = text(body.action)

  try {
    if (action === 'RECORD_SIGNED') {
      if (item.kind !== 'CONTRACT_TERM') return refused(422, 'Only a contract item records a signed paper this way. A petition paper is marked on hand.', 'action')
      if (!hasPermission(seat.caller.permissions, 'assignments.write')) return refused(403, 'Recording what a signed paper says is for whoever looks after contracts at your firm.')
      const reference = text(body.paperReference)
      if (!reference) return refused(422, 'Say which signed paper this comes from: its name, number or date.', 'paperReference')
      const agreed = text(body.agreedValue) || item.actualValue
      if (!agreed) return refused(422, 'There is no value on the line to agree to. Say what the signed paper agrees.', 'agreedValue')
      const state = judgeContractItem(item.label, agreed, item.actualValue)
      await prisma.$transaction(async (tx) => {
        await tx.checklistItem.update({ where: { id: item.id }, data: { agreedValue: agreed, state, decidedById: seat.personId } })
        await writeRecordAction(tx, { ...stamp, action: 'AGREED_VALUE_RECORDED', summary: `Recorded from the signed paper “${reference}” that ${item.label.toLowerCase()} is ${agreed}.${state === 'DRIFT' ? ' The line still differs.' : ''}` })
      })
      return NextResponse.json({ data: { id: item.id, state, message: state === 'MET' ? 'Saved. The line matches the signed paper.' : 'Saved. The line still differs from the signed paper.' } })
    }

    if (action === 'MARK_MET' || action === 'SET_SIGNATORY') {
      if (item.kind !== 'PETITION_PAPER') return refused(422, 'That is a contract item. A petition paper has its own lines.', 'action')
      if (!hasPermission(seat.caller.permissions, 'consultants.write')) return refused(403, 'Recording a petition paper is for whoever looks after paperwork at your firm.')
      if (action === 'MARK_MET') {
        const reference = text(body.paperReference)
        if (!reference) return refused(422, 'Say which paper is on hand: its name, number or date. Etyme keeps the reference, never the paper.', 'paperReference')
        await prisma.$transaction(async (tx) => {
          await tx.checklistItem.update({ where: { id: item.id }, data: { state: 'MET', actualValue: reference, decidedById: seat.personId } })
          await writeRecordAction(tx, { ...stamp, action: 'PETITION_PAPER_ON_HAND', summary: `Recorded the ${item.label.toLowerCase()} as on hand (${reference}).` })
        })
        return NextResponse.json({ data: { id: item.id, state: 'MET', message: 'Saved. The paper is recorded as on hand.' } })
      }
      const who = text(body.signatoryPersonId)
      const seats = await firmSeats(seat.companyId)
      if (!who || !seats.some((s) => s.personId === who && seatAtFirm(s, seats, new Date()) !== null)) return refused(422, 'Choose somebody who works at this firm to sign.', 'signatoryPersonId')
      await prisma.$transaction(async (tx) => {
        await tx.checklistItem.update({ where: { id: item.id }, data: { signatoryPersonId: who } })
        await writeRecordAction(tx, { ...stamp, action: 'SIGNATORY_NAMED', summary: `Named who signs the ${item.label.toLowerCase()}.` })
      })
      return NextResponse.json({ data: { id: item.id, message: 'Saved. The signatory is told when the paper is waiting.' } })
    }
  } catch (e) {
    return refusalOf(e)
  }
  return refused(422, 'Say what to do: record a signed paper, mark a petition paper on hand, or name the signatory.', 'action')
}
