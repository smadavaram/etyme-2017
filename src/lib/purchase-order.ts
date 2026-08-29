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
 * Contract types that describe employing somebody rather than buying from
 * a company.
 *
 * W2 and 1099 are both the payer's own arrangement with an individual:
 * one is an employee, the other is an independent contractor engaged
 * directly. Neither has a supplier on the other side of it.
 */
const EMPLOYMENT_TYPES = new Set(['W2', 'W2_HOURLY', 'W2_SALARY', 'C1099', '1099'])

/**
 * May a PO be attached to this buy contract?
 *
 * ── The contradiction this refuses ───────────────────────────────────
 *
 * A purchase order is a commitment to a SUPPLIER: a ceiling somebody
 * else may bill against. An employee does not bill against a ceiling —
 * they are paid through payroll, and the money leaves by an entirely
 * different route with entirely different tax consequences.
 *
 * So a `BuyContract` with `contractType: W2` and a `purchaseOrderId` set
 * is a purchase order raised to your own employee. It is not a harmless
 * extra field. It puts wages into a commitment ledger, it makes a
 * three-way match run against a person who will never send an invoice,
 * and — the part that actually costs money — a worker paid through a PO
 * looks in every downstream report like a supplier rather than an
 * employee, which is the exact shape of a misclassification finding.
 *
 * CLAUDE.md names this as the clearest proof that an order and a
 * contract are different objects: `BuyContract.purchaseOrderId` is
 * nullable precisely because roughly half of all buy contracts have
 * none.
 *
 * Two ways to be wrong, and they are checked in this order because the
 * second is the one somebody will argue about:
 *
 *   **No vendor company.** There is nobody to raise a PO to. This is
 *   checked first because it is the plainest thing to say back.
 *
 *   **An employment contract type, even with a vendor company recorded.**
 *   This is the one that was slipping through: a staffing firm that both
 *   employs and subcontracts, a stale `vendorCompanyId` left on the row,
 *   and a W2 contract that now looks like a purchase. The type decides
 *   how the person is paid, so the type decides this.
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
  if (EMPLOYMENT_TYPES.has(String(contract.contractType).toUpperCase())) {
    return {
      allowed: false,
      reason:
        `A ${contract.contractType} contract employs somebody directly, so there is no ` +
        `supplier here whatever the vendor field says. You do not raise a purchase order to ` +
        `your own employee — they are paid through payroll, not against a ceiling they bill ` +
        `into, and a worker carried as a supplier is the shape of a misclassification finding`,
    }
  }
  return { allowed: true, reason: 'Subcontract — the PO is this company\'s commitment to the supplier' }
}
