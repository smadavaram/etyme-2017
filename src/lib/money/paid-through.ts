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

// ── What the worker's own page may say about money ──────────────────

/**
 * How the person on a line is paid, from their own side.
 *
 * - WAGES: the firm on the line employs them and pays by payroll. "Owed
 *   to you" and a pay day are true.
 * - OWN_COMPANY_BILLS: the firm buys from a company that is the person's
 *   own — corp to corp through her LLC. Nothing is owed to her as wages.
 *   Her company is the seller: it bills the firm, and the firm pays her
 *   company's invoice on its terms. Colleen Byrne's page said "$9,936 is
 *   owed to you … paid by Halcyon Talent … no pay date set", which is a
 *   payroll sentence about somebody on no payroll.
 * - THROUGH_SUPPLIER: another firm stands between — her employer is
 *   below this line, and this line's money goes to that firm, not to her.
 * - UNKNOWN: nothing on the line says (no contract type). Said as
 *   unknown, never read as wages.
 *
 * `ownCompanyIds` are the companies that are the person's own: her
 * `ConsultantProfile.ownCompanyId`, and any one-person corporation she
 * holds the owner's seat at.
 */
export type WorkerPaidAs = 'WAGES' | 'OWN_COMPANY_BILLS' | 'THROUGH_SUPPLIER' | 'UNKNOWN'

export function workerPaidAs(line: PayLineShape, ownCompanyIds: readonly string[]): WorkerPaidAs {
  if (line.vendorCompanyId && ownCompanyIds.includes(line.vendorCompanyId)) return 'OWN_COMPANY_BILLS'
  if (line.vendorCompanyId || line.supplierSellContractId) return 'THROUGH_SUPPLIER'
  if (paidByPayroll(line)) return 'WAGES'
  const t = String(line.contractType ?? '').toUpperCase()
  // An independent contractor on a 1099 bills in their own name: the
  // same shape as her own company, with herself as the seller.
  if (t === 'IND_1099') return 'OWN_COMPANY_BILLS'
  return 'UNKNOWN'
}

/**
 * The sentence for weeks a person's own company bills, in place of "owed
 * to you". Hours and weeks only — never a figure, because what her
 * company bills is her company's own price and the rate on the buyer's
 * line is what the buyer pays her company, which her company's bill
 * states and this page does not restate as wages.
 */
export function ownCompanyBillsSays(a: {
  companyName: string | null
  buyerName: string
  weeks: number
  hours: number
  paymentTermsDays?: number | null
}): string {
  const seller = a.companyName ?? 'Your own company'
  const w = `${a.weeks} week${a.weeks === 1 ? '' : 's'}`
  const h = `${Math.round(a.hours * 100) / 100} hour${a.hours === 1 ? '' : 's'}`
  const terms = a.paymentTermsDays ? `, net ${a.paymentTermsDays} days` : ''
  if (a.weeks === 0) {
    return `${seller} bills ${a.buyerName} for your hours once ${a.buyerName} accepts them. ` +
      `${a.buyerName} pays ${seller}’s invoice${terms}; it does not pay you wages.`
  }
  return `${w}, ${h}, accepted by ${a.buyerName} and ready for ${seller} to bill. ` +
    `${a.buyerName} pays ${seller}’s invoice${terms}; it does not pay you wages.`
}
