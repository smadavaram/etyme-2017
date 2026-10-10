/**
 * Whether the payer may hold an invoice receipt, or lift its hold, and
 * what it becomes. One place, so the route and a test agree.
 *
 * A hold is the payer's own "not yet" while it asks the supplier
 * something: nobody pays through it, and it needs a reason, because a
 * payment stopped for no stated reason is the one a supplier chases by
 * phone. Lifting a hold returns the invoice to submitted — the state it
 * can be held from.
 *
 * Pure: no database.
 */

export type HoldVerdict =
  | { ok: true; to: 'HELD' | 'SUBMITTED'; reason: string | null; says: string }
  | { ok: false; code: string; status: number; says: string }

/** The states a payer may hold an invoice from: submitted and part paid. */
const HOLDABLE = ['SUBMITTED', 'PARTIALLY_PAID']

export function holdInvoice(a: {
  payer: boolean
  status: string
  number: string
  release: boolean
  reason: string | null
  by: string
}): HoldVerdict {
  if (!a.payer) {
    return { ok: false, code: 'NOT_THE_PAYER', status: 403, says: `Only the firm that pays invoice ${a.number} may hold it.` }
  }
  const reason = a.reason?.trim() || null
  if (a.release) {
    if (a.status !== 'HELD') {
      return { ok: false, code: 'NOT_HELD', status: 409, says: `Invoice ${a.number} is not on hold.` }
    }
    return {
      ok: true, to: 'SUBMITTED', reason,
      says: `${a.by} lifted the hold on invoice ${a.number}${reason ? `: ${reason}` : ''}. It can be paid.`,
    }
  }
  if (a.status === 'HELD') {
    return { ok: false, code: 'ALREADY_HELD', status: 409, says: `Invoice ${a.number} is already on hold.` }
  }
  if (!HOLDABLE.includes(a.status)) {
    const why = a.status === 'ISSUED'
      ? 'it has not been submitted, so nothing is due on it yet'
      : a.status === 'PAID' ? 'it is already paid' : `it is ${a.status.toLowerCase().replace('_', ' ')}`
    return { ok: false, code: 'NOT_HOLDABLE', status: 409, says: `Invoice ${a.number} cannot be held: ${why}.` }
  }
  if (!reason) {
    return { ok: false, code: 'REASON_REQUIRED', status: 422, says: 'Say why it is on hold. The supplier and the next person on this desk will read it.' }
  }
  return { ok: true, to: 'HELD', reason, says: `${a.by} put invoice ${a.number} on hold: ${reason}` }
}

/**
 * What the supplier reads when its invoice is held or let go: who, which
 * invoice, and why — never a silent stop, because a payment held for no
 * stated reason is the one a supplier chases by phone.
 */
export function supplierToldSays(a: { payerName: string; number: string; to: 'HELD' | 'SUBMITTED'; reason: string | null }): { title: string; body: string } {
  if (a.to === 'HELD') {
    return {
      title: `${a.payerName} put invoice ${a.number} on hold`,
      body: `${a.payerName} put invoice ${a.number} on hold: ${a.reason}. Nothing is paid on it until they lift the hold.`,
    }
  }
  return {
    title: `${a.payerName} lifted the hold on invoice ${a.number}`,
    body: `${a.payerName} lifted the hold on invoice ${a.number}${a.reason ? `: ${a.reason}` : ''}. It can be paid once it clears the check.`,
  }
}
