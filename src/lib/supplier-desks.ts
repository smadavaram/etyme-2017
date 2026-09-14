import { prisma } from '@/lib/db'
import type { Desks } from '@/lib/supplier-onboarding'

/**
 * The desks a supplier walks, as the requisition chain already names
 * them. The department lead is the nearest value-rule approver up the
 * recommender's own unit tree, then a company-wide one; HR and
 * Procurement are the standing desks (an ApprovalRule of kind HR or
 * PROCUREMENT, company-wide first, else the first unit's). Null where
 * nobody is named — the chain still walks, with the program office
 * standing in for the lead and for HR, anybody who manages suppliers
 * for Procurement, and whoever records payments for Finance.
 */
export async function desksFor(companyId: string, recommendedById?: string | null): Promise<Desks> {
  const rules = await prisma.approvalRule.findMany({
    where: { companyId, isActive: true },
    select: { kind: true, approverId: true, orgUnitId: true, rank: true },
    orderBy: [{ orgUnitId: 'asc' }, { rank: 'asc' }],
  })
  const pick = (kind: string) => {
    const mine = rules.filter((r) => r.kind === kind)
    return (mine.find((r) => r.orgUnitId === null) ?? mine[0])?.approverId ?? null
  }

  // The lead: walk up from the recommender's unit, nearest value rule
  // wins; then the company-wide value rule with the lowest rank. Never
  // the recommender themselves.
  let leadId: string | null = null
  if (recommendedById) {
    const seat = await prisma.context.findFirst({ where: { companyId, personId: recommendedById, revokedAt: null }, select: { orgUnitId: true } })
    const chain: string[] = []
    let unitId = seat?.orgUnitId ?? null
    for (let i = 0; unitId && i < 12; i++) {
      chain.push(unitId)
      const unit: { parentId: string | null } | null = await prisma.orgUnit.findUnique({ where: { id: unitId }, select: { parentId: true } })
      unitId = unit?.parentId ?? null
    }
    const values = rules.filter((r) => r.kind === 'VALUE' && r.approverId !== recommendedById)
    for (const u of chain) {
      const hit = values.filter((r) => r.orgUnitId === u).sort((a, b) => a.rank - b.rank)[0]
      if (hit) { leadId = hit.approverId; break }
    }
    if (!leadId) leadId = values.filter((r) => r.orgUnitId === null).sort((a, b) => a.rank - b.rank)[0]?.approverId ?? null
  }
  return { leadId, hrId: pick('HR'), procurementId: pick('PROCUREMENT') }
}

/**
 * Everybody who sits on the desk a request is on now, to be told.
 *
 * `barred` is whoever cannot decide this one — the recommender, and
 * anybody who decided an earlier desk. A named lead or HR holder who is
 * barred stands down and the program office is told instead, which is
 * the same fallback `mayActAt` applies; without it the one email went
 * to the one person who would be refused on arrival.
 */
export async function deskPeople(
  companyId: string,
  stage: 'LEAD' | 'PROCUREMENT' | 'HR' | 'FINANCE',
  desks: Desks,
  barred: readonly string[] = []
): Promise<string[]> {
  const free = (id: string | null): boolean => id !== null && !barred.includes(id)
  if (stage === 'LEAD' && free(desks.leadId)) return [desks.leadId!]
  if (stage === 'HR' && free(desks.hrId)) return [desks.hrId!]
  const permission = stage === 'PROCUREMENT' ? 'vendors.manage' : stage === 'FINANCE' ? 'payments.record' : 'governance.write'
  const rows = await prisma.context.findMany({
    where: { companyId, revokedAt: null, role: { permissions: { has: permission } } },
    select: { personId: true },
  })
  const ids = new Set(rows.map((r) => r.personId))
  if (stage === 'PROCUREMENT' && free(desks.procurementId)) ids.add(desks.procurementId!)
  return [...ids]
}
