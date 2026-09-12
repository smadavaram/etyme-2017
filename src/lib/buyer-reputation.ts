/**
 * What a supplier wants to know about a buyer, and nobody publishes.
 *
 * A staffing firm deciding whether to work a client's requisition is asking
 * three questions, in this order:
 *
 *   Will they actually decide, or will my candidate sit for six weeks?
 *   Will they pay me, and when?
 *   How many other firms am I competing with for this?
 *
 * Every VMS on the market publishes the opposite — supplier scorecards,
 * fill rates, submission quality — because the VMS is bought by the buyer.
 * Nobody scores the buyer, and the buyer's behaviour is the single largest
 * cost a small supplier carries.
 *
 * So this is the buyer's side of the same transparency the BRD demands of
 * suppliers. It is computed from what actually happened, never from a
 * survey, and it is shown to the buyer first — a number somebody can see
 * about themselves before it is published is a number they can act on.
 *
 * Two rules, because a reputation number that is wrong is worse than none:
 *
 * **Never publish a number built on almost nothing.** Three submissions is
 * not a decision speed, it is an anecdote, and dressing it up as a metric
 * invites a supplier to plan around noise.
 *
 * **Say what the number does not know.** A median that ignores the
 * still-waiting cases flatters whoever is slowest.
 */

export interface Decided {
  /** When the candidate was put forward. */
  submittedAt: Date
  /** When the buyer said yes or no. Null while they still have not. */
  decidedAt: Date | null
}

export interface InvoiceRecord {
  dueAt: Date
  paidAt: Date | null
  /** So an unpaid recent invoice is not counted as late before it is. */
  amountCents: number
}

export interface ReputationInput {
  submissions: Decided[]
  invoices: InvoiceRecord[]
  /** Distinct suppliers with a live contract. */
  supplierCount: number
  openPositions: number
  /** Median months people stay, across all suppliers. */
  medianTenureMonths: number | null
}

export type Confidence = 'ENOUGH' | 'THIN' | 'NONE'

export interface Measure {
  /** Null when there is not enough to say anything honest. */
  value: number | null
  /** How much it rests on. */
  basis: number
  confidence: Confidence
  /** The number said in words, or why there is no number. */
  said: string
  /** What this measure cannot see. */
  unknown: string | null
}

/**
 * Below this, a number is an anecdote wearing a metric's clothes.
 *
 * Nothing under ENOUGH is ever published. THIN exists so the company's own
 * screen can say "four so far, eight before this goes on your page" —
 * useful to them, and never shown to anybody making a decision on it.
 */
const ENOUGH = 8
const THIN = 3

function confidenceOf(n: number): Confidence {
  if (n >= ENOUGH) return 'ENOUGH'
  if (n >= THIN) return 'THIN'
  return 'NONE'
}

/** A published number needs the full basis, not merely some. */
function publishable(c: Confidence): boolean {
  return c === 'ENOUGH'
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = xs.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

const DAY = 86_400_000

/**
 * How long they take to decide.
 *
 * The number a supplier cares about most, because a candidate waiting on a
 * decision is a candidate being placed somewhere else.
 *
 * Counted only on decisions actually made — but the ones still waiting are
 * reported alongside, because a buyer who decides quickly on four and has
 * left eleven hanging is not a fast buyer.
 */
export function decisionSpeed(submissions: Decided[], now: Date): Measure {
  const decided = submissions.filter((s) => s.decidedAt !== null)
  const waiting = submissions.filter((s) => s.decidedAt === null)

  const days = decided.map((s) =>
    Math.max(0, Math.round((s.decidedAt!.getTime() - s.submittedAt.getTime()) / DAY))
  )
  const m = median(days)
  const confidence = confidenceOf(decided.length)

  const stillWaiting = waiting.filter(
    (s) => (now.getTime() - s.submittedAt.getTime()) / DAY > 14
  ).length

  if (!publishable(confidence) || m === null) {
    return {
      value: null,
      basis: decided.length,
      confidence,
      said: decided.length === 0
        ? 'No decisions yet.'
        : `Only ${decided.length} decision${decided.length === 1 ? '' : 's'} so far — too few to be worth a number. ${ENOUGH} before this is published.`,
      unknown: null,
    }
  }

  return {
    value: m,
    basis: decided.length,
    confidence,
    said: m === 0 ? 'Usually same day.' : `Usually ${m} day${m === 1 ? '' : 's'}.`,
    // The flattering omission, named.
    unknown: stillWaiting > 0
      ? `${stillWaiting} candidate${stillWaiting === 1 ? ' has' : 's have'} been waiting over a fortnight with no answer. Those are not in this number.`
      : null,
  }
}

/**
 * Whether they pay on time.
 *
 * The other question, and the one that decides whether a small supplier can
 * afford to work with them at all. Paying sixty days late is a loan the
 * supplier did not agree to make.
 */
export function paymentBehaviour(invoices: InvoiceRecord[], now: Date): Measure {
  // An invoice not yet due is not late. Counting it would make anybody
  // who invoiced last week look like a bad payer.
  const due = invoices.filter((i) => i.dueAt.getTime() <= now.getTime() || i.paidAt !== null)
  const confidence = confidenceOf(due.length)

  if (!publishable(confidence)) {
    return {
      value: null,
      basis: due.length,
      confidence,
      said: due.length === 0
        ? 'Nothing has come due yet.'
        : `Only ${due.length} invoice${due.length === 1 ? '' : 's'} so far — ${ENOUGH} before this is published.`,
      unknown: null,
    }
  }

  const lateness = due.map((i) => {
    const settled = i.paidAt ?? now
    return Math.round((settled.getTime() - i.dueAt.getTime()) / DAY)
  })

  const m = median(lateness) ?? 0
  const unpaidPastDue = due.filter((i) => i.paidAt === null).length

  return {
    value: m,
    basis: due.length,
    confidence,
    said:
      m <= 0
        ? m === 0 ? 'Pays on the due date.' : `Pays ${Math.abs(m)} day${Math.abs(m) === 1 ? '' : 's'} early.`
        : `Pays ${m} day${m === 1 ? '' : 's'} late.`,
    unknown: unpaidPastDue > 0
      ? `${unpaidPastDue} invoice${unpaidPastDue === 1 ? ' is' : 's are'} past due and still unpaid, counted as late-so-far rather than settled.`
      : null,
  }
}

export interface BuyerReputation {
  openPositions: number
  suppliers: number
  decisionSpeed: Measure
  payment: Measure
  tenure: Measure
  /** One line for a supplier deciding whether to bother. */
  worthIt: string
}

export function reputationOf(input: ReputationInput, now: Date): BuyerReputation {
  const speed = decisionSpeed(input.submissions, now)
  const pay = paymentBehaviour(input.invoices, now)

  const tenure: Measure = input.medianTenureMonths === null
    ? { value: null, basis: 0, confidence: 'NONE', said: 'Nobody has finished an engagement yet.', unknown: null }
    : {
        value: input.medianTenureMonths,
        basis: 1,
        confidence: 'ENOUGH',
        said: `People stay about ${input.medianTenureMonths} month${input.medianTenureMonths === 1 ? '' : 's'}.`,
        unknown: null,
      }

  return {
    openPositions: input.openPositions,
    suppliers: input.supplierCount,
    decisionSpeed: speed,
    payment: pay,
    tenure,
    worthIt: worthIt(input, speed, pay),
  }
}

/**
 * The sentence a supplier reads first.
 *
 * Written to be useful rather than flattering. A buyer who is slow and pays
 * late should read as slow and paying late, because the alternative is a
 * supplier finding out over three months and never coming back.
 */
function worthIt(input: ReputationInput, speed: Measure, pay: Measure): string {
  if (input.openPositions === 0) {
    return 'Nothing open to suppliers right now.'
  }

  const bits: string[] = [
    `${input.openPositions} position${input.openPositions === 1 ? '' : 's'} open to any supplier`,
  ]

  if (input.supplierCount > 0) {
    bits.push(`${input.supplierCount} supplier${input.supplierCount === 1 ? '' : 's'} already working with them`)
  }

  const tail: string[] = []
  if (speed.value !== null) tail.push(speed.said.toLowerCase().replace(/\.$/, ''))
  if (pay.value !== null) tail.push(pay.said.toLowerCase().replace(/\.$/, ''))

  return tail.length > 0
    ? `${bits.join(', ')}. ${tail.join(', ')}.`
    : `${bits.join(', ')}. Too new to say how they decide or pay.`
}
