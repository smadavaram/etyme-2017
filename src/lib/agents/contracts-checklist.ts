/**
 * The contracts checklist agent (record 112, chain 3, "Start them").
 *
 * Each run, for one firm that sells people:
 *  1. For every placement not yet ended, the items its record supports (the
 *     bill rate, the payment terms under its agreement, its dates inside its
 *     order, the statement of work where one is written) are listed as checklist items with the agreed value beside the
 *     actual one. Nothing is listed for a paper that is not there. A bill
 *     rate starts with no agreed value (open, no card) until a person
 *     records the signed paper; an unsigned statement of work is a drift.
 *  2. An item whose actual no longer matches the agreed value opens ONE
 *     decision. The agreed value never changes here: only a person
 *     recording a signed paper changes it (POST
 *     /api/compliance/checklist-items/:id). Signing is a person's.
 *  3. The onboarding pack: a placement starting within the proposed lead
 *     (5 days) with papers the start rule still needs opens one card to HR,
 *     naming them and asking that they be on file before day one. The agent
 *     sends nothing and asks nobody for anything. With every paper on file,
 *     one card asks HR to confirm the pack is ready: advice only, since
 *     Activate decides the start.
 *  4. The placement record: for each placement not started, one card to the
 *     Contract Manager, else the Account Manager, else the Owner, to read the
 *     line the award wrote (customer, worksite where it differs, bill rate,
 *     dates, suppliers on the firm's own chain) and say yes. Nothing on the
 *     line is changed and nothing is signed.
 * It runs the same on Drafts only and On: it opens cards and writes lists,
 * it never sends. Every act goes on the ledger through the runner.
 */

import { prisma } from '@/lib/db'
import { dayAround } from '@/lib/decision-queue'
import { previewFor } from '@/app/api/compliance/clearance/ask'
import { registerAgent, type AgentContext } from './runner'
import { openOnce, ownerOf } from './open-once'
import {
  PROPOSED_PACK_LEAD_DAYS, contractItemsFor, daysFromTo, driftWords, judgeContractItem, packCompleteWords, packDue, packWords, placementWords, type ItemState,
} from './checklist-rules'

export const CONTRACTS_CHECKLIST_AGENT = 'contracts-checklist'
export const CONTRACTS_CHECKLIST_RULES = 'contracts-checklist-1'
/** The record a contract item belongs to. */
export const LINE_RECORD = 'SellContract'
export const ITEM_RECORD = 'ChecklistItem'
/**
 * The dedupe labels of the placement card and the complete-pack card. They are
 * not records (so not named `*_RECORD`; the decision page draws only a link it can open): each card shows its line beside them, and the record view opens
 * the line from that link. Their own first link keeps them from blocking the
 * incomplete-pack card, whose first link is the line.
 */
export const PLACEMENT_CARD_LABEL = 'PlacementRecord'
export const PACK_CARD_LABEL = 'OnboardingPack'

const NOT_STARTED = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] as const
const LIVE = [...NOT_STARTED, 'IN_PROGRESS', 'PAUSED'] as const

export async function contractsChecklistStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const lines = await prisma.sellContract.findMany({
    where: { companyId, state: { in: [...LIVE] } },
    select: {
      id: true, state: true, billRate: true, billCurrency: true, paymentTerms: true, startDate: true, endDate: true, personId: true,
      clientCompanyId: true, endClientCompanyId: true,
      person: { select: { name: true } },
      clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
      msa: { select: { paymentTerms: true } },
      engagement: { select: { statementOfWork: true, sowSignedAt: true } },
      workOrder: { select: { number: true, startDate: true, endDate: true, engagement: { select: { statementOfWork: true, sowSignedAt: true } } } },
    },
    orderBy: { id: 'asc' },
    take: 500,
  })
  const contractsOwner = await ownerOf(ctx, ['Contract Manager'])
  // The placement card is the Contract Manager's, else the Account Manager's, else the Owner's.
  const contractsOwnerOrAccount = await ownerOf(ctx, ['Contract Manager', 'Account Manager'])

  for (const line of lines) {
    const client = line.endClientCompany?.name ?? line.clientCompany.name
    const eng = line.engagement ?? line.workOrder?.engagement ?? null
    const sow = eng?.statementOfWork?.trim() ? { signedAt: eng.sowSignedAt } : null
    const wanted = contractItemsFor({
      billRateCents: line.billRate, billCurrency: line.billCurrency, paymentTerms: line.paymentTerms,
      startDate: line.startDate, endDate: line.endDate, msa: line.msa, order: line.workOrder, sow,
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
        await ctx.act({ recordType: LINE_RECORD, recordId: line.id, action: 'CHECKLIST_LISTED', summary: `Listed “${w.label}” on ${line.person.name}’s placement at ${client}: ${state === 'MET' ? 'agreed and actual match' : state === 'OPEN' ? 'no signed paper recorded' : 'agreed and actual differ'}.` })
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

  // The placement record: one card to read the line the award wrote and say yes to it.
  // Nothing on the line is changed; corrections are made on the contract's own screens.
  for (const line of lines) {
    if (!(NOT_STARTED as readonly string[]).includes(line.state)) continue
    const chain = await prisma.buyContractCandidate.findMany({
      where: { personId: line.personId, state: { in: ['ACTIVE', 'ENDED'] }, buyContract: { companyId, vendorCompanyId: { not: null } } },
      select: { buyContract: { select: { vendorCompany: { select: { name: true } } } } },
    })
    const suppliers = [...new Set(chain.map((c) => c.buyContract.vendorCompany?.name).filter((n): n is string => !!n))].sort()
    const words = placementWords({
      person: line.person.name, customer: line.clientCompany.name,
      // The worksite is named only where it differs from the customer (record 110).
      endClient: line.endClientCompanyId && line.endClientCompanyId !== line.clientCompanyId ? line.endClientCompany?.name ?? null : null,
      billRateCents: line.billRate, currency: line.billCurrency, startDate: line.startDate, endDate: line.endDate, suppliers,
    })
    if (!(await ctx.mayAct())) return
    const r = await openOnce(ctx, contractsOwnerOrAccount, { recordType: PLACEMENT_CARD_LABEL, recordId: line.id }, words, [{ recordType: LINE_RECORD, recordId: line.id }])
    if (r === 'OPENED') await ctx.act({ recordType: LINE_RECORD, recordId: line.id, action: 'PLACEMENT_RECORD_ASSEMBLED', summary: `${words.question} A decision is open. Nothing was changed and nothing was signed.` })
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
    const client = line.endClientCompany?.name ?? line.clientCompany.name
    if (missing.length === 0) {
      // Every paper is on file: HR is asked to confirm the pack is ready. Advisory only; Activate decides the start.
      const papers = [...new Set(found.preview.items.filter((i) => i.required && !i.waived).map((i) => i.label))]
      if (papers.length === 0) continue
      const done = packCompleteWords({ person: line.person.name, client, startDate: line.startDate, days, papers })
      if (!(await ctx.mayAct())) return
      const o = await openOnce(ctx, hrOwner, { recordType: PACK_CARD_LABEL, recordId: line.id }, done, [{ recordType: LINE_RECORD, recordId: line.id }])
      if (o === 'OPENED') await ctx.act({ recordType: LINE_RECORD, recordId: line.id, action: 'PACK_COMPLETE_FLAGGED', summary: `Asked HR to confirm ${line.person.name}’s pack is ready for ${client}: ${papers.length} ${papers.length === 1 ? 'paper' : 'papers'} on file. Nobody was started.` })
      continue
    }
    const words = packWords({ person: line.person.name, client, startDate: line.startDate, days, missing })
    if (!(await ctx.mayAct())) return
    const r = await openOnce(ctx, hrOwner, { recordType: LINE_RECORD, recordId: line.id }, words)
    if (r === 'OPENED') await ctx.act({ recordType: LINE_RECORD, recordId: line.id, action: 'PACK_INCOMPLETE_FLAGGED', summary: `Told HR that ${line.person.name} starts at ${client} with ${missing.length} ${missing.length === 1 ? 'paper' : 'papers'} missing: ${missing.join('; ')}.` })
  }
}

export function registerContractsChecklist(): void {
  registerAgent(CONTRACTS_CHECKLIST_AGENT, { ruleVersion: CONTRACTS_CHECKLIST_RULES, step: contractsChecklistStep })
}
