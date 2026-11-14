/**
 * Whether the start checks a row of a line's paper set, and what the row
 * says where it does not.
 *
 * Walk tpa, 2026-11-14: on a line for a client that is not on Etyme, the
 * client's own master agreement and NDA read "Required". Nobody on Etyme
 * can supply them, and the start does not check them: a client-owed row
 * from the default set is not holdable (`holdable` in
 * lib/contract-clearance), so it neither blocks nor warns. "Required"
 * promised a check that is never made. The row now says what is true.
 *
 * A client-owed row somebody wrote on the order or the line is held by
 * the start like any other written ask, so it keeps its word.
 *
 * Pure and browser-safe. Owned by regulatory.
 */

export const NOT_CHECKED_AT_START = 'Asked of the client, not checked at the start'

export function checkedAtStart(item: { owedBy: string; from: 'DEFAULT' | 'ORDER' | 'LINE' | string }): boolean {
  return !(item.owedBy === 'CUSTOMER' && item.from === 'DEFAULT')
}
