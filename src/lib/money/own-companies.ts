/**
 * The companies that are a person's own: her `ConsultantProfile.ownCompanyId`
 * and any one-person corporation she holds a seat at. A buy line that buys
 * from one of them pays her company and is hers to read; a line that buys
 * from any other firm is a price between firms (`isWorkersOwnPayLine` in
 * lib/money/paid-through). Read once here so the worker's page and the
 * rate history cannot disagree about which firms are hers.
 */
import { prisma } from '@/lib/db'

export async function ownCompanyIdsOf(personId: string): Promise<string[]> {
  const [profiles, corps] = await Promise.all([
    prisma.consultantProfile.findMany({ where: { personId, ownCompanyId: { not: null } }, select: { ownCompanyId: true } }),
    prisma.company.findMany({
      where: {
        kind: 'CONSULTANT_CORP',
        OR: [
          { consultantsBehind: { some: { personId } } },
          { contexts: { some: { personId, revokedAt: null, type: 'EMPLOYEE' } } },
        ],
      },
      select: { id: true },
    }),
  ])
  return [...new Set([...profiles.map((p) => p.ownCompanyId!), ...corps.map((c) => c.id)])]
}
