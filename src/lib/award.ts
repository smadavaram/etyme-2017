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
 * service, work authorization, lapsed supplier insurance. Those are the
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

import { termsFor, type OrderHeader, type OrderLine, type OrderSide } from '@/lib/money/order-terms'

export type AwardCode =
  | 'APPROVAL'    // the requisition itself cleared approval
  | 'SEATS'       // a position remains to be filled
  | 'DUPLICATE'   // this person does not already hold a seat here
  | 'GOVERNANCE'  // tenure, break in service, work authorization, insurance
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
    ? { code: 'APPROVAL', outcome: 'PASS', reason: 'Job request is approved' }
    : {
        code: 'APPROVAL',
        outcome: 'BLOCK',
        reason: `Job request is ${f.requisitionApprovalState.toLowerCase().replace(/_/g, ' ')} — nobody can be placed against it yet`,
      })

  // ── A seat must exist ──
  checks.push(remaining > 0
    ? {
        code: 'SEATS',
        outcome: 'PASS',
        reason: remaining === 1
          ? 'The last position on this job request'
          : `${remaining} of ${f.headcount} positions still open`,
      }
    : {
        code: 'SEATS',
        outcome: 'BLOCK',
        reason: `All ${f.headcount} position${f.headcount === 1 ? '' : 's'} on this job request are already filled`,
      })

  // ── One person, one seat ──
  checks.push(f.personAlreadyAwarded
    ? {
        code: 'DUPLICATE',
        outcome: 'BLOCK',
        reason: `${f.personName} already holds a position on this job request`,
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
      reason: 'Tenure, work authorization and supplier cover all clear',
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
      reason: `${money(f.awardedRateCents)}/hr is above the ${money(f.ceilingCents)}/hr ceiling on this job request`,
    })
  } else {
    checks.push({ code: 'CEILING', outcome: 'PASS', reason: 'Within the ceiling on this job request' })
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
      : awardSaid({
          personName: f.personName,
          fills,
          seatsAfter: remaining - 1,
          notes: warnings.map((w) => w.reason),
        }),
  }
}

/**
 * The same note, said once.
 *
 * The classification check reaches the award twice — once from the
 * client's governance rules and once from the route's own reading of the
 * way the vendor engages the person — and the confirmation printed "The
 * vendor has not said how this person is engaged" twice in one line. A
 * note is one fact however many doors it came through.
 */
function uniqueNotes(notes: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of notes.flatMap((n) => n.split('; '))) {
    const n = raw.trim().replace(/[.]+$/, '')
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    out.push(n)
  }
  return out
}

function count(n: number, one: string, many: string): string {
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
  return `${n < words.length ? words[n] : String(n)} ${n === 1 ? one : many}`
}

/**
 * What the person who pressed Place reads, in one paragraph, each thing
 * once.
 *
 * The tester read "Daniel Okafor placed with 1 note(s) — The vendor has
 * not said how this person is engaged The vendor has not said how this
 * person is engaged": a plural nobody chose, and one note twice because
 * the screen printed the summary and then the notes it already carried.
 * So the sentence carries the notes itself and the screen prints the
 * sentence and nothing else.
 */
export function awardSaid(f: {
  personName: string
  fills: boolean
  seatsAfter: number
  notes: string[]
  /** Other candidates on the job told they were not chosen. */
  passedOver?: number
  /** Interview rounds on the job called off by the award. */
  roundsCalledOff?: number
}): string {
  const parts: string[] = [`${f.personName} is placed.`]
  if (f.fills) {
    const after: string[] = []
    if (f.passedOver && f.passedOver > 0) {
      after.push(`${count(f.passedOver, 'other candidate was', 'other candidates were')} told they were not chosen`)
    }
    if (f.roundsCalledOff && f.roundsCalledOff > 0) {
      after.push(`${count(f.roundsCalledOff, 'interview was', 'interviews were').toLowerCase()} called off, and everybody in them told`)
    }
    parts.push(after.length > 0 ? `This fills the job: ${after.join(', and ')}.` : 'This fills the job.')
  } else {
    parts.push(`${count(f.seatsAfter, 'position is', 'positions are')} still open.`)
    if (f.roundsCalledOff && f.roundsCalledOff > 0) {
      parts.push(`${count(f.roundsCalledOff, 'interview', 'interviews')} for ${f.personName.split(' ')[0]} ${f.roundsCalledOff === 1 ? 'was' : 'were'} called off.`)
    }
  }
  const notes = uniqueNotes(f.notes)
  if (notes.length === 1) parts.push(`One thing to note: ${notes[0]}.`)
  else if (notes.length > 1) parts.push(`${count(notes.length, 'thing', 'things')} to note: ${notes.join('; ')}.`)
  return parts.join(' ')
}

// ── The interviews the award makes pointless ───────────────────────
//
// The client tester placed Daniel Okafor and opened Interviews: Rajesh
// Iyer's round still read "In all three diaries" and Mei-Lin Chao's was
// still waiting on her supplier. Both had just been turned down. Two
// people would have taken a morning off for a meeting about a job that
// no longer existed, and nobody would have told them.

/** A round that has not happened yet and could still be called off. */
export const OPEN_ROUND_STATES = ['PROPOSED', 'CONFIRMED'] as const

export interface RoundOnTheJob {
  id: string
  submissionId: string
  state: string
}

export interface RoundToCallOff {
  id: string
  /** Said to the supplier, the candidate and the requester — the same words to all three. */
  reason: string
}

/**
 * Which rounds on this job the award calls off, and why, in words.
 *
 * The placed person's own open rounds always go: they are placed, and a
 * round after that decides nothing. Everybody else's go only when this
 * award fills the job — while a seat is still open, the others are still
 * in the running and their rounds stand. A round already held, missed or
 * called off is history and is never touched.
 */
export function roundsToCallOff(
  rounds: RoundOnTheJob[],
  f: { placedSubmissionId: string; placedName: string; roleTitle: string; fills: boolean }
): RoundToCallOff[] {
  const open = rounds.filter((r) => (OPEN_ROUND_STATES as readonly string[]).includes(r.state))
  return open.flatMap((r) => {
    if (r.submissionId === f.placedSubmissionId) {
      return [{ id: r.id, reason: `${f.placedName} was placed on ${f.roleTitle}, so this round is no longer needed.` }]
    }
    if (f.fills) {
      return [{ id: r.id, reason: `${f.roleTitle} has been filled by another candidate, so this round will not go ahead.` }]
    }
    return []
  })
}

/**
 * Why a candidate stood down by the award stopped — a reason code, never
 * free text. Somebody else got the seat, which is TIMING in
 * `lib/outcomes`: a good candidate beaten to it, which does not count
 * against the supplier's bar.
 */
export const STOOD_DOWN_REASON = 'TIMING' as const

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

/**
 * ── Whose cost is this, and who is it owed to ────────────────────────
 *
 * The buy contract raised on an award belongs to the firm that was just
 * awarded, and it records what *they* pay. So the only question worth
 * asking is who supplied the person to them.
 *
 * That is answered by the chain, not by the award. A submission that was
 * forwarded carries a parent, and the parent's sender is the supplier —
 * Techpeple put Priya forward to Computer Systems, Computer Systems put
 * her forward to Adobe, so when Adobe awards, Computer Systems buys from
 * Techpeple at what Techpeple asked for. A submission with no parent is a
 * firm's own person, which is a W2 employee and no purchase order.
 *
 * This used to be decided by comparing the supplier with the awarding
 * company, which are never the same — the route refuses that case
 * explicitly, one screen up. So the "our own employee" branch was
 * unreachable, every buy contract named its owner as its own supplier,
 * and the cost recorded was the price charged. Margin came out at zero on
 * every chained placement, which is at least a number somebody queries;
 * a company buying from itself is not.
 */
export interface BuySideFacts {
  /** The firm that has just been awarded. This cost is theirs. */
  awardedCompanyId: string
  /**
   * Who supplied the person to them, from the hop below. Null where
   * nobody did, which means the person is their own.
   */
  suppliedByCompanyId: string | null
  /** What that supplier asked for, in cents per hour. Their price is this
   *  firm's cost, which is the whole arrangement. */
  suppliedRateCents: number | null
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
  const ourOwn =
    f.suppliedByCompanyId === null || f.suppliedByCompanyId === f.awardedCompanyId

  // Where the person came up the chain from another firm, what that firm
  // asked for IS the cost. Where we employ them ourselves, nothing in the
  // chain tells us what we pay them and a guess would be worse than a gap.
  const agreed =
    typeof f.agreedRateCents === 'number' && f.agreedRateCents > 0 ? f.agreedRateCents : null
  const fallback = !ourOwn && f.suppliedRateCents && f.suppliedRateCents > 0
    ? f.suppliedRateCents
    : null
  const rate = agreed ?? fallback

  return {
    vendorCompanyId: ourOwn ? null : f.suppliedByCompanyId,
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

// ── The header the award raises ───────────────────────────────────────
//
// A purchase order is a header and its lines. CLAUDE.md, 2026-09-18:
// the header is the commitment to a counterparty — who, how much, over
// what dates, on what terms — and a line is one person at one rate at
// one site. `SellContract` and `BuyContract` are the lines. `WorkOrder`
// is the header, and until now nothing had ever written one from an
// award: a client awarded, a contract appeared, and no order was raised
// or required. `WorkOrder` had zero rows for the life of the product,
// which is why `cron/auto-approve` — which reads the client's own term
// off the order — had approved nothing since the day it was written.
//
// Everything below is arithmetic and naming. No database, so every
// branch that decides money can be read and tested on its own.

/** Where the ceiling on an order came from. Never a bare number. */
export type CeilingBasis =
  /** The requisition stated a budget. What finance actually committed. */
  | 'BUDGET'
  /** Nobody stated one, so the approval chain's own estimate was used. */
  | 'ESTIMATE'
  /** Neither — so the line that is on the order was valued instead. */
  | 'LINE'

export interface OrderCeiling {
  /** Dollars, for `WorkOrder.amount`. Rounded up to the nearest thousand. */
  dollars: number
  /** The figure the rule produced before rounding, in cents. */
  rawCents: number
  basis: CeilingBasis
  /** One line, for the award log and for anybody who queries the number. */
  says: string
}

/**
 * What the order may authorize in total.
 *
 * **One rule, and it is the approval chain's own:** the requisition's
 * annual value — `annualValue` in `lib/requisition-approval`, the exact
 * function that decided whether a VP had to sign — extended over the
 * term the requisition runs for, rounded up to the nearest thousand
 * dollars.
 *
 * Why extended: `annualValue` annualises on purpose, because it is
 * comparing against an annual budget and a two-year commitment must not
 * read as two years of one year's budget. A ceiling is the opposite
 * question — it has to cover the whole term or the order reads as
 * exhausted before the last invoice. Multiplying the annual figure back
 * out by the years restores exactly what was stated: a $500,000 budget
 * over 24 months annualises to $250,000 and comes back here as
 * $500,000, and an estimate comes back as rate x hours x the whole term.
 * Same arithmetic, one stage later. `Requirement.budgetCents` has said
 * so since it was added: *"It becomes the purchase order's ceiling after
 * the award — the same money, one stage later."*
 *
 * Why rounded up to the thousand: a ceiling is a round number somebody
 * signed, never a computed cent, and rounding down would authorize less
 * than was approved. Same rule `lib/seed-order-to-cash` uses, so the
 * seeded world and a real award do not disagree.
 *
 * Null where there is nothing to stand behind — no budget, no rate
 * ceiling and no rate on the award. A plausible ceiling is worse than
 * none, because an invoice would then be matched against a number
 * nobody chose.
 */
export function orderCeiling(input: {
  /** `Requirement.budgetCents` — what finance committed, where they did. */
  budgetCents: number | null
  /** `Requirement.billMax` — the client's own rate ceiling. */
  billMaxCents: number | null
  headcount: number
  months: number | null
  hoursPerWeek: number | null
  /** The rate this award was actually made at, as the last resort. */
  awardedRateCents: number
  /**
   * The same function the approval chain routed on, injected rather than
   * imported so this file stays arithmetic with no dependency to trip
   * over. The route passes `annualValue`.
   */
  annualValue: (i: {
    budgetCents?: number | null
    billMaxCents: number | null
    headcount: number
    months: number | null
    hoursPerWeek?: number | null
  }) => { cents: number; basis: string; says: string }
}): OrderCeiling | null {
  const heads = Math.max(1, input.headcount)
  const stated = input.annualValue({
    budgetCents: input.budgetCents,
    billMaxCents: input.billMaxCents,
    headcount: heads,
    months: input.months,
    hoursPerWeek: input.hoursPerWeek,
  })

  // Neither a budget nor a ceiling on the requisition. The line that is
  // about to go on the order is then the only figure anybody has stated,
  // and it is valued by the same arithmetic rather than a second one.
  const fallback =
    stated.basis === 'UNKNOWN' || stated.cents <= 0
      ? input.annualValue({
          budgetCents: null,
          billMaxCents: input.awardedRateCents > 0 ? input.awardedRateCents : null,
          headcount: heads,
          months: input.months,
          hoursPerWeek: input.hoursPerWeek,
        })
      : null

  const value = fallback ?? stated
  if (value.cents <= 0) return null

  const basis: CeilingBasis =
    fallback ? 'LINE' : value.basis === 'BUDGET' ? 'BUDGET' : 'ESTIMATE'

  // Back out the annualisation, so the ceiling covers the term rather
  // than one year of it.
  const months = input.months ?? 12
  const years = months > 12 ? months / 12 : 1
  const rawCents = Math.round(value.cents * years)

  // Up to the nearest thousand dollars. 100_000 cents is a thousand.
  const dollars = Math.ceil(rawCents / 100_000) * 1_000

  const over = months > 12 ? ` over ${months} months` : ''
  const says =
    basis === 'BUDGET'
      ? `$${dollars.toLocaleString()} authorized — the budget stated on the job request${over}, rounded up to the thousand`
      : basis === 'ESTIMATE'
        ? `$${dollars.toLocaleString()} authorized — ${value.says}${over ? ` extended${over}` : ''}, rounded up to the thousand`
        : `$${dollars.toLocaleString()} authorized — no budget and no rate ceiling on the job request, so ${value.says}`

  return { dollars, rawCents, basis, says }
}

/**
 * The two numbers one document carries.
 *
 * The buyer's PO number is what their AP team quotes; the seller keeps
 * its own sales order reference for the same paper. Both are derived
 * from the two company ids and the year, so a second award between the
 * same two firms lands on the number the first one used instead of
 * colliding on `@@unique([issuedById, number])` — the same trick
 * `lib/seed-order-to-cash` uses for the same reason.
 */
export function orderNumbers(input: { buyerId: string; sellerId: string; on: Date }): {
  number: string
  sellerNumber: string
} {
  const year = input.on.getUTCFullYear()
  return {
    number: `PO-${year}-${input.sellerId.slice(-5).toUpperCase()}`,
    sellerNumber: `SO-${year}-${input.buyerId.slice(-5).toUpperCase()}`,
  }
}

/**
 * The same number again when the first is already taken.
 *
 * A closed order keeps its number forever and the database holds one
 * number per issuer, so a pair that has traded before needs a second.
 * Attempt 1 is the base; after that a suffix nobody has to decode.
 */
export function orderNumberAttempt(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`
}

/** The shipped billing rhythm. One default, changed on the order. */
export const ORDER_RHYTHM = {
  billFrequency: 'MONTHLY',
  billAnchor: 'CALENDAR',
  billStraddle: 'SPLIT',
} as const

export interface HeaderCandidate {
  id: string
  issuedById: string
  issuedToId: string
  status: string
  startDate: Date
  endDate: Date | null
}

export interface HeaderLine {
  issuedById: string
  issuedToId: string
  start: Date
  end: Date | null
}

export interface HeaderChoice {
  /** The order to put this line on, or null to raise one. */
  id: string | null
  says: string
}

/**
 * One open order per buyer-and-seller pair — found, not raised twice.
 *
 * The same rule `POST /api/purchase-orders` applies when it attaches
 * running contracts to a newly raised order, read from the other end: a
 * second person awarded to the same client joins the order the first one
 * opened, as a second line, because five people on one commitment is one
 * document with five lines.
 *
 * Two things disqualify an existing order, and both are refusals to
 * quietly change something somebody signed:
 *
 *   **It is not open.** A closed or cancelled order authorizes nothing.
 *   **It does not cover the line.** An order that starts after the work
 *   does, or ends before it, cannot authorize it — and widening it is
 *   the buyer's act on their own document, never a side effect of an
 *   award. A new order is raised instead and says so.
 */
export function chooseHeader(candidates: HeaderCandidate[], line: HeaderLine): HeaderChoice {
  const pair = candidates.filter(
    (c) => c.issuedById === line.issuedById && c.issuedToId === line.issuedToId
  )
  if (pair.length === 0) {
    return { id: null, says: 'No order between these two firms yet, so the award raises one.' }
  }

  const open = pair.filter((c) => c.status === 'OPEN')
  if (open.length === 0) {
    return { id: null, says: 'Every order between these two firms is closed, so the award raises one.' }
  }

  const covers = open.filter((c) => {
    if (c.startDate.getTime() > line.start.getTime()) return false
    if (c.endDate === null) return true
    if (line.end === null) return false
    return line.end.getTime() <= c.endDate.getTime()
  })

  if (covers.length === 0) {
    return {
      id: null,
      says:
        'The open order between these two firms does not cover this placement’s dates, ' +
        'so the award raises one rather than widening a commitment somebody signed.',
    }
  }

  // The most recent commitment that covers it.
  const best = covers.reduce((a, b) => (b.startDate.getTime() > a.startDate.getTime() ? b : a))
  return { id: best.id, says: 'Joins the order already open with this firm, as another line on it.' }
}

/**
 * The window a new header covers.
 *
 * A month past the last day of the line, because an order that closes
 * the day the work does cannot carry the final invoice — the same
 * reasoning, and the same thirty days, as the seeded world.
 */
export function headerWindow(line: { start: Date; end: Date | null }): {
  startDate: Date
  endDate: Date | null
} {
  return {
    startDate: line.start,
    endDate: line.end ? new Date(line.end.getTime() + 30 * 86_400_000) : null,
  }
}

/**
 * Whether a line and the header it hangs on say the same thing.
 *
 * ── Why this is not a string comparison ──────────────────────────────
 *
 * The two rows do not share a vocabulary, which is its own evidence
 * that nothing ever reconciled them: a header says `CONTRACT_START` and
 * `TO_EARLIER` where a line says `CONTRACT` and `START`. Compared as
 * written, one answer reads as two. So both sides go through money's
 * one door (`lib/money/order-terms`), which translates each vocabulary
 * into the period engine's, and what is compared is the answer rather
 * than the spelling.
 *
 * ── Four fields, not six ─────────────────────────────────────────────
 *
 * Ratified 2026-09-19, after money audited the seeded world. The
 * **rhythm and the net days are the document's** — how often a deal is
 * billed and how many days there are to pay are properties of the paper
 * two firms signed, and one order billed two ways is incoherent. The
 * **dates are the line's**, because a line is a person and a header is
 * not: one header for a five-person project runs the length of the
 * project and the third person on it starts in March. Twenty-nine
 * seeded lines end a month to a year before their order, deliberately,
 * so the order can carry the final invoice.
 *
 * So a line running outside its order's window is not a disagreement —
 * it is a separate fact, reported beside the answer, because cutting a
 * running placement short because its paper expired is a decision for a
 * person.
 *
 * Returns the disagreements in plain English. Empty means they agree.
 */
export interface LineAgreement {
  /** Where the document and the line's own copy give different answers. */
  differences: string[]
  /** The line starts before its order, or runs past the end of it. */
  outsideOrderWindow: boolean
  /** Header values the money engine cannot read, named rather than guessed. */
  unreadable: string[]
}

export function lineAgreesWithHeader(
  side: OrderSide,
  header: OrderHeader | null,
  line: Omit<OrderLine, 'workOrder'>
): LineAgreement {
  const withHeader = termsFor(side, { ...line, workOrder: header })
  const lineAlone = termsFor(side, { ...line, workOrder: null })

  const differences: string[] = []
  if (withHeader.frequency !== lineAlone.frequency) {
    differences.push(`the order bills ${withHeader.frequency} and the line says ${lineAlone.frequency}`)
  }
  if (withHeader.anchor !== lineAlone.anchor) {
    differences.push(`the order is anchored ${withHeader.anchor} and the line says ${lineAlone.anchor}`)
  }
  if (withHeader.straddle !== lineAlone.straddle) {
    differences.push(
      `the order splits a straddling period ${withHeader.straddle} and the line says ${lineAlone.straddle}`
    )
  }
  if (withHeader.paymentTermsDays !== lineAlone.paymentTermsDays) {
    differences.push(
      `the order is net ${withHeader.paymentTermsDays} and the line is net ${lineAlone.paymentTermsDays}`
    )
  }

  return {
    differences,
    outsideOrderWindow: withHeader.outsideOrderWindow,
    unreadable: withHeader.unreadable,
  }
}

// ── The one road to PLACED ─────────────────────────────────────────────
//
// A placement is a contract, an order and the dates behind them, written
// in one transaction by `POST /api/submissions/[id]/award`. It used to
// have a second road: `PATCH /api/submissions/[id]/status` would flip a
// submission to PLACED as a bare word, writing nothing behind it, and the
// Submissions list then offered "→ Contract" on the row as a separate
// step. A tester walking from an interview offer took the second road
// every time and got a PLACED candidate with no contract, no timesheet
// and no invoice — the whole work-and-pay half of the product
// unreachable from the way people actually hire.
//
// So PLACED is written by the award and by nothing else, and every screen
// that offers "Place" asks this function first, with the same facts the
// route reads, so a button is never offered that the route would refuse.

/**
 * Where a candidate may be awarded from: still in the running.
 *
 * Straight from SUBMITTED is allowed on purpose — a client may hire
 * without an interview, and the requisition page always let it.
 * `INTERVIEWING` is the spelling the volume seed writes where the routes
 * write `INTERVIEW`; both mean somebody being interviewed.
 */
export const AWARDABLE_FROM: readonly string[] = [
  'SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'INTERVIEWING', 'OFFERED',
]

export interface AwardDoorFacts {
  /** The company the caller is acting for. */
  callerCompanyId: string | null
  callerCompanyName: string | null
  /** Holds `requirements.write` — the hiring desk. */
  mayHire: boolean
  /** The company that raised the requisition. */
  requirementCompanyId: string
  /** The firm that put the person forward. */
  fromCompanyId: string
  fromCompanyName: string
  /** The firm the person was put forward to — who pays. */
  toCompanyId: string
  toCompanyName: string
  personName: string
  status: string
  /** A contract already written for this person on this job request. */
  contractId: string | null
}

export type AwardDoor =
  | { open: true; says: string }
  | {
      open: false
      code: 'OWN_CANDIDATE' | 'NOT_THE_BUYER' | 'NOT_HIRING' | 'ALREADY_AWARDED' | 'NOT_IN_THE_RUNNING'
      httpStatus: 403 | 409
      says: string
      contractId?: string
    }

/** Why somebody is out of the running, in the words a hiring manager uses. */
const OUT_BECAUSE: Record<string, string> = {
  REJECTED: 'was turned down',
  WITHDRAWN: 'was withdrawn',
  NOT_SELECTED: 'was stood down when the job was filled',
}

/**
 * Whether this caller may award this submission, and the sentence either
 * way. The route refuses on exactly these answers and the lists offer
 * "Place" on exactly these answers.
 */
export function awardDoor(f: AwardDoorFacts): AwardDoor {
  // Neutrality before anything else. A supplier handing its own candidate
  // the job is the supplier awarding itself the role.
  if (f.callerCompanyId !== null && f.callerCompanyId === f.fromCompanyId) {
    return {
      open: false,
      code: 'OWN_CANDIDATE',
      httpStatus: 403,
      says: `A supplier never awards its own candidate. ${f.toCompanyName} decides whether ${f.personName} is placed.`,
    }
  }

  if (f.callerCompanyId === null ||
      (f.callerCompanyId !== f.requirementCompanyId && f.callerCompanyId !== f.toCompanyId)) {
    return {
      open: false,
      code: 'NOT_THE_BUYER',
      httpStatus: 403,
      says: `Only ${f.toCompanyName}, who ${f.personName} was put forward to, can award this position.`,
    }
  }

  if (!f.mayHire) {
    return {
      open: false,
      code: 'NOT_HIRING',
      httpStatus: 403,
      says:
        `Awarding a position is for whoever is hiring at ${f.callerCompanyName ?? 'your company'} — ` +
        `a hiring or program manager. Ask them to award ${f.personName}.`,
    }
  }

  if (f.contractId) {
    return {
      open: false,
      code: 'ALREADY_AWARDED',
      httpStatus: 409,
      says: `${f.personName} already holds a position on this job request`,
      contractId: f.contractId,
    }
  }

  // PLACED with no contract behind it is what the old status flip left
  // behind. The award is how it is repaired, so it stays open here.
  if (!AWARDABLE_FROM.includes(f.status) && f.status !== 'PLACED') {
    const why = OUT_BECAUSE[f.status] ?? `is ${f.status.toLowerCase().replace(/_/g, ' ')}`
    return {
      open: false,
      code: 'NOT_IN_THE_RUNNING',
      httpStatus: 409,
      says: `${f.personName} ${why}, so there is no position to award them.`,
    }
  }

  return {
    open: true,
    says: `Place ${f.personName}: this writes the contract, the order and the billing dates in one step.`,
  }
}

/**
 * The refusal a bare status change to PLACED gets. The buyer is pointed at
 * the button; the supplier is told who presses it.
 */
export function placeByAward(personName: string, byBuyer: boolean, buyerName: string): string {
  return byBuyer
    ? `${personName} is placed by awarding the position, which writes the contract, the order and the billing dates in the same step. Press Place on their row.`
    : `${personName} is placed when ${buyerName} awards the position, which writes the contract and its billing dates in the same step.`
}

/**
 * What the person placed reads.
 *
 * The award told the requisition raiser and the supplier's desks
 * (`lib/papering`) and never the one person the whole thing was about.
 * Neutral on purpose, and no rate: what the person is paid is their
 * employer's conversation with them, and a rate here would be the client's
 * bill rate or a rung's, neither of which is theirs.
 *
 * `supplierName` is the firm nearest the person — the one holding their
 * consent or their payroll, at the bottom of a chain — because that is the
 * firm that will actually call them. They already know every firm above it:
 * each rung told them when it put them forward.
 */
export function tellPlaced(i: { siteName: string; supplierName: string; roleTitle: string }): {
  title: string
  body: string
} {
  return {
    title: `You are placed at ${i.siteName}`,
    body:
      `You are placed at ${i.siteName} through ${i.supplierName}, for ${i.roleTitle}. ` +
      `${i.supplierName} will be in touch about your start date.`,
  }
}

/**
 * Whether this award is the one that tells the person.
 *
 * Only the top of a chain. A prime can settle with its sub-vendor before
 * the client has decided — the award of the rung below — and telling the
 * person "you are placed" then would announce a placement the client has
 * not made. The rung that nobody sent any further is the client's decision.
 */
export function awardTellsThePerson(f: { sentOnward: boolean }): boolean {
  return !f.sentOnward
}
