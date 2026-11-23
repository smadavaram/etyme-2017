/**
 * The immigration checklist agent (record 112, chain 3, "Start them").
 *
 * One checklist per petition, each dependent paper its own line (the labor
 * condition application, the petition form, the representation form, the
 * approval notice copy). The petition is complete only when every line is
 * met. A person records each paper as on hand; the agent never marks one.
 * A line that needs a signature opens one card to the signatory seat (the
 * seat named on the line, else the Owner), once. The agent files nothing
 * and passes on no paper's contents: it holds a label, a state and who
 * signs. It opens cards and writes lists on Drafts only and On alike.
 */

import { prisma } from '@/lib/db'
import { registerAgent, type AgentContext } from './runner'
import { openOnce, ownerOf } from './open-once'
import { ENDED_PETITION_STAGES, PETITION_LINES, petitionComplete, signatureWords } from './checklist-rules'
import { ITEM_RECORD } from './contracts-checklist'
import { seatAtFirm, firmSeats } from '@/lib/decision-items'

export const IMMIGRATION_CHECKLIST_AGENT = 'immigration-checklist'
export const IMMIGRATION_CHECKLIST_RULES = 'immigration-checklist-1'
export const PETITION_RECORD = 'Petition'

export async function immigrationChecklistStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const petitions = await prisma.petition.findMany({
    where: { companyId, stage: { notIn: [...ENDED_PETITION_STAGES] } },
    orderBy: { id: 'asc' }, take: 500,
  })
  if (petitions.length === 0) return
  const people = await prisma.person.findMany({ where: { id: { in: [...new Set(petitions.map((p) => p.personId))] } }, select: { id: true, name: true } })
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'the person'
  const seats = await firmSeats(companyId)
  const working = (personId: string | null) => !!personId && seats.some((s) => s.personId === personId && seatAtFirm(s, seats, now) !== null)
  const owner = await ownerOf(ctx, [])

  for (const pet of petitions) {
    let items = await prisma.checklistItem.findMany({ where: { companyId, ownerType: PETITION_RECORD, ownerId: pet.id, kind: 'PETITION_PAPER' }, orderBy: { createdAt: 'asc' } })
    const missingLines = PETITION_LINES.filter((l) => !items.some((i) => i.label === l.label))
    if (missingLines.length > 0 && !(await ctx.mayAct())) return
    for (const l of missingLines) {
      await prisma.checklistItem.create({ data: { companyId, ownerType: PETITION_RECORD, ownerId: pet.id, kind: 'PETITION_PAPER', label: l.label } })
    }
    if (missingLines.length > 0) {
      items = await prisma.checklistItem.findMany({ where: { companyId, ownerType: PETITION_RECORD, ownerId: pet.id, kind: 'PETITION_PAPER' }, orderBy: { createdAt: 'asc' } })
      await ctx.act({ recordType: 'Petition', recordId: pet.id, action: 'PETITION_CHECKLIST_LISTED', summary: `Listed ${PETITION_LINES.length} papers for ${nameOf(pet.personId)}’s petition, each its own line. A person records each as on hand.` })
    }

    // A signature line routes one card to the signatory seat.
    for (const l of PETITION_LINES.filter((x) => x.signature)) {
      const item = items.find((i) => i.label === l.label)
      if (!item || item.state === 'MET') continue
      const to = working(item.signatoryPersonId) ? item.signatoryPersonId : owner
      if (!(await ctx.mayAct())) return
      const r = await openOnce(ctx, to, { recordType: ITEM_RECORD, recordId: item.id }, signatureWords({ person: nameOf(pet.personId), label: l.label }), [{ recordType: 'Petition', recordId: pet.id }])
      if (r === 'OPENED') await ctx.act({ recordType: ITEM_RECORD, recordId: item.id, action: 'SIGNATURE_CARD_OPENED', summary: `Asked the signatory whether the ${l.label.toLowerCase()} for ${nameOf(pet.personId)}’s petition is signed. The agent signs nothing.` })
    }

    if (petitionComplete(items.map((i) => i.state))) {
      const ref = `petition ${pet.id.slice(-6)}`
      const said = await prisma.recordAction.count({ where: { companyId, recordType: PETITION_RECORD, recordId: pet.id, action: 'PETITION_PAPERS_COMPLETE' } })
      if (said === 0 && !(await ctx.mayAct())) return
      if (said === 0) await ctx.act({ recordType: PETITION_RECORD, recordId: pet.id, action: 'PETITION_PAPERS_COMPLETE', summary: `Every paper for ${nameOf(pet.personId)}’s petition is recorded as on hand (${ref}). Filing is counsel’s; Etyme files nothing.` })
    }
  }
}

export function registerImmigrationChecklist(): void {
  registerAgent(IMMIGRATION_CHECKLIST_AGENT, { ruleVersion: IMMIGRATION_CHECKLIST_RULES, step: immigrationChecklistStep })
}
