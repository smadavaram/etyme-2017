/**
 * The masking half of lib/sensitive, with no server-only import, because
 * a screen reaches it too (through lib/money/pay-to). The sealing half
 * uses node:crypto and stays in lib/sensitive, which re-exports these.
 */

/** The last four letters or digits of a number, ignoring dashes and spaces. */
export function lastFourOf(plain: string | null | undefined): string | null {
  const s = String(plain ?? '').replace(/[^0-9A-Za-z]/g, '')
  return s ? s.slice(-4) : null
}

/** "•••••6789": the masked form every screen prints. Null where there is nothing. */
export function masked(last4: string | null | undefined): string | null {
  return last4 ? `•••••${last4}` : null
}

/** Whether a value is the masked form a screen was given back, never a number a person typed. */
export function isMasked(v: unknown): boolean {
  return typeof v === 'string' && v.includes('•')
}

/**
 * The tax ID a reply may carry: always masked. Reads the last four, and
 * for a row written before the rule (plain `taxId`, not yet moved) masks
 * the plain value here so it never leaves whole.
 */
export function taxIdShown(row: { taxId?: string | null; taxIdLast4?: string | null } | null | undefined): string | null {
  if (!row) return null
  return masked(row.taxIdLast4 ?? lastFourOf(row.taxId))
}

/** Whether a tax ID is on the row, without reading it. */
export function hasTaxId(row: { taxId?: string | null; taxIdLast4?: string | null; taxIdSealed?: string | null }): boolean {
  return Boolean(row.taxIdSealed || row.taxIdLast4 || row.taxId)
}
