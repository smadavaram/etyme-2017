/**
 * The ladder above the contract a week is filed on.
 *
 * Moved out of `[id]/approve/route.ts`, unchanged, because three readers
 * now need the same walk: the approve route, the decisions queue that
 * tells each rung its turn has come, and the timesheet list that offers
 * a rung its button. A route file may export only its handlers.
 */
import { prisma } from '@/lib/db'
import type { ChainRung } from '@/lib/overtime'
import { topDown, signersOf, turnOf, signedBy, type Turn, type LadderRung, type Signer } from './chain-turn'

/** One contract as answering a leg needs it: its terms, its rate, its two firms. */
export interface LegContract {
  id: string
  billRate: number
  overtimeAfterHours: number | null
  overtimeMultiplierBps: number | null
  companyId: string
  clientCompanyId: string
  endClientCompanyId: string | null
  companyName: string | null
  clientName: string | null
}

/**
 * The rungs above the contract the hours are filed against.
 *
 * `lib/work-chain-read` descends, because a firm billing for hours needs
 * to find them underneath it. This is the opposite question and it is
 * asked by the approver, not about them: which of the contracts on this
 * ladder is the one I buy on. A client cannot find its own leg by
 * descending, because its leg is at the top.
 *
 * `BuyContract.supplierSellContractId` is the edge in both directions —
 * followed downward it finds the hours; followed upward it finds
 * whoever bought them from us. Two queries per rung above, and none at
 * all on a direct placement, which is the ordinary case: the walk stops
 * the first time nobody has bought this contract's person from us.
 *
 * It returns nothing a firm is not entitled to on its own leg: the
 * caller reads the rate off the one rung it is a party to, and
 * `decidingLeg` picks that rung before anything is priced.
 */
export async function ladderAbove(
  hoursOn: string,
  bottom: ChainRung
): Promise<{ rung: ChainRung; contract: LegContract | null }[]> {
  return (await laddersAbove([{ hoursOn, bottom }])).get(hoursOn) ?? [{ rung: bottom, contract: null }]
}

/**
 * The same walk for many weeks at once: two queries per rung of the
 * tallest chain, whatever the number of weeks. The decisions queue asked
 * `ladderAbove` once per row — five queries a week, twenty weeks a seat —
 * and was most of the greeting's time (simulation, 2026-10-20).
 *
 * Keyed by the contract the hours are on. Each walk is its own: a rung
 * one week reaches is never handed to another week's ladder unless that
 * week's own chain reaches it too.
 */
export async function laddersAbove(
  starts: readonly { hoursOn: string; bottom: ChainRung }[]
): Promise<Map<string, { rung: ChainRung; contract: LegContract | null }[]>> {
  type Walk = { out: { rung: ChainRung; contract: LegContract | null }[]; seen: Set<string>; frontier: string[] }
  const walks = new Map<string, Walk>()
  for (const s of starts) {
    if (!walks.has(s.hoursOn)) walks.set(s.hoursOn, { out: [], seen: new Set([s.hoursOn]), frontier: [s.hoursOn] })
  }

  // A chain deeper than eight firms is a data fault rather than a
  // business arrangement, and stopping beats looping forever on one.
  let frontier = [...new Set([...walks.values()].flatMap((w) => w.frontier))]
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const links = await prisma.contractLink.findMany({
      where: { buyContract: { supplierSellContractId: { in: frontier } } },
      select: {
        sellContractId: true,
        buyContract: { select: { supplierSellContractId: true } },
      },
    })

    const wantedBy = new Map<Walk, string[]>()
    for (const w of walks.values()) {
      if (w.frontier.length === 0) continue
      const mine = links.filter((l) => w.frontier.includes(l.buyContract.supplierSellContractId ?? ''))
      const wanted = [...new Set(mine.map((l) => l.sellContractId))].filter((id) => !w.seen.has(id))
      wanted.forEach((id) => w.seen.add(id))
      wantedBy.set(w, wanted)
    }
    // Nobody bought any of these from the firm below: every walk stops
    // here. A direct placement asks this one question and no other.
    const wanted = [...new Set([...wantedBy.values()].flat())]
    if (wanted.length === 0) break

    const rows = await prisma.sellContract.findMany({
      where: { id: { in: wanted } },
      select: {
        id: true, billRate: true, companyId: true,
        clientCompanyId: true, endClientCompanyId: true,
        overtimeAfterHours: true, overtimeMultiplierBps: true,
        company: { select: { name: true } },
        clientCompany: { select: { name: true } },
        endClientCompany: { select: { name: true } },
      },
    })

    for (const [w, mine] of wantedBy) {
      for (const row of rows.filter((r) => mine.includes(r.id))) {
        const below =
          links.find((l) => l.sellContractId === row.id && w.frontier.includes(l.buyContract.supplierSellContractId ?? ''))
            ?.buyContract.supplierSellContractId ?? null
        w.out.push({
          rung: {
            sellContractId: row.id,
            companyId: row.companyId,
            clientCompanyId: row.clientCompanyId,
            endClientCompanyId: row.endClientCompanyId,
            supplierSellContractId: below,
          },
          contract: {
            id: row.id,
            billRate: row.billRate,
            overtimeAfterHours: row.overtimeAfterHours,
            overtimeMultiplierBps: row.overtimeMultiplierBps,
            companyId: row.companyId,
            clientCompanyId: row.clientCompanyId,
            endClientCompanyId: row.endClientCompanyId,
            companyName: row.company?.name ?? null,
            clientName: row.endClientCompany?.name ?? row.clientCompany?.name ?? null,
          },
        })
      }
      w.frontier = mine
    }
    frontier = [...new Set([...walks.values()].flatMap((x) => x.frontier))]
  }

  // The bottom rung comes back too, with no contract of its own: the
  // caller already holds that row, and handing it back a second copy is
  // how two readings of one contract drift apart.
  const result = new Map<string, { rung: ChainRung; contract: LegContract | null }[]>()
  for (const s of starts) {
    const w = walks.get(s.hoursOn)!
    result.set(s.hoursOn, [...w.out, { rung: s.bottom, contract: null }])
  }
  return result
}

/**
 * Whose turn it is on one week, for one firm — the same question the
 * approve route asks, for the queue and the list that must not offer a
 * button the route will refuse.
 */
export async function weekTurn(
  week: TurnWeek,
  companyId: string
): Promise<{ turn: Turn; ladder: LadderRung[]; signers: Signer[] }> {
  return (await weekTurns([week], companyId)).get(week.id)!
}

/** One week as `weekTurn` reads it. */
export interface TurnWeek {
  id: string
  sellContractId: string
  clientApprovedAt: Date | null
  employerAcceptedAt: Date | null
  sellContract: { companyId: string; clientCompanyId: string; endClientCompanyId: string | null }
}

/**
 * `weekTurn` for many weeks at once, keyed by week: the ladders walked
 * together (`laddersAbove`), the signatures read in one query and the
 * firms named in one. The same answer, row for row, in a fixed number of
 * queries rather than five per week.
 */
export async function weekTurns(
  weeks: readonly TurnWeek[],
  companyId: string
): Promise<Map<string, { turn: Turn; ladder: LadderRung[]; signers: Signer[] }>> {
  const out = new Map<string, { turn: Turn; ladder: LadderRung[]; signers: Signer[] }>()
  if (weeks.length === 0) return out
  const ladders = await laddersAbove(
    weeks.map((w) => ({
      hoursOn: w.sellContractId,
      bottom: {
        sellContractId: w.sellContractId,
        companyId: w.sellContract.companyId,
        clientCompanyId: w.sellContract.clientCompanyId,
        endClientCompanyId: w.sellContract.endClientCompanyId,
        supplierSellContractId: null,
      },
    }))
  )
  const shaped = weeks.map((w) => {
    const ladder = topDown((ladders.get(w.sellContractId) ?? []).map((r) => r.rung))
    return { w, ladder, signers: signersOf(ladder) }
  })
  const [live, firms] = await Promise.all([
    prisma.workAssertion.findMany({
      where: { timesheetId: { in: weeks.map((w) => w.id) }, state: 'LIVE' },
      select: { timesheetId: true, companyId: true, role: true },
    }),
    prisma.company.findMany({
      where: { id: { in: [...new Set(shaped.flatMap((x) => x.signers.map((s) => s.companyId)))] } },
      select: { id: true, name: true },
    }),
  ])
  const names = new Map(firms.map((c) => [c.id, c.name]))
  for (const { w, ladder, signers } of shaped) {
    const mine = live.filter((a) => a.timesheetId === w.id)
    const turn = turnOf(signers, companyId, (s) => signedBy(s, w, mine), (id) => names.get(id) ?? 'The firm above you')
    out.set(w.id, { turn, ladder, signers })
  }
  return out
}
