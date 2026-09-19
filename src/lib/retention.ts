/**
 * How long a record is kept, why, and what the nightly sweep does about
 * it. No database in this file.
 *
 * ── Why the schedule is code and not a company setting ───────────────
 *
 * `prisma/schema.prisma` says it plainly beside the models: a retention
 * period is worse than a cycle date as a knob, because a client who sets
 * it wrong deletes something that is gone. CLAUDE.md's rule is default
 * aggressively, configure rarely. A company that genuinely needs longer
 * places a `LegalHold`, which is a decision with a reason and a name on
 * it rather than a number in a settings page.
 *
 * ── Where a period is not known, this returns null ───────────────────
 *
 * CLAUDE.md: "Where the data does not support a figure, return null and
 * say why. A plausible wrong number is worse than a blank, because
 * nobody audits good news." A retention period invented by an engineer
 * is the same class of error as an invented rate, except that acting on
 * it deletes a record. So `months` is null on every line where no
 * citable federal minimum exists, `basis` says so in words, and
 * `verdictFor` returns no date rather than a date nobody can defend.
 *
 * Every period below is a **federal United States minimum with its rule
 * cited**. State law is longer in places and no line here claims
 * otherwise: where a state may ask for more, the basis says so, and the
 * jurisdictional answer is counsel's (`COUNSEL_QUESTIONS['retention']`
 * in `lib/legal`).
 *
 * ── The four fates come from the schema, not from here ───────────────
 *
 * `Person.erasedAt`'s doc comment maps every `HELD` category in
 * `lib/legal` to one of four fates — kept anonymized, kept in full, kept
 * until a statutory period runs and then deleted, deleted. This file is
 * that map with the periods filled in, and `lib/erasure` reads it rather
 * than deciding again.
 *
 * Owned by etyme-regulatory (`lib/retention` in `lib/domains.ts`).
 */

import { HELD } from '@/lib/legal'

// ── The regimes, and how long each gives ──────────────────────────────

/**
 * Which law's clock is running on a request.
 *
 * `UNKNOWN` is the common case and is not a failure: nobody asks a
 * consultant which statute they are exercising, and guessing from an
 * email domain would be a legal conclusion drawn from a mail server.
 */
export type Regime = 'GDPR' | 'CCPA' | 'UNKNOWN'

export type RequestKind = 'EXPORT' | 'ERASURE'

/** How long somebody has to change their mind before an erasure runs. */
export const COOLING_DAYS = 14

const DAY = 86_400_000

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY)
}

/**
 * One calendar month, the way the GDPR counts one — the same day number
 * in the next month, and the last day of that month where there is no
 * such day. A request received on 31 January is due on 28 February.
 */
export function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastOfMonth))
  return d
}

/** The day an erasure may run, and nothing happens before it. */
export function coolingEndsAt(receivedAt: Date): Date {
  return addDays(receivedAt, COOLING_DAYS)
}

export interface Due {
  dueAt: Date
  /** Why that day, in a sentence a person can read. Never a code. */
  dueBasis: string
}

/**
 * When an answer is owed.
 *
 * The clock counts from `receivedAt` and not from the row being written:
 * a request emailed on Friday and logged on Monday is three days old,
 * and pretending otherwise is how a deadline is missed. That is the
 * schema's own reasoning and this is the arithmetic behind it.
 */
export function dueDateFor(kind: RequestKind, receivedAt: Date, regime: Regime): Due {
  let dueAt: Date
  let basis: string

  if (regime === 'GDPR') {
    dueAt = addCalendarMonths(receivedAt, 1)
    basis =
      'One calendar month from the day the request arrived, which is what the GDPR ' +
      'allows. It can be extended by two further months where a request is complex, ' +
      'and the extension has to be told to the person inside the first month.'
  } else if (regime === 'CCPA') {
    dueAt = addDays(receivedAt, 45)
    basis =
      'Forty-five days from the day the request arrived, which is what the California ' +
      'Consumer Privacy Act allows. It can be extended once by a further forty-five ' +
      'days, and the extension has to be told to the person.'
  } else {
    // The earliest day any regime above would allow, computed rather than
    // typed. A flat "thirty days" reads as the safe answer and is not: a
    // request received on 31 January is due on 28 February under the GDPR,
    // which is two days sooner than thirty. A conservative default that is
    // only usually conservative is the worst of the three options.
    const candidates = [
      dueDateFor(kind === 'ERASURE' ? 'EXPORT' : kind, receivedAt, 'GDPR').dueAt,
      dueDateFor(kind === 'ERASURE' ? 'EXPORT' : kind, receivedAt, 'CCPA').dueAt,
    ]
    dueAt = candidates.reduce((a, b) => (a < b ? a : b))
    basis =
      'Nobody has recorded which law applies to this person, so the earliest day any of ' +
      'them would allow is used — one calendar month or forty-five days from the day the ' +
      'request arrived, whichever falls first. That is a conservative date rather than a ' +
      'correct one, and answering by it answers under every regime this product has been ' +
      'asked about.'
  }

  if (kind === 'ERASURE') {
    basis +=
      ` Nothing is erased for ${COOLING_DAYS} days after the request, so the person can ` +
      'change their mind; it runs on the day the cooling period ends, and the link to ' +
      'withdraw it is in the letter they were sent.'
  }

  return { dueAt, dueBasis: basis }
}

// ── The schedule, one line per category the privacy notice names ──────

/**
 * What happens to a category, said as the schema's own four fates.
 *
 *   KEPT_ANONYMIZED   the row survives and stops naming anybody
 *   KEPT_IN_FULL      the row survives whole, ids and all
 *   HELD_THEN_DELETED a statutory minimum runs first, then it goes
 *   DELETED           it goes, and nothing waits for it
 */
export type Fate = 'KEPT_ANONYMIZED' | 'KEPT_IN_FULL' | 'HELD_THEN_DELETED' | 'DELETED'

/** What a period is counted from. */
export type Anchor =
  /** The day the person was hired by whoever holds the record. */
  | 'HIRE'
  /** The day that employment ended. */
  | 'EMPLOYMENT_END'
  /** The later of three years after hire and one year after it ended. */
  | 'I9'
  /** The day the last money moved on this person. */
  | 'LAST_PAID'
  /** The last day of the work the record is about. */
  | 'LAST_WORKED'
  /** No period at all — it is kept, or it goes now. */
  | 'NONE'

export interface ScheduleLine {
  /** Exactly as `HELD` in `lib/legal` names it. */
  category: string
  fate: Fate
  anchor: Anchor
  /**
   * Months after the anchor, or **null where no federal minimum can be
   * cited**. Null on a `HELD_THEN_DELETED` line means nobody may delete
   * it on a schedule yet, and the verdict says so instead of offering a
   * date.
   */
  months: number | null
  /** The rule, cited, and where a state may ask for longer, that too. */
  basis: string
}

export const SCHEDULE: ScheduleLine[] = [
  {
    category: 'Identity and sign-in',
    fate: 'DELETED',
    anchor: 'NONE',
    months: 0,
    basis:
      'No statute requires a name and a sign-in method to be kept. A live way into the ' +
      'product for somebody who asked to be forgotten is the one survivor that cannot ' +
      'be defended, so sign-in records go first and the name becomes a tombstone.',
  },
  {
    category: 'A consultant own profile',
    fate: 'DELETED',
    anchor: 'NONE',
    months: 0,
    basis:
      'A profile is the person own marketing of themselves. Nobody is required to keep ' +
      'it and no counterparty book depends on it.',
  },
  {
    category: 'Resumes',
    fate: 'DELETED',
    anchor: 'NONE',
    months: 0,
    basis:
      'A file the person uploaded, and the text read out of it. A copy already sent to ' +
      'a company is in that company own records and keeps its row with the bytes and ' +
      'the text cleared, because Etyme cannot unsend it.',
  },
  {
    category: 'Bars and preferences',
    fate: 'DELETED',
    anchor: 'NONE',
    months: 0,
    basis:
      'A star or a bar a company set against a name goes with the name. A bar on ' +
      'somebody nobody can name goes on refusing them forever, which is the worse ' +
      'outcome of the two.',
  },
  {
    category: 'Messages',
    fate: 'KEPT_ANONYMIZED',
    anchor: 'NONE',
    months: null,
    basis:
      'A message is the counterparty own record of a deal as much as the author own. ' +
      'The words stay; the author becomes the tombstone. No statute sets a period, so ' +
      'none is offered.',
  },
  {
    category: 'A seat at a company, and what was decided from it',
    fate: 'KEPT_ANONYMIZED',
    anchor: 'NONE',
    months: null,
    basis:
      'A decision is the company own record of a decision it made, and it keeps its date, ' +
      'its outcome and the reason in words while it stops naming anybody. Where one of ' +
      'these is itself a personnel record made in the course of a hiring action, the EEOC ' +
      'minimum applies to keeping it — one year at 29 CFR 1602.14, two for a federal ' +
      'contractor at 41 CFR 60-1.12 — and that is a floor on keeping rather than a day ' +
      'for deleting. For the seat itself, and for an approval or a signature on somebody ' +
      'else file, no federal minimum can be cited at all, so no period is stated and ' +
      'nothing is deleted on one. An approval with nobody behind it is worse for everybody ' +
      'than one nobody is named on, which is why the fate is a marker and never a delete.',
  },
  {
    category: 'Money about a person',
    fate: 'KEPT_ANONYMIZED',
    anchor: 'LAST_PAID',
    months: 48,
    basis:
      'Four years from the later of the employment tax becoming due and it being paid, ' +
      'which is the federal minimum at 26 CFR 31.6001-1. The Fair Labor Standards Act ' +
      'asks three years for payroll records at 29 CFR 516.5, so four is the longer of ' +
      'the two federal floors. A state may ask for longer and several do; the ' +
      'jurisdictional answer is counsel. Until the period runs, the amounts stay and ' +
      'stop naming anybody, because a paid invoice has to go on footing.',
  },
  {
    category: 'Time on site',
    fate: 'KEPT_ANONYMIZED',
    anchor: 'NONE',
    months: null,
    basis:
      'No statute sets a period for this. The days somebody stood on a client site are ' +
      'the client own record of its own exposure, kept for as long as the client is ' +
      'answerable for them, counted once per day and naming nobody after an erasure. ' +
      'Offering a deletion date here would be a number nobody can stand behind.',
  },
  {
    category: 'Checks somebody else ran',
    fate: 'HELD_THEN_DELETED',
    anchor: 'I9',
    months: null,
    basis:
      'The I-9 sets the floor and it is not a single period: three years after the date ' +
      'of hire, or one year after the employment ends, whichever is later, at 8 CFR ' +
      '274a.2(b)(2)(i)(A). A background check or a screening held as a personnel record ' +
      'runs on the EEOC minimum of one year at 29 CFR 1602.14, two years for a federal ' +
      'contractor at 41 CFR 60-1.12, and a state may ask for longer. The later of the ' +
      'two is used, so nothing is deleted while the I-9 floor still stands.',
  },
  {
    category: 'Onboarding paperwork',
    fate: 'HELD_THEN_DELETED',
    anchor: 'EMPLOYMENT_END',
    months: 12,
    basis:
      'One year from the personnel action, which is the EEOC minimum at 29 CFR 1602.14 ' +
      'for records made in the course of hiring somebody. Two years for a federal ' +
      'contractor at 41 CFR 60-1.12, and a state may ask for longer. Where a document ' +
      'in the pack is itself an I-9 or its evidence, that document runs on the I-9 ' +
      'floor and not this one.',
  },
  {
    category: 'Work authorization and immigration',
    fate: 'HELD_THEN_DELETED',
    anchor: 'EMPLOYMENT_END',
    months: null,
    basis:
      'No single federal minimum covers a petition file and this code will not invent ' +
      'one. What can be cited covers one part of it: the H-1B public access file runs ' +
      'one year beyond the end of the employment named in the labor condition ' +
      'application, or one year from the application being withdrawn, at 29 CFR ' +
      '655.760(c). The petition itself is the employer own file with the government, ' +
      'its period turns on the classification and on state law, and that is counsel ' +
      'answer. So nothing here is deleted on a schedule, and the reason is said rather ' +
      'than a plausible number being printed.',
  },
  {
    category: 'Positions taken about how somebody is engaged',
    fate: 'HELD_THEN_DELETED',
    anchor: 'LAST_PAID',
    months: 36,
    basis:
      'Three years from the last payroll record the position is a defense of, which is ' +
      'the Fair Labor Standards Act minimum for payroll records at 29 CFR 516.5. ' +
      'Whether somebody was an employee or a contractor, and whether they were exempt, ' +
      'is the employer own position and it has to be able to answer for it for as long ' +
      'as the pay records behind it are live. A state may ask for longer.',
  },
  {
    category: 'Logs',
    fate: 'KEPT_IN_FULL',
    anchor: 'NONE',
    months: null,
    basis:
      'Kept whole, ids and all, for as long as the records they are evidence about. ' +
      'After a tombstone the ids resolve to nobody. Deleting the trail of who read ' +
      'somebody record is the one deletion that hurts the person it was meant to ' +
      'protect, so no period is offered and none is wanted.',
  },
  {
    category: 'Company and supplier records',
    fate: 'KEPT_IN_FULL',
    anchor: 'NONE',
    months: null,
    basis:
      'A company own legal and trading records are the company, not a person. They are ' +
      'not erased by a person request and no statutory period here is Etyme to set.',
  },
  {
    category: 'Payment details',
    fate: 'KEPT_IN_FULL',
    anchor: 'NONE',
    months: null,
    basis:
      'A bank name, the name on the account and four digits, held against a company ' +
      'rather than against a person. Kept for as long as the company keeps them.',
  },
]

/** The line for a category, or null where nobody has classified it. */
export function scheduleFor(category: string): ScheduleLine | null {
  return SCHEDULE.find((s) => s.category === category) ?? null
}

/** Categories the privacy notice holds with no line here. Should be empty. */
export function unscheduledCategories(): string[] {
  return HELD.map((h) => h.category).filter((c) => !scheduleFor(c))
}

// ── What to do with one category, for one person, today ───────────────

export interface Facts {
  now: Date
  /** When the firm holding the record hired them. */
  hiredAt?: Date | null
  /** When that employment ended. Null means it has not. */
  employmentEndedAt?: Date | null
  /** The day the last money moved on this person. */
  lastPaidAt?: Date | null
  /** The last day of the work the record is about. */
  lastWorkedAt?: Date | null
  /** True where an unlifted legal hold names this subject. */
  underLegalHold?: boolean
  /**
   * The hold reason, in the holder own words. Shown to the person; the
   * matter reference never is.
   */
  holdReason?: string | null
  /** A federal contractor keeps personnel records for two years, not one. */
  federalContractor?: boolean
}

export type VerdictKind = 'KEEP' | 'ANONYMIZE' | 'DELETE' | 'HELD_UNTIL'

export interface Verdict {
  category: string
  verdict: VerdictKind
  /**
   * The day it may go, where one can be computed from the facts given.
   * **Null is a real answer** and means one of three things, all said in
   * `says`: it is kept and nothing deletes it; no federal minimum can be
   * cited; or the facts needed to count from are not known.
   */
  until: Date | null
  /** What happens, in a sentence somebody can read on a screen. */
  says: string
  /** The rule behind it, cited. */
  basis: string
}

function i9Until(f: Facts): Date | null {
  if (!f.hiredAt) return null
  const threeAfterHire = addCalendarMonths(f.hiredAt, 36)
  if (!f.employmentEndedAt) return null
  const oneAfterEnd = addCalendarMonths(f.employmentEndedAt, 12)
  return threeAfterHire > oneAfterEnd ? threeAfterHire : oneAfterEnd
}

function anchorDate(anchor: Anchor, f: Facts): Date | null {
  switch (anchor) {
    case 'HIRE': return f.hiredAt ?? null
    case 'EMPLOYMENT_END': return f.employmentEndedAt ?? null
    case 'LAST_PAID': return f.lastPaidAt ?? null
    case 'LAST_WORKED': return f.lastWorkedAt ?? null
    case 'I9': return null
    case 'NONE': return null
  }
}

/**
 * What happens to one category for one person, today.
 *
 * A legal hold beats every period below it. That is uncomfortable and it
 * is the point: the records a litigation needs are usually somebody
 * else, and a hold placed by one company suspends the deletion wherever
 * it would have happened. The sentence gives the holder reason and never
 * the matter reference, which is the holder own business.
 */
export function verdictFor(category: string, facts: Facts): Verdict {
  const line = scheduleFor(category)

  if (!line) {
    return {
      category,
      verdict: 'KEEP',
      until: null,
      says:
        `Nobody has classified "${category}" yet, so nothing is promised about it either ` +
        'way and nothing deletes it. Ask and a person will answer.',
      basis:
        'A category with no line in the retention schedule. Deleting on an unwritten ' +
        'rule is worse than keeping on a stated gap.',
    }
  }

  if (facts.underLegalHold) {
    return {
      category,
      verdict: 'HELD_UNTIL',
      until: null,
      says:
        `${category} is kept for now, because a company has placed a legal hold that ` +
        `names this person${facts.holdReason ? `: ${facts.holdReason}` : ''}. It is ` +
        'kept until that hold is lifted, and nobody can say today when that will be.',
      basis:
        'An unlifted LegalHold suspends every scheduled deletion of this subject, ' +
        'including on records the holder would never see. ' + line.basis,
    }
  }

  if (line.fate === 'KEPT_IN_FULL') {
    return {
      category, verdict: 'KEEP', until: null,
      says: `${category} is kept whole, and no date is set for deleting it.`,
      basis: line.basis,
    }
  }

  if (line.fate === 'DELETED') {
    return {
      category, verdict: 'DELETE', until: null,
      says: `${category} is deleted, and nothing waits before it goes.`,
      basis: line.basis,
    }
  }

  if (line.fate === 'KEPT_ANONYMIZED') {
    // A money line has a statutory floor and still keeps its amounts
    // afterwards: what the period governs is when the last thing naming
    // anybody may be dropped, not whether the arithmetic survives.
    const anchor = line.anchor === 'I9' ? null : anchorDate(line.anchor, facts)
    const until = line.months != null && anchor ? addCalendarMonths(anchor, line.months) : null
    return {
      category,
      verdict: 'ANONYMIZE',
      until,
      says:
        `${category} keeps its dates and its amounts and stops naming anybody. ` +
        (until
          ? `It is not deleted before ${until.toISOString().slice(0, 10)}.`
          : line.months == null
            ? 'No statute sets a date for deleting it, so none is offered.'
            : 'Nobody has recorded the day to count from, so no date is offered.'),
      basis: line.basis,
    }
  }

  // HELD_THEN_DELETED
  if (line.anchor === 'I9') {
    const until = i9Until(facts)
    const extra = facts.federalContractor
      ? ' As a federal contractor, the personnel-record floor behind it is two years rather than one.'
      : ''
    return {
      category,
      verdict: 'HELD_UNTIL',
      until,
      says: until
        ? `${category} is kept until ${until.toISOString().slice(0, 10)} — three years after ` +
          'the date of hire or one year after the job ended, whichever is later — and is ' +
          `deleted after that.${extra}`
        : `${category} is kept. The day it may go is three years after the date of hire or ` +
          'one year after the job ended, whichever is later, and ' +
          (facts.hiredAt
            ? 'the job has not ended, so the later of the two has not happened yet.'
            : 'nobody has recorded when the person was hired, so no date can be counted.') +
          extra,
      basis: line.basis,
    }
  }

  if (line.months == null) {
    return {
      category,
      verdict: 'HELD_UNTIL',
      until: null,
      says:
        `${category} is kept, and no date is offered for deleting it because no federal ` +
        'minimum can be cited for it. A number here would be a legal conclusion written ' +
        'by an engineer, which is worse than the blank.',
      basis: line.basis,
    }
  }

  const anchor = anchorDate(line.anchor, facts)
  const until = anchor ? addCalendarMonths(anchor, line.months) : null
  return {
    category,
    verdict: 'HELD_UNTIL',
    until,
    says: until
      ? `${category} is kept until ${until.toISOString().slice(0, 10)} and deleted after that.`
      : `${category} is kept. Nobody has recorded the day to count the period from, so no ` +
        'date is offered rather than a plausible one.',
    basis: line.basis,
  }
}

/** Every category, for one person, today. */
export function verdictsFor(facts: Facts, categories?: string[]): Verdict[] {
  const cats = categories ?? HELD.map((h) => h.category)
  return cats.map((c) => verdictFor(c, facts))
}

// ── The nightly sweep, as a decision and not as a database ────────────
//
// Pure. The runner in `lib/data-request` reads the rows, calls this, and
// applies what comes back. Keeping the decision here means every branch
// that deletes something, holds something or wakes somebody at midnight
// is testable without a database — and there is no branch in this file
// that money or a legal consequence does not hang off.
//
// ── Two things this sweep deliberately does not do ───────────────────
//
// **It does not anonymize a living person who has merely gone quiet.**
// The schedule above has a four-year floor on money records, and it
// would be easy to read that as "anybody last paid five years ago loses
// their name". Nobody has decided that, the test for "no longer engaged"
// is not written anywhere a lawyer has seen, and getting it wrong takes
// the name off a contractor who is coming back next month —
// permanently, and with no request behind it. Whether a quiet person
// should be aged out at all is counsel's, and it is named in
// `COUNSEL_QUESTIONS['retention']`.
//
// **And it does not anonymize a tombstoned one either, which is why
// `RETENTION_ANONYMIZE` is still only planned.** It was going to: the
// first draft re-checked every erased person for anything that still
// named them. Nothing ever does. The tombstone *is* the anonymization —
// every row goes on pointing at the same `Person` and that row now reads
// "Erased person" — so there is no second occasion for the act, and a
// sweep that logged one would be logging that it had found nothing.
// `lib/autonomy`'s own rule is that an inventory listing actions nobody
// performs overstates what we do, and that is the more dangerous of its
// two lies because a buyer reads it. So the name stays in `PLANNED`
// until something genuinely writes it, and `retention.test.ts` holds
// that sentence.

export type RequestStatus = 'RECEIVED' | 'HELD' | 'READY' | 'DONE' | 'REFUSED'

export interface SweepRequest {
  id: string
  kind: RequestKind
  status: RequestStatus
  receivedAt: Date
  dueAt: Date
  subjectPersonId: string | null
  subjectCompanyId: string | null
  /** What to call the subject on a staff alert. Never shown to anybody else. */
  subjectLabel: string
  /** True where an unlifted hold names the subject. */
  underLegalHold: boolean
  /** The holder's own words. The matter reference never travels. */
  holdReason: string | null
  /** Whether this clock has already been warned about today. */
  warnedToday: boolean
}

/** Which notice a breach clock is for. A company clock carries its id. */
export type BreachClockId = 'AUTHORITY' | 'PEOPLE' | { companyId: string; companyName: string }

export interface SweepClock {
  which: BreachClockId
  /** Null where nobody has decided a deadline applies. */
  dueAt: Date | null
  notifiedAt: Date | null
  /** The named person who owns sending it. A clock owned by nobody is missed. */
  owner: string
}

export interface SweepBreach {
  id: string
  reference: string
  summary: string
  closedAt: Date | null
  /** When the sweep last said anything about this breach. Once a day, not once a run. */
  lastWarnedAt: Date | null
  clocks: SweepClock[]
}

/** A person already under a tombstone, re-checked for drift. */
export interface SweepSubject {
  personId: string
  /** The companies whose records changed, for the automation log. */
  companyIds: string[]
  facts: Facts
  /** Held evidence whose statutory floor may have passed, by category. */
  stillHeld: string[]
}

export interface SweepDeps {
  requests: SweepRequest[]
  breaches: SweepBreach[]
  subjects: SweepSubject[]
}

export interface RequestWarning {
  action: 'DATA_REQUEST_CLOCK_WARNED'
  requestId: string
  hoursLeft: number
  late: boolean
  says: string
}

export interface ErasureDecision {
  action: 'ERASURE_COMPLETE' | 'RETENTION_HELD'
  requestId: string
  personId: string | null
  companyId: string | null
  says: string
}

export interface RetentionAct {
  action: 'RETENTION_DELETE' | 'RETENTION_HELD'
  personId: string
  companyIds: string[]
  category: string
  says: string
  basis: string
}

export interface BreachWarning {
  action: 'BREACH_CLOCK_WARNED' | 'BREACH_CLOCK_MISSED'
  breachId: string
  which: BreachClockId
  owner: string
  dueAt: Date
  hoursLeft: number
  says: string
}

export interface NoClockYet {
  breachId: string
  says: string
}

export interface SweepPlan {
  warnRequests: RequestWarning[]
  erasures: ErasureDecision[]
  retention: RetentionAct[]
  breachWarnings: BreachWarning[]
  breachesWithNoClock: NoClockYet[]
}

/** How long before a deadline the one early warning goes. */
export const WARN_WITHIN_HOURS = 24

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000
}

function whichSays(which: BreachClockId): string {
  if (which === 'AUTHORITY') return 'the supervisory authority'
  if (which === 'PEOPLE') return 'the people affected'
  return which.companyName
}

/** Whether two moments fall on the same UTC day. */
function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

/**
 * What the nightly run should do, given what it found.
 *
 * Nothing in here writes. Everything it returns names the literal action
 * the runner will log, so the autonomy ladder can see every act this
 * product performs unprompted.
 */
export function sweep(now: Date, deps: SweepDeps): SweepPlan {
  const plan: SweepPlan = {
    warnRequests: [], erasures: [], retention: [],
    breachWarnings: [], breachesWithNoClock: [],
  }

  // ── Requests: warn a day out, and complete what is ready ───────────

  for (const r of deps.requests) {
    if (r.status === 'DONE' || r.status === 'REFUSED') continue

    const hoursLeft = hoursBetween(now, r.dueAt)
    if (hoursLeft < WARN_WITHIN_HOURS && !r.warnedToday) {
      plan.warnRequests.push({
        action: 'DATA_REQUEST_CLOCK_WARNED',
        requestId: r.id,
        hoursLeft: Math.round(hoursLeft),
        late: hoursLeft < 0,
        says: hoursLeft < 0
          ? `The answer to ${r.subjectLabel}'s request was due ${Math.abs(Math.round(hoursLeft))} ` +
            'hours ago and nobody has answered it. Answer it today, and record the hour it went.'
          : `${r.subjectLabel}'s request is due in ${Math.max(0, Math.round(hoursLeft))} hours ` +
            'and nobody has answered it.',
      })
    }

    if (r.kind !== 'ERASURE') continue
    const runsOn = coolingEndsAt(r.receivedAt)
    if (now < runsOn) continue

    if (r.underLegalHold) {
      plan.erasures.push({
        action: 'RETENTION_HELD',
        requestId: r.id,
        personId: r.subjectPersonId,
        companyId: r.subjectCompanyId,
        says:
          `${r.subjectLabel} asked to be forgotten and the cooling period has passed, and ` +
          'a company has placed a legal hold naming them' +
          (r.holdReason ? `: ${r.holdReason}` : '') +
          '. Nothing was erased. The request is held, not refused, and the person is told ' +
          'that a hold applies without being told whose matter it is.',
      })
      continue
    }

    plan.erasures.push({
      action: 'ERASURE_COMPLETE',
      requestId: r.id,
      personId: r.subjectPersonId,
      companyId: r.subjectCompanyId,
      says:
        `${r.subjectLabel} asked to be forgotten on ${r.receivedAt.toISOString().slice(0, 10)}, ` +
        `the ${COOLING_DAYS}-day cooling period has passed and nothing stands in the way. ` +
        'The identity becomes a tombstone and the work stays on the record under nobody’s name.',
    })
  }

  // ── Records past their period, for somebody already tombstoned ─────

  for (const s of deps.subjects) {
    for (const category of s.stillHeld) {
      const v = verdictFor(category, s.facts)
      if (v.verdict === 'HELD_UNTIL' && s.facts.underLegalHold) {
        plan.retention.push({
          action: 'RETENTION_HELD', personId: s.personId, companyIds: s.companyIds,
          category, says: v.says, basis: v.basis,
        })
        continue
      }
      if (v.verdict === 'HELD_UNTIL' && v.until && v.until <= now) {
        plan.retention.push({
          action: 'RETENTION_DELETE', personId: s.personId, companyIds: s.companyIds,
          category,
          says:
            `${category} was kept for the period the law sets and that period has now run. ` +
            'It is deleted, and nothing puts it back.',
          basis: v.basis,
        })
      }
      // A HELD_UNTIL with no date is kept and said nothing about. A
      // period nobody can cite is not a period that expires tonight.
    }
  }

  // ── Breach clocks ──────────────────────────────────────────────────

  for (const b of deps.breaches) {
    if (b.closedAt) continue

    const live = b.clocks.filter((c) => c.dueAt !== null)
    if (live.length === 0) {
      plan.breachesWithNoClock.push({
        breachId: b.id,
        says:
          `Nobody has decided a deadline on breach ${b.reference}. That is not the same as ` +
          'nothing being owed — it means the question has not been asked yet, and somebody ' +
          'has to ask it before anything else happens.',
      })
      continue
    }

    // Once a day, not once a run. The history of every warning is in the
    // automation log; this column only stops the same night repeating.
    if (b.lastWarnedAt && sameDay(b.lastWarnedAt, now)) continue

    for (const c of live) {
      if (c.notifiedAt) continue
      const hoursLeft = hoursBetween(now, c.dueAt!)
      if (hoursLeft >= WARN_WITHIN_HOURS) continue
      plan.breachWarnings.push({
        action: hoursLeft < 0 ? 'BREACH_CLOCK_MISSED' : 'BREACH_CLOCK_WARNED',
        breachId: b.id,
        which: c.which,
        owner: c.owner,
        dueAt: c.dueAt!,
        hoursLeft: Math.round(hoursLeft),
        says: hoursLeft < 0
          ? `The deadline to tell ${whichSays(c.which)} about breach ${b.reference} passed ` +
            `${Math.abs(Math.round(hoursLeft))} hours ago and no notice is recorded against ` +
            `it. ${c.owner} owns it. This is said again every night until the notice is ` +
            'recorded or the breach is closed.'
          : `There are ${Math.max(0, Math.round(hoursLeft))} hours left to tell ` +
            `${whichSays(c.which)} about breach ${b.reference}. ${c.owner} owns it.`,
      })
    }
  }

  return plan
}
