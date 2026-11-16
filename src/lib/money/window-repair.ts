/**
 * Repairing a pay window an extension left behind: the one act that
 * releases a week held on Payroll because it is after the window ended.
 *
 * ── Why (2026-11-16) ─────────────────────────────────────────────────
 *
 * A placement extended before 2026-11-16 kept its pay window
 * (`ContractLink.effectiveTo`) and her row on the pay line at the first
 * end. Payroll now holds a week after that end by name and week
 * (lib/money/outside-pay-window), and said "ask whoever runs payroll here
 * to repair the window". Nothing in the product repaired one, so that
 * sentence led nowhere: a dead end (CLAUDE.md, "Flowy"). This is the act.
 *
 * ── What it moves, and what it refuses ───────────────────────────────
 *
 * Before 2026-11-16 the payroll run paid a week whose every day fell
 * outside the window as one lump on the week's first day
 * (lib/money/extension-windows). Moving the window under such a week
 * would read its days as unpaid and pay them a second time. So a repair
 * first reads what the processed pay runs recorded on that pay line for
 * her: a day paid after the window's end, or a lump on a week that has
 * days after it, refuses the repair, names the week, and moves nothing.
 * A person checks that week against what the payroll provider paid out.
 *
 * Otherwise it moves this placement's window on that pay line, and her
 * own row there, from the window's end to the placement's end: only a
 * window and a row that end on that day, never another person's row. The
 * open pay cycles are widened through the cycle generator's own door
 * (`extensionPlan`); a completed one is never widened.
 *
 * Pure: no database, no clock.
 */

import { formatDay } from '@/lib/format-date'
import { weekStart } from '@/lib/overtime'
import { extensionPlan, type PlannedCycle, type StoredCycle, type ExtensionPlan } from '@/lib/contract-cycles'
import { windowBehind } from '@/lib/money/outside-pay-window'
import type { Moved } from '@/lib/money/extension-windows'

const dayKey = (d: Date): string => d.toISOString().slice(0, 10)

export { REPAIRING_THE_WINDOW, REPAIR_BUTTON, windowRepairBody } from '@/lib/money/window-repair-body'

/** One day a processed pay run recorded paying her on this pay line. */
export interface PaidDay {
  timesheetId: string
  day: string
  hours: number
}

/**
 * The weeks a pay run recorded as paid after the window ended, by their
 * Sunday, earliest first. A day paid after the end counts; so does a day
 * paid on a week with hours after the end where that day had no hours
 * filed, which is the lump the run paid before 2026-11-16 on the week's
 * first day. A day filed and paid on or before the end does not count:
 * the window covered it.
 */
export function weeksPaidAfter(
  endedOn: string,
  paid: readonly PaidDay[],
  sheets: ReadonlyArray<{ id: string; days: Record<string, unknown> | null | undefined }>,
): string[] {
  const filedOn = new Map(sheets.map((s) => [
    s.id,
    Object.entries(s.days ?? {}).filter(([, h]) => Number(h) > 0).map(([d]) => d.slice(0, 10)),
  ]))
  const weeks = new Set<string>()
  for (const p of paid) {
    if (!(Number(p.hours) > 0)) continue
    const day = p.day.slice(0, 10)
    const filed = filedOn.get(p.timesheetId) ?? []
    const lump = filed.some((d) => d > endedOn) && !filed.includes(day)
    if (day > endedOn || lump) weeks.add(weekStart(day))
  }
  return [...weeks].sort()
}

export interface RepairInput {
  personName: string
  /** The pay line the held row is on. */
  buyContractId: string
  /** Every window on this placement, whichever pay line it is on. */
  links: ReadonlyArray<{ id: string; buyContractId: string; effectiveFrom: Date; effectiveTo: Date | null }>
  /** The placement's own last day. */
  sellEnd: Date | null
  /** Her rows on this pay line. Nobody else's is ever passed. */
  rows: ReadonlyArray<{ id: string; endDate: Date | null }>
  /** What processed pay runs recorded paying her on this pay line. */
  paid: readonly PaidDay[]
  /** Her weeks on this placement, as filed. */
  sheets: ReadonlyArray<{ id: string; days: Record<string, unknown> | null | undefined }>
}

export type RepairPlan =
  | { ok: true; endedOn: string; sellEnds: string; links: Moved[]; rows: Moved[] }
  | { ok: false; status: number; code: 'NOTHING_TO_REPAIR' | 'PAID_AFTER_THE_WINDOW'; says: string }

const weeksSaid = (weeks: readonly string[]): string => {
  const said = weeks.map((w) => formatDay(w))
  if (said.length === 1) return `week of ${said[0]}`
  return `weeks of ${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`
}

/**
 * What a repair moves, each from → to; or the one sentence it refuses in.
 */
export function planRepair(input: RepairInput): RepairPlan {
  const behind = windowBehind(input.links, input.sellEnd)
  if (!behind || behind.buyContractId !== input.buyContractId) {
    return {
      ok: false,
      status: 409,
      code: 'NOTHING_TO_REPAIR',
      says: `${input.personName}'s pay window already reaches the end of the placement, so there is nothing to repair.`,
    }
  }
  const paidAfter = weeksPaidAfter(behind.endedOn, input.paid, input.sheets)
  if (paidAfter.length > 0) {
    return {
      ok: false,
      status: 409,
      code: 'PAID_AFTER_THE_WINDOW',
      says:
        `A pay run recorded ${input.personName}'s ${weeksSaid(paidAfter)} as paid, so the pay window was not moved. ` +
        'Check it against what your payroll provider paid out, so no day is paid twice.',
    }
  }
  const to = behind.sellEnds
  const links = input.links
    .filter((l) => l.buyContractId === behind.buyContractId && l.effectiveTo && dayKey(l.effectiveTo) === behind.endedOn)
    .map((l) => ({ id: l.id, from: behind.endedOn, to }))
  const rows = input.rows
    .filter((r) => r.endDate && dayKey(r.endDate) === behind.endedOn)
    .map((r) => ({ id: r.id, from: behind.endedOn, to }))
  return { ok: true, endedOn: behind.endedOn, sellEnds: to, links, rows }
}

/**
 * The pay cycles a repair widens and writes, on this pay line only, by the
 * generator's own rule (`extensionPlan`): a stored period the series now
 * runs further is widened where it is open, and left as it was where a
 * run completed it; a period no stored row covers is written.
 *
 * `full` is the series over the placement's whole dates; `added` is what
 * the generator writes after the window's end. Sell-side rows are never
 * touched: a repair moves pay, not bills.
 */
export function repairCycles(
  buyContractId: string,
  stored: readonly StoredCycle[],
  full: readonly PlannedCycle[],
  added: readonly PlannedCycle[],
): ExtensionPlan {
  const onLine = (c: object) => 'buyContractId' in c && (c as { buyContractId?: string | null }).buyContractId === buyContractId
  return extensionPlan(
    stored.filter((c) => c.buyContractId === buyContractId),
    full.filter(onLine),
    added.filter(onLine),
  )
}

/** The activity log's sentence for a repair: who, whose, from and to, and that it is not undone anywhere. */
export function repairLogSays(o: { personName: string; byName: string; from: string; to: string }): { summary: string; reason: string } {
  return {
    summary: `${o.personName}'s pay window moved from ${formatDay(o.from)} to ${formatDay(o.to)}`,
    reason:
      `${o.byName} repaired the pay window on Payroll, so the weeks after ${formatDay(o.from)} are paid on the next calculation. ` +
      'Nothing in Etyme undoes this repair.',
  }
}

/** What the person who pressed reads once it is done. */
export function repairedSays(personName: string, to: string): string {
  return `${personName}'s pay window now runs to ${formatDay(to)}. Calculate this pay to include the held week.`
}
