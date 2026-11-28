import { prisma } from '@/lib/db'

/**
 * The firms on one sell line's own chain: its seller, and every firm that
 * sells this same person to a firm already on it, rung by rung down
 * (review, 2026-11-25). Never a firm from the person's other deals: a
 * supplier on this line reads no paper another firm holds on a deal it is
 * not party to.
 */
export async function chainFirmsOf(line: { personId: string; companyId: string }, db: typeof prisma = prisma): Promise<string[]> {
  const firms = new Set<string>([line.companyId])
  let frontier = [line.companyId]
  for (let depth = 0; depth < 6 && frontier.length > 0; depth++) {
    const below = await db.sellContract.findMany({
      where: { personId: line.personId, clientCompanyId: { in: frontier }, state: { notIn: ['CANCELLED', 'ENDED'] } },
      select: { companyId: true }, take: 40,
    })
    frontier = below.map((b) => b.companyId).filter((id) => !firms.has(id))
    for (const id of frontier) firms.add(id)
  }
  return [...firms]
}
