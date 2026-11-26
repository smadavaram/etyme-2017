/**
 * Reading a sold team's earned margin off the record (record 120, pods).
 *
 * The arithmetic is `podMargin` and has no database. This gathers its facts
 * and answers who may read it: only a seat that may read margin, over lines
 * its reach covers (`lib/money/margin-reach`). The route asks `readPodMargin`
 * after the caller's own gates; a client or a member is never served.
 */
import { prisma } from '@/lib/db'
import { podMargin, type PodMargin } from '@/lib/money/pod-margin'
import { sellLinesInReach, type MarginReach } from '@/lib/money/margin-reach'

export type PodMarginRead =
  | { ok: true; podProjectId: string; margin: PodMargin }
  | { ok: false; status: 403 | 404; says: string }

export async function readPodMargin(
  caller: { companyId: string; personId: string },
  reach: Pick<MarginReach, 'scope' | 'unitIds'>,
  podProjectId: string
): Promise<PodMarginRead> {
  const project = await prisma.podProject.findFirst({
    where: { id: podProjectId, projectOrder: { companyId: caller.companyId } },
    select: {
      id: true,
      projectOrder: {
        select: {
          id: true, currency: true,
          sellContracts: { select: { id: true, person: { select: { id: true, name: true } } } },
          postings: { select: { personId: true, kind: true, amountCents: true, currency: true } },
        },
      },
      deliverables: { select: { milestone: { select: { amountCents: true, status: true } } } },
    },
  })
  if (!project) return { ok: false, status: 404, says: 'No such project at your firm.' }

  const lineIds = project.projectOrder.sellContracts.map((l) => l.id)
  const inReach = await sellLinesInReach(caller.companyId, reach, caller.personId)
  if (inReach !== null && !lineIds.some((id) => inReach.includes(id))) {
    return { ok: false, status: 403, says: 'This project is outside the part of the book you may read margin for.' }
  }

  const people = new Map(project.projectOrder.sellContracts.map((l) => [l.person.id, l.person.name]))
  return {
    ok: true,
    podProjectId: project.id,
    margin: podMargin({
      currency: project.projectOrder.currency,
      milestones: project.deliverables.map((d) => d.milestone),
      members: [...people].map(([personId, name]) => ({ personId, name })),
      postings: project.projectOrder.postings,
    }),
  }
}
