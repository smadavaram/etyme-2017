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
import { generateCycles, generatePayCycles, type CycleDefinition } from '@/lib/cycle-generator'
import { cyclesFor } from '@/lib/cycle-kinds'
import { policyFrom, type CycleShiftPolicy } from '@/lib/cycle-shift'
import { getTemplatePack } from '@/lib/template-packs'
import { termsFor, type OrderHeader } from '@/lib/money/order-terms'
import { rhythmFrom, type PayRhythm } from '@/lib/pay-dates'

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

/**
 * The seeded world's monthly pay. FOR THE DEMO ONLY — it is not a default
 * for any real company and no template pack ships it.
 *
 * The seeded payroll runs pay calendar months (`lib/seed-payroll-runs`),
 * and the US pack pays fortnightly, so a demo worker's pay days and paid
 * periods never lined up. The founder approved monthly pay for the demo
 * firms on 2026-09-30. How often a real employee must be paid is set by
 * the law of the state they work in, and some states do not allow monthly
 * pay for hourly workers, so this never reaches a real placement: only
 * `lib/seed-*` and `lib/demo-*` may pass it, and
 * `__tests__/invariants/demo-monthly-pay.test.ts` fails on anybody else.
 *
 * `dayOfMonth: 28` is month-end in the generator. The offsets were
 * measured over every month from 2024 to 2035 on the US federal calendar,
 * with pay moving to the working day before a weekend or holiday:
 *
 * - month-end + 3 and + 5 (the first proposal) can pay on the day it
 *   calculates — June 2026's pay day, Sunday 5 July, moves back to Friday
 *   3 July, the calculation day — and a Monday holiday moves month-end + 3
 *   back onto the month-end itself, before the last day's hours are in;
 * - month-end + 4 and + 9 is the smallest pair where the calculation is
 *   always at least one day after the month ends and pay always at least
 *   two days after the calculation. The latest pay day is nine days after
 *   the month ends.
 */
export const DEMO_MONTHLY_PAY: readonly CycleDefinition[] = Object.freeze([
  Object.freeze({ kind: 'SALARY_CALCULATE', frequency: 'MONTHLY', dayOfMonth: 28, offsetDays: 4 }),
  Object.freeze({ kind: 'SALARY_PAY', frequency: 'MONTHLY', dayOfMonth: 28, offsetDays: 9 }),
] as CycleDefinition[])

/**
 * The company's payroll, where somebody chose it, or null.
 *
 * ── Payroll is the company's choice, 2026-10-07 ──────────────────────
 *
 * The founder: "Give choice to businesses when they want to configure
 * payroll." The pack's salary lines (`lib/template-packs`) stay where they
 * are, as the documented default; where a company has answered on its
 * settings screen (`lib/payroll-settings`), its answer replaces them on
 * every payroll line it pays, and the pack's lines never win over it.
 *
 * "Chose" is read off who set it, not off the columns: the columns carry
 * schema defaults — every other week, Wednesday and Friday — so a value
 * that cannot say it was never answered must not move a pay date. That is
 * the same argument `lib/money/order-terms` makes about a line's copy of
 * the billing rhythm. A company nobody configured is generated on the
 * pack exactly as before, which is why no seeded date moves: an India or
 * UK pack still pays on the 25th and 28th, a US one still on the
 * Wednesday and Friday, and the demo's monthly override still stands.
 *
 * Only pay. Hours and bill dates are the pack's, and a line bought from a
 * supplier has no payroll — its invoice receipt dates do not move.
 */
export function chosenPayroll(
  company: (Parameters<typeof rhythmFrom>[0] & { paySettingsSetAt?: Date | null }) | null | undefined
): PayRhythm | null {
  // The pure half of lib/payroll-settings' `paySettingsFrom`, read here
  // without the database client so the unit tests' stand-ins still fit.
  if (!company?.paySettingsSetAt) return null
  return rhythmFrom(company)
}

/** The kinds a pay override may replace, and must replace together. */
const PAY_KINDS = ['SALARY_CALCULATE', 'SALARY_PAY'] as const

/**
 * The pack's definitions with its pay dates replaced by `pay`, or the
 * pack's own where there is no override.
 *
 * Refused rather than half-honored: an override naming anything but the
 * two pay kinds would move an hours or a bill date the caller never
 * reasoned about, and one naming only one of them would calculate on one
 * rhythm and pay on another.
 */
export function withPay<T extends { kind: string }>(
  definitions: readonly T[],
  pay: readonly CycleDefinition[] | undefined
): (T | CycleDefinition)[] {
  if (!pay) return [...definitions]
  const stray = pay.filter((d) => !(PAY_KINDS as readonly string[]).includes(d.kind)).map((d) => d.kind)
  if (stray.length > 0) {
    throw new Error(
      `A pay override moves only pay dates. It named ${stray.join(', ')}, which is not pay; ` +
        `those dates stay the pack's.`
    )
  }
  const named = new Set(pay.map((d) => d.kind))
  if (named.size !== PAY_KINDS.length || pay.length !== PAY_KINDS.length) {
    throw new Error(
      'A pay override must give both the pay calculation and the pay day, once each, ' +
        'so a month is not worked out on one rhythm and paid on another.'
    )
  }
  return [...definitions.filter((d) => !named.has(d.kind)), ...pay]
}

export interface Written {
  sell: number
  buy: number
  /** Kinds the pack offered that are not money. Named so a stale pack is visible. */
  refused: string[]
}

export async function writeCyclesFor(
  db: CycleWriter,
  input: {
    /**
     * The sell line, and the document it is on where the caller has it.
     *
     * The dates generated over are the **line's**, and the header is
     * read only so that decision goes through one door
     * (`lib/money/order-terms`). An order is not a person: one header
     * for a five-person project runs the length of the project, and the
     * third person on it starts in March. Generating from the header's
     * start would write months of due dates before anybody worked.
     *
     * The rhythm does not come from either — every cycle's frequency is
     * the template pack's, which is why a header that says WEEKLY does
     * not move an hours-due date. `billFrequency` decides what an
     * invoice period is, not when a cycle falls.
     */
    sell: { id: string; startDate: Date | null; endDate: Date | null; workOrder?: OrderHeader | null }
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
    /**
     * No date written before this day — the award's floor, by due date.
     *
     * Where the work was already under way at the award, a period that
     * ended yesterday is still due tomorrow, and that reminder is owed.
     * `onlyPeriodsAfter` would drop it, because it bounds by the period;
     * this bounds by the day the reminder lands. Pass the award's own day
     * (`calendarDay` of now, at midnight UTC), not the day before it.
     */
    noneDueBefore?: Date | null
    /**
     * Pay dates on a rhythm other than the pack's: both pay kinds, and
     * nothing else. Only the seed passes this, with `DEMO_MONTHLY_PAY`.
     * Replaces the pack's pay calculation and pay day; on a line bought
     * from a supplier there is no payroll, so it writes nothing there.
     *
     * A company's own payroll choice wins over it (`chosenPayroll`): the
     * override is the demo's stand-in for an answer nobody gave, and once
     * somebody gives one it is theirs.
     */
    pay?: readonly CycleDefinition[]
    /**
     * The paying company's payroll, where the caller has it: a rhythm it
     * chose, or null for "nobody chose, use the pack". Omitted, it is read
     * off the company that holds the pair, with the shift policy.
     */
    payroll?: PayRhythm | null
  }
): Promise<Written> {
  const { sell, buy } = input
  const pack = getTemplatePack(input.packId)
  // Checked before anything can return early, so a malformed override is
  // refused on an open-ended line too rather than ignored there.
  const definitions = withPay(pack?.cycleDefinitions ?? [], input.pay)
  const dates = termsFor('SELL', sell)
  if (!pack || !dates.startDate || !dates.endDate) return { sell: 0, buy: 0, refused: [] }

  const split = cyclesFor(
    buy ? { contractType: buy.contractType, vendorCompanyId: buy.vendorCompanyId } : null,
    definitions
  )
  const holidays = input.holidays ?? []
  const existing = input.existing ?? new Map<string, Set<string>>()

  // Whose policy and whose payroll: the company that holds the pair — it
  // runs the payroll on the buy line. A contract row that has gone missing
  // between the caller's write and this read would be a bug elsewhere; it
  // reads as the shipped default rather than as no answer, because there
  // is no third behavior for a cycle date.
  const company =
    input.policy !== undefined && input.payroll !== undefined
      ? null
      : (
          await db.sellContract.findUnique({
            where: { id: sell.id },
            select: {
              company: {
                select: {
                  cycleShiftHours: true, cycleShiftPay: true, cycleShiftBill: true, daysOff: true,
                  payPeriod: true, payCalcOffsetDays: true, payDayOffsetDays: true,
                  payDaysOfMonth: true, payCalcDaysBefore: true,
                  paySettingsSetAt: true, paySettingsSetById: true,
                },
              },
            },
          })
        )?.company
  const policy = input.policy ?? policyFrom(company)
  const payroll = input.payroll !== undefined ? input.payroll : chosenPayroll(company)
  // A payroll line — nobody below us to pay, so we pay the person — on a
  // company that chose its payroll: the pack's (or the demo's) pay lines
  // step aside and the company's dates are written instead.
  const ownPayroll = payroll !== null && buy !== null && buy.vendorCompanyId === null
  const options = {
    policy,
    onlyPeriodsAfter: input.onlyPeriodsAfter ?? null,
    noneDueBefore: input.noneDueBefore ?? null,
  }

  const sellCycles = generateCycles(dates.startDate, dates.endDate, split.sell, holidays, existing, options)
  const buyCycles = !buy
    ? []
    : ownPayroll
      ? [
          ...generateCycles(
            dates.startDate,
            dates.endDate,
            split.buy.filter((d) => !(PAY_KINDS as readonly string[]).includes(d.kind)),
            holidays,
            existing,
            options
          ),
          ...generatePayCycles(dates.startDate, dates.endDate, payroll!, holidays, existing, options),
        ].sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
      : generateCycles(dates.startDate, dates.endDate, split.buy, holidays, existing, options)

  const rows = [
    ...sellCycles.map((c) => ({ sellContractId: sell.id, kind: c.kind, dueOn: c.dueOn })),
    ...buyCycles.map((c) => ({ buyContractId: buy!.id, kind: c.kind, dueOn: c.dueOn })),
  ]
  if (rows.length > 0) await db.cycle.createMany({ data: rows })

  return { sell: sellCycles.length, buy: buyCycles.length, refused: split.refused }
}
