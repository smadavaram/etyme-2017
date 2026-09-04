/**
 * Awarding a candidate to a requisition.
 *
 * This is the enforcement point of the whole demand side. Everything before
 * it is reversible paperwork — a requisition can be withdrawn, an invitation
 * expired, a submission ignored, and nobody is worse off. The award is where
 * a person starts at a client, and from that moment co-employment exposure,
 * tenure accrual and spend commitment all begin. It cannot be taken back by
 * deleting a row.
 *
 * So this is where Addendum E's BLOCK rules bite: tenure cap, break in
 * service, work authorisation, lapsed supplier insurance. Those are the
 * legally grounded ones, and none of them is anybody's to wave through.
 *
 * Two things this models that the previous convert path did not:
 *
 *   Seats. A requisition is not a yes/no, it is N positions. Awarding
 *   consumes one. The old path let five people be converted against a
 *   one-position requisition and nothing objected.
 *
 *   Closure. Filling the last seat ends the requisition, which should stop
 *   the other vendors working it. Leaving it open costs suppliers real
 *   sourcing effort on a role that no longer exists, and they remember.
 */

export type AwardCode =
  | 'APPROVAL'    // the requisition itself cleared approval
  | 'SEATS'       // a position remains to be filled
  | 'DUPLICATE'   // this person does not already hold a seat here
  | 'GOVERNANCE'  // tenure, break in service, work authorisation, insurance
  | 'BAND'        // the awarded rate is inside the band this vendor was given
  | 'CEILING'     // and inside what the client said it would pay

export interface AwardCheck {
  code: AwardCode
  outcome: 'PASS' | 'WARN' | 'BLOCK'
  reason: string
}

export interface AwardFacts {
  /** Positions on the requisition. */
  headcount: number
  /** Seats already filled by live contracts. */
  alreadyAwarded: number
  /** True when this same person already holds a seat on this requisition. */
  personAlreadyAwarded: boolean
  personName: string
  requisitionApprovalState: string
  requisitionStatus: string
  /** What the client will actually pay this person, in cents. */
  awardedRateCents: number
  /** The band this vendor was given. Null when none was stated. */
  vendorBand: { payMin: number | null; payMax: number | null } | null
  /** The client's own ceiling on the requisition, in cents. */
  ceilingCents: number | null
  /** Result of the existing governance engine at CONTRACT_START. */
  governance: {
    blocks: string[]
    warnings: string[]
  }
}

export interface AwardDecision {
  decision: 'AWARD' | 'BLOCKED'
  checks: AwardCheck[]
  /** Seats left after this award, if it proceeds. */
  seatsAfter: number
  /** True when this award fills the last position. */
  fillsRequisition: boolean
  summary: string
}

const money = (c: number) => `$${Math.round(c / 100)}`

export function seatsRemaining(headcount: number, alreadyAwarded: number): number {
  return Math.max(0, headcount - alreadyAwarded)
}

export function assessAward(f: AwardFacts): AwardDecision {
  const checks: AwardCheck[] = []
  const remaining = seatsRemaining(f.headcount, f.alreadyAwarded)

  // ── The requisition must have cleared approval ──
  // Awarding against an unapproved requisition makes the approval chain
  // decorative, exactly as distributing without approval would.
  const approved = f.requisitionApprovalState === 'APPROVED' || f.requisitionApprovalState === 'AUTO_APPROVED'
  checks.push(approved
    ? { code: 'APPROVAL', outcome: 'PASS', reason: 'Requisition is approved' }
    : {
        code: 'APPROVAL',
        outcome: 'BLOCK',
        reason: `Requisition is ${f.requisitionApprovalState.toLowerCase().replace(/_/g, ' ')} — nobody can be placed against it yet`,
      })

  // ── A seat must exist ──
  checks.push(remaining > 0
    ? {
        code: 'SEATS',
        outcome: 'PASS',
        reason: remaining === 1
          ? 'The last position on this requisition'
          : `${remaining} of ${f.headcount} positions still open`,
      }
    : {
        code: 'SEATS',
        outcome: 'BLOCK',
        reason: `All ${f.headcount} position${f.headcount === 1 ? '' : 's'} on this requisition are already filled`,
      })

  // ── One person, one seat ──
  checks.push(f.personAlreadyAwarded
    ? {
        code: 'DUPLICATE',
        outcome: 'BLOCK',
        reason: `${f.personName} already holds a position on this requisition`,
      }
    : { code: 'DUPLICATE', outcome: 'PASS', reason: 'Not already placed here' })

  // ── Governance: the legally grounded gates ──
  // Delegated to the existing engine; this only decides what to do with the
  // answer. A block here is never overridable — it is the reason the award
  // is the enforcement point rather than a formality.
  if (f.governance.blocks.length > 0) {
    checks.push({
      code: 'GOVERNANCE',
      outcome: 'BLOCK',
      reason: f.governance.blocks.join('; '),
    })
  } else if (f.governance.warnings.length > 0) {
    checks.push({
      code: 'GOVERNANCE',
      outcome: 'WARN',
      reason: f.governance.warnings.join('; '),
    })
  } else {
    checks.push({
      code: 'GOVERNANCE',
      outcome: 'PASS',
      reason: 'Tenure, work authorisation and supplier cover all clear',
    })
  }

  // ── The rate against the band this vendor was given ──
  // A warning, not a block. The client is free to pay more than it offered;
  // it is their money and their decision. But a band that quietly stops
  // meaning anything is worse than no band at all, so it is said out loud.
  if (f.vendorBand && (f.vendorBand.payMin != null || f.vendorBand.payMax != null)) {
    const { payMin, payMax } = f.vendorBand
    if (payMax != null && f.awardedRateCents > payMax) {
      checks.push({
        code: 'BAND',
        outcome: 'WARN',
        reason: `${money(f.awardedRateCents)}/hr is above the ${money(payMax)}/hr you offered this vendor`,
      })
    } else if (payMin != null && f.awardedRateCents < payMin) {
      checks.push({
        code: 'BAND',
        outcome: 'WARN',
        reason: `${money(f.awardedRateCents)}/hr is below the ${money(payMin)}/hr floor you offered this vendor`,
      })
    } else {
      checks.push({ code: 'BAND', outcome: 'PASS', reason: `${money(f.awardedRateCents)}/hr is inside the band you offered` })
    }
  } else {
    checks.push({ code: 'BAND', outcome: 'PASS', reason: 'No band was stated for this vendor' })
  }

  // ── And against the client's own ceiling ──
  if (f.ceilingCents != null && f.awardedRateCents > f.ceilingCents) {
    checks.push({
      code: 'CEILING',
      outcome: 'WARN',
      reason: `${money(f.awardedRateCents)}/hr is above the ${money(f.ceilingCents)}/hr ceiling on this requisition`,
    })
  } else {
    checks.push({ code: 'CEILING', outcome: 'PASS', reason: 'Within the requisition ceiling' })
  }

  const blocks = checks.filter(c => c.outcome === 'BLOCK')
  const warnings = checks.filter(c => c.outcome === 'WARN')
  const fills = blocks.length === 0 && remaining === 1

  return {
    decision: blocks.length === 0 ? 'AWARD' : 'BLOCKED',
    checks,
    seatsAfter: blocks.length === 0 ? remaining - 1 : remaining,
    fillsRequisition: fills,
    summary: blocks.length > 0
      ? blocks.length === 1 ? blocks[0].reason : `${blocks.length} reasons this cannot proceed — ${blocks[0].reason}`
      : warnings.length > 0
        ? `${f.personName} placed with ${warnings.length} note(s) — ${warnings[0].reason}`
        : fills
          ? `${f.personName} placed — this fills the requisition`
          : `${f.personName} placed — ${remaining - 1} position(s) still open`,
  }
}

// ── The other half of the deal ────────────────────────────────────
//
// An award used to create a sell contract and nothing else, so every
// placement carried a price and no cost. Profitability read the missing
// pay rate as zero and reported a hundred per cent margin across the
// whole book — confidently wrong, and it looks like good news, which is
// the kind nobody audits.
//
// You cannot place somebody without knowing what you pay them, so the
// buy side is decided here, in one readable place, and the route builds
// the rows from it.

export interface BuySideFacts {
  /** The firm supplying the person. */
  fromCompanyId: string
  /** The firm doing the awarding — us. */
  awardingCompanyId: string
  /** What the supplier asked for, in cents per hour. */
  submittedRateCents: number | null
  /** A rate somebody typed on the award itself, if they did. */
  agreedRateCents?: number | null
}

export interface BuySide {
  /** Null where we employ them ourselves; the supplier where we do not. */
  vendorCompanyId: string | null
  contractType: 'C2C' | 'W2'
  /** Zero where nobody has said. Visibly missing beats a plausible guess. */
  payRateCents: number
  rateKnown: boolean
  /** Plain English for the award log and the screen. */
  says: string
}

export function buySide(f: BuySideFacts): BuySide {
  const ourOwn = f.fromCompanyId === f.awardingCompanyId

  // Where the submission came from another firm, what they asked for IS
  // the cost. That is the whole arrangement, so defaulting to it is
  // right rather than lazy. Where we employ the person ourselves,
  // nothing in the submission tells us what we pay them.
  const agreed =
    typeof f.agreedRateCents === 'number' && f.agreedRateCents > 0 ? f.agreedRateCents : null
  const fallback = !ourOwn && f.submittedRateCents && f.submittedRateCents > 0
    ? f.submittedRateCents
    : null
  const rate = agreed ?? fallback

  return {
    vendorCompanyId: ourOwn ? null : f.fromCompanyId,
    contractType: ourOwn ? 'W2' : 'C2C',
    payRateCents: rate ?? 0,
    rateKnown: rate !== null,
    says: rate === null
      ? 'No pay rate on this placement yet. Margin stays blank until somebody sets one.'
      : agreed !== null
        ? 'Pay rate taken from the award.'
        : 'Pay rate taken from what the supplier asked for.',
  }
}
