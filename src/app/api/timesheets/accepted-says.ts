import { amount } from '@/lib/money-display'

/**
 * What a firm below the top of a chain is told when it accepts a week.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The third screen walk, 2026-11-03 (fault M4): Brightmoor's AP & Payroll
 * seat accepted Rajesh Iyer's week and read "Accepted 40h — $5,200.00 to
 * pay for the week". The figure was the week valued at the bill rate on
 * the contract the hours are filed on, which is what Brightmoor bills the
 * firm above it. It is not what Brightmoor pays: Brightmoor employs
 * Rajesh and pays him through payroll at his pay rate, on rules (the cut
 * week's overtime, the pay model) that this press does not work out.
 *
 * So the sentence says only what the press knows, in two parts:
 *
 *   - what the firm bills upward, where the figure is the firm's own bill
 *     ("$5,200.00 to bill Northbend Athletic"), in the line's currency;
 *   - how the person below is paid, without a figure: through payroll on
 *     their own pay line, or by the sub-vendor's invoice, which is
 *     checked against this acceptance.
 *
 * Never a payroll figure. A pay amount worked out here would be a number
 * nobody can stand behind.
 */

export type PaidBelow =
  /** The firm employs the person: paid through payroll, never billed. */
  | { kind: 'PAYROLL'; personName: string }
  /** The firm pays a sub-vendor, whose invoice is checked against the week. */
  | { kind: 'SUPPLIER'; supplierName: string }
  /** The firm pays the person directly but not by payroll (an independent contractor). */
  | { kind: 'OWN_LINE'; personName: string }

export interface AcceptedSaysInput {
  hours: number
  /**
   * What the firm bills upward for the week, in minor units of `currency`.
   * Null where the firm does not bill this week from this press, or where
   * the figure could not be read (the client's overtime answer).
   */
  billMinor: number | null
  /** The currency of the line the bill figure is on. */
  currency: string
  /** Who the bill goes to: the firm directly above. */
  billsName: string | null
  /** How the person below is paid, where the press knows. */
  paidBelow: PaidBelow | null
  /** The client's overtime decision, as a sentence, where there is one. */
  clientDecided?: string | null
}

export function acceptedSays(x: AcceptedSaysInput): string {
  const bill = x.billMinor != null && x.billsName ? `${amount(x.billMinor, x.currency)} to bill ${x.billsName}.` : null
  const below = paidBelowSays(x.paidBelow)

  let out: string
  if (bill && below) out = `Accepted ${x.hours}h. ${bill} ${below}.`
  else if (bill) out = `Accepted ${x.hours}h. ${bill}`
  else if (below && x.paidBelow?.kind === 'SUPPLIER') out = `Accepted ${x.hours}h; ${below}.`
  else if (below) out = `Accepted ${x.hours}h. ${below}.`
  else out = `Accepted ${x.hours}h.`

  return x.clientDecided ? `${out} ${x.clientDecided}` : out
}

function paidBelowSays(p: PaidBelow | null): string | null {
  if (!p) return null
  switch (p.kind) {
    case 'PAYROLL':
      return `${p.personName} is paid through payroll on their own pay line`
    case 'SUPPLIER':
      return `${p.supplierName}'s invoice is checked against it`
    case 'OWN_LINE':
      return `${p.personName} is paid on their own pay line`
  }
}

/** Contract types under which the employer pays the person through payroll. */
const PAYROLL_TYPES = new Set(['W2', 'C2H_W2', 'CDD', 'FIXED_TERM'])

/**
 * How the employer at the bottom of a chain pays the person, read off its
 * own buy line for them. A line with a vendor is a sub-vendor's invoice; a
 * line with none under an employment type is payroll; an independent
 * contractor's line is their own pay line. No line, no claim.
 */
export function paidBelowFrom(
  line: { vendorName: string | null; contractType: string } | null,
  personName: string
): PaidBelow | null {
  if (!line) return null
  if (line.vendorName) return { kind: 'SUPPLIER', supplierName: line.vendorName }
  if (PAYROLL_TYPES.has(line.contractType)) return { kind: 'PAYROLL', personName }
  return { kind: 'OWN_LINE', personName }
}
