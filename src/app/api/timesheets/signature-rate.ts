/**
 * The rate a signature records: the rate on the rung the signing firm
 * pays on, as that firm pays it.
 *
 * Decided 2026-10-06 (lib/money/hop-ledger): `WorkAssertion.rateCents` is
 * a record of what the signer saw when it signed, and no posting reads it
 * — every posting prices the hours from the line it lands on. So:
 *
 *   · the client records the bill rate of the top contract, the one it
 *     pays, in force on the week's first day;
 *   · a firm in the middle records its own buy line's rate — what it pays
 *     the firm below for this person;
 *   · the employer records its pay line's rate — what it pays the person.
 *
 * The assert route used to record the bill rate of the contract the week
 * was filed on as the client's — on a chain, the sub-vendor's price, which
 * the client never pays and must never see.
 *
 * Pure. The route reads the ladder, the lines and the rate changes in
 * force; this says which of them belongs on which signature.
 */

export type SignatureRole = 'CLIENT_APPROVAL' | 'PASS_THROUGH' | 'EMPLOYER_ACCEPTANCE'

export interface RungRate {
  sellContractId: string
  /** The seller on this rung. */
  companyId: string
  /** Who pays on this rung. */
  clientCompanyId: string
  /** The rung's bill rate in force on the week's first day, in cents. */
  billRateCents: number
}

export interface SignatureRateFacts {
  role: SignatureRole
  /** The signing firm. */
  companyId: string
  /** The ladder, top first, the rung the week is filed on last. */
  ladder: RungRate[]
  /**
   * The signing firm's own buy line for this person, rate in force on the
   * week's first day: to the firm below for a middle firm, the pay line
   * for the employer. Null where it has none on record.
   */
  ownBuyLineCents: number | null
}

export function signatureRateCents(f: SignatureRateFacts): number {
  const top = f.ladder[0]
  if (f.role === 'CLIENT_APPROVAL') {
    // The top contract is the one the client pays. Where the signer is not
    // the top rung's buyer — a firm reading as the client on a chain whose
    // filed line names no end client — the rung it does buy on.
    const bought = f.ladder.find((r) => r.clientCompanyId === f.companyId)
    return (top && top.clientCompanyId === f.companyId ? top : bought ?? top)?.billRateCents ?? 0
  }
  if (f.role === 'PASS_THROUGH') {
    if (f.ownBuyLineCents != null && f.ownBuyLineCents > 0) return f.ownBuyLineCents
    // No buy line of its own on record: the rung it pays on is the one it
    // is the buyer of, at that rung's price — which is what it pays.
    const bought = f.ladder.find((r) => r.clientCompanyId === f.companyId)
    return (bought ?? f.ladder[f.ladder.length - 1])?.billRateCents ?? 0
  }
  // The employer: what it pays the person. Zero where nothing is on
  // record, never the bill rate — "we pay them what we bill" zeroes the
  // margin invisibly, and zero is visibly missing.
  return f.ownBuyLineCents != null && f.ownBuyLineCents > 0 ? f.ownBuyLineCents : 0
}
