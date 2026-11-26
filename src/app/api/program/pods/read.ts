import { prisma } from '@/lib/db'
import { deliverableState, fulfilled, type DeliverableState } from '@/lib/pods'
import { REJECTION_REASONS, decodeRejection } from '../milestones/acceptance'

/**
 * What a client reads of work it bought as a team (record 120, 119).
 *
 * The allowlist, and nothing past it: the project's name, each deliverable's
 * name, due date and state, the reason on a rejection, the one person named
 * to decide and the day it was accepted, and the roles with their headcount.
 * Never a member's name or id, a rate, a cost, a margin, the seller's name or
 * any firm below it. The only ids are the deliverables', which its Accept
 * and Reject buttons need. The words are project, deliverable and team.
 */
export interface SoldWorkDeliverable {
  id: string
  name: string
  dueOn: string | null
  state: DeliverableState | 'unknown'
  /** Why it was rejected, in words; null on any other state. */
  reason: string | null
  acceptedAt: string | null
  /** Whether the reader is the named acceptor and the deliverable waits for an answer. */
  mayDecide: boolean
}

export interface SoldWorkProject {
  name: string
  acceptor: { name: string; isYou: boolean }
  roles: { title: string; headcount: number }[]
  headcount: number
  deliverables: SoldWorkDeliverable[]
  /** At least one deliverable and every one accepted. */
  fulfilled: boolean
}

const reasonWords = (code: string | null): string | null => (code ? REJECTION_REASONS.find((r) => r.code === code)?.label ?? code : null)

export async function readSoldWork(clientCompanyId: string, readerPersonId: string): Promise<SoldWorkProject[]> {
  const projects = await prisma.podProject.findMany({
    where: { projectOrder: { clientCompanyId } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      acceptorPersonId: true,
      acceptor: { select: { name: true } },
      projectOrder: { select: { name: true } },
      pod: { select: { roles: { orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], select: { title: true, headcount: true } } } },
      deliverables: {
        select: {
          startedAt: true,
          milestone: { select: { id: true, name: true, dueOn: true, status: true, acceptedAt: true, rejectionReason: true, note: true } },
        },
      },
    },
  })
  return projects.map((p) => {
    const deliverables = p.deliverables
      .map((d) => d.milestone)
      .map((m, i) => ({ m, startedAt: p.deliverables[i].startedAt }))
      .sort((a, b) => (a.m.dueOn?.getTime() ?? Infinity) - (b.m.dueOn?.getTime() ?? Infinity) || a.m.name.localeCompare(b.m.name))
      .map(({ m, startedAt }): SoldWorkDeliverable & { raw: DeliverableState | null } => {
        const code = m.rejectionReason ?? decodeRejection(m.note)?.reason ?? null
        const st = deliverableState({ status: m.status, rejectionReason: code }, startedAt)
        return {
          id: m.id,
          name: m.name,
          dueOn: m.dueOn?.toISOString() ?? null,
          state: st?.state ?? 'unknown',
          reason: st?.state === 'rejected' ? reasonWords(st.reason) : null,
          acceptedAt: st?.state === 'accepted' ? m.acceptedAt?.toISOString() ?? null : null,
          mayDecide: p.acceptorPersonId === readerPersonId && st?.state === 'submitted',
          raw: st?.state ?? null,
        }
      })
    return {
      name: p.projectOrder.name,
      acceptor: { name: p.acceptor.name, isYou: p.acceptorPersonId === readerPersonId },
      roles: p.pod.roles.map((r) => ({ title: r.title, headcount: r.headcount })),
      headcount: p.pod.roles.reduce((n, r) => n + r.headcount, 0),
      deliverables: deliverables.map(({ raw: _raw, ...d }) => d),
      fulfilled: fulfilled(deliverables.map((d) => d.raw)),
    }
  })
}
