/**
 * Reading planned versus actual off a sold team's record (records 120, 123).
 * The arithmetic is `projectVariance`. This gathers the facts and decides
 * what the reader may see: the schedule to a seat that reads jobs or margin,
 * the cost only to a seat that may read margin, over lines its reach covers.
 * A client is never served; the route refuses before this runs.
 */
import { prisma } from '@/lib/db'
import { projectVariance, type ProjectVariance } from '@/lib/pods/variance'
import { sellLinesInReach, type MarginReach } from '@/lib/money/margin-reach'

export type VarianceRead =
  | { ok: true; podProjectId: string; variance: ProjectVariance; costSays: string | null }
  | { ok: false; status: 403 | 404; says: string }

export async function readPodVariance(
  caller: { companyId: string; personId: string; readsJobs: boolean; readsMargin: boolean },
  reach: Pick<MarginReach, 'scope' | 'unitIds'>,
  podProjectId: string,
  asOf: Date = new Date()
): Promise<VarianceRead> {
  const project = await prisma.podProject.findFirst({
    where: { id: podProjectId, projectOrder: { companyId: caller.companyId } },
    select: {
      id: true,
      projectOrder: {
        select: {
          currency: true,
          sellContracts: { select: { id: true, person: { select: { id: true, name: true } } } },
          postings: { select: { personId: true, kind: true, amountCents: true, currency: true } },
        },
      },
      deliverables: { orderBy: { milestone: { sortOrder: 'asc' } }, select: { baselineDueOn: true, baselineAmountCents: true, milestone: { select: { name: true, status: true, acceptedAt: true } } } },
    },
  })
  if (!project) return { ok: false, status: 404, says: 'No such project at your firm.' }

  let mayCost = false
  if (caller.readsMargin) {
    const lineIds = project.projectOrder.sellContracts.map((l) => l.id)
    const inReach = await sellLinesInReach(caller.companyId, reach, caller.personId)
    mayCost = inReach === null || lineIds.some((id) => inReach.includes(id))
  }
  if (!caller.readsJobs && !mayCost) return { ok: false, status: 403, says: 'This project is outside the part of the book you may read margin for.' }

  const people = new Map(project.projectOrder.sellContracts.map((l) => [l.person.id, l.person.name]))
  const variance = projectVariance({
    asOf,
    currency: project.projectOrder.currency,
    deliverables: project.deliverables.map((d) => ({ name: d.milestone.name, status: d.milestone.status, baselineDueOn: d.baselineDueOn, baselineAmountCents: d.baselineAmountCents, acceptedAt: d.milestone.acceptedAt })),
    cost: mayCost ? { members: [...people].map(([personId, name]) => ({ personId, name })), postings: project.projectOrder.postings } : null,
  })
  return { ok: true, podProjectId: project.id, variance, costSays: mayCost ? null : 'Cost is for seats that read margin.' }
}
