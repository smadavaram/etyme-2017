/**
 * Hop 0: the terms between the person and the first firm.
 *
 * ── What went wrong ──────────────────────────────────────────────────
 *
 * The outside chain audit of 2026-10-05, section 6. Marisol Quintero
 * granted Brightmoor a bench listing, which is permission to market her.
 * Northbend awarded her, and the award wrote "Brightmoor Staffing employs
 * Marisol directly": W2, at $0 an hour. She was never asked, and nobody
 * at Brightmoor said what it would pay her either.
 *
 * Two mistakes in one row. A listing is consent to be marketed, never
 * consent to be employed, and the employment is the consent only where
 * the firm already employs the person (an EMPLOYEE context — CLAUDE.md,
 * "Who sells and who buys"). And a rate nobody stated is a missing rate,
 * not a free placement.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * A chain is a list of hops; hop 0 is the person and the first firm.
 * Every hop above it takes its rate from the submission that went up it,
 * because that rate is what the seller asked and the buyer accepted by
 * placing. Hop 0 has no such submission: nothing anybody typed into the
 * chain says what the first firm pays the person. So the award writes no
 * hop 0 at all unless its terms are already on record, and the placement
 * reads "Awarded, terms pending" until they are.
 *
 * Terms are on record when the first firm has stated them — an
 * engagement type and a pay rate above nothing — and the person has
 * agreed them on their own page. An employee is told, not asked: where
 * the firm holds an EMPLOYEE context, the firm's word is enough.
 *
 * ── Where the agreement is kept ──────────────────────────────────────
 *
 * On the paper it is: a "Terms of engagement" `DocInstance` on the hop 0
 * buy line, countersigned by the firm and signed by the person. That
 * model gained both signatures on 2026-09-21 precisely for "an employment
 * agreement" hanging off a line. The values themselves are on the line —
 * the contract type on `BuyContract`, the rate on its candidate row — so
 * the paper holds who agreed and when, and the line holds what.
 *
 * No database in this file. The route reads, this decides.
 */

/** The name of the paper both sides sign. One per firm, found or made. */
export const TERMS_PAPER = 'Terms of engagement'

/**
 * The four ways a person can stand at hop 0. The founder's list, from the
 * audit: an employee, an independent, their own company, or somebody
 * else's employee.
 */
export type EngagementType = 'W2' | 'IND_1099' | 'OWN_COMPANY' | 'OTHER_EMPLOYER'

export const ENGAGEMENT_TYPES: readonly EngagementType[] = ['W2', 'IND_1099', 'OWN_COMPANY', 'OTHER_EMPLOYER']

/** What a person reads beside each choice. Plain words, never the code. */
export const ENGAGEMENT_WORDS: Record<EngagementType, string> = {
  W2: 'Employee of the firm (W2)',
  IND_1099: 'Independent contractor (1099)',
  OWN_COMPANY: 'Through their own company',
  OTHER_EMPLOYER: 'Employed by another firm',
}

/** Minor units to "$90/hr". Never prints a zero as a price. */
export function perHour(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}/hr`
}

// ── The firm states the terms ─────────────────────────────────────────

export interface StatedTerms {
  engagementType: string | null | undefined
  payRateCents: number | null | undefined
  personName: string
  firmName: string
  /** The person's own company, where they have one on record. */
  ownCompany: { id: string; name: string } | null
}

export type StatedVerdict =
  | {
      ok: true
      engagementType: EngagementType
      /** What `BuyContract.contractType` is written as. */
      contractType: 'W2' | 'IND_1099' | 'C2C'
      /** Null where the firm pays the person; their own company where it pays that. */
      vendorCompanyId: string | null
      payRateCents: number
      says: string
    }
  | { ok: false; code: 'NO_TYPE' | 'NO_RATE' | 'NO_OWN_COMPANY' | 'THROUGH_THE_EMPLOYER'; says: string }

/**
 * Whether what the firm typed can be written as hop 0.
 *
 * No zero defaults: an empty or zero rate is refused in the words the
 * placement page already uses for it. And "employed by another firm" is
 * refused with the road that works — that firm puts them forward itself,
 * and the chain then carries it as the hop it is, with its own consent —
 * rather than a buy line to a firm that has agreed nothing.
 */
export function checkStatedTerms(t: StatedTerms): StatedVerdict {
  const type = String(t.engagementType ?? '').toUpperCase() as EngagementType
  if (!ENGAGEMENT_TYPES.includes(type)) {
    return {
      ok: false,
      code: 'NO_TYPE',
      says: `Say how ${t.firmName} engages ${t.personName}: as an employee, as an independent contractor, or through their own company.`,
    }
  }
  if (type === 'OTHER_EMPLOYER') {
    return {
      ok: false,
      code: 'THROUGH_THE_EMPLOYER',
      says:
        `${t.personName}'s employer has to agree this, so it cannot be written from here. ` +
        `Ask the employer to put ${t.personName} forward to ${t.firmName}; the chain then carries them as its own hop.`,
    }
  }
  const rate = typeof t.payRateCents === 'number' && Number.isFinite(t.payRateCents) ? Math.round(t.payRateCents) : 0
  if (rate <= 0) {
    return {
      ok: false,
      code: 'NO_RATE',
      says: `Say what ${t.firmName} pays ${t.personName}. An empty rate is a missing rate, not a free placement.`,
    }
  }
  if (type === 'OWN_COMPANY') {
    if (!t.ownCompany) {
      return {
        ok: false,
        code: 'NO_OWN_COMPANY',
        says: `${t.personName} has no company of their own on record. Pay them as an employee or an independent, or ask them to add their company first.`,
      }
    }
    return {
      ok: true,
      engagementType: type,
      contractType: 'C2C',
      vendorCompanyId: t.ownCompany.id,
      payRateCents: rate,
      says: `${t.firmName} pays ${t.ownCompany.name}, ${t.personName}'s own company, ${perHour(rate)}.`,
    }
  }
  return {
    ok: true,
    engagementType: type,
    contractType: type,
    vendorCompanyId: null,
    payRateCents: rate,
    says:
      type === 'W2'
        ? `${t.firmName} employs ${t.personName} at ${perHour(rate)}.`
        : `${t.firmName} pays ${t.personName} ${perHour(rate)} as an independent contractor.`,
  }
}

/** Which of the four a written line is, read back. */
export function engagementOf(line: {
  contractType: string
  vendorCompanyId: string | null
  ownCompanyId: string | null
}): EngagementType | null {
  if (line.contractType === 'W2') return 'W2'
  if (line.contractType === 'IND_1099') return 'IND_1099'
  if (line.contractType === 'C2C' && line.vendorCompanyId && line.vendorCompanyId === line.ownCompanyId) return 'OWN_COMPANY'
  return null
}

// ── Whether hop 0 is on record ────────────────────────────────────────

/** Hop 0 as the database has it, for one placement. */
export interface HopZeroFacts {
  personName: string
  firmName: string
  /**
   * Null where no hop 0 line exists — the award wrote none because no
   * terms were on record, or a firm further down has not been settled.
   */
  line: { payRateCents: number | null } | null
  /** Where the chain stopped before reaching the person, the firm it stopped at. */
  stoppedAbove?: string | null
  /** The terms paper on the line, where one was written. */
  paper: { firmSignedAt: Date | null; personSignedAt: Date | null } | null
  /** The firm holds a live EMPLOYEE context for the person. */
  employedByFirm: boolean
}

export type Pending = 'BELOW' | 'NO_LINE' | 'NO_RATE' | 'FIRM' | 'PERSON'

export interface HopZero {
  onRecord: boolean
  pending: Pending | null
  /** What is missing and who does it, in a sentence. */
  says: string
  /** Whose move it is. */
  waitingOn: 'FIRM' | 'PERSON' | 'BELOW' | null
}

/**
 * Whether the person's own terms are on record, and if not, whose move
 * it is.
 *
 * A line with no paper on it was written by a desk directly — recorded
 * by the contract desk, or by a seed — rather than by the award, and the
 * award is the door this rule closes. It is on record if it carries a
 * rate. Every line the award writes from now on carries the paper.
 */
export function hopZero(f: HopZeroFacts): HopZero {
  if (f.stoppedAbove) {
    return {
      onRecord: false,
      pending: 'BELOW',
      waitingOn: 'BELOW',
      says: `${f.stoppedAbove} has not placed ${f.personName} with the firm below it yet.`,
    }
  }
  if (!f.line) {
    return {
      onRecord: false,
      pending: 'NO_LINE',
      waitingOn: 'FIRM',
      says: `${f.firmName} has not said how it engages ${f.personName} or what it pays them.`,
    }
  }
  if (!(f.line.payRateCents != null && f.line.payRateCents > 0)) {
    return {
      onRecord: false,
      pending: 'NO_RATE',
      waitingOn: 'FIRM',
      says: `${f.firmName} has not said what it pays ${f.personName}. That is a missing rate, not a free placement.`,
    }
  }
  if (f.paper) {
    if (!f.paper.firmSignedAt) {
      return {
        onRecord: false,
        pending: 'FIRM',
        waitingOn: 'FIRM',
        says: `${f.firmName} has not confirmed the terms with ${f.personName}.`,
      }
    }
    if (!f.paper.personSignedAt && !f.employedByFirm) {
      return {
        onRecord: false,
        pending: 'PERSON',
        waitingOn: 'PERSON',
        says: `${f.personName} has not agreed the terms ${f.firmName} offered yet.`,
      }
    }
  }
  return { onRecord: true, pending: null, waitingOn: null, says: `${f.personName}'s terms with ${f.firmName} are agreed.` }
}

// ── The start date ────────────────────────────────────────────────────

/** YYYY-MM-DD in UTC — a calendar day, the way a contract states one. */
export function calendarDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export interface StartFacts {
  /** What the awarder typed, if anything. */
  typed: Date | null
  /** The day the job request said it was needed by, if it did. */
  neededBy: Date | null
  /** The moment of the award. */
  now: Date
  /** The awarder ticked "this work is already under way". */
  underWay: boolean
  /** Why, in their words. Required with the tick. */
  reason: string | null | undefined
}

export type StartVerdict =
  | { ok: true; start: Date; underWay: { reason: string } | null }
  | { ok: false; code: 'START_BEFORE_AWARD' | 'NO_REASON' | 'BAD_DATE'; says: string }

/**
 * The day the placement starts.
 *
 * A start before the award is refused unless the person awarding says
 * the work is already under way, and why — the case is real (a client
 * papering somebody who began on a handshake), and refusing it outright
 * would send it round the product. Without the tick it is a typing
 * mistake, and dates generated from it land in the past.
 *
 * Nobody typed a date: the day the job request needed somebody by, or
 * today where that day has gone. A default never lands before the award.
 */
export function startOf(f: StartFacts): StartVerdict {
  const today = calendarDay(f.now)
  if (f.typed) {
    if (Number.isNaN(f.typed.getTime())) {
      return { ok: false, code: 'BAD_DATE', says: 'That start date is not a date.' }
    }
    if (calendarDay(f.typed) < today) {
      if (!f.underWay) {
        return {
          ok: false,
          code: 'START_BEFORE_AWARD',
          says:
            `A start date of ${plainDay(f.typed)} is before today. ` +
            'Pick today or later, or tick "the work is already under way" and say why.',
        }
      }
      const why = (f.reason ?? '').trim()
      if (why.length === 0) {
        return {
          ok: false,
          code: 'NO_REASON',
          says: 'Say why the work started before the award — it is kept with the placement.',
        }
      }
      return { ok: true, start: f.typed, underWay: { reason: why } }
    }
    return { ok: true, start: f.typed, underWay: null }
  }
  if (f.neededBy && calendarDay(f.neededBy) >= today) return { ok: true, start: f.neededBy, underWay: null }
  return { ok: true, start: new Date(`${today}T00:00:00.000Z`), underWay: null }
}

/**
 * The floor under every date a placement generates: the day before
 * `now`, so a period that ended before today writes no reminder.
 *
 * Passed to the cycle writer as `onlyPeriodsAfter`. A start the awarder
 * marked as already under way still begins in the past — that is the
 * truth about the work — but a reminder about a day already gone is
 * overdue the moment it is written, and nobody can act on it (audit,
 * 2026-10-05: "reminders generate from activation, never for dates
 * already past").
 */
export function noDatesBefore(now: Date): Date {
  const today = new Date(`${calendarDay(now)}T00:00:00.000Z`)
  return new Date(today.getTime() - 24 * 60 * 60 * 1000)
}

function plainDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// ── What the award may set ────────────────────────────────────────────

/**
 * The award refuses a pay rate typed by the buyer.
 *
 * Whoever awards is the buyer, and what the seller pays below it — its
 * own employee, or its own supplier — is the seller's agreement, never
 * the buyer's to type. The field used to be accepted and written as the
 * seller's cost, which is how a client could set what a supplier pays
 * its W2.
 */
export function payRateIsNotTheBuyers(i: { sellerName: string; personName: string }): string {
  return (
    `What ${i.sellerName} pays for ${i.personName} is agreed between ${i.sellerName} and whoever it pays, ` +
    'not set at the award. Place them at the bill rate; the pay is confirmed on the placement’s terms page.'
  )
}
