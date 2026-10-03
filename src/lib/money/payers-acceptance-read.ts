/**
 * Reading, from the database, what a paying firm accepted on one buy
 * contract over a billed period. The thinking is in
 * `lib/money/payers-acceptance`; this only finds the weeks.
 *
 * Two places the weeks can be, and both are asked:
 *
 *   - on a contract the payer sells on, linked to this buy contract —
 *     where the payer carries the person's hours itself (a supplier that
 *     is not on the platform);
 *   - on the supplier's own contract below it, reached through
 *     `BuyContract.supplierSellContractId` and descended to the bottom
 *     of the chain, where the hours are filed once by the person.
 *
 * The one query the invoice-receipt match and the exception queue both
 * ask, so what a bill was matched against at intake and what it is
 * re-matched against in the queue cannot drift apart.
 */

import { prisma } from '@/lib/db'
import { ladderFor } from '@/lib/work-chain-read'
import { descend } from '@/lib/work-chain'
import {
  payersAcceptance, weeksAwaitingPayer, notAcceptedSays,
  type PayersAcceptance, type PayableWeek, type WaitingWeek,
} from '@/lib/money/payers-acceptance'

export async function acceptedByPayer(i: {
  buyContractId: string
  periodStart: Date
  periodEnd: Date
}): Promise<PayersAcceptance | null> {
  return (await payersBook(i))?.accepted ?? null
}

/**
 * What the payer accepted over the period, and every week in it that it
 * has not — with the sentence refusing an invoice over them, ending in
 * what the reader was doing. The invoice-receipt intake, the exception
 * queue and a payment all ask this, so the three cannot disagree about
 * which weeks are missing.
 */
export async function payersBook(i: {
  buyContractId: string
  periodStart: Date
  periodEnd: Date
  then?: 'record' | 'pay'
}): Promise<{
  accepted: PayersAcceptance | null
  waiting: WaitingWeek[]
  /** Empty where every week is accepted. */
  notAccepted: string
} | null> {
  const buy = await prisma.buyContract.findUnique({
    where: { id: i.buyContractId },
    select: { companyId: true, supplierSellContractId: true, company: { select: { name: true } } },
  })
  if (!buy) return null

  // Below the payer: every rung from the supplier's contract down, the
  // employer's last. On a two-firm chain that is one contract.
  const below = buy.supplierSellContractId
    ? descend(buy.supplierSellContractId, await ladderFor([buy.supplierSellContractId]))
    : []

  const weeks = await prisma.timesheet.findMany({
    where: {
      periodEnd: { gte: i.periodStart },
      periodStart: { lte: i.periodEnd },
      OR: [
        { sellContract: { buyLinks: { some: { buyContractId: i.buyContractId } } } },
        ...(below.length > 0 ? [{ sellContractId: { in: below } }] : []),
      ],
    },
    select: {
      id: true, periodStart: true, periodEnd: true, days: true,
      person: { select: { name: true } },
      sellContract: {
        select: {
          companyId: true, clientCompanyId: true, endClientCompanyId: true,
          buyLinks: {
            select: { buyContractId: true, sellContractId: true, effectiveFrom: true, effectiveTo: true },
          },
        },
      },
      // Only the payer's own. Another firm's signature is not read here
      // at all, so it cannot stand in for the payer's by accident.
      assertions: {
        where: { state: 'LIVE', companyId: buy.companyId },
        select: { companyId: true, role: true, hours: true, rateCents: true },
      },
    },
    take: 2_000,
  })

  // Which days this buy contract was in force for, read from the payer's
  // own sell contract — the side the payer holds.
  const payerLinks = await prisma.contractLink.findMany({
    where: { sellContract: { buyLinks: { some: { buyContractId: i.buyContractId } } } },
    select: { buyContractId: true, sellContractId: true, effectiveFrom: true, effectiveTo: true },
  })

  const read = {
    payerCompanyId: buy.companyId,
    buyContractId: i.buyContractId,
    weeks: weeks.map(({ person, ...w }) => ({
      ...w,
      personName: person?.name ?? null,
      days: (w.days as PayableWeek['days']) ?? null,
    })),
    payerLinks,
  }
  const waiting = weeksAwaitingPayer(read)
  return {
    accepted: payersAcceptance(read),
    waiting,
    notAccepted: notAcceptedSays(buy.company.name, waiting, i.then ?? 'record'),
  }
}
