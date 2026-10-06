/**
 * The hop ledger: every money posting lands on one rung, at that rung's
 * own rate.
 *
 * ── The finding this closes ──────────────────────────────────────────
 *
 * The outside chain audit of 2026-10-05 (docs/audits/2026-10-05-multi-
 * tier-chain-spec.md, sections 2–4), confirmed against the code. In
 * Northbend Athletic ← Computer Systems ← Techpeple ← Helena Marsh, the
 * week is filed once, on Techpeple's line. `postAssertion` booked the
 * client's signature as REVENUE to the firm that owns the filing line —
 * Techpeple — at the rate the signature carried, which was Computer
 * Systems' $145. And it posted nothing at all for Computer Systems'
 * acceptance in the middle. So Techpeple's profit read $29,000 billed on
 * 200 hours at somebody else's price, and Computer Systems' profit did
 * not list Helena or Priya Raman, whom it buys in and bills, at all.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * One week, filed once, signed at the top, accepted down the chain, and
 * each rung bills and is paid on the same hours at its own rate. So a
 * signature is read as the payer's acceptance on the rung the payer buys
 * on, and nothing else:
 *
 *   · the rung it buys on is REVENUE to that rung's seller — the hours
 *     the payer accepted, at the seller's own sell rate ("a firm bills
 *     only the hours the firm above it accepted");
 *   · where the payer itself sells the rung above, the same acceptance is
 *     its own COST — the same hours, at its own buy rate;
 *   · the employer's acceptance is the PAY at hop 0, plus burden where it
 *     employs the person.
 *
 * Nothing posts to the placement as a whole and nothing posts at another
 * rung's rate. A rung that cannot be placed on the ladder posts nothing,
 * in a sentence, rather than landing in the filing firm's books.
 *
 * ── What `WorkAssertion.rateCents` means, decided here ───────────────
 *
 * Two readers disagreed. `lib/work-ledger` said it is the asserting
 * company's own leg ("their money, their number"); this file read it as
 * the filing contract's rate. The one reading, from 2026-10-06: **it is
 * the rate on the rung the signing firm pays on, as that firm pays it** —
 * the client's buy rate at the top, a middle firm's buy rate on the rung
 * below it, the employer's pay rate at hop 0. It is a record of what the
 * signer saw. **No posting reads it.** Every posting prices the hours
 * from the line it lands on, day by day at the rate in force, because a
 * column that one door wrote at one rung and another door at another
 * (the legacy assert route still writes the filing line's bill rate on
 * the client's signature, and the seed wrote the bill rate on the
 * employer's) is not a figure books can stand behind.
 *
 * Pure. The ladder is read by `ladderOver` (lib/work-chain-read) and the
 * prices by lib/order-postings; this only says who posts what, where.
 */

import { roleOf } from '@/lib/work-chain'

export type SignRole = 'CLIENT_APPROVAL' | 'PASS_THROUGH' | 'EMPLOYER_ACCEPTANCE'

/** One rung of the chain: one sell line, its seller selling to its client. */
export interface HopRung {
  sellContractId: string
  /** The seller on this rung. */
  companyId: string
  /** Who this rung bills — its customer. */
  clientCompanyId: string
  endClientCompanyId?: string | null
  /**
   * The seller's own buy line behind this rung: to the supplier on the
   * rung below, or the payroll line where the seller employs the person.
   */
  buyContractId: string | null
}

/** What one signature posts, and to whom. Amounts are the caller's to price. */
export type PostingLeg =
  /** The rung's seller earns the payer's accepted hours at its own sell rate. */
  | { kind: 'REVENUE'; companyId: string; sellContractId: string; customerId: string }
  /**
   * The payer's own cost of the rung below, where the payer itself sells
   * the rung above: the same hours at its own buy rate, grouped under its
   * own sell line.
   */
  | { kind: 'BOUGHT'; companyId: string; sellContractId: string; buyContractId: string | null; supplierSellContractId: string; customerId: string }
  /** Hop 0: the employer pays the person, and carries burden where it employs them. */
  | { kind: 'PAY'; companyId: string; sellContractId: string; buyContractId: string | null; customerId: string }

export interface Legs {
  legs: PostingLeg[]
  /** Why a signature posts less than it might, in a sentence. Null where it posts in full. */
  says: string | null
}

/**
 * Who the signature is, read off the rung the hours are filed on — the
 * same answer the invoice-receipt match and every rung's bill read
 * (`payersRole` in lib/money/payers-acceptance).
 */
function payersRole(companyId: string, bottom: HopRung): SignRole {
  return (
    roleOf({
      companyId,
      employerCompanyId: bottom.companyId,
      endClientCompanyId: bottom.endClientCompanyId ?? null,
      clientCompanyId: bottom.clientCompanyId,
    }) ?? 'PASS_THROUGH'
  )
}

/**
 * What one signature posts, rung by rung.
 *
 * `ladder` is top first, and its last rung is the line the hours are
 * filed on — the employer's. A direct placement is a ladder of one.
 */
export function legsOf(signature: { companyId: string; role: string }, ladder: readonly HopRung[]): Legs {
  if (ladder.length === 0) return { legs: [], says: 'The line these hours are filed on could not be read, so nothing is posted.' }
  const bottom = ladder[ladder.length - 1]
  const role = signature.role as SignRole

  if (role === 'EMPLOYER_ACCEPTANCE') {
    if (signature.companyId !== bottom.companyId) {
      return {
        legs: [],
        says: 'Only the firm that employs the person accepts hours for pay, and this signature is not theirs, so it posts no pay.',
      }
    }
    return {
      legs: [{
        kind: 'PAY', companyId: bottom.companyId, sellContractId: bottom.sellContractId,
        buyContractId: bottom.buyContractId, customerId: bottom.clientCompanyId,
      }],
      says: null,
    }
  }

  // The rung this signature pays on: the one whose customer it is, where
  // the signature is the payer's own kind. Top first, so a firm named on
  // two rungs — a data fault — posts once, on the higher.
  const at = ladder.findIndex((r) => r.clientCompanyId === signature.companyId)
  if (at < 0 || payersRole(signature.companyId, bottom) !== role) {
    return {
      legs: [],
      says:
        role === 'CLIENT_APPROVAL'
          ? 'The line this client pays on is not linked to the line the hours are filed on, so its signature is revenue to nobody yet. Link the rung above, then rebuild the postings.'
          : 'This firm buys on no rung of this chain that is on the record, so its acceptance posts nothing.',
    }
  }

  const rung = ladder[at]
  const legs: PostingLeg[] = [
    { kind: 'REVENUE', companyId: rung.companyId, sellContractId: rung.sellContractId, customerId: rung.clientCompanyId },
  ]

  // The payer is itself a seller on the rung above: the same hours are its cost.
  if (at > 0) {
    const above = ladder[at - 1]
    if (above.companyId === signature.companyId) {
      legs.push({
        kind: 'BOUGHT', companyId: above.companyId, sellContractId: above.sellContractId,
        buyContractId: above.buyContractId, supplierSellContractId: rung.sellContractId,
        customerId: above.clientCompanyId,
      })
    }
  }
  return { legs, says: null }
}

/**
 * Where a firm stands on a chain, and how far it can see.
 *
 * A firm is party to at most two hops: the one it sells on and the one it
 * buys on. It may know that hops exist above and below it, and how many,
 * and never their rates, values, bills or payments (the audit's
 * visibility rule, section 3.3). Hop 0 — the person and their employer —
 * counts as a hop like any other.
 *
 * Null where the firm is on no hop of this chain at all.
 */
export function hopsAround(
  companyId: string,
  ladder: readonly HopRung[]
): { sells: string | null; buys: string | null; hopsAbove: number; hopsBelow: number } | null {
  if (ladder.length === 0) return null
  const last = ladder.length - 1
  const top = ladder[0]
  const sellsAt = ladder.findIndex((r) => r.companyId === companyId)
  if (sellsAt >= 0) {
    return {
      sells: ladder[sellsAt].sellContractId,
      // The rung below, or hop 0 where it employs the person.
      buys: sellsAt < last ? ladder[sellsAt + 1].sellContractId : null,
      hopsAbove: sellsAt,
      hopsBelow: sellsAt < last ? last - sellsAt : 0,
    }
  }
  if (top.clientCompanyId === companyId || top.endClientCompanyId === companyId) {
    // The client: party to the top hop only.
    return { sells: null, buys: top.sellContractId, hopsAbove: 0, hopsBelow: ladder.length }
  }
  return null
}

/**
 * A week as one rung sees it, keyed for the pricing that reads it.
 *
 * The placement page and the profitability screen price a week through
 * `priceSheets` (lib/money/placement-earned), which bills on the client's
 * signature and costs on the employer's. On a direct placement those are
 * the rung's two signatures. In a chain they are not: Techpeple's line is
 * billed on Computer Systems' acceptance, and Computer Systems' line is
 * costed on its own. So each signature is re-keyed to the question the
 * rung asks of it —
 *
 *   'CLIENT_APPROVAL'     the payer's acceptance on this rung: billed on
 *   'EMPLOYER_ACCEPTANCE' this firm's own acceptance of the rung below,
 *                         or its acceptance for pay at hop 0: costed on
 *
 * — and every other firm's signature is dropped, so no rung is ever
 * priced from a signature (or a rate) that is not its own to read. On a
 * direct placement nothing changes.
 */
export function rungView<A extends { companyId?: string; role: string }>(
  rung: HopRung,
  ladder: readonly HopRung[],
  assertions: readonly A[]
): A[] {
  const bottom = ladder[ladder.length - 1] ?? rung
  const payer = rung.clientCompanyId
  const billedOn = payersRole(payer, bottom)
  const isBottom = rung.sellContractId === bottom.sellContractId
  const out: A[] = []
  for (const a of assertions) {
    if (a.companyId === payer && a.role === billedOn) {
      out.push({ ...a, role: 'CLIENT_APPROVAL' })
    } else if (a.companyId === rung.companyId && a.role === (isBottom ? 'EMPLOYER_ACCEPTANCE' : 'PASS_THROUGH')) {
      out.push({ ...a, role: 'EMPLOYER_ACCEPTANCE' })
    }
  }
  return out
}
