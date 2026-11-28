/**
 * What an extension moves besides the end dates: the window her hours are
 * paid through, and her own row on the pay line.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * Extending a placement moved the sell and buy end dates and wrote the
 * added months' due dates. It left `ContractLink.effectiveTo` and her row's
 * `endDate` on the pay line at the first end. Payroll narrows every week
 * to the days a link covers (`daysFor`, lib/contract-links), so every
 * hour after the first end read as nobody's and the added months went
 * unpaid. CLAUDE.md, "Money": every hour is paid at the rate in force on
 * the day worked.
 *
 * ── Which windows follow ─────────────────────────────────────────────
 *
 * Only a window whose last day is the end being extended. A window a
 * replacement closed on the day she left, or a change of sub-vendor closed
 * on the day it changed, stays closed: reopening it would set two pay
 * lines claiming one day, which pays neither. An open window (no last day)
 * stays open. Nothing ever moves earlier.
 *
 * ── A window an earlier extension left behind ────────────────────────
 *
 * A placement extended before this rule still has its window at the
 * first end. It is not moved here, on purpose. Before 2026-11-16 the
 * payroll run paid a week whose every day fell outside the window as one
 * lump on the week's first day, so the record of what was paid may not
 * name the days worked. Moving that window would read those days as
 * unpaid and pay them a second time. Such a window is named in the
 * extension's log (`leftBehind`) for a person to repair, never moved by a
 * guess.
 *
 * Pure: no database, no clock.
 */

import { formatDay } from '@/lib/format-date'

/** "2026-11-16" for a stored day (midnight UTC). */
const dayKey = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * The earlier ends of this placement, read off its earlier extensions'
 * logs (`oldEndDate`). A window still sitting on one of them was left
 * there by an extension made before this rule.
 */
export function earlierEnds(oldEnds: ReadonlyArray<string | Date | null | undefined>): Set<string> {
  const out = new Set<string>()
  for (const e of oldEnds) {
    if (!e) continue
    const d = typeof e === 'string' ? new Date(e) : e
    if (!Number.isNaN(d.getTime())) out.add(dayKey(d))
  }
  return out
}

/** From and to, as days, for the activity log. */
export type Moved = {
  id: string
  from: string
  to: string
}

/**
 * Why a window or a row was not moved, in the log:
 * - EARLIER_EXTENSION: an extension before 2026-11-16 left it at an
 *   earlier end; what was paid on it may not name the days.
 * - ANOTHER_WINDOW: another window of this placement already covers a day
 *   in the moved range, or ends on the same day; moving it would set two
 *   windows claiming one day, which pays neither.
 * - NO_PAY_LINE_IN_FORCE: no single pay line is in force at the end
 *   (`payLineInForce`); the pay line's own end and its pay dates did not
 *   move either.
 */
export type NotMovedWhy = 'EARLIER_EXTENSION' | 'ANOTHER_WINDOW' | 'NO_PAY_LINE_IN_FORCE'

/** A window or a row not moved, named for a person to repair. `endsOn` is null for an open window. */
export type LeftBehind = {
  id: string
  endsOn: string | null
  why: NotMovedWhy
}

/**
 * Whether a closed day follows the new end: it is the end being extended,
 * and the new end is later. Null (open) never moves. Whether the window
 * holding it may move is `windowsAtNewEnd`'s question: no other window of
 * the placement may already claim a day it would gain.
 */
export function follows(current: Date | null, oldEnd: Date | null, newEnd: Date): boolean {
  if (current === null || oldEnd === null) return false
  const k = dayKey(current)
  return k === dayKey(oldEnd) && k < dayKey(newEnd)
}

export interface WindowInput {
  /** Every link on this sell line. Without `effectiveFrom`, a window is read as starting before the end. */
  links: ReadonlyArray<{ id: string; buyContractId: string; effectiveFrom?: Date; effectiveTo: Date | null }>
  /** Her rows on the pay lines those links reach. Other people's rows are never passed. */
  rows: ReadonlyArray<{ id: string; buyContractId: string; endDate: Date | null }>
  oldEnd: Date | null
  /** Ends earlier extensions moved past (`earlierEnds`). */
  earlier: ReadonlySet<string>
  newEnd: Date
}

export interface WindowMoves {
  /** Links whose last day moves to the new end. */
  links: Moved[]
  /** Her rows whose end date moves to the new end. */
  rows: Moved[]
  /** Links and rows not moved, each with why: an earlier end, or another window claiming the days. */
  leftBehind: { links: LeftBehind[]; rows: LeftBehind[] }
}

/**
 * Whether a window claims a day after `afterDay` and on or before
 * `toDay`, as it stands.
 */
const claimsBetween = (l: { effectiveFrom?: Date; effectiveTo: Date | null }, afterDay: string, toDay: string): boolean =>
  (l.effectiveTo === null || dayKey(l.effectiveTo) > afterDay) && (!l.effectiveFrom || dayKey(l.effectiveFrom) <= toDay)

/**
 * The windows an extension moves to the new end, each with its from and
 * to. Her row is moved only on a pay line whose window this placement
 * still holds: where her window there was closed by a replacement, her
 * row there stays closed with it.
 */
export function windowsAtNewEnd(input: WindowInput): WindowMoves {
  const to = dayKey(input.newEnd)
  const following = input.links.filter((l) => follows(l.effectiveTo, input.oldEnd, input.newEnd))
  // A window moves only where no other window of this placement claims a
  // day it would gain: one already covering a day after the old end, or a
  // second window ending on it that would move too. Two windows claiming
  // one day pay neither (`daysFor`), so neither is moved by a guess; both
  // are named for a person to repair.
  const old = input.oldEnd ? dayKey(input.oldEnd) : ''
  const contested = new Set(
    following
      .filter((l) => input.links.some((o) => o.id !== l.id && (following.includes(o) || claimsBetween(o, old, to))))
      .map((l) => l.id),
  )
  const links = following
    .filter((l) => !contested.has(l.id))
    .map((l) => ({ id: l.id, from: dayKey(l.effectiveTo!), to }))
  // A pay line this placement still reaches after the move: its window is
  // open, or it now runs to the new end or past it.
  const held = new Set(
    input.links
      .filter((l) => l.effectiveTo === null || links.some((m) => m.id === l.id) || dayKey(l.effectiveTo) >= to)
      .map((l) => l.buyContractId),
  )
  const rows = input.rows
    .filter((r) => held.has(r.buyContractId) && follows(r.endDate, input.oldEnd, input.newEnd))
    .map((r) => ({ id: r.id, from: dayKey(r.endDate!), to }))
  const behind = (d: Date | null) => d !== null && input.earlier.has(dayKey(d)) && (input.oldEnd === null || dayKey(d) < dayKey(input.oldEnd))
  // Her row on a pay line whose window was contested stays with it.
  const contestedLines = new Set(input.links.filter((l) => contested.has(l.id)).map((l) => l.buyContractId))
  return {
    links,
    rows,
    leftBehind: {
      links: [
        ...input.links.filter((l) => behind(l.effectiveTo)).map((l) => ({ id: l.id, endsOn: dayKey(l.effectiveTo!), why: 'EARLIER_EXTENSION' as const })),
        ...input.links.filter((l) => contested.has(l.id)).map((l) => ({ id: l.id, endsOn: dayKey(l.effectiveTo!), why: 'ANOTHER_WINDOW' as const })),
      ],
      rows: [
        ...input.rows.filter((r) => behind(r.endDate)).map((r) => ({ id: r.id, endsOn: dayKey(r.endDate!), why: 'EARLIER_EXTENSION' as const })),
        ...input.rows
          .filter((r) => contestedLines.has(r.buyContractId) && !held.has(r.buyContractId) && follows(r.endDate, input.oldEnd, input.newEnd))
          .map((r) => ({ id: r.id, endsOn: dayKey(r.endDate!), why: 'ANOTHER_WINDOW' as const })),
      ],
    },
  }
}

/**
 * The pay line an extension moves with the placement: the one whose window
 * is in force at the end being extended (open, reaching that day, or left
 * at an earlier end by an earlier extension), and the latest-starting of
 * those. Never "the first link": a line that changed sub-vendor holds two,
 * and the old firm's window is closed.
 *
 * Null where none is, or where two start on the same day: two pay lines
 * claiming one window is a question for a person, and moving either would
 * be a guess.
 */
export function payLineInForce(
  links: ReadonlyArray<{ buyContractId: string; effectiveFrom: Date; effectiveTo: Date | null }>,
  oldEnd: Date | null,
  earlier: ReadonlySet<string>,
): string | null {
  const read = inForce(links, oldEnd, earlier)
  return 'buyContractId' in read ? read.buyContractId : null
}

/**
 * Where `payLineInForce` is null on a placement that has windows: the
 * windows a person looks at, each named for the log, and the sentence the
 * person who extended reads. Null where a pay line is in force, or where
 * the placement has no window at all (nothing pays through one).
 *
 * The windows named are the ones the answer turned on: the windows that
 * start on the same day, where two pay lines do; else the windows that
 * ended last, where none reaches the end.
 */
export function noPayLineInForce(
  links: ReadonlyArray<{ id: string; buyContractId: string; effectiveFrom: Date; effectiveTo: Date | null }>,
  oldEnd: Date | null,
  earlier: ReadonlySet<string>,
  personName: string,
): { windows: LeftBehind[]; says: string } | null {
  if (links.length === 0) return null
  const read = inForce(links, oldEnd, earlier)
  if ('buyContractId' in read) return null
  const named = (ls: typeof links) =>
    ls.map((l) => ({ id: l.id, endsOn: l.effectiveTo ? dayKey(l.effectiveTo) : null, why: 'NO_PAY_LINE_IN_FORCE' as const }))
  if (read.tied.length > 0) {
    return {
      windows: named(links.filter((l) => read.tied.includes(l))),
      says:
        `${personName}'s pay window was not moved: two pay lines start on the same day, and moving either would be a guess. ` +
        'Check which pay line pays the added days.',
    }
  }
  const lastDay = links.map((l) => (l.effectiveTo ? dayKey(l.effectiveTo) : '')).sort().at(-1)!
  return {
    windows: named(links.filter((l) => l.effectiveTo && dayKey(l.effectiveTo) === lastDay)),
    says:
      `${personName}'s pay window was not moved: no pay window reaches the old end, and the last one ended on ${formatDay(lastDay)}. ` +
      'Check which pay line pays the added days.',
  }
}

/**
 * The sentence for windows `windowsAtNewEnd` did not move because another
 * window claims the days, or null where there are none.
 */
export function anotherWindowSays(personName: string, moves: WindowMoves): string | null {
  const contested = moves.leftBehind.links.filter((l) => l.why === 'ANOTHER_WINDOW')
  if (contested.length === 0) return null
  const on = contested[0].endsOn
  return (
    `${personName}'s pay window ending ${on ? formatDay(on) : 'at the old end'} was not moved: another pay window claims the same days. ` +
    'Moving it would leave them paid by neither. Check which pay line pays the added days.'
  )
}

/**
 * Where a person checks and acts on a pay window an extension left alone:
 * the pay lines, on the Contracts page. The sentence stays text in the log;
 * only the reply on screen carries this link, and only for the selling firm,
 * the one side that has pay lines.
 */
export const PAY_LINES_DOOR = { href: '/dashboard/contracts?side=buy', label: 'Open the pay lines' } as const

/**
 * One short clause for what DID move with the placement's end: her pay
 * window, her pay row, or both. Null where neither moved, so a reply never
 * claims pay moved when it did not.
 */
export function movedSays(moves: Pick<WindowMoves, 'links' | 'rows'>, newEnd: Date): string | null {
  const what = moves.links.length > 0 && moves.rows.length > 0 ? 'pay window and pay row' : moves.links.length > 0 ? 'pay window' : moves.rows.length > 0 ? 'pay row' : null
  if (!what) return null
  return `Her ${what} moved to ${formatDay(dayKey(newEnd))}.`
}

function inForce<L extends { buyContractId: string; effectiveFrom: Date; effectiveTo: Date | null }>(
  links: readonly L[],
  oldEnd: Date | null,
  earlier: ReadonlySet<string>,
): { buyContractId: string } | { tied: L[] } {
  const at = oldEnd ? dayKey(oldEnd) : null
  const live = links.filter(
    (l) => l.effectiveTo === null || at === null || dayKey(l.effectiveTo) >= at || earlier.has(dayKey(l.effectiveTo)),
  )
  if (live.length === 0) return { tied: [] }
  const latest = Math.max(...live.map((l) => Date.parse(dayKey(l.effectiveFrom))))
  const top = live.filter((l) => Date.parse(dayKey(l.effectiveFrom)) === latest)
  const ids = new Set(top.map((l) => l.buyContractId))
  return ids.size === 1 ? { buyContractId: top[0].buyContractId } : { tied: top }
}
