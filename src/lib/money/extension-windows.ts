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

/** A window or a row left at an earlier end, named for a person to repair. */
export type LeftBehind = {
  id: string
  endsOn: string
}

/**
 * Whether a closed day follows the new end: it is the end being extended,
 * and the new end is later. Null (open) never moves.
 */
export function follows(current: Date | null, oldEnd: Date | null, newEnd: Date): boolean {
  if (current === null || oldEnd === null) return false
  const k = dayKey(current)
  return k === dayKey(oldEnd) && k < dayKey(newEnd)
}

export interface WindowInput {
  /** Every link on this sell line. */
  links: ReadonlyArray<{ id: string; buyContractId: string; effectiveTo: Date | null }>
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
  /** Links and rows still on an end an earlier extension moved past. Not moved. */
  leftBehind: { links: LeftBehind[]; rows: LeftBehind[] }
}

/**
 * The windows an extension moves to the new end, each with its from and
 * to. Her row is moved only on a pay line whose window this placement
 * still holds: where her window there was closed by a replacement, her
 * row there stays closed with it.
 */
export function windowsAtNewEnd(input: WindowInput): WindowMoves {
  const to = dayKey(input.newEnd)
  const links = input.links
    .filter((l) => follows(l.effectiveTo, input.oldEnd, input.newEnd))
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
  return {
    links,
    rows,
    leftBehind: {
      links: input.links.filter((l) => behind(l.effectiveTo)).map((l) => ({ id: l.id, endsOn: dayKey(l.effectiveTo!) })),
      rows: input.rows.filter((r) => behind(r.endDate)).map((r) => ({ id: r.id, endsOn: dayKey(r.endDate!) })),
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
  const at = oldEnd ? dayKey(oldEnd) : null
  const live = links.filter(
    (l) => l.effectiveTo === null || at === null || dayKey(l.effectiveTo) >= at || earlier.has(dayKey(l.effectiveTo)),
  )
  if (live.length === 0) return null
  const latest = Math.max(...live.map((l) => Date.parse(dayKey(l.effectiveFrom))))
  const top = live.filter((l) => Date.parse(dayKey(l.effectiveFrom)) === latest)
  const ids = new Set(top.map((l) => l.buyContractId))
  return ids.size === 1 ? top[0].buyContractId : null
}
