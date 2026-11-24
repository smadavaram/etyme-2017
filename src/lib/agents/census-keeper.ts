/**
 * The census keeper (record 112, chain 1, "Win work"). Key `census-keeper`.
 *
 * Once a week, for one firm: its customers and suppliers, active against
 * dormant (no contract, bill or submission in 90 days, a proposal in
 * `census-rules`). The list is one line on the ledger, which Agent control
 * shows; and where anything changed since last week, one card owed by the
 * Account Manager else the Owner, with who moved and why in its proof.
 *
 * It edits no company, register row or money field and deletes nothing.
 * For a company that went quiet it proposes one check-in letter as a task;
 * after one person's yes, and only with the agent On, the letter is sent
 * once (`dormant-outreach`, record 116). Drafts only reads, lists and drafts.
 */

import { prisma } from '@/lib/db'
import { LedgerRefusal } from '@/lib/record-ledger'
import { openDecision, firmToday } from '@/lib/decision-items'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { draftDormantOutreach, walkOutreach } from './dormant-outreach'
import type { sendMail } from '@/lib/notify/mail-door'
import { AGENT_HELD_AS, registerAgent, type AgentContext, type AgentDef } from './runner'
import {
  CENSUS_AGENT, CENSUS_RULE, censusOn, censusProof, censusQuestion, changesBetween, sideOf, weeklyLine,
  type CensusFacts, type Window,
} from './census-rules'

export const CENSUS_RECORD = 'Company'
const NOT_A_CONTRACT = ['DRAFT', 'CANCELLED']
const weekStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()))

const windowOf = (c: { startDate: Date; endDate: Date | null; state: string }): Window =>
  ({ start: c.startDate, end: c.state === 'ENDED' ? c.endDate ?? c.startDate : c.endDate })

/** The dated facts behind every customer and supplier on the firm's register. Reads only the firm's own records. */
export async function censusFacts(companyId: string): Promise<CensusFacts[]> {
  const rows = await prisma.counterparty.findMany({
    where: { companyId, status: { in: ['ACTIVE', 'DORMANT'] } },
    select: { id: true, otherCompanyId: true, relationship: true, createdAt: true, otherCompany: { select: { name: true } } },
    orderBy: [{ id: 'asc' }],
  })
  const regs = rows.flatMap((r) => { const side = sideOf(r.relationship); return side ? [{ ...r, side }] : [] })
  const customers = regs.filter((r) => r.side === 'CUSTOMER').map((r) => r.otherCompanyId)
  const suppliers = regs.filter((r) => r.side === 'SUPPLIER').map((r) => r.otherCompanyId)

  const [sells, buys, subsOut, subsIn, bills] = await Promise.all([
    prisma.sellContract.findMany({ where: { companyId, clientCompanyId: { in: customers }, state: { notIn: NOT_A_CONTRACT as never[] } }, select: { id: true, clientCompanyId: true, startDate: true, endDate: true, state: true } }),
    prisma.buyContract.findMany({ where: { companyId, vendorCompanyId: { in: suppliers }, state: { notIn: NOT_A_CONTRACT as never[] } }, select: { vendorCompanyId: true, startDate: true, endDate: true, state: true } }),
    prisma.submission.findMany({ where: { fromCompanyId: companyId, toCompanyId: { in: customers } }, select: { toCompanyId: true, submittedAt: true } }),
    prisma.submission.findMany({ where: { toCompanyId: companyId, fromCompanyId: { in: suppliers } }, select: { fromCompanyId: true, submittedAt: true } }),
    prisma.vendorBill.findMany({ where: { companyId, vendorCompanyId: { in: suppliers } }, select: { vendorCompanyId: true, receivedAt: true } }),
  ])
  const lines = await prisma.invoiceLine.findMany({
    where: { sellContractId: { in: sells.map((s) => s.id) }, invoice: { issuedAt: { not: null } } },
    select: { sellContractId: true, invoice: { select: { issuedAt: true } } },
  })
  const clientOfSell = new Map(sells.map((s) => [s.id, s.clientCompanyId]))

  return regs.map((r) => {
    const mine = r.side === 'CUSTOMER'
    const contracts = mine ? sells.filter((s) => s.clientCompanyId === r.otherCompanyId) : buys.filter((b) => b.vendorCompanyId === r.otherCompanyId)
    const events: Date[] = mine
      ? [
          ...subsOut.filter((s) => s.toCompanyId === r.otherCompanyId).map((s) => s.submittedAt),
          ...lines.filter((l) => clientOfSell.get(l.sellContractId!) === r.otherCompanyId).map((l) => l.invoice.issuedAt!),
        ]
      : [
          ...subsIn.filter((s) => s.fromCompanyId === r.otherCompanyId).map((s) => s.submittedAt),
          ...bills.filter((b) => b.vendorCompanyId === r.otherCompanyId).map((b) => b.receivedAt),
        ]
    return {
      key: `${r.side}:${r.otherCompanyId}`, name: r.otherCompany.name, side: r.side, addedAt: r.createdAt,
      events: [...events, ...contracts.map((c) => c.startDate)], windows: contracts.map(windowOf),
    }
  })
}

export async function censusKeeperStep(ctx: AgentContext, deps: { send?: typeof sendMail } = {}): Promise<void> {
  const { companyId, now } = ctx
  // A yes can come any day of the week, so released outreach is walked on every run, before the weekly work.
  await walkOutreach(ctx, async () => censusOn(await censusFacts(companyId), now), deps)
  const from = weekStart(now)
  // Once a week, on the first run of it.
  const done = await prisma.recordAction.count({ where: { companyId, agentKey: ctx.agentKey, action: 'CENSUS_WEEKLY', createdAt: { gte: from } } })
  if (done > 0) return
  if (!(await ctx.mayAct())) return
  const facts = await censusFacts(companyId)
  const rows = censusOn(facts, now)
  const before = censusOn(facts, new Date(now.getTime() - 7 * 86_400_000))
  const changes = changesBetween(before, rows)
  await ctx.act({ recordType: CENSUS_RECORD, recordId: companyId, action: 'CENSUS_WEEKLY', summary: weeklyLine(rows, changes, from) })
  // A company gone quiet gets a draft check-in on a card; a person sends it.
  await draftDormantOutreach(ctx, { before, after: rows })
  if (changes.length === 0) return

  const owner = await ownerForRoles(companyId, ['Account Manager'], now)
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!owner || !sw) return
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  try {
    await openDecision({
      companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entities.length === 1 ? entities[0].id : null,
      question: censusQuestion(changes, from), ownerPersonId: owner, openedOn: await firmToday(companyId, now),
      proof: censusProof(changes), proofLinks: [{ recordType: CENSUS_RECORD, recordId: companyId }],
    })
  } catch (e) {
    if (!(e instanceof LedgerRefusal)) throw e
  }
}

export const censusKeeperAgent: AgentDef = { ruleVersion: CENSUS_RULE, step: (ctx) => censusKeeperStep(ctx) }

export function registerCensusKeeper(): void { registerAgent(CENSUS_AGENT, censusKeeperAgent) }

