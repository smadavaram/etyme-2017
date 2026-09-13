import { prisma } from '@/lib/db'
import type { Desks } from '@/lib/supplier-onboarding'

/**
 * The HR and Procurement standing desks at a client, as the requisition
 * chain names them: an ApprovalRule of kind HR or PROCUREMENT. A
 * company-wide rule wins; else the first unit's. Null where nobody is
 * named — the chain still walks, with the program office standing in
 * for HR and anybody who manages suppliers for Procurement.
 */
export async function desksFor(companyId: string): Promise<Desks> {
  const rules = await prisma.approvalRule.findMany({
    where: { companyId, isActive: true, kind: { in: ['HR', 'PROCUREMENT'] } },
    select: { kind: true, approverId: true, orgUnitId: true },
    orderBy: [{ orgUnitId: 'asc' }, { rank: 'asc' }],
  })
  const pick = (kind: string) => {
    const mine = rules.filter((r) => r.kind === kind)
    return (mine.find((r) => r.orgUnitId === null) ?? mine[0])?.approverId ?? null
  }
  return { hrId: pick('HR'), procurementId: pick('PROCUREMENT') }
}

/** Everybody who sits on the desk a request is on now, to be told. */
export async function deskPeople(companyId: string, stage: 'TEAM' | 'HR' | 'PROCUREMENT', desks: Desks): Promise<string[]> {
  if (stage === 'HR' && desks.hrId) return [desks.hrId]
  const permission = stage === 'PROCUREMENT' ? 'vendors.manage' : 'governance.write'
  const rows = await prisma.context.findMany({
    where: { companyId, role: { permissions: { has: permission } } },
    select: { personId: true },
  })
  const ids = new Set(rows.map((r) => r.personId))
  if (stage === 'PROCUREMENT' && desks.procurementId) ids.add(desks.procurementId)
  return [...ids]
}
