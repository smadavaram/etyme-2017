/**
 * The dates to ask a bill for, when a story means "bill this week".
 *
 * ── Why a test cannot simply pass the week's own dates ───────────────
 *
 * A bill covers part of ONE contract period, the period containing the
 * first date asked for (`lib/money/invoice-window`). A week that crosses
 * the edge of that period is billed whole in the period it ends in — or
 * starts in, where the document says START — because one timesheet bills
 * once (`billingStraddle` in `lib/periods`).
 *
 * So on a monthly contract, a week running 28 September to 2 October is
 * October's. Asked for "28 September to 2 October", the generator reads
 * the September part of that, finds nothing of September's in it, and
 * refuses — rightly. Ten integration tests passed that literal for two
 * days and failed on 5 October 2026, when the week they read off the
 * world first crossed a month end. The product was right; the tests had
 * picked a window the rule says holds nothing.
 *
 * This asks the same question the generator asks, from the contract's own
 * terms, and returns the part of the week that lies in the period the
 * week bills in. For a week inside one period that is the week itself,
 * so nothing changes on the days the tests already passed.
 */
import { prisma } from '@/lib/db'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { billingStraddle, iso, periodFor } from '@/lib/periods'

export interface WeekWindow {
  /** periodStart to ask the generator for, YYYY-MM-DD. */
  periodStart: string
  /** periodEnd to ask the generator for, YYYY-MM-DD. */
  periodEnd: string
  /** The contract period the week bills in, as the bill's header says it. */
  label: string
}

export async function billingWindowFor(
  sellContractId: string,
  week: { periodStart: Date; periodEnd: Date }
): Promise<WeekWindow> {
  const line = await prisma.sellContract.findUniqueOrThrow({
    where: { id: sellContractId },
    select: {
      startDate: true, billFrequency: true, billAnchor: true, billStraddle: true,
      workOrder: { select: ORDER_HEADER_SELECT },
    },
  })
  const terms = periodTermsFor('SELL', line)
  const { straddle } = billingStraddle(terms.straddle)
  const owner = periodFor(straddle === 'START' ? week.periodStart : week.periodEnd, terms)
  const start = week.periodStart > owner.start ? week.periodStart : owner.start
  const end = week.periodEnd < owner.end ? week.periodEnd : owner.end
  return { periodStart: iso(start), periodEnd: iso(end), label: owner.label }
}
