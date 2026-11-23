/**
 * The contracts checklist agent (record 112, chain 3, "Start them").
 *
 * Each run, for one firm that sells people:
 *  1. For every placement not yet ended, the items its record supports (the
 *     bill rate, the payment terms under its agreement, its dates inside its
 *     order) are listed as checklist items with the agreed value beside the
 *     actual one. Nothing is listed for a paper that is not there.
 *  2. An item whose actual no longer matches the agreed value opens ONE
 *     decision. The agreed value never changes here: only a person
 *     recording a signed paper changes it (POST
 *     /api/compliance/checklist-items/:id). Signing is a person's.
 *  3. The onboarding pack: a placement starting within the proposed lead
 *     (5 days) with papers the start rule still needs opens one card to HR,
 *     naming them. The agent sends nothing and asks nobody for anything.
 * It runs the same on Drafts only and On: it opens cards and writes lists,
 * it never sends. Every act goes on the ledger through the runner.
 */

import { prisma } from '@/lib/db'
import { dayAround } from '@/lib/decision-queue'
import { previewFor } from '@/app/api/compliance/clearance/ask'
import { registerAgent, type AgentContext } from './runner'
import { openOnce, ownerOf } from './open-once'
import {
  PROPOSED_PACK_LEAD_DAYS, contractItemsFor, daysFromTo, driftWords, judgeContractItem, packDue, packWords, type ItemState,
} from './checklist-rules'

export const CONTRACTS_CHECKLIST_AGENT = 'contracts-checklist'
export const CONTRACTS_CHECKLIST_RULES = 'contracts-checklist-1'
/** The record a contract item belongs to. */
export const LINE_RECORD = 'SellContract'
export const ITEM_RECORD = 'ChecklistItem'

const NOT_STARTED = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] as const
const LIVE = [...NOT_STARTED, 'IN_PROGRESS', 'PAUSED'] as const

export async function contractsChecklistStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const lines = await prisma.sellContract.findMany({
    where: { companyId, state: { in: [...LIVE] } },
    select: {
      id: true, state: true, billRate: true, billCurrency: true, paymentTerms: true, startDate: true, endDate: true,
      person: { select: { name: true } },
      clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
      msa: { select: { paymentTerms: true } },
      workOrder: { select: { number: true, startDate: true, endDate: true } },
    },
    orderBy: { id: 'asc' },
    take: 500,
  })
  const contractsOwner = await ownerOf(ctx, ['Contract Manager'])

  for (const line of lines) {
    const client = line.endClientCompany?.name ?? line.clientCompany.name
    const wanted = contractItemsFor({
      billRateCents: line.billRate, billCurrency: line.billCurrency, paymentTerms: line.paymentTerms,
      startDate: line.startDate, endDate: line.endDate, msa: line.msa, order: line.workOrder,
    })
    const have = await prisma.checklistItem.findMany({ where: { companyId, ownerType: LINE_RECORD, ownerId: line.id, kind: 'CONTRACT_TERM' } })

    for (const w of wanted) {
      let item = have.find((h) => h.label === w.label)
      if (!item) {
        if (!(await ctx.mayAct())) return
        const state: ItemState = judgeContractItem(w.label, w.firstAgreed, w.actual)
        item = await prisma.checklistItem.create({
          data: { companyId, ownerType: LINE_RECORD, ownerId: line.id, kind: 'CONTRACT_TERM', label: w.label, agreedValue: w.firstAgreed, actualValue: w.actual, state },
        })
        await ctx.act({ recordType: LINE_RECORD, recordId: line.id, action: 'CHECKLIST_LISTED', summary: `Listed “${w.label}” on ${line.person.name}’s placement at ${client}: ${state === 'MET' ? 'agreed and actual match' : 'agreed and actual differ'}.` })
      } else if (item.state !== 'WAIVED_WITH_REASON') {
        const state = judgeContractItem(w.label, item.agreedValue, w.actual)
        if (item.actualValue !== w.actual || item.state !== state) {
          item = await prisma.checklistItem.update({ where: { id: item.id }, data: { actualValue: w.actual, state } })
        }
      }
      if (item.state !== 'DRIFT') continue
      const words = driftWords({ person: line.person.name, client, label: w.label, agreed: item.agreedValue, actual: item.actualValue })
      if (!(await ctx.mayAct())) return
      const r = await openOnce(ctx, contractsOwner, { recordType: ITEM_RECORD, recordId: item.id }, words, [{ recordType: LINE_RECORD, recordId: line.id }])
      if (r === 'OPENED') await ctx.act({ recordType: LINE_RECORD, recordId: line.id, action: 'DRIFT_FLAGGED', summary: `${words.question} A decision is open. Nothing was changed.` })
    }
  }

  // The onboarding pack, complete before day one.
  const today = dayAround(now).from
  const hrOwner = await ownerOf(ctx, ['HR'])
  for (const line of lines) {
    if (!(NOT_STARTED as readonly string[]).includes(line.state)) continue
    const days = daysFromTo(today, line.startDate)
    if (!packDue(days, PROPOSED_PACK_LEAD_DAYS)) continue
    const found = await previewFor(line.id, now)
    if (!found) continue
    const missing = [...new Set([...found.preview.blocking, ...found.preview.chasing].map((i) => i.label))]
    if (missing.length === 0) continue
    const client = line.endClientCompany?.name ?? line.clientCompany.name
    const words = packWords({ person: line.person.name, client, startDate: line.startDate, days, missing })
    if (!(await ctx.mayAct())) return
    const r = await openOnce(ctx, hrOwner, { recordType: LINE_RECORD, recordId: line.id }, words)
    if (r === 'OPENED') await ctx.act({ recordType: LINE_RECORD, recordId: line.id, action: 'PACK_INCOMPLETE_FLAGGED', summary: `Told HR that ${line.person.name} starts at ${client} with ${missing.length} ${missing.length === 1 ? 'paper' : 'papers'} missing: ${missing.join('; ')}.` })
  }
}

export function registerContractsChecklist(): void {
  registerAgent(CONTRACTS_CHECKLIST_AGENT, { ruleVersion: CONTRACTS_CHECKLIST_RULES, step: contractsChecklistStep })
}
