/**
 * Which side of the trade the contracts page is showing.
 *
 * ── The fault this closes (release walk, 2026-10-27) ────────────────
 *
 * The Buy contracts tab opened the Sell contracts heading and rows. The
 * page read `?side=` once, when it was first drawn, into a piece of state
 * nothing wrote back. Sell contracts and Buy contracts are two tabs of
 * one page, so following one tab's link from the other kept the page
 * mounted and kept the side it was born with: the address said buy and
 * the screen said sell.
 *
 * So the address is the only place the side lives. The page reads it on
 * every render, a press on Sell or Buy writes the address, and an answer
 * that comes back for a side no longer on screen is dropped rather than
 * drawn under the other side's heading.
 *
 * No database in here.
 */

export type ContractSide = 'sell' | 'buy'

/** The side a `?side=` value names. Anything but `buy` is the sell side, as the route reads it. */
export function sideFromQuery(value: string | null | undefined): ContractSide {
  return value === 'buy' ? 'buy' : 'sell'
}

/** The address of one side: the same two links the menu carries. */
export function sideHref(side: ContractSide): string {
  return `/dashboard/contracts?side=${side}`
}

/**
 * Whether an answer may be drawn. The side it was asked for must still be
 * the side on screen; a slow sell answer landing after the reader moved
 * to Buy is the other tab's rows under this tab's heading.
 */
export function answerFits(asked: ContractSide, onScreen: ContractSide): boolean {
  return asked === onScreen
}

/**
 * The rows of one side only. The route answers one side per call; this
 * holds where a row says which side it is, so a row of the other side
 * can never be counted, totaled or drawn here.
 */
export function rowsOfSide<T extends { side?: string | null }>(rows: T[], side: ContractSide): T[] {
  return rows.filter((r) => r.side == null || r.side === side)
}
