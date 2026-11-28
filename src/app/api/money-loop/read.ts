import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { mayReadBillRate } from '@/lib/money/pay-visibility'
import { amountsOf } from '@/lib/money/money-chain'
import { stateLabel, type Month } from '@/lib/money-loop'
import type { LoopSeat } from './door'

/**
 * What the money loop's routes read, in one place (record 107, Flow B).
 * A placement is a sell line this firm bills on. "On a running contract in
 * a month" is a line in progress whose dates touch that month.
 */

export function runningIn(companyId: string, month: Month): Prisma.SellContractWhereInput {
  return { companyId, state: 'IN_PROGRESS', startDate: { lte: month.end }, OR: [{ endDate: null }, { endDate: { gte: month.start } }] }
}

/** The agreed rate is the bill rate, read only by a seat that prices or bills it (lib/money/pay-visibility). */
export function readsRate(seat: LoopSeat): boolean {
  const c = seat.caller.company!
  return mayReadBillRate({ permissions: seat.caller.permissions, companyId: c.id, companyKind: c.kind }, { sellerId: c.id, clientId: '' })
}

export const RATE_WITHHELD = 'The agreed rate is shown to the people who price and bill it.'

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

type Line = { id: string; billRate: number; billCurrency: string; startDate: Date; endDate: Date | null; person: { name: string }; clientCompany: { name: string } }

export const LINE_SELECT = {
  id: true, billRate: true, billCurrency: true, startDate: true, endDate: true, personId: true,
  person: { select: { name: true } }, clientCompany: { select: { name: true } },
} as const

export function placementRow(seat: LoopSeat, l: Line) {
  return {
    sellContractId: l.id, consultant: l.person.name, client: l.clientCompany.name,
    agreedRate: readsRate(seat) ? { cents: l.billRate, currency: l.billCurrency } : null,
    start: day(l.startDate), end: day(l.endDate), currency: l.billCurrency,
  }
}

type Chain = Parameters<typeof amountsOf>[0] & { id: string; state: string; source: string | null; asOf: Date | null; disputeDecisionId: string | null }

export function chainRow(c: Chain) {
  return {
    id: c.id, state: c.state, label: stateLabel(c.state), amounts: amountsOf(c),
    source: c.source, asOf: day(c.asOf), disputeDecisionId: c.state === 'DISPUTED' ? c.disputeDecisionId : null,
  }
}

/** Every placement that is running in the month or already has a chain for it, each with that chain. */
export async function placementsIn(seat: LoopSeat, month: Month) {
  const chains = await prisma.moneyChain.findMany({ where: { companyId: seat.companyId, periodStart: month.start } })
  const lines = await prisma.sellContract.findMany({
    where: { OR: [runningIn(seat.companyId, month), { companyId: seat.companyId, id: { in: chains.map((c) => c.sellContractId) } }] },
    select: { ...LINE_SELECT, state: true },
    orderBy: [{ person: { name: 'asc' } }, { id: 'asc' }],
  })
  return lines.map((l) => {
    const chain = chains.find((c) => c.sellContractId === l.id) ?? null
    return { ...placementRow(seat, l), personId: l.personId, running: l.state === 'IN_PROGRESS', chain: chain ? chainRow(chain) : null }
  })
}

/** Whom a past month may be loaded for: a contract that ran or ended, whose dates touch the month, with no chain for it yet. */
export async function loadableIn(seat: LoopSeat, month: Month) {
  const lines = await prisma.sellContract.findMany({
    where: {
      companyId: seat.companyId, state: { in: ['IN_PROGRESS', 'PAUSED', 'ENDED'] }, startDate: { lte: month.end },
      OR: [{ endDate: null }, { endDate: { gte: month.start } }], moneyChains: { none: { periodStart: month.start } },
    },
    select: LINE_SELECT, orderBy: [{ person: { name: 'asc' } }, { id: 'asc' }],
  })
  return lines.map((l) => ({ sellContractId: l.id, name: `${l.person.name} at ${l.clientCompany.name}`, currency: l.billCurrency }))
}
