import { prisma } from '@/lib/db'
import { offerStateSays } from '@/lib/pods'
import { POD_SALE_ACT } from '@/lib/twin/pod-sale-card'
import { rosterRule, projectIsOpen, deliverableState, type RosterFacts } from '@/lib/pods'

/** The firm's teams with roles, headcount and members (names only). */
export async function readPods(companyId: string, podId?: string) {
  const pods = await prisma.pod.findMany({
    where: { companyId, ...(podId ? { id: podId } : {}) },
    orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, description: true, pricing: true, sprintPriceCents: true, sprintWeeks: true, currency: true, archivedAt: true,
      roles: {
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true, headcount: true, rateCents: true, members: { orderBy: { addedAt: 'asc' }, select: { id: true, person: { select: { id: true, name: true, primaryEmail: true } } } } },
      },
    },
  })
  return pods.map((p) => ({
    ...p,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    headcount: p.roles.reduce((n, r) => n + r.headcount, 0),
    filled: p.roles.reduce((n, r) => n + r.members.length, 0),
    roles: p.roles.map((r) => ({
      id: r.id, title: r.title, headcount: r.headcount, rateCents: r.rateCents,
      members: r.members.map((m) => ({ memberId: m.id, personId: m.person.id, name: m.person.name, email: m.person.primaryEmail })),
    })),
  }))
}

/** What the roster rule needs for one person at one firm. */
export async function rosterFacts(companyId: string, personId: string): Promise<RosterFacts | null> {
  const [seat, listings] = await Promise.all([
    prisma.context.findFirst({ where: { personId, companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } }),
    prisma.benchListing.findMany({ where: { companyId, consultant: { personId } }, select: { state: true, revokedAt: true } }),
  ])
  // A person the firm holds nothing on is never looked up: no name leaves the table for a bare id.
  if (!seat && listings.length === 0) return null
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { name: true } })
  if (!person) return null
  // The best listing she holds: a live granted one beats any other.
  const listing = listings.find((l) => l.state === 'GRANTED' && !l.revokedAt) ?? listings[0] ?? null
  return { name: person.name, employee: Boolean(seat), listing }
}

/** Everybody who may be put on a team at this firm: its employees and its consented bench. */
export async function eligiblePeople(companyId: string): Promise<{ personId: string; name: string; email: string | null; kind: 'EMPLOYEE' | 'BENCH' }[]> {
  const [seats, listings] = await Promise.all([
    prisma.context.findMany({ where: { companyId, type: 'EMPLOYEE', revokedAt: null }, select: { person: { select: { id: true, name: true, primaryEmail: true } } }, take: 500 }),
    prisma.benchListing.findMany({ where: { companyId, state: 'GRANTED', revokedAt: null }, select: { consultant: { select: { person: { select: { id: true, name: true, primaryEmail: true } } } } }, take: 500 }),
  ])
  const out = new Map<string, { personId: string; name: string; email: string | null; kind: 'EMPLOYEE' | 'BENCH' }>()
  for (const l of listings) { const p = l.consultant.person; out.set(p.id, { personId: p.id, name: p.name, email: p.primaryEmail, kind: 'BENCH' }) }
  for (const s of seats) { const p = s.person; out.set(p.id, { personId: p.id, name: p.name, email: p.primaryEmail, kind: 'EMPLOYEE' }) }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The firm's own pod, or null. */
export async function ownPod(companyId: string, id: string) {
  return prisma.pod.findFirst({ where: { id, companyId }, select: { id: true, name: true, pricing: true, sprintPriceCents: true, sprintWeeks: true, archivedAt: true } })
}

/** The client a team is sold to while a project of it is not fulfilled; null where it is free to change. */
export async function soldTo(podId: string): Promise<{ clientName: string | null } | null> {
  const projects = await prisma.podProject.findMany({
    where: { podId },
    select: {
      fulfilledAt: true,
      projectOrder: { select: { clientCompany: { select: { name: true } } } },
      deliverables: { select: { startedAt: true, milestone: { select: { status: true, rejectionReason: true } } } },
    },
  })
  const open = projects.find((p) => projectIsOpen({ fulfilledAt: p.fulfilledAt, deliverableStates: p.deliverables.map((d) => deliverableState(d.milestone, d.startedAt)?.state ?? null) }))
  return open ? { clientName: open.projectOrder.clientCompany?.name ?? null } : null
}

/** The firm's sold projects, by team: who bought, and whether it is still open. No money here; the margin has its own door. */
export async function readProjects(companyId: string, lineIds?: string[] | null): Promise<{ id: string; podId: string; name: string; clientName: string | null; open: boolean; deliverables: { id: string; name: string; state: string | null }[] }[]> {
  const rows = await prisma.podProject.findMany({
    // `lineIds` narrows to the projects with a line in a margin reader's reach; null or absent is every project.
    where: { pod: { companyId }, ...(lineIds ? { projectOrder: { sellContracts: { some: { id: { in: lineIds } } } } } : {}) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, podId: true, fulfilledAt: true,
      projectOrder: { select: { name: true, clientCompany: { select: { name: true } } } },
      deliverables: { orderBy: { milestone: { sortOrder: 'asc' } }, select: { id: true, startedAt: true, milestone: { select: { name: true, status: true, rejectionReason: true } } } },
    },
  })
  return rows.map((p) => ({
    id: p.id, podId: p.podId, name: p.projectOrder.name, clientName: p.projectOrder.clientCompany?.name ?? null,
    deliverables: p.deliverables.map((d) => ({ id: d.id, name: d.milestone.name, state: deliverableState(d.milestone, d.startedAt)?.state ?? null })),
    open: projectIsOpen({ fulfilledAt: p.fulfilledAt, deliverableStates: p.deliverables.map((d) => deliverableState(d.milestone, d.startedAt)?.state ?? null) }),
  }))
}

/**
 * Where each team's offer stands, newest card per team: who it was offered
 * to, who it waits on, and the answer. The supplier reads the client's name
 * and the acceptor's name (she was named by the supplier) and nothing else
 * from the card; the client's reason for a no stays with the client.
 */
export async function readOffers(companyId: string): Promise<Record<string, { client: string; acceptor: string; decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERTAKEN'; says: string | null }>> {
  const rows = await prisma.twinAction.findMany({
    where: { action: POD_SALE_ACT, entityType: 'Pod', partyCompanyIds: { has: companyId }, NOT: { companyId }, approvalRequested: { isNot: null } },
    orderBy: { ts: 'desc' },
    take: 200,
    select: { entityId: true, payload: true, company: { select: { name: true } }, approvalRequested: { select: { decision: true } } },
  })
  const newest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (r.entityId && !newest.has(r.entityId)) newest.set(r.entityId, r)
  const people = await prisma.person.findMany({
    where: { id: { in: [...newest.values()].map((r) => String((r.payload as { acceptorPersonId?: string } | null)?.acceptorPersonId ?? '')) } },
    select: { id: true, name: true },
  })
  const names = new Map(people.map((p) => [p.id, p.name]))
  const out: Awaited<ReturnType<typeof readOffers>> = {}
  for (const [podId, r] of newest) {
    if (!r.approvalRequested) continue
    const o = { client: r.company.name, acceptor: names.get(String((r.payload as { acceptorPersonId?: string } | null)?.acceptorPersonId)) ?? 'the person named', decision: r.approvalRequested.decision }
    out[podId] = { ...o, says: offerStateSays(o) }
  }
  return out
}
