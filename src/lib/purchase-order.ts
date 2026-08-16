/**
 * Purchase order semantics.
 *
 * A PO is not a contract. A contract carries a RATE — what one person costs
 * per hour. A PO carries a CEILING — how much the payer has authorised the
 * supplier to bill in total, across however many people. Both are needed:
 * rate x hours, capped by what is left on the PO.
 *
 * The two coincide in one case only. A C2C BuyContract with a vendor company
 * is the economic substance of a PO issued to that sub-vendor — the same
 * relationship seen from the rate side. Everywhere else they are distinct:
 * a client issuing a PO has no buy contract at all, because it is buying
 * services rather than running payroll.
 */

export type PoStatus = 'OPEN' | 'CLOSED' | 'CANCELLED'

export interface PoBalanceInput {
  /** Authorised ceiling, in cents. */
  amountCents: number
  /** Invoiced against it so far, in cents. */
  invoicedCents: number
  status: PoStatus
  endDate?: Date | null
}

export interface PoBalance {
  amountCents: number
  invoicedCents: number
  remainingCents: number
  /** 0–100, capped at 100 even when overdrawn. */
  consumedPercent: number
  overdrawn: boolean
  expired: boolean
  /** Whether a further invoice may be raised against this PO at all. */
  canInvoice: boolean
  reason: string
}

/**
 * What is left on a PO, and whether anything more may be billed to it.
 *
 * Overdrawn is reported rather than silently clamped. AP needs to see that
 * a supplier has billed past the authorisation — that is the condition a PO
 * exists to catch, and hiding it would defeat the control.
 */
export function poBalance(input: PoBalanceInput, now: Date = new Date()): PoBalance {
  const { amountCents, invoicedCents, status } = input

  const remainingCents = amountCents - invoicedCents
  const overdrawn = remainingCents < 0
  const expired = input.endDate ? input.endDate.getTime() < now.getTime() : false

  const consumedPercent =
    amountCents <= 0
      ? 100
      : Math.min(100, Math.round((invoicedCents / amountCents) * 100))

  let canInvoice = true
  let reason = 'Available'

  if (status === 'CANCELLED') {
    canInvoice = false
    reason = 'Purchase order cancelled'
  } else if (status === 'CLOSED') {
    canInvoice = false
    reason = 'Purchase order closed'
  } else if (expired) {
    canInvoice = false
    reason = `Purchase order expired ${input.endDate!.toISOString().slice(0, 10)}`
  } else if (remainingCents <= 0) {
    canInvoice = false
    reason = overdrawn
      ? `Overdrawn by $${Math.abs(remainingCents / 100).toFixed(2)} — raise a change order`
      : 'Fully drawn — raise a change order'
  }

  return {
    amountCents,
    invoicedCents,
    remainingCents,
    consumedPercent,
    overdrawn,
    expired,
    canInvoice,
    reason,
  }
}

/**
 * May a PO be attached to this buy contract?
 *
 * A PO is issued to another company. Direct employment has no counterparty
 * to raise one to, so attaching one there is a modelling error rather than
 * a harmless extra.
 */
export function canAttachPoToBuyContract(contract: {
  vendorCompanyId: string | null
  contractType: string
}): { allowed: boolean; reason: string } {
  if (!contract.vendorCompanyId) {
    return {
      allowed: false,
      reason: 'Direct employment has no supplier — a purchase order needs a counterparty',
    }
  }
  return { allowed: true, reason: 'Subcontract — the PO is this company\'s commitment to the supplier' }
}
