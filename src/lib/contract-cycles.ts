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
import { getTemplatePack } from '@/lib/template-packs'

/** The one table this touches, so a transaction client or the plain client both fit. */
type CycleWriter = Pick<Prisma.TransactionClient, 'cycle'>

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

  const sellCycles = generateCycles(sell.startDate, sell.endDate, split.sell, holidays)
  const buyCycles = buy ? generateCycles(sell.startDate, sell.endDate, split.buy, holidays) : []

  const rows = [
    ...sellCycles.map((c) => ({ sellContractId: sell.id, kind: c.kind, dueOn: c.dueOn })),
    ...buyCycles.map((c) => ({ buyContractId: buy!.id, kind: c.kind, dueOn: c.dueOn })),
  ]
  if (rows.length > 0) await db.cycle.createMany({ data: rows })

  return { sell: sellCycles.length, buy: buyCycles.length, refused: split.refused }
}
