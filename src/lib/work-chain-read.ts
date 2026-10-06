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

// ── Ascending, for the books ──────────────────────────────────────────
//
// `ladderFor` descends because a firm billing for hours has to find them
// underneath it. Posting a signature is the other question: given the
// line the hours are filed on, which rungs sit above it, so each rung's
// money lands in its own seller's books at its own rate (lib/money/hop-
// ledger). It is read by the books, never handed to a screen: what one
// rung charges another is read by the caller off the one row it prices.

/** The seller's own buy line behind a rung, with the person's rate on it where named. */
export interface BookBuy {
  id: string
  companyId: string
  contractType: string
  payCurrency: string | null
  /** Null where the line does not name the person. */
  payRate: number | null
  personPayCurrency: string | null
}

/** One rung as the books read it. */
export interface BookRung {
  sellContractId: string
  companyId: string
  clientCompanyId: string
  endClientCompanyId: string | null
  billRate: number
  billCurrency: string
  /** The master contract the line is tagged to, where it is — saves opening one. */
  projectOrderId: string | null
  /** The seller's own buy line behind this rung, where one is linked. */
  buyContractId: string | null
  buy: BookBuy | null
  /** The rung below, where the seller buys the person from another firm. */
  supplierSellContractId: string | null
}

/** What a rung is read with. Exported so a caller can fold it into a read it already makes. */
export function bookRungSelect(personId: string | null) {
  return {
    id: true, companyId: true, clientCompanyId: true, endClientCompanyId: true,
    billRate: true, billCurrency: true, projectOrderId: true, personId: true,
    buyLinks: {
      select: {
        buyContractId: true,
        buyContract: {
          select: {
            id: true, companyId: true, contractType: true, payCurrency: true, supplierSellContractId: true,
            candidates: {
              ...(personId ? { where: { personId }, take: 1 } : {}),
              select: { personId: true, payRate: true, payCurrency: true },
            },
          },
        },
      },
    },
  } as const
}

type RungRow = {
  id: string; companyId: string; clientCompanyId: string; endClientCompanyId: string | null
  billRate: number; billCurrency: string | null; projectOrderId: string | null; personId: string
  buyLinks: {
    buyContractId: string
    buyContract: {
      id: string; companyId: string; contractType: string; payCurrency: string | null; supplierSellContractId: string | null
      candidates: { personId: string; payRate: number; payCurrency: string | null }[]
    }
  }[]
}

function toRung(row: RungRow, below: string | null): BookRung {
  // The buy line that continues the ladder downward, where this rung buys
  // from a supplier; else the payroll line where it employs them.
  const link = (below ? row.buyLinks.find((l) => l.buyContract.supplierSellContractId === below) : null)
    ?? row.buyLinks.find((l) => !l.buyContract.supplierSellContractId)
    ?? row.buyLinks[0]
  const b = link?.buyContract ?? null
  const cand = b?.candidates.find((c) => c.personId === row.personId) ?? null
  return {
    sellContractId: row.id,
    companyId: row.companyId,
    clientCompanyId: row.clientCompanyId,
    endClientCompanyId: row.endClientCompanyId,
    billRate: row.billRate,
    billCurrency: row.billCurrency ?? 'USD',
    projectOrderId: row.projectOrderId,
    buyContractId: link?.buyContractId ?? null,
    buy: b
      ? {
          id: b.id, companyId: b.companyId, contractType: b.contractType, payCurrency: b.payCurrency,
          payRate: cand?.payRate ?? null, personPayCurrency: cand?.payCurrency ?? null,
        }
      : null,
    supplierSellContractId: below,
  }
}

/**
 * The ladder over the line the hours are filed on, top first and that
 * line last. A direct placement is a ladder of one.
 *
 * Walked upward through `BuyContract.supplierSellContractId` and the buy
 * line's `ContractLink` to the sell line it funds — the same edge every
 * other walk uses. Eight rungs at most: a chain deeper than that is a
 * data fault rather than a business arrangement.
 */
export async function ladderOver(hoursOn: string): Promise<BookRung[]> {
  return (await laddersOver([hoursOn])).get(hoursOn) ?? []
}

/** One row of the ladder read: a sell line in the closure, joined to one of its buy links. */
interface FlatRung {
  bottom: string
  id: string
  companyId: string
  clientCompanyId: string
  endClientCompanyId: string | null
  billRate: number
  billCurrency: string | null
  projectOrderId: string | null
  personId: string
  buyContractId: string | null
  buyCompanyId: string | null
  contractType: string | null
  payCurrency: string | null
  supplierSellContractId: string | null
  candPayRate: number | null
  candPayCurrency: string | null
}

/**
 * The ladder over each of these filing lines, in one question.
 *
 * Posting a signature reads its ladder, and the seed posts every signed
 * week of the world one call at a time against a budget of database
 * questions — so the whole closure upward is read as one recursive query
 * rather than one nested read per rung. The walk itself is replayed here
 * exactly as it was: at each step, the sell line whose buy line buys the
 * rung below; where two would qualify, the one whose seller is the
 * customer of the rung below.
 */
export async function laddersOver(hoursOn: readonly string[]): Promise<Map<string, BookRung[]>> {
  const out = new Map<string, BookRung[]>()
  const ids = [...new Set(hoursOn)]
  if (ids.length === 0) return out
  const flat = await prisma.$queryRaw<FlatRung[]>`
    WITH RECURSIVE up(id, bottom, person, depth) AS (
      SELECT sc.id, sc.id, sc."personId", 0 FROM "SellContract" sc WHERE sc.id = ANY(${ids}::text[])
      UNION
      SELECT s2.id, up.bottom, up.person, up.depth + 1
        FROM up
        JOIN "BuyContract" bc ON bc."supplierSellContractId" = up.id
        JOIN "ContractLink" cl ON cl."buyContractId" = bc.id
        JOIN "SellContract" s2 ON s2.id = cl."sellContractId"
       WHERE up.depth < 8 AND s2.id <> up.bottom
    )
    SELECT DISTINCT up.bottom, sc.id, sc."companyId", sc."clientCompanyId", sc."endClientCompanyId",
           sc."billRate", sc."billCurrency", sc."projectOrderId", sc."personId",
           cl."buyContractId", bc."companyId" AS "buyCompanyId", bc."contractType"::text AS "contractType",
           bc."payCurrency", bc."supplierSellContractId",
           c."payRate" AS "candPayRate", c."payCurrency" AS "candPayCurrency"
      FROM up
      JOIN "SellContract" sc ON sc.id = up.id
      LEFT JOIN "ContractLink" cl ON cl."sellContractId" = sc.id
      LEFT JOIN "BuyContract" bc ON bc.id = cl."buyContractId"
      LEFT JOIN "BuyContractCandidate" c
             ON c."buyContractId" = bc.id AND c."personId" = sc."personId" AND c."personId" = up.person
     ORDER BY sc.id, cl."buyContractId"
  `

  for (const bottom of ids) {
    // Every sell line in this bottom's closure, as the row `toRung` reads.
    const rows = new Map<string, RungRow>()
    for (const f of flat) {
      if (f.bottom !== bottom) continue
      const row = rows.get(f.id) ?? {
        id: f.id, companyId: f.companyId, clientCompanyId: f.clientCompanyId, endClientCompanyId: f.endClientCompanyId,
        billRate: Number(f.billRate), billCurrency: f.billCurrency, projectOrderId: f.projectOrderId, personId: f.personId,
        buyLinks: [],
      }
      rows.set(f.id, row)
      if (f.buyContractId && f.buyCompanyId && !row.buyLinks.some((l) => l.buyContractId === f.buyContractId)) {
        row.buyLinks.push({
          buyContractId: f.buyContractId,
          buyContract: {
            id: f.buyContractId, companyId: f.buyCompanyId, contractType: f.contractType ?? 'W2',
            payCurrency: f.payCurrency, supplierSellContractId: f.supplierSellContractId,
            candidates: f.candPayRate == null ? [] : [{ personId: f.personId, payRate: Number(f.candPayRate), payCurrency: f.candPayCurrency }],
          },
        })
      }
    }
    const bottomRow = rows.get(bottom)
    if (!bottomRow) {
      out.set(bottom, [])
      continue
    }
    const ladder: BookRung[] = [toRung(bottomRow, null)]
    const seen = new Set<string>([bottom])
    let at = bottom
    for (let depth = 0; depth < 8; depth++) {
      const above = [...rows.values()].filter(
        (r) => !seen.has(r.id) && r.buyLinks.some((l) => l.buyContract.supplierSellContractId === at)
      )
      if (above.length === 0) break
      const customer = ladder[0].clientCompanyId
      const row = above.find((r) => r.companyId === customer) ?? above[0]
      seen.add(row.id)
      ladder.unshift(toRung(row, at))
      at = row.id
    }
    out.set(bottom, ladder)
  }
  return out
}
