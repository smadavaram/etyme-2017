/**
 * The dormant outreach (record 112, chain 1, "Win work"; part B of "Drafts
 * of outreach and chases"). A step of the census keeper, under its key
 * `census-keeper`. The rules are in `dormant-outreach-rules`.
 *
 * Outreach is a person's act, so this only drafts. For each company that
 * went from active to dormant since last week it opens one card to the
 * Account Manager else the Owner, holding the plain draft and the person it
 * would go to. It sends nothing, ever: there is no task, no yes that
 * releases a send, and no call to the mail door anywhere in this file.
 * A company is drafted for once in 180 days per side (a proposal). A card
 * is its own dedupe, because one company may be a customer and a supplier
 * and each side reads differently.
 */

import { prisma } from '@/lib/db'
import { LedgerRefusal } from '@/lib/record-ledger'
import { openDecision } from '@/lib/decision-items'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { AGENT_HELD_AS, type AgentContext } from './runner'
import type { CensusRow, Side } from './census-rules'
import { becameDormant, coolingOffHolds, outreachCard, outreachPrefix } from './dormant-outreach-rules'

/** Who a check-in would go to, by the kinds of contact that read it well; anybody else with an email after them, accounts payable last. */
const PREFERRED: Record<Side, string[]> = {
  CUSTOMER: ['HIRING_MANAGER', 'PROCUREMENT', 'EXECUTIVE'],
  SUPPLIER: ['RECRUITING', 'DELIVERY', 'EXECUTIVE'],
}

async function recipientAt(companyId: string, otherId: string, side: Side): Promise<{ name: string; email: string } | null> {
  const rows = await prisma.companyContact.findMany({
    where: { companyId, atCompanyId: otherId, email: { not: null } },
    select: { name: true, email: true, kind: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const usable = rows.filter((r) => r.email?.trim())
  const rank = (kind: string) => { const i = PREFERRED[side].indexOf(kind); return i >= 0 ? i : kind === 'AP' ? 99 : 50 }
  const pick = [...usable].sort((a, b) => rank(a.kind) - rank(b.kind))[0]
  return pick ? { name: pick.name, email: pick.email!.trim() } : null
}

export async function draftDormantOutreach(ctx: AgentContext, census: { before: readonly CensusRow[]; after: readonly CensusRow[] }): Promise<void> {
  const { companyId, now } = ctx
  const gone = becameDormant(census.before, census.after)
  if (gone.length === 0) return
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!sw) return
  const owner = await ownerForRoles(companyId, ['Account Manager'], now)
  if (!owner) {
    if (await ctx.mayAct(1)) await ctx.act({ recordType: 'Company', recordId: companyId, action: 'DORMANT_OUTREACH_NO_OWNER', summary: `${gone.length} ${gone.length === 1 ? 'company' : 'companies'} went quiet and no check-in was drafted: no Account Manager or Owner seat is working.` })
    return
  }
  const firm = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  for (const row of gone) {
    const otherId = row.key.slice(row.key.indexOf(':') + 1)
    const link = { recordType: 'Company', recordId: otherId }
    const last = await prisma.decisionItem.findFirst({
      where: { companyId, question: { startsWith: outreachPrefix(row.side) }, proofLinks: { array_contains: [link] } },
      orderBy: { openedOn: 'desc' }, select: { openedOn: true },
    })
    if (coolingOffHolds(last?.openedOn ?? null, now)) continue
    if (!(await ctx.mayAct(1))) return
    const card = outreachCard({
      side: row.side, firmName: firm?.name ?? 'We', companyName: row.name, lastActivity: row.lastActivity, today: now,
      recipient: await recipientAt(companyId, otherId, row.side),
    })
    try {
      await openDecision({
        companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entities.length === 1 ? entities[0].id : null,
        question: card.question, ownerPersonId: owner, openedOn: now, proof: card.proof, proofLinks: [link],
      }, now)
    } catch (e) {
      if (e instanceof LedgerRefusal) continue
      throw e
    }
    await ctx.act({ recordType: 'Company', recordId: otherId, action: 'DORMANT_OUTREACH_DRAFTED', summary: `Drafted a check-in letter for ${row.name} as a ${row.side === 'CUSTOMER' ? 'customer' : 'supplier'}. A person sends it; Etyme sent nothing.` })
  }
}
