/**
 * A week a W-2 person worked after her pay window ended, on a placement
 * that runs past that window: held on Payroll, said by name and week,
 * never paid and never dropped without a word.
 *
 * ── Why (2026-11-16) ─────────────────────────────────────────────────
 *
 * A placement extended before 2026-11-16 kept its pay window
 * (`ContractLink.effectiveTo`) at the first end. Payroll narrows every
 * week to the days a window covers (`daysFor`, lib/contract-links), so a
 * week after the first end is nobody's: the page and the pay file left it
 * out, and since b209f2755 the run pays it nothing. Nobody was told.
 * CLAUDE.md: "Never silently permit", and a week over the line is never
 * paid at the usual rate by silence. A dropped week is not silent either.
 *
 * The window is not moved here. Before 2026-11-16 the run paid such a
 * week as one lump on its first day, so moving the window could pay those
 * days twice (lib/money/extension-windows). That repair is a person's
 * decision, made with the button on the held row (lib/money/window-repair,
 * POST /api/payroll/window-repair). This file only finds the week and says it.
 *
 * ── Which days ───────────────────────────────────────────────────────
 *
 * Only days after the last window of her line closed, and on or before
 * the placement's own end: every one of them is outside every window, and
 * moving that window to the placement's end would cover it. A window
 * still open covers everything after it, and nothing is held. A placement
 * that ends where its window ends has nothing past it here. A week filed
 * as a total with no days cannot be placed against a window, so it is
 * left to the rule that already pays it.
 *
 * The held days are said on the pay line holding that last window, and
 * on no other, so one week is never held twice.
 *
 * Pure: no database, no clock.
 */

import { formatDay } from '@/lib/format-date'
import { weekStart } from '@/lib/overtime'

const dayKey = (d: Date): string => d.toISOString().slice(0, 10)

/** One pay window on a sell line: the pay line it pays through and its days. */
export interface PayWindow {
  buyContractId: string
  effectiveFrom: Date
  effectiveTo: Date | null
}

/** The last window of a line, where the placement now runs past it. */
export interface WindowBehind {
  /** The pay line holding that window. */
  buyContractId: string
  /** Its last day, "2026-11-07". */
  endedOn: string
  /** The placement's own last day, "2026-12-31". */
  sellEnds: string
}

/**
 * The window a placement has outrun, or null where none is: a window is
 * still open, the line has none, the placement has no end, or it ends on
 * or before the last window's end.
 *
 * Two pay lines whose windows end on the same day: the days after are
 * said on the first of them by id, so the week is held once.
 */
export function windowBehind(windows: readonly PayWindow[], sellEnd: Date | null): WindowBehind | null {
  if (windows.length === 0 || !sellEnd) return null
  if (windows.some((w) => w.effectiveTo === null)) return null
  const endedOn = windows.map((w) => dayKey(w.effectiveTo!)).sort().at(-1)!
  const sellEnds = dayKey(sellEnd)
  if (endedOn >= sellEnds) return null
  const owner = windows
    .filter((w) => dayKey(w.effectiveTo!) === endedOn)
    .map((w) => w.buyContractId)
    .sort()[0]
  return { buyContractId: owner, endedOn, sellEnds }
}

/**
 * The days of a week with hours after the window ended and on or before
 * the placement's end, keyed as filed. Empty where there are none.
 */
export function daysPastWindow(days: Record<string, unknown> | null | undefined, behind: WindowBehind): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, raw] of Object.entries(days ?? {})) {
    const d = k.slice(0, 10)
    const h = Number(raw)
    if (h > 0 && d > behind.endedOn && d <= behind.sellEnds) out[k] = h
  }
  return out
}

/** One week held because it is after the pay window ended. */
export interface WindowHeldWeek {
  /** The Sunday it began, "2026-11-08". */
  weekOf: string
  /** The day the window ended, "2026-11-07". */
  endedOn: string
  /** The hours held on each day, "2026-11-09" → 8. */
  days: Record<string, number>
  /** Every hour of the week as filed is after the window: the week is wholly outside it. */
  whole: boolean
}

/**
 * The held days, grouped by the week they fall in.
 *
 * `held` is what would be paid on those days (the employer's acceptance,
 * cut the way pay is cut); `filed` is the whole week as filed, which says
 * whether any of it fell inside the window.
 */
export function weeksPastWindow(
  held: Record<string, number>,
  filed: Record<string, unknown> | null | undefined,
  endedOn: string,
): WindowHeldWeek[] {
  const byWeek = new Map<string, Record<string, number>>()
  for (const [k, h] of Object.entries(held)) {
    if (!(Number(h) > 0)) continue
    const d = k.slice(0, 10)
    const w = weekStart(d)
    const m = byWeek.get(w) ?? {}
    m[d] = Math.round(((m[d] ?? 0) + Number(h)) * 100) / 100
    byWeek.set(w, m)
  }
  return [...byWeek.entries()]
    .map(([weekOf, days]) => ({
      weekOf,
      endedOn,
      days,
      whole: !Object.entries(filed ?? {}).some(([k, h]) => Number(h) > 0 && weekStart(k.slice(0, 10)) === weekOf && k.slice(0, 10) <= endedOn),
    }))
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
}

/** The hours of a held week that fall inside a pay period, both ends counted. */
export function hoursIn(w: WindowHeldWeek, start: string, end: string): number {
  const n = Object.entries(w.days).reduce((s, [d, h]) => (d >= start && d <= end ? s + h : s), 0)
  return Math.round(n * 100) / 100
}

const hrs = (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'}`

/**
 * What a seat that runs payroll does about a held week: the button beside
 * the sentence repairs the window (lib/money/window-repair), and the next
 * calculation pays it. A seat that may not run payroll reads, in its
 * place, who here may (`whoHereMaySays`, from the seats the firm filled).
 */
export const REPAIR_THE_WINDOW = 'Repair the pay window to pay it.'

/**
 * The row's sentence for each week held because it is after the pay
 * window ended, then once what the reader does: `next`, which is
 * "Repair the pay window to pay it." for a seat that runs payroll, and
 * who here may for any other. Null where none is held.
 *
 * "Lena Okafor's week of Nov 8, 2026, 40 hours, is held off this pay. It
 * is after the pay window ended on Nov 7, 2026; the placement was
 * extended. Repair the pay window to pay it."
 */
export function windowHeldSays(
  personName: string,
  weeks: ReadonlyArray<{ weekOf: string; endedOn: string; hours: number; whole: boolean }>,
  next: string = REPAIR_THE_WINDOW,
): string | null {
  const said = weeks.filter((w) => w.hours > 0)
  if (said.length === 0) return null
  const each = said.map((w) =>
    `${personName}'s week of ${formatDay(w.weekOf)}, ${hrs(w.hours)}, is held off this pay. ` +
    (w.whole
      ? `It is after the pay window ended on ${formatDay(w.endedOn)}; the placement was extended.`
      : `Those hours are after the pay window ended on ${formatDay(w.endedOn)}; the placement was extended.`),
  )
  return `${each.join(' ')} ${next}`
}

/**
 * One sentence above the Payroll table: who has a week held because it is
 * after the pay window, by name where three or fewer. Null where nobody.
 */
export function windowHeldAboveTableSays(names: readonly string[]): string | null {
  const who = [...new Set(names)]
  if (who.length === 0) return null
  const list = who.length > 3
    ? `${who.length} people`
    : who.length === 1 ? who[0] : who.length === 2 ? `${who[0]} and ${who[1]}` : `${who[0]}, ${who[1]} and ${who[2]}`
  return `${list} ${who.length === 1 ? 'has' : 'have'} a week held off this pay because it is after the pay window ended. The row says which week and what to do.`
}
