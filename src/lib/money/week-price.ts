import { billingStraddle, periodFor, workedSpan, type Period } from '@/lib/periods'
import type { BillOutcome } from '@/lib/money/bill-generate'
import type { periodTermsFor } from '@/lib/money/order-terms'

/**
 * How one signed week is priced: the billing period it falls in, and what
 * the Bills page's own generator says about it on a dry run. Read by the
 * one signed-not-billed reader (lib/money/signed-unbilled) and by the
 * firm's Today figures through it. Pure: no database.
 */

/** Why a signed week has no amount, in a word. */
export type WeekUnpriced =
  /** No rate on the line this firm bills from. */
  | 'no rate'
  /** Hours over the line nobody has decided are on no bill. */
  | 'overtime'
  /** The firm this firm bills has not accepted the week. */
  | 'not accepted'
  /** Accepted, and the arithmetic is not decided, so the bill leaves it off. */
  | 'held'
  /** Some of its days are already on an invoice the payer recorded from this firm, and a receipt has no lines to say which. */
  | 'partly billed'
  /** The bill for its period would go over the order's ceiling. */
  | 'ceiling'
  /**
   * The placement is paused, cancelled or not yet started, and a bill is
   * raised only on a running or ended one (`BILLABLE_LINE_STATES`). An
   * ended placement is billed for the weeks signed before its last day.
   */
  | 'not running'
  /** The placement is on no engagement, so no bill can be made for it. */
  | 'no engagement'
  /** The Bills page would refuse the bill for another reason, said in `says`. */
  | 'refused'

/**
 * The period a week bills in: its last worked day's, or its first under
 * START — one week bills once (`billingStraddle`). The same answer as
 * `periodOfWeek` in `lib/money/supplier-bills`, the twin's, and a test
 * holds the two together. Not imported from there, because that module
 * sits in a loop with the twin's performers that only loads in one order.
 */
export function billingPeriodOf(
  week: { periodStart: Date; periodEnd: Date; days: unknown },
  terms: ReturnType<typeof periodTermsFor>
): Period {
  const { straddle } = billingStraddle(terms.straddle)
  const span = workedSpan((week.days ?? {}) as Record<string, number>)
  const on = straddle === 'START' ? (span?.first ?? week.periodStart) : (span?.last ?? week.periodEnd)
  return periodFor(on, terms)
}

type LeftOffWeek = { timesheetId: string; kind: string; says: string; billedElsewhere?: 'WHOLE' | 'PART' }

/**
 * A week the bill leaves off, read: one already wholly on an invoice the
 * payer recorded from this firm is billed, and not this figure's; the
 * rest are counted with no amount.
 */
function leftOff(off: LeftOffWeek): { unpriced: WeekUnpriced; says: string } | { billed: true; says: string } {
  if (off.billedElsewhere === 'WHOLE') return { billed: true, says: off.says }
  if (off.billedElsewhere === 'PART') return { unpriced: 'partly billed', says: off.says }
  return { unpriced: off.kind === 'WAITING' ? 'not accepted' : 'held', says: off.says }
}

/** What one dry run of the generator says about one week, read as the Today figure needs it. */
export function readWeek(
  outcome: BillOutcome,
  timesheetId: string
): { billedHours: number; amountMinor: number } | { unpriced: WeekUnpriced; says: string | null } | { billed: true; says: string } {
  if (outcome.ok) {
    const p = outcome.planned
    const undecided = p.weeksUndecided.find((w) => w.timesheetId === timesheetId)
    if (undecided) {
      return {
        unpriced: 'overtime',
        says:
          `${undecided.pendingHours} hour${undecided.pendingHours === 1 ? '' : 's'} over the weekly limit ` +
          'are not on any bill, because nobody has decided how they are paid.',
      }
    }
    const priced = p.weeks.find((w) => w.timesheetId === timesheetId)
    if (priced) return { billedHours: priced.hours, amountMinor: priced.amountMinor }
    const off = p.weeksLeftOff.find((w) => w.timesheetId === timesheetId)
    if (off) return leftOff(off)
    return { unpriced: 'refused', says: 'The bill for its period would not carry this week, so no figure is given.' }
  }
  const err = outcome.body.error as { code?: unknown; message?: unknown; heldBack?: unknown }
  const message = typeof err.message === 'string' ? err.message : null
  if (err.code === 'NOT_ACCEPTED_ABOVE' && Array.isArray(err.heldBack)) {
    const off = (err.heldBack as LeftOffWeek[]).find((h) => h.timesheetId === timesheetId)
    if (off) return leftOff(off)
  }
  if (err.code === 'PO_CEILING') return { unpriced: 'ceiling', says: message }
  return { unpriced: 'refused', says: message }
}

