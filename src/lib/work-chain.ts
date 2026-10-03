/**
 * Finding the hours from anywhere in the chain.
 *
 * Hours are filed once, by the person, against the contract of the firm
 * that actually employs them. Everybody above has to be able to reach
 * that one record and value it at their own rate — the sub at $110, the
 * prime at $135, and neither seeing the other's number.
 *
 * ── Why this needed an edge in the schema ────────────────────────────
 *
 * The ladder was walkable one rung and then stopped:
 *
 *   SellContract  --ContractLink-->  BuyContract      ✓ in the schema
 *   BuyContract   --???-->           SellContract     ✗ nothing
 *
 * `BuyContract.vendorCompanyId` names the firm we buy from, which is not
 * the same as naming the contract. Two people from the same sub-vendor
 * on two different roles are two sell contracts, and guessing between
 * them by person and date is the kind of join that is right in testing
 * and wrong in March.
 *
 * `BuyContract.supplierSellContractId` is that edge. With it the ladder
 * reads from any rung:
 *
 *   CS.sell(→Adobe) → CS.buy(CloudEPA) → CloudEPA.sell(→CS)
 *                                        → CloudEPA.buy(Priya, W2)
 *                                                    ▲
 *                                          the hours are filed here
 *
 * ── What this file will not do ───────────────────────────────────────
 *
 * It does not copy hours, and it does not let a firm see another firm's
 * rate. Descending returns contract ids; what each hop charges is read
 * from its own row by the caller, which is the only party entitled to
 * it.
 *
 * Pure — every function takes rows and returns answers, so a wrong
 * result is a failing test rather than a support call about an invoice.
 */

/** A sell contract, reduced to what walking needs. */
export interface Rung {
  sellContractId: string
  /** The firm that owns this contract and bills under it. */
  companyId: string
  /** Its own buy side, where one is linked. */
  buyContractId: string | null
  /**
   * The supplier's sell contract, where this firm buys from another
   * firm. Null where the person is this firm's own employee, which is
   * where the ladder ends.
   */
  supplierSellContractId: string | null
}

/**
 * Every rung from here down, this one first, the employer's last.
 *
 * A chain of three firms returns three ids. A direct placement returns
 * one, which is the ordinary case and must not be a special case.
 */
export function descend(from: string, rungs: readonly Rung[]): string[] {
  const by = new Map(rungs.map((r) => [r.sellContractId, r]))
  const seen: string[] = []
  let at: string | null = from

  while (at) {
    // A cycle should not be possible and would hang a request if it were.
    // Somebody's data will one day disagree with that sentence.
    if (seen.includes(at)) break
    const rung: Rung | undefined = by.get(at)
    if (!rung) {
      // The rung is not in the rows we were given. That is a partial
      // read rather than a break in the chain, so it is still part of
      // the answer.
      seen.push(at)
      break
    }
    seen.push(at)
    at = rung.supplierSellContractId
  }

  return seen
}

/**
 * The contract the hours are actually filed against.
 *
 * The bottom of the ladder: the firm that employs the person. On a
 * direct placement that is the contract you started from.
 */
export function whereHoursLive(from: string, rungs: readonly Rung[]): string {
  const all = descend(from, rungs)
  return all[all.length - 1]
}

/** How many firms stand between this contract and the person. */
export function hopsBelow(from: string, rungs: readonly Rung[]): number {
  return Math.max(0, descend(from, rungs).length - 1)
}

/**
 * Whether this contract may bill the hours filed on that one.
 *
 * The question an invoice run asks, and the answer must be no for any
 * contract that is not on the same ladder — otherwise a firm bills for
 * somebody else's week, which is the failure this whole file exists to
 * make impossible rather than unlikely.
 */
export function mayBill(from: string, hoursOn: string, rungs: readonly Rung[]): boolean {
  return descend(from, rungs).includes(hoursOn)
}

/**
 * What a firm is passing up, and what it keeps.
 *
 * `sold` is what this firm charges; `bought` is what the hop below
 * charges it. Both in cents per hour. The caller reads each from the row
 * it owns — this only does the arithmetic, so a margin is never derived
 * from a number a firm is not entitled to see.
 */
export function legMargin(input: {
  hours: number
  soldRateCents: number
  boughtRateCents: number | null
}): { revenueCents: number; costCents: number | null; marginCents: number | null } {
  const revenueCents = Math.round(input.hours * input.soldRateCents)
  if (input.boughtRateCents === null) {
    // Visibly missing beats a plausible guess. A margin shown as the
    // whole invoice because nobody set a cost is the kind of wrong that
    // looks like good news.
    return { revenueCents, costCents: null, marginCents: null }
  }
  const costCents = Math.round(input.hours * input.boughtRateCents)
  return { revenueCents, costCents, marginCents: revenueCents - costCents }
}

/**
 * Which role a company is playing on a set of hours.
 *
 * The employer accepts what it will pay for. The end client says the
 * work happened. Everybody in between passes it up at their own rate,
 * and that is a third statement rather than a weaker version of either.
 */
export function roleOf(input: {
  companyId: string
  /** The firm that employs the person — the bottom of the ladder. */
  employerCompanyId: string
  /** Where the work is done. Null means the buyer on the contract. */
  endClientCompanyId: string | null
  /** Who is billed on the contract carrying the hours. */
  clientCompanyId: string
}): 'EMPLOYER_ACCEPTANCE' | 'CLIENT_APPROVAL' | 'PASS_THROUGH' | null {
  const client = input.endClientCompanyId ?? input.clientCompanyId

  // A direct placement is both at once. The employer's acceptance is the
  // consequential one — it gates pay — so it wins, and the route's own
  // "one press signs both" rule handles the rest.
  if (input.companyId === input.employerCompanyId) return 'EMPLOYER_ACCEPTANCE'
  if (input.companyId === client) return 'CLIENT_APPROVAL'
  return 'PASS_THROUGH'
}
