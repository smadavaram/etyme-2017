/**
 * The Timesheets tiles that count weeks, and the list each one opens.
 *
 * Fix list E1, item 2 (2026-11-14). The tile "Pending approval" counted
 * the weeks waiting on this reader, a part of the "Submitted" tab, so the
 * same weeks sat under two names and two counts, and none of the tiles
 * did anything when pressed. Now each tile is named for what it counts,
 * and pressing one narrows the list to exactly the weeks it counted.
 *
 * Pure: no React, no fetch.
 */

export type Tile = 'WAITING_ON_YOU' | 'FLAGGED' | 'OVERTIME'

/** What a week has to say for the tiles to count it. */
export interface TileRow {
  status: string
  flag: string | null
  signature?: { waitingOnYou: boolean } | null
  overtime?: { weeks?: unknown[] } | null
}

/** Whether a tile counts this week. One rule, read by the count and by the list it opens. */
export function inTile(tile: Tile, t: TileRow): boolean {
  switch (tile) {
    case 'WAITING_ON_YOU':
      return t.signature ? t.signature.waitingOnYou : t.status === 'SUBMITTED'
    case 'FLAGGED':
      return t.flag != null
    case 'OVERTIME':
      return (t.overtime?.weeks?.length ?? 0) > 0
  }
}

export const TILE_LABEL: Record<Tile, string> = {
  WAITING_ON_YOU: 'Waiting on you',
  FLAGGED: 'Flagged',
  OVERTIME: 'Overtime to decide',
}

/** The line under the waiting tile. */
export function waitingSub(n: number): string {
  return n === 0 ? 'nothing waiting on you' : n === 1 ? '1 week for you to sign' : `${n} weeks for you to sign`
}

/** The line over a list a tile narrowed. */
export function tileShowing(tile: Tile, n: number): string {
  const weeks = n === 1 ? '1 week' : `${n} weeks`
  switch (tile) {
    case 'WAITING_ON_YOU':
      return `Showing the ${weeks} waiting on you.`
    case 'FLAGGED':
      return `Showing the ${weeks} flagged.`
    case 'OVERTIME':
      return `Showing the ${weeks} with overtime to decide.`
  }
}

/** The empty list a tile narrowed to nothing. */
export const TILE_EMPTY: Record<Tile, string> = {
  WAITING_ON_YOU: 'No weeks are waiting on you.',
  FLAGGED: 'No weeks are flagged.',
  OVERTIME: 'No weeks have overtime to decide.',
}
