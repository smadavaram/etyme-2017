/**
 * Write the cycles a contract pair needs, once, on the side each belongs to.
 *
 * The six lines that do this — split the pack by side, generate for the
 * sell contract, generate for the buy contract, write both — appeared in
 * both contract-creating routes and in neither seeder. So a contract
 * made through a route had its due dates and one made by a seed did
 * not, and every demo the founder opened showed a timeline reading "no
 * cycles have been generated". The thread's eighth station was empty
 * on exactly the placements anybody would look at.
 *
 * One function, called wherever a contract pair comes into existence.
 *
 * No end date, no cycles. A contract with no end is open-ended and its
 * obligations cannot be enumerated; that is the routes' rule and it is
 * kept, rather than inventing a horizon.
 */

import type { Prisma } from '@prisma/client'
import { generateCycles } from '@/lib/cycle-generator'
import { cyclesFor } from '@/lib/cycle-kinds'
import { policyFrom, type CycleShiftPolicy } from '@/lib/cycle-shift'
import { getTemplatePack } from '@/lib/template-packs'

/**
 * The two tables this touches, so a transaction client or the plain
 * client both fit.
 *
 * `sellContract` is read, never written: it is how the company that holds
 * the pair — and so whose shift policy applies — is found without every
 * caller having to know to pass it. Six callers write cycles, four of
 * them in other domains and two of them seeds; a policy that only
 * arrives when somebody remembers to send it is a policy half the
 * placements in the system do not have.
 */
type CycleWriter = Pick<Prisma.TransactionClient, 'cycle' | 'sellContract'>

export interface Written {
  sell: number
  buy: number
  /** Kinds the pack offered that are not money. Named so a stale pack is visible. */
  refused: string[]
}

export async function writeCyclesFor(
  db: CycleWriter,
  input: {
    sell: { id: string; startDate: Date | null; endDate: Date | null }
    buy: { id: string; contractType: string; vendorCompanyId: string | null } | null
    /** Which pack's definitions. Seeds have no company pack and say US_IT. */
    packId: string
    /** YYYY-MM-DD, both companies' calendars unioned. Seeds pass none. */
    holidays?: Iterable<string>
    /**
     * kind → the days already written, so an extension adds the new months
     * and rewrites none of the old ones.
     *
     * Generation still runs over the whole contract, not over the added
     * months alone. A fortnightly cycle anchored on the original start
     * falls on alternate weeks, and restarting the count at the old end
     * date lands on the wrong ones half the time. Running the whole series
     * and dropping what is already there keeps every date where the first
     * generation put it, and makes calling this twice harmless.
     */
    existing?: Map<string, Set<string>>
    /**
     * Which way this company's dates move off a weekend or a holiday.
     *
     * Omitted, it is read from the company that holds the sell contract —
     * the firm that sells to the client and buys from the consultant or
     * the sub-vendor. All six money kinds are that firm's own operating
     * dates, so it is one firm's answer and not a negotiation between
     * two. A caller that has the company loaded already may pass it and
     * save the read.
     */
    policy?: CycleShiftPolicy
    /**
     * The last day already covered, on an extension.
     *
     * Generation runs over the whole contract — a fortnightly cycle
     * anchored on the original start falls on alternate weeks — and
     * emits only periods ending after this day. Without it, a company
     * that changed its weekend rule between the two runs has every date
     * of the original contract written a second time, because the dates
     * already on the books are matched by the day they landed on.
     */
    onlyPeriodsAfter?: Date | null
  }
): Promise<Written> {
  const { sell, buy } = input
  const pack = getTemplatePack(input.packId)
  if (!pack || !sell.startDate || !sell.endDate) return { sell: 0, buy: 0, refused: [] }

  const split = cyclesFor(
    buy ? { contractType: buy.contractType, vendorCompanyId: buy.vendorCompanyId } : null,
    pack.cycleDefinitions
  )
  const holidays = input.holidays ?? []
  const existing = input.existing ?? new Map<string, Set<string>>()

  // Whose policy: the company that holds the pair. A contract row that
  // has gone missing between the caller's write and this read would be a
  // bug elsewhere; it reads as the shipped default rather than as no
  // answer, because there is no third behavior for a cycle date.
  const policy =
    input.policy ??
    policyFrom(
      (
        await db.sellContract.findUnique({
          where: { id: sell.id },
          select: {
            company: {
              select: { cycleShiftHours: true, cycleShiftPay: true, cycleShiftBill: true },
            },
          },
        })
      )?.company
    )
  const options = { policy, onlyPeriodsAfter: input.onlyPeriodsAfter ?? null }

  const sellCycles = generateCycles(sell.startDate, sell.endDate, split.sell, holidays, existing, options)
  const buyCycles = buy
    ? generateCycles(sell.startDate, sell.endDate, split.buy, holidays, existing, options)
    : []

  const rows = [
    ...sellCycles.map((c) => ({ sellContractId: sell.id, kind: c.kind, dueOn: c.dueOn })),
    ...buyCycles.map((c) => ({ buyContractId: buy!.id, kind: c.kind, dueOn: c.dueOn })),
  ]
  if (rows.length > 0) await db.cycle.createMany({ data: rows })

  return { sell: sellCycles.length, buy: buyCycles.length, refused: split.refused }
}
