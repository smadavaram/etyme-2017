/**
 * The score bar's figures (record 130). Pure.
 *
 * | Due         | cards owed today                         |
 * | Late        | cards past due                           |
 * | On time %   | done on time ÷ done × 100                |
 * | Agent load  | agent cards ÷ all cards × 100            |
 * | Touch time  | median seconds from open to Yes          |
 *
 * A figure the record cannot support is null, never a number that looks
 * plausible. On time % is null where nothing done had a due date: it is
 * counted over the done cards that had one, because a card with no due
 * date was never late and never early.
 */

import { daysToDue, type Scorable } from './score'

export interface DoneCard {
  /** The day it was owed, where the record had one. */
  dueOn: string | null
  /** When the person said yes. */
  doneAt: string
}

/** Cards owed today. Only a real due date counts: the days-open fallback orders cards and is never shown. */
export function dueCount(cards: ReadonlyArray<Pick<Scorable, 'dueOn' | 'openedOn'>>, now: Date): number {
  return cards.filter((c) => c.dueOn != null && daysToDue(c, now) === 0).length
}

/** Cards past due. */
export function lateCount(cards: ReadonlyArray<Pick<Scorable, 'dueOn' | 'openedOn'>>, now: Date): number {
  return cards.filter((c) => { if (c.dueOn == null) return false; const d = daysToDue(c, now); return d !== null && d < 0 }).length
}

/** Done on time over done, as a whole percent; null where no done card had a due date. */
export function onTimePct(done: readonly DoneCard[]): number | null {
  const dated = done.filter((d) => d.dueOn && !Number.isNaN(Date.parse(d.dueOn.slice(0, 10))))
  if (dated.length === 0) return null
  const onTime = dated.filter((d) => d.doneAt.slice(0, 10) <= d.dueOn!.slice(0, 10)).length
  return Math.round((onTime / dated.length) * 100)
}

/** Agent cards over all cards, as a whole percent; null where there are no cards. */
export function agentLoadPct(agentCards: number, allCards: number): number | null {
  if (!Number.isFinite(allCards) || allCards <= 0) return null
  return Math.round((agentCards / allCards) * 100)
}

/** The median of the seconds from open to Yes; null where nobody has said yes yet. */
export function touchSeconds(samples: readonly number[]): number | null {
  const s = samples.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b)
  if (s.length === 0) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10
}

/** A figure on the bar: the number, or a dash where the record cannot say. */
export function barWords(n: number | null, unit: '' | '%' = ''): string {
  return n === null ? '–' : `${n}${unit}`
}
