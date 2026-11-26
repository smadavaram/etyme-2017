import { prisma } from '@/lib/db'
import { rosterRule, type RosterFacts } from '@/lib/pods'

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
  const [person, seat, listings] = await Promise.all([
    prisma.person.findUnique({ where: { id: personId }, select: { name: true } }),
    prisma.context.findFirst({ where: { personId, companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } }),
    prisma.benchListing.findMany({ where: { companyId, consultant: { personId } }, select: { state: true, revokedAt: true } }),
  ])
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
