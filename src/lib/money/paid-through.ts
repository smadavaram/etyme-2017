/**
 * Whether a buy line is paid by payroll or by invoice receipt. One door.
 *
 * CLAUDE.md, "Bill, invoice receipt, payroll": payroll is for the firm's
 * own employee. A supplier below — including a worker's own company — is
 * paid by invoice receipt, and so is a 1099 individual. "Buy contract
 * will pay supplier or run payroll for candidate": one or the other,
 * never both, so the same week is never paid twice.
 *
 * Payroll pays a line only where it is an employment the firm holds
 * directly: an employee contract type, and nobody between — no supplier
 * named on the line and no supplier's contract behind it. A line with no
 * type is paid by neither until somebody says, rather than by payroll on
 * a guess.
 *
 * Pure: no database.
 */

/** Employment: the firm is the employer and pays a wage. */
export const EMPLOYEE_CONTRACT_TYPES = ['W2', 'C2H_W2', 'CDD', 'FIXED_TERM'] as const

export interface PayLineShape {
  contractType: string | null | undefined
  vendorCompanyId?: string | null
  supplierSellContractId?: string | null
}

export function paidByPayroll(line: PayLineShape): boolean {
  if (line.vendorCompanyId || line.supplierSellContractId) return false
  return (EMPLOYEE_CONTRACT_TYPES as readonly string[]).includes(String(line.contractType ?? '').toUpperCase())
}

/** The one plain line a payroll screen shows, or a run refuses with, for a line it does not pay. */
export function notPayrollSays(a: { personName: string; contractType: string | null | undefined; vendorName?: string | null }): string {
  if (a.vendorName) return `${a.personName} is paid through ${a.vendorName}’s invoice — see Invoice receipts.`
  const t = String(a.contractType ?? '').toUpperCase()
  if (t === 'IND_1099') return `${a.personName} is paid on their own invoice as an independent contractor — see Invoice receipts.`
  if (t === 'C2C') return `${a.personName} is paid through their own company’s invoice — see Invoice receipts.`
  return `Nothing on ${a.personName}’s line says they are our employee, so payroll does not pay it. Set the contract type, or settle it through Invoice receipts.`
}
