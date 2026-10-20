/**
 * Overtime a client was billed that the worker was not paid, because
 * nobody has recorded whether the worker is exempt.
 *
 * ── What the simulation found, 2026-10-20 ────────────────────────────
 *
 * At a hundred placements, clients were billed $2,229.50 of overtime
 * premium on nine weeks while the workers were paid straight time. Both
 * halves are right on their own. The bill prices the hours over the line
 * on what the client decided (lib/money/bill-generate). The pay line
 * pays a premium only once the employer has said whether the worker is
 * exempt, and refuses to guess (lib/money/pay-line, `weekWage` in
 * lib/worker-classification): picking "nonexempt" to fill the gap would
 * be a wage decision nobody made. Neither half was wrong, and the gap
 * between them was visible to nobody.
 *
 * The pay rule does not move here; that is the founder's. This file only
 * makes the gap a line the firm reads: on the payroll run and under its
 * "Billing this month" figure.
 *
 * ── What counts ──────────────────────────────────────────────────────
 *
 * A week is counted where all of these hold:
 *   - the firm pays the worker by payroll — an employee line with nobody
 *     between (`paidByPayroll` in lib/money/paid-through);
 *   - the firm has recorded no exempt position for the worker on that
 *     line (no `ExemptAssertion` row, which is "unknown");
 *   - the firm's own bill to its client, sent and not voided, carried a
 *     premium on the worker's week.
 *
 * The amount is what the bill carried above straight time: each line's
 * amount less its hours at its own rate (a bill line's rate is the
 * straight rate, `rateCents`, and a premium is what makes a line not
 * multiply out). Read off the sent document, never recomputed from a
 * contract that may have moved since. A line that bills less than its
 * hours at its rate carries no premium and adds nothing.
 *
 * Two currencies are never added: each has its own total.
 */

import { prisma } from '@/lib/db'
import { totals as sayTotals } from '@/lib/money-display'
import { EMPLOYEE_CONTRACT_TYPES } from '@/lib/money/paid-through'
import { weekStart } from '@/lib/overtime'

// ── Pure ──────────────────────────────────────────────────────────────

/** One bill line, as the sent document carries it. */
export interface BilledLine {
  hours: number
  /** The straight rate on the line, in minor units an hour. */
  rateCents: number
  /** What the line billed, in minor units. */
  amountCents: number
}

/**
 * What a sheet's bill lines carried above straight time, in minor units.
 * Never negative: a line billed under its hours at its rate is a cut, not
 * a negative premium.
 */
export function premiumBilled(lines: ReadonlyArray<BilledLine>): number {
  let out = 0
  for (const l of lines) {
    const straight = Number(l.hours) * Number(l.rateCents)
    const over = Math.round(Number(l.amountCents) - straight)
    if (over > 0) out += over
  }
  return out
}

/** One sheet whose billed premium the worker was not paid. */
export interface UnpaidPremiumSheet {
  timesheetId: string
  personName: string
  currency: string
  /** The premium the firm's bill carried on it, in minor units. */
  premiumMinor: number
  /** The Sunday each week over the line began, YYYY-MM-DD. */
  weeks: string[]
}

export interface OvertimeNotPaid {
  /** Weeks counted, across every sheet. */
  weeks: number
  /** Who, in the order they first appear. */
  people: string[]
  /** One total per currency, never added across. */
  totals: Array<{ currency: string; amountMinor: number }>
  /** The line the firm reads, or null where there is nothing to say. */
  says: string | null
}

export const NOTHING_NOT_PAID: OvertimeNotPaid = { weeks: 0, people: [], totals: [], says: null }

function names(people: string[]): string {
  const possessive = (n: string) => (n.endsWith('s') ? `${n}’` : `${n}’s`)
  const shown = people.length > 3 ? [...people.slice(0, 3).map(possessive), `${people.length - 3} more people’s`] : people.map(possessive)
  return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

/** The weeks, the people, the amount per currency, and the sentence. */
export function overtimeNotPaid(sheets: ReadonlyArray<UnpaidPremiumSheet>): OvertimeNotPaid {
  const counted = sheets.filter((s) => s.premiumMinor > 0)
  if (counted.length === 0) return NOTHING_NOT_PAID
  const weeks = new Set<string>()
  const people: string[] = []
  const by = new Map<string, number>()
  for (const s of counted) {
    for (const w of s.weeks.length ? s.weeks : ['?']) weeks.add(`${s.timesheetId}|${w}`)
    if (!people.includes(s.personName)) people.push(s.personName)
    const c = s.currency.toUpperCase()
    by.set(c, (by.get(c) ?? 0) + s.premiumMinor)
  }
  const totals = [...by.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor }))
  const n = weeks.size
  const amount = sayTotals(totals.map((t) => ({ minor: t.amountMinor, currency: t.currency })))
  return {
    weeks: n,
    people,
    totals,
    says:
      `${n} ${n === 1 ? 'week' : 'weeks'} billed overtime the worker was not paid, because exempt status is not recorded: ` +
      `${amount} of premium billed on ${names(people)} ${n === 1 ? 'week' : 'weeks'}. ` +
      `Record on ${people.length === 1 ? 'the placement' : 'each placement'} whether ${people.length === 1 ? 'they are' : 'each person is'} exempt from overtime.`,
  }
}

// ── The read ──────────────────────────────────────────────────────────

/** Bills that were sent and stand. A draft was sent to nobody. */
const SENT = { notIn: ['DRAFT', 'CANCELLED', 'VOID'] }

/**
 * What this firm billed as overtime premium on the weeks of workers it
 * pays by payroll and has not classified. Reads only.
 *
 * `scope` narrows it to a payroll run: its pay lines, and the sheets in
 * the periods it ran.
 */
export async function overtimeNotPaidFor(
  companyId: string,
  scope?: { buyContractIds?: string[]; timesheetIds?: string[] }
): Promise<OvertimeNotPaid> {
  if (scope?.timesheetIds && scope.timesheetIds.length === 0) return NOTHING_NOT_PAID
  const lines = await prisma.buyContract.findMany({
    where: {
      companyId,
      ...(scope?.buyContractIds ? { id: { in: scope.buyContractIds } } : {}),
      vendorCompanyId: null,
      supplierSellContractId: null,
      contractType: { in: [...EMPLOYEE_CONTRACT_TYPES] },
    },
    select: {
      id: true,
      candidates: { select: { personId: true } },
      exemptAssertions: { select: { personId: true } },
      sellLinks: { select: { sellContractId: true } },
    },
  })

  // The sell line and person of every worker nobody has classified.
  const unrecorded = new Set<string>()
  for (const bc of lines) {
    for (const c of bc.candidates) {
      if (bc.exemptAssertions.some((a) => a.personId === c.personId)) continue
      for (const l of bc.sellLinks) unrecorded.add(`${l.sellContractId}|${c.personId}`)
    }
  }
  if (unrecorded.size === 0) return NOTHING_NOT_PAID
  const sellIds = [...new Set([...unrecorded].map((k) => k.split('|')[0]))]
  const personIds = [...new Set([...unrecorded].map((k) => k.split('|')[1]))]

  const billed = await prisma.invoiceLine.findMany({
    where: {
      sellContractId: { in: sellIds },
      personId: { in: personIds },
      timesheetId: scope?.timesheetIds ? { in: scope.timesheetIds } : { not: null },
      // The firm's own bill: on its own sell line, sent and standing.
      sellContract: { companyId },
      invoice: { status: SENT },
    },
    select: {
      hours: true, rateCents: true, amountCents: true, sellContractId: true, personId: true, timesheetId: true,
      invoice: { select: { currency: true } },
      person: { select: { name: true } },
      timesheet: {
        select: {
          periodStart: true,
          overtimeDecisions: { where: { treatment: 'PREMIUM' }, select: { weekOf: true } },
        },
      },
    },
    orderBy: [{ timesheetId: 'asc' }],
  })

  const bySheet = new Map<string, { s: UnpaidPremiumSheet; lines: BilledLine[] }>()
  for (const l of billed) {
    if (!l.timesheetId || !l.sellContractId || !l.personId) continue
    if (!unrecorded.has(`${l.sellContractId}|${l.personId}`)) continue
    const k = `${l.timesheetId}|${l.invoice.currency.toUpperCase()}`
    let entry = bySheet.get(k)
    if (!entry) {
      const decided = (l.timesheet?.overtimeDecisions ?? []).map((d) => d.weekOf.toISOString().slice(0, 10))
      const weeks = decided.length
        ? [...new Set(decided)]
        : l.timesheet ? [weekStart(l.timesheet.periodStart.toISOString().slice(0, 10))] : []
      entry = {
        s: { timesheetId: l.timesheetId, personName: l.person?.name ?? 'A worker', currency: l.invoice.currency, premiumMinor: 0, weeks },
        lines: [],
      }
      bySheet.set(k, entry)
    }
    entry.lines.push({ hours: Number(l.hours), rateCents: l.rateCents, amountCents: l.amountCents })
  }
  return overtimeNotPaid([...bySheet.values()].map(({ s, lines: ls }) => ({ ...s, premiumMinor: premiumBilled(ls) })))
}
