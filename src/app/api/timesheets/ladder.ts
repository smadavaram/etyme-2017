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
  const out: { rung: ChainRung; contract: LegContract | null }[] = []
  const seen = new Set<string>([hoursOn])
  let frontier = [hoursOn]

  // A chain deeper than eight firms is a data fault rather than a
  // business arrangement, and stopping beats looping forever on one.
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const links = await prisma.contractLink.findMany({
      where: { buyContract: { supplierSellContractId: { in: frontier } } },
      select: {
        sellContractId: true,
        buyContract: { select: { supplierSellContractId: true } },
      },
    })

    const wanted = [...new Set(links.map((l) => l.sellContractId))].filter((id) => !seen.has(id))
    if (wanted.length === 0) break
    wanted.forEach((id) => seen.add(id))

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

    for (const row of rows) {
      const below = links.find((l) => l.sellContractId === row.id)?.buyContract.supplierSellContractId ?? null
      out.push({
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

    frontier = wanted
  }

  // The bottom rung comes back too, with no contract of its own: the
  // caller already holds that row, and handing it back a second copy is
  // how two readings of one contract drift apart.
  return [...out, { rung: bottom, contract: null }]
}

/**
 * Whose turn it is on one week, for one firm — the same question the
 * approve route asks, for the queue and the list that must not offer a
 * button the route will refuse.
 */
export async function weekTurn(
  week: {
    id: string
    sellContractId: string
    clientApprovedAt: Date | null
    employerAcceptedAt: Date | null
    sellContract: { companyId: string; clientCompanyId: string; endClientCompanyId: string | null }
  },
  companyId: string
): Promise<{ turn: Turn; ladder: LadderRung[]; signers: Signer[] }> {
  const rungs = await ladderAbove(week.sellContractId, {
    sellContractId: week.sellContractId,
    companyId: week.sellContract.companyId,
    clientCompanyId: week.sellContract.clientCompanyId,
    endClientCompanyId: week.sellContract.endClientCompanyId,
    supplierSellContractId: null,
  })
  const ladder = topDown(rungs.map((r) => r.rung))
  const signers = signersOf(ladder)
  const live = await prisma.workAssertion.findMany({
    where: { timesheetId: week.id, state: 'LIVE' },
    select: { companyId: true, role: true },
  })
  const firms = new Map(
    (
      await prisma.company.findMany({
        where: { id: { in: [...new Set(signers.map((s) => s.companyId))] } },
        select: { id: true, name: true },
      })
    ).map((c) => [c.id, c.name])
  )
  const turn = turnOf(signers, companyId, (s) => signedBy(s, week, live), (id) => firms.get(id) ?? 'The firm above you')
  return { turn, ladder, signers }
}
