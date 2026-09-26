/**
 * Reading the ladder out of the database.
 *
 * `lib/work-chain` is pure and does the thinking. This does the queries,
 * and is deliberately the only place that knows how a rung is stored —
 * so if the edge ever moves, one file changes rather than every route
 * that bills or pays.
 *
 * It descends and never ascends. A firm asking for its own ladder learns
 * which contracts sit below it, which is what it needs to find the hours
 * it is billing for. It learns nothing about what sits above, because
 * that is somebody else's margin.
 */

import { prisma } from '@/lib/db'
import type { Rung } from '@/lib/work-chain'

/**
 * Every rung at or below these contracts.
 *
 * Iterative rather than recursive so the query count is the depth of the
 * chain — two for the ordinary two-hop case — rather than one per
 * contract. A chain deeper than eight hops is a data fault rather than a
 * business arrangement, and stopping there beats looping forever on one.
 */
export async function ladderFor(startIds: readonly string[]): Promise<Rung[]> {
  const rungs: Rung[] = []
  const seen = new Set<string>()
  let frontier = [...new Set(startIds)]

  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const wanted = frontier.filter((id) => !seen.has(id))
    if (wanted.length === 0) break
    wanted.forEach((id) => seen.add(id))

    const rows = await prisma.sellContract.findMany({
      where: { id: { in: wanted } },
      select: {
        id: true,
        companyId: true,
        buyLinks: {
          select: {
            buyContractId: true,
            buyContract: { select: { supplierSellContractId: true } },
          },
        },
      },
    })

    for (const row of rows) {
      // A contract may in principle carry more than one buy link over
      // its life — an extension re-linked, a supplier swapped. The one
      // that names a supplier is the one that continues the ladder.
      const link = row.buyLinks.find((l) => l.buyContract.supplierSellContractId) ?? row.buyLinks[0]
      rungs.push({
        sellContractId: row.id,
        companyId: row.companyId,
        buyContractId: link?.buyContractId ?? null,
        supplierSellContractId: link?.buyContract.supplierSellContractId ?? null,
      })
    }

    frontier = rungs
      .filter((r) => wanted.includes(r.sellContractId))
      .map((r) => r.supplierSellContractId)
      .filter((id): id is string => id !== null)
  }

  return rungs
}
