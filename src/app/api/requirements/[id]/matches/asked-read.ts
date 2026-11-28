import { prisma } from '@/lib/db'

/**
 * When this company last asked for this person on this job, or null.
 * Read off the ASK messages the route writes — the ask is the message,
 * so there is no second record of it to drift.
 */
export async function lastAsk(companyId: string, requirementId: string, personId: string): Promise<Date | null> {
  const row = await prisma.message.findFirst({
    where: {
      type: 'ASK',
      conversation: { companyId, topic: 'REQUIREMENT', topicId: requirementId },
      metadata: { path: ['personId'], equals: personId },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return row?.createdAt ?? null
}

/**
 * The last ask for each person on this job, by this company — one read
 * for a whole match list.
 */
export async function lastAsks(companyId: string, requirementId: string): Promise<Map<string, Date>> {
  const rows = await prisma.message.findMany({
    where: { type: 'ASK', conversation: { companyId, topic: 'REQUIREMENT', topicId: requirementId } },
    select: { createdAt: true, metadata: true },
  })
  const out = new Map<string, Date>()
  for (const r of rows) {
    const person = (r.metadata as Record<string, unknown> | null)?.personId
    if (typeof person !== 'string') continue
    const had = out.get(person)
    if (!had || r.createdAt > had) out.set(person, r.createdAt)
  }
  return out
}
