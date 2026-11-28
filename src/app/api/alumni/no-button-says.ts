/**
 * The sentence a Past contractors row shows where there is no "Ask back"
 * button. Addendum E §E.2.3: the ledger is checked before the button is
 * offered, and a row without one says why — never an empty cell.
 *
 * Pure and import-free, so the page (a client component) can read it.
 * The route's own reason wins; this is the floor beneath it.
 */

export interface NoButtonRow {
  ledgerStatus?: string | null
  eligibleDate?: string | null
  reengageBlockReason?: string | null
}

export function noButtonSays(row: NoButtonRow): string {
  if (row.reengageBlockReason) return row.reengageBlockReason
  if (row.ledgerStatus === 'BREAK_REQUIRED' && !row.eligibleDate) {
    return 'A break is required before asking back, and the day is not on record. Check the contract under Contracts.'
  }
  if (row.eligibleDate) return 'A break is required before asking back.'
  return 'Not offered: a contract here is still open on the record. Check the contract under Contracts.'
}
