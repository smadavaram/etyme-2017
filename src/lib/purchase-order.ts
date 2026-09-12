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

// ═════════════════════════════════════════════════════════════════════
// OVER-BILLING — the other half of the duplicate check
// ═════════════════════════════════════════════════════════════════════
//
// `/api/ap/bills` already refuses the same supplier invoice number twice,
// which catches the commonest AP error. It caught nothing else. A
// supplier could bill £40,000 against a £25,000 purchase order, or
// £12,000 a month against a buy contract worth £8,000 a month, and the
// bill went straight in — because the ceiling existed in one table and
// the bill in another and nothing compared them.
//
// A ceiling nobody checks is not a control. It is a number in a database.
//
// ── Two different ceilings, and they mean different things ───────────
//
// **The purchase order** is what the payer authorised in total, across
// however many people and months. Going past it is not a rounding
// question — somebody has committed the firm to spend it did not agree
// to, and the fix is a change order, not a waiver.
//
// **The buy contract** carries a rate and a shape: this person, this
// many hours, this long. A bill materially above what that contract can
// produce is either hours nobody worked or a rate nobody agreed, and both
// are worth stopping at the door rather than finding in a margin report
// three months later.

export interface OverBillInput {
  /** The bill being recorded, in minor units. */
  billCents: number
  billCurrency: string
  /** The window the bill covers, where it says. */
  periodStart?: Date | null
  periodEnd?: Date | null
  po: {
    number: string
    status: string
    /** Authorised ceiling, minor units. */
    amountCents: number
    currency: string
    /** Already billed against it by other bills. */
    consumedCents: number
    startDate: Date
    endDate: Date | null
  } | null
  /**
   * What the buy contract can produce for the period, where it is
   * knowable. Null where the contract carries no rate or no hours
   * expectation — and null means unchecked, never "fine".
   */
  contractExpectedCents?: number | null
  contractCurrency?: string | null
}

export type OverBillCode =
  | 'PO_CURRENCY'
  | 'PO_CLOSED'
  | 'PO_WINDOW'
  | 'PO_CEILING'
  | 'CONTRACT_CURRENCY'
  | 'CONTRACT_AMOUNT'

export interface OverBillProblem {
  code: OverBillCode
  /** True where an AP clerk with authority may record it anyway. */
  overridable: boolean
  says: string
}

export interface OverBillVerdict {
  ok: boolean
  problems: OverBillProblem[]
  /** What the PO has left after this bill, where there is a PO. */
  poRemainingAfterCents: number | null
  says: string
}

/**
 * A material variance. Five per cent.
 *
 * Below this an over-bill is a rounding difference, a part-hour, or a
 * currency conversion at the supplier's end, and refusing it would train
 * an AP clerk to override everything. Above it, somebody billed something
 * the contract does not produce.
 */
export const CONTRACT_TOLERANCE_BPS = 500

export function overBillCheck(i: OverBillInput, now: Date = new Date()): OverBillVerdict {
  const problems: OverBillProblem[] = []
  let remainingAfter: number | null = null

  if (i.po) {
    const po = i.po
    if (po.currency.toUpperCase() !== i.billCurrency.toUpperCase()) {
      problems.push({
        code: 'PO_CURRENCY',
        overridable: false,
        says:
          `PO ${po.number} authorises spend in ${po.currency.toUpperCase()} and this bill ` +
          `is in ${i.billCurrency.toUpperCase()}. Drawing one down with the other would ` +
          `bury an exchange rate inside a ceiling, where nobody would find it.`,
      })
    } else {
      const balance = poBalance(
        {
          amountCents: po.amountCents,
          invoicedCents: po.consumedCents,
          status: po.status as PoStatus,
          endDate: po.endDate,
        },
        now
      )
      remainingAfter = balance.remainingCents - i.billCents

      if (po.status !== 'OPEN') {
        problems.push({
          code: 'PO_CLOSED',
          overridable: true,
          says:
            `PO ${po.number} is ${po.status.toLowerCase()}. A bill against it needs the ` +
            `order reopened, or somebody saying in writing why it is being paid anyway.`,
        })
      }

      const start = i.periodStart ?? null
      const end = i.periodEnd ?? null
      if (start && start < po.startDate) {
        problems.push({
          code: 'PO_WINDOW',
          overridable: true,
          says:
            `The work starts ${iso(start)}, before PO ${po.number} opens on ` +
            `${iso(po.startDate)}. A purchase order authorises spend over a window, and ` +
            `this is spend from outside it.`,
        })
      }
      if (end && po.endDate && end > po.endDate) {
        problems.push({
          code: 'PO_WINDOW',
          overridable: true,
          says:
            `The work runs to ${iso(end)}, past PO ${po.number} ending ${iso(po.endDate)}.`,
        })
      }

      if (remainingAfter < 0) {
        problems.push({
          code: 'PO_CEILING',
          overridable: true,
          says:
            `PO ${po.number} has ${money(balance.remainingCents)} left and this bill is ` +
            `${money(i.billCents)} — over by ${money(-remainingAfter)}. The ceiling is what ` +
            `the payer actually authorised; going past it is a change order, not a rounding ` +
            `question.`,
        })
      }
    }
  }

  if (i.contractExpectedCents != null) {
    const expected = i.contractExpectedCents
    const contractCurrency = (i.contractCurrency ?? i.billCurrency).toUpperCase()
    if (contractCurrency !== i.billCurrency.toUpperCase()) {
      problems.push({
        code: 'CONTRACT_CURRENCY',
        overridable: false,
        says:
          `The buy contract is in ${contractCurrency} and the bill is in ` +
          `${i.billCurrency.toUpperCase()}. Those two numbers are not comparable, so the ` +
          `contract check is refused rather than made.`,
      })
    } else {
      const ceiling = expected + Math.round((expected * CONTRACT_TOLERANCE_BPS) / 10_000)
      if (expected > 0 && i.billCents > ceiling) {
        problems.push({
          code: 'CONTRACT_AMOUNT',
          overridable: true,
          says:
            `The buy contract produces about ${money(expected)} for this period and the ` +
            `bill is ${money(i.billCents)} — ${Math.round(((i.billCents - expected) / expected) * 100)}% ` +
            `above it. That is either hours nobody worked or a rate nobody agreed, and both ` +
            `are cheaper to settle at the door than in a margin report three months later.`,
        })
      }
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    poRemainingAfterCents: remainingAfter,
    says:
      problems.length === 0
        ? i.po
          ? `Within PO ${i.po.number} — ${money(remainingAfter ?? 0)} left after this bill.`
          : 'Nothing to check it against, and nothing wrong with it.'
        : problems[0].says,
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function money(cents: number): string {
  const n = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
