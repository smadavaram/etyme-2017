/**
 * How a consultant is engaged, and whether this client accepts it.
 *
 * Four ways a person can be on site:
 *
 *   W2        the vendor employs them
 *   C2C       they have their own company; the vendor contracts with it
 *   IND_1099  a sole trader billing in their own name
 *   C2H_W2    contract now, on the client's payroll later
 *
 * These are not interchangeable. A sole trader carries the most risk for
 * the client: if a tax authority later decides they were really an
 * employee, the client can be liable alongside the vendor. A consultant
 * working through their own company puts a legal entity in between, which
 * is why many enterprises allow corp-to-corp and ban sole traders outright.
 *
 * Etyme had the four names in an enum and used none of them, so every
 * placement was recorded as W2 whatever it actually was.
 */

import type { Treatment } from './overtime'

export type WorkerType = 'W2' | 'C2C' | 'IND_1099' | 'C2H_W2'

export interface ClassificationVerdict {
  outcome: 'PASS' | 'WARN' | 'BLOCK'
  reason: string
  /** What the client should do about it, when there is something. */
  action: string | null
}

/** Plain names, for screens and refusals. */
export const WORKER_TYPE_LABEL: Record<WorkerType, string> = {
  W2: 'employed by the vendor',
  C2C: 'their own company',
  IND_1099: 'sole trader',
  C2H_W2: 'contract to hire',
}

/**
 * Whose insurance answers for this person.
 *
 * On corp-to-corp the cover sits with the consultant's own company, not the
 * staffing vendor — so checking only the vendor leaves the real gap open.
 * That gap is the one that matters on the day somebody is hurt on site.
 */
export function insuranceRestsWith(type: WorkerType): 'VENDOR' | 'CONSULTANT_ENTITY' | 'NOBODY' {
  if (type === 'C2C') return 'CONSULTANT_ENTITY'
  if (type === 'IND_1099') return 'NOBODY'
  return 'VENDOR'
}

/**
 * Does this client accept this way of engaging somebody?
 *
 * `allowed` is the client's own list. An empty list means they have not
 * said, which is treated as "anything goes" rather than "nothing goes" —
 * refusing every placement because nobody configured a policy would be a
 * rule that gets switched off within a week.
 */
export function checkClassification(
  type: WorkerType | null,
  allowed: WorkerType[]
): ClassificationVerdict {
  if (!type) {
    return {
      outcome: 'WARN',
      reason: 'The vendor has not said how this person is engaged',
      action: 'Ask the vendor whether this is W2, corp-to-corp or a sole trader',
    }
  }

  if (allowed.length === 0) {
    return {
      outcome: 'PASS',
      reason: `Engaged as ${WORKER_TYPE_LABEL[type]}; this client has no policy on file`,
      action: null,
    }
  }

  if (allowed.includes(type)) {
    return {
      outcome: 'PASS',
      reason: `Engaged as ${WORKER_TYPE_LABEL[type]}, which this client allows`,
      action: null,
    }
  }

  // Refused. This is a legal position the client has taken, not a
  // preference, so it blocks rather than warns — and it says what would be
  // accepted instead, because a refusal with no alternative just moves the
  // placement off the platform.
  return {
    outcome: 'BLOCK',
    reason: `This client does not accept ${WORKER_TYPE_LABEL[type]}`,
    action: `They accept: ${allowed.map(a => WORKER_TYPE_LABEL[a]).join(', ')}`,
  }
}

/**
 * Extra risk this way of working adds to time already served.
 *
 * Tenure is counted the same for everyone, but it does not mean the same
 * thing for everyone. Eighteen months of a sole trader working like an
 * employee is the textbook misclassification picture; the same eighteen
 * months through the consultant's own company is a far weaker case against
 * the client. The cap does not move — the concern does.
 */
export function tenureConcern(type: WorkerType | null, monthsAccrued: number): string | null {
  if (monthsAccrued < 12) return null
  if (type === 'IND_1099') {
    return `${Math.round(monthsAccrued)} months as a sole trader — the pattern a tax authority looks for`
  }
  if (type === 'C2C') {
    return `${Math.round(monthsAccrued)} months, through their own company, which limits the exposure`
  }
  return null
}

// ── Whether the right company is actually covered ──────────

export interface CoverFacts {
  /** GL and workers' comp certificates on file for the responsible party. */
  certificates: { type: string; expiresAt: Date | null; status: string }[]
  /** Set when corp-to-corp and we know which company they work through. */
  consultantCorpName: string | null
  /** True when corp-to-corp but no company has been recorded for them. */
  corpMissing: boolean
}

export interface CoverVerdict {
  outcome: 'PASS' | 'WARN' | 'BLOCK'
  reason: string
  /** Which company should have been carrying it. */
  responsible: 'VENDOR' | 'CONSULTANT_ENTITY' | 'NOBODY'
}

/** The two that must be current before somebody stands on a client's site. */
const REQUIRED = ['INSURANCE_GL', 'INSURANCE_WC']
const LIVE = ['CLEAR', 'CONDITIONAL']

/**
 * Is the party who actually answers for this person insured?
 *
 * The gap this closes: the existing rule checks the staffing vendor every
 * time. On corp-to-corp the vendor is a middleman — the cover that responds
 * to an injury belongs to the consultant's own company, and nobody was
 * looking at it.
 *
 * A sole trader usually has no company at all behind them. That is not an
 * administrative gap to chase, it is the arrangement itself, so it is
 * reported as a fact rather than as a missing document.
 */
export function checkCover(type: WorkerType | null, facts: CoverFacts, asOf: Date): CoverVerdict {
  const responsible = insuranceRestsWith(type ?? 'W2')

  if (responsible === 'NOBODY') {
    return {
      outcome: 'WARN',
      reason: 'A sole trader has no company behind them, so no employer cover answers for this person',
      responsible,
    }
  }

  const who = responsible === 'CONSULTANT_ENTITY'
    ? (facts.consultantCorpName ?? 'their own company')
    : 'the vendor'

  if (responsible === 'CONSULTANT_ENTITY' && facts.corpMissing) {
    return {
      outcome: 'BLOCK',
      reason: 'Corp-to-corp, but the company they work through has not been recorded, so nobody knows whose insurance applies',
      responsible,
    }
  }

  const current = facts.certificates.filter(
    c => LIVE.includes(c.status) && (c.expiresAt === null || c.expiresAt > asOf)
  )
  const held = new Set(current.map(c => c.type))
  const missing = REQUIRED.filter(r => !held.has(r))

  if (missing.length === 0) {
    return { outcome: 'PASS', reason: `${who} has current cover`, responsible }
  }

  const names = missing
    .map(m => (m === 'INSURANCE_GL' ? 'general liability' : "workers' compensation"))
    .join(' and ')

  // Lapsed cover on the party who answers is legally grounded, so it blocks.
  const lapsed = facts.certificates.some(
    c => REQUIRED.includes(c.type) && c.expiresAt !== null && c.expiresAt <= asOf
  )
  return {
    outcome: 'BLOCK',
    reason: lapsed
      ? `${who} let ${names} lapse`
      : `${who} has no ${names} cover on file`,
    responsible,
  }
}


// ══════════════════════════════════════════════════════════════════════
// Testing the arrangement, and keeping the evidence
// ══════════════════════════════════════════════════════════════════════
//
// Everything above tests the *label* — the client says it will not take
// sole traders, and we check what the vendor wrote down. That is a policy
// check and it is worth having, but it is not the exposure.
//
// The exposure is that the label is wrong. A person recorded as a sole
// trader who is directed like an employee, works the client's hours on
// the client's equipment alongside the client's own staff, is an employee
// whatever the contract says — and the finding lands on the client and
// the vendor together, with back tax, penalties and interest.
//
// Two things follow, and only the second is unusual.
//
// **Test the arrangement.** Nine questions about how the work is really
// done, weighed under whichever test the jurisdiction actually applies.
// Rules in data, per test, so a change of law is a change of a line.
//
// **Keep the evidence for the position taken.** This is the part almost
// nobody builds. A classification is a position, and a position is worth
// what the file behind it is worth. A determination with no record of
// what it was made from is indistinguishable, three years later, from a
// guess — and a firm whose counsel takes a different view from the test
// is perfectly entitled to, so long as somebody wrote down why.
//
// So: recording a position the test contradicts is allowed, and it is
// allowed only in writing. This is not us refusing to be overruled. It is
// us refusing to hold an unexplained override, because the note is the
// whole of the evidence on the day somebody asks.

/** Which country's test is being applied. */
export type ClassificationTestName = 'US_IRS' | 'US_ABC' | 'UK_IR35' | 'DEFAULT'

/** A position somebody takes. Never a guess, never a badge. */
export type Position = 'EMPLOYEE' | 'INDEPENDENT'

/** What the test concluded. Unclear is a real answer and a common one. */
export type TestOutcome = Position | 'UNCLEAR'

/**
 * How the work is actually done.
 *
 * Every field is nullable and null means unanswered. A missing answer is
 * never read as a no: half these questions are embarrassing to answer
 * honestly, and a test that scores silence as "independent" is a test
 * built to produce the answer somebody wanted.
 */
export interface Arrangement {
  clientDirectsHow?: boolean | null
  clientSetsHours?: boolean | null
  clientSuppliesEquipment?: boolean | null
  maySubstitute?: boolean | null
  bearsFinancialRisk?: boolean | null
  servesOtherClients?: boolean | null
  sameWorkAsEmployees?: boolean | null
  openEnded?: boolean | null
  receivesEmployeeBenefits?: boolean | null
}

/** The questions, in the words you would put to somebody. */
export const ARRANGEMENT_QUESTIONS: { key: keyof Arrangement; asks: string }[] = [
  { key: 'clientDirectsHow', asks: 'Does the client direct how the work is done, rather than only what is delivered?' },
  { key: 'clientSetsHours', asks: 'Does the client set the working hours?' },
  { key: 'clientSuppliesEquipment', asks: 'Does the client supply the equipment and the systems?' },
  { key: 'maySubstitute', asks: 'May they send a qualified substitute in their place?' },
  { key: 'bearsFinancialRisk', asks: 'Do they carry their own profit and loss on the work — fixed price, own costs, rework at their expense?' },
  { key: 'servesOtherClients', asks: 'Do they work for other clients at the same time?' },
  { key: 'sameWorkAsEmployees', asks: 'Is this the same work the client’s own employees do?' },
  { key: 'openEnded', asks: 'Is the engagement open-ended rather than a defined piece of work?' },
  { key: 'receivesEmployeeBenefits', asks: 'Do they get employee-style treatment — paid leave, training, performance reviews?' },
]

const QUESTION_OF = new Map(ARRANGEMENT_QUESTIONS.map(q => [q.key, q.asks]))

interface Factor {
  key: keyof Arrangement
  /** The answer that points at employment. */
  employmentWhen: boolean
  weight: number
  /**
   * Where this one answer settles it on its own, and in which direction.
   * The ABC prongs work this way; almost nothing else does.
   */
  decidesFor?: Position
  saysEmployee: string
  saysIndependent: string
}

// ── The rule tables, one per test ─────────────────────────────────────
//
// Written as data so that a change of law is a change of a line, and so
// somebody who is not a programmer can be walked through why a factor
// carried.

const TESTS: Record<ClassificationTestName, { label: string; factors: Factor[] }> = {
  // The IRS common-law test: behavioral control, financial control, the
  // relationship of the parties. Explicitly a weighing exercise — no
  // single factor decides, which is why nothing here is marked decisive.
  US_IRS: {
    label: 'IRS common-law',
    factors: [
      { key: 'clientDirectsHow', employmentWhen: true, weight: 3,
        saysEmployee: 'the client directs how the work is done, not only what is delivered',
        saysIndependent: 'the client says what is wanted and leaves the method to them' },
      { key: 'receivesEmployeeBenefits', employmentWhen: true, weight: 3,
        saysEmployee: 'they are given employee-style treatment — leave, training, reviews',
        saysIndependent: 'they get none of the employee benefits' },
      { key: 'bearsFinancialRisk', employmentWhen: false, weight: 3,
        saysEmployee: 'they carry no profit or loss on the work',
        saysIndependent: 'they carry their own profit and loss on the work' },
      { key: 'clientSetsHours', employmentWhen: true, weight: 2,
        saysEmployee: 'the client sets the hours',
        saysIndependent: 'they set their own hours' },
      { key: 'clientSuppliesEquipment', employmentWhen: true, weight: 2,
        saysEmployee: 'the client supplies the equipment',
        saysIndependent: 'they supply their own equipment' },
      { key: 'servesOtherClients', employmentWhen: false, weight: 2,
        saysEmployee: 'this client is their only client',
        saysIndependent: 'they work for other clients at the same time' },
      { key: 'openEnded', employmentWhen: true, weight: 2,
        saysEmployee: 'the engagement is open-ended rather than a defined piece of work',
        saysIndependent: 'the engagement is a defined piece of work' },
      { key: 'maySubstitute', employmentWhen: false, weight: 1,
        saysEmployee: 'the work must be done by them personally',
        saysIndependent: 'they may send a substitute' },
      { key: 'sameWorkAsEmployees', employmentWhen: true, weight: 1,
        saysEmployee: 'they do the same work as the client’s own employees',
        saysIndependent: 'the work sits outside what the client’s own staff do' },
    ],
  },

  // California AB5, Massachusetts, New Jersey. Three prongs, and the
  // hiring entity must satisfy all three — so failing any one is the end
  // of it. Prong B in particular has no equivalent anywhere else: doing
  // the client's own line of business settles it whatever else is true.
  US_ABC: {
    label: 'ABC',
    factors: [
      { key: 'clientDirectsHow', employmentWhen: true, weight: 3, decidesFor: 'EMPLOYEE',
        saysEmployee: 'prong A fails — the client directs how the work is done',
        saysIndependent: 'prong A holds — they are free from the client’s control over method' },
      { key: 'sameWorkAsEmployees', employmentWhen: true, weight: 3, decidesFor: 'EMPLOYEE',
        saysEmployee: 'prong B fails — the work is the client’s own line of business, which settles it on its own',
        saysIndependent: 'prong B holds — the work sits outside the client’s usual course of business' },
      { key: 'servesOtherClients', employmentWhen: false, weight: 3, decidesFor: 'EMPLOYEE',
        saysEmployee: 'prong C fails — no independently established trade behind them',
        saysIndependent: 'prong C holds — they trade independently with other clients' },
    ],
  },

  // IR35 and the UK employment status tests. Control, personal service
  // and mutuality of obligation. A genuine, unfettered right of
  // substitution is close to fatal to employment status, and is the one
  // thing in any of these tables that settles it toward independence.
  UK_IR35: {
    label: 'IR35 employment status',
    factors: [
      { key: 'maySubstitute', employmentWhen: false, weight: 3, decidesFor: 'INDEPENDENT',
        saysEmployee: 'personal service — the work must be done by them and nobody else',
        saysIndependent: 'a genuine right of substitution, which is close to fatal to employment status' },
      { key: 'clientDirectsHow', employmentWhen: true, weight: 3,
        saysEmployee: 'the client controls how the work is done',
        saysIndependent: 'no control over the method' },
      { key: 'openEnded', employmentWhen: true, weight: 3,
        saysEmployee: 'mutuality of obligation — work is offered and expected to be taken',
        saysIndependent: 'no mutuality — a defined piece of work with no expectation beyond it' },
      { key: 'bearsFinancialRisk', employmentWhen: false, weight: 2,
        saysEmployee: 'no financial risk of their own',
        saysIndependent: 'they carry their own financial risk' },
      { key: 'servesOtherClients', employmentWhen: false, weight: 2,
        saysEmployee: 'this client is their only client',
        saysIndependent: 'they are in business on their own account with other clients' },
      { key: 'receivesEmployeeBenefits', employmentWhen: true, weight: 2,
        saysEmployee: 'part and parcel of the organization — leave, training, reviews',
        saysIndependent: 'not part and parcel of the organization' },
      { key: 'clientSetsHours', employmentWhen: true, weight: 1,
        saysEmployee: 'the client sets the hours',
        saysIndependent: 'they set their own hours' },
      { key: 'clientSuppliesEquipment', employmentWhen: true, weight: 1,
        saysEmployee: 'the client supplies the equipment',
        saysIndependent: 'they supply their own equipment' },
      { key: 'sameWorkAsEmployees', employmentWhen: true, weight: 1,
        saysEmployee: 'the same work as the client’s own employees',
        saysIndependent: 'work the client’s own staff do not do' },
    ],
  },

  // Everywhere we have not written a table for. Control and risk, which
  // is the shape almost every jurisdiction's test takes underneath, and
  // an honest label rather than a borrowed one.
  DEFAULT: {
    label: 'control and risk',
    factors: [
      { key: 'clientDirectsHow', employmentWhen: true, weight: 3,
        saysEmployee: 'the client directs how the work is done',
        saysIndependent: 'the method is theirs' },
      { key: 'bearsFinancialRisk', employmentWhen: false, weight: 3,
        saysEmployee: 'they carry no financial risk',
        saysIndependent: 'they carry their own financial risk' },
      { key: 'receivesEmployeeBenefits', employmentWhen: true, weight: 2,
        saysEmployee: 'they receive employee benefits',
        saysIndependent: 'they receive no employee benefits' },
      { key: 'servesOtherClients', employmentWhen: false, weight: 2,
        saysEmployee: 'this client is their only client',
        saysIndependent: 'they serve other clients' },
      { key: 'clientSetsHours', employmentWhen: true, weight: 2,
        saysEmployee: 'the client sets the hours',
        saysIndependent: 'they set their own hours' },
      { key: 'openEnded', employmentWhen: true, weight: 2,
        saysEmployee: 'the engagement is open-ended',
        saysIndependent: 'a defined piece of work' },
      { key: 'clientSuppliesEquipment', employmentWhen: true, weight: 1,
        saysEmployee: 'the client supplies the equipment',
        saysIndependent: 'their own equipment' },
      { key: 'maySubstitute', employmentWhen: false, weight: 1,
        saysEmployee: 'personal service only',
        saysIndependent: 'substitution is allowed' },
      { key: 'sameWorkAsEmployees', employmentWhen: true, weight: 1,
        saysEmployee: 'the same work as the client’s own employees',
        saysIndependent: 'outside what the client’s own staff do' },
    ],
  },
}

export function testLabel(name: ClassificationTestName): string {
  return TESTS[name].label
}

export interface ClassificationTest {
  test: ClassificationTestName
  position: TestOutcome
  /** What carried it, heaviest first, in plain English. */
  reasons: string[]
  /** Questions nobody answered. An unanswered question is never a no. */
  unknowns: string[]
  /**
   * The share of the test's total weight that was answered and pointed
   * the way the conclusion points. Null on an unclear test, because
   * there is no conclusion for a figure to be about — a plausible number
   * against no position is exactly the number nobody audits.
   */
  confidence: number | null
  says: string
}

/** Below this share of the weight answered, no position is taken. */
const ENOUGH_ANSWERED = 0.5
/** Below this margin between the two sides, no position is taken. */
const ENOUGH_MARGIN = 0.15

/**
 * What the arrangement is, as against what it was called.
 *
 * Returns UNCLEAR rather than guessing. That is the whole point: a test
 * that always produces an answer produces a wrong one about a third of
 * the time, and a wrong answer with a file behind it is worse than no
 * answer, because somebody relies on it.
 */
export function testArrangement(
  arrangement: Arrangement,
  test: ClassificationTestName = 'DEFAULT'
): ClassificationTest {
  const { label, factors } = TESTS[test]

  const unknowns: string[] = []
  let employee = 0
  let independent = 0
  let total = 0
  const employeeReasons: { weight: number; says: string }[] = []
  const independentReasons: { weight: number; says: string }[] = []
  let decided: Position | null = null
  let decidedBy: string | null = null

  for (const f of factors) {
    total += f.weight
    const answer = arrangement[f.key]
    if (answer == null) {
      unknowns.push(QUESTION_OF.get(f.key) ?? f.key)
      continue
    }

    const pointsAtEmployment = answer === f.employmentWhen
    if (pointsAtEmployment) {
      employee += f.weight
      employeeReasons.push({ weight: f.weight, says: f.saysEmployee })
    } else {
      independent += f.weight
      independentReasons.push({ weight: f.weight, says: f.saysIndependent })
    }

    // A prong that settles it. Only the first one found is named as the
    // one that decided; the rest still appear as supporting reasons.
    if (f.decidesFor === 'EMPLOYEE' && pointsAtEmployment && !decided) {
      decided = 'EMPLOYEE'
      decidedBy = f.saysEmployee
    }
    if (f.decidesFor === 'INDEPENDENT' && !pointsAtEmployment && !decided) {
      decided = 'INDEPENDENT'
      decidedBy = f.saysIndependent
    }
  }

  const byWeight = (a: { weight: number }, b: { weight: number }) => b.weight - a.weight

  if (decided) {
    const supporting = decided === 'EMPLOYEE' ? employeeReasons : independentReasons
    const reasons = [
      decidedBy!,
      ...supporting.slice().sort(byWeight).map(r => r.says).filter(s => s !== decidedBy),
    ]
    return {
      test,
      position: decided,
      reasons,
      unknowns,
      // A prong that settles it settles it as a matter of law, not on the
      // balance of the rest. The remaining questions cannot change it.
      confidence: 1,
      says:
        `Tests as ${decided === 'EMPLOYEE' ? 'employment' : 'independent'} under the ${label} test, ` +
        `on a factor that settles it on its own: ${decidedBy}.`,
    }
  }

  const answeredWeight = employee + independent
  const coverage = total > 0 ? answeredWeight / total : 0
  const margin = answeredWeight > 0 ? Math.abs(employee - independent) / answeredWeight : 0

  if (coverage < ENOUGH_ANSWERED || margin < ENOUGH_MARGIN) {
    return {
      test,
      position: 'UNCLEAR',
      reasons: [
        ...employeeReasons.slice().sort(byWeight).map(r => r.says),
        ...independentReasons.slice().sort(byWeight).map(r => r.says),
      ],
      unknowns,
      confidence: null,
      says:
        coverage < ENOUGH_ANSWERED
          ? `Not enough of the ${label} test has been answered to take a position — ` +
            `${unknowns.length} of ${factors.length} questions are unanswered.`
          : `The ${label} test comes out too close to call. The factors point both ways ` +
            `and nothing in it settles the question on its own.`,
    }
  }

  const position: Position = employee > independent ? 'EMPLOYEE' : 'INDEPENDENT'
  const winning = position === 'EMPLOYEE' ? employee : independent
  const reasons = (position === 'EMPLOYEE' ? employeeReasons : independentReasons)
    .slice().sort(byWeight).map(r => r.says)

  return {
    test,
    position,
    reasons,
    unknowns,
    confidence: Math.round((winning / total) * 100) / 100,
    says:
      `Tests as ${position === 'EMPLOYEE' ? 'employment' : 'independent'} under the ${label} test: ` +
      `${reasons[0]}.` +
      (unknowns.length > 0
        ? ` ${unknowns.length} question${unknowns.length === 1 ? '' : 's'} unanswered.`
        : ''),
  }
}

// ── Recording the position, and the evidence behind it ────────────────

/**
 * How long a written reason has to be before it is a reason.
 *
 * Arbitrary, and defended anyway: "client says so" is forty characters
 * short of anything a tribunal would read as a determination, and a
 * required field that accepts "n/a" is a required field that has been
 * switched off.
 */
export const MIN_REASON_CHARS = 40

/** Positions rot as arrangements drift. Twelve months is the usual cycle. */
export const REVIEW_MONTHS = 12

export function defaultReviewBy(from: Date): Date {
  return new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth() + REVIEW_MONTHS,
    from.getUTCDate()
  ))
}

export interface CallProposal {
  /** The position being taken. */
  position: Position | string
  /** What the test concluded, from testArrangement. */
  test: ClassificationTest
  /** The written reason, where the position departs from the test. */
  note?: string | null
  reviewBy?: Date | null
  decidedAt: Date
}

export interface CallCheck {
  ok: boolean
  code: 'AGREES' | 'DEPARTS_WITH_REASON' | 'NEEDS_A_REASON' | 'NOT_A_POSITION'
  says: string
  /** What belongs in the record. The evidence, not a verdict. */
  reasons: string[]
  /** Always set — a call with no review date is a call nobody remakes. */
  reviewBy: Date
}

/**
 * Whether this call may be recorded as it stands.
 *
 * Agreeing with the test needs nothing. Departing from it needs a reason
 * in writing, because on the day somebody asks, the note is the whole of
 * the evidence — and a firm whose counsel takes a different view is
 * entitled to, so long as the view is on the file.
 */
export function checkCall(p: CallProposal): CallCheck {
  const reviewBy = p.reviewBy ?? defaultReviewBy(p.decidedAt)

  if (p.position !== 'EMPLOYEE' && p.position !== 'INDEPENDENT') {
    return {
      ok: false,
      code: 'NOT_A_POSITION',
      says:
        `"${p.position}" is not a position. A call says employee or independent. ` +
        `Where the test did not settle it, the honest record is the test with its ` +
        `unanswered questions — not a third status that means nobody decided.`,
      reasons: [],
      reviewBy,
    }
  }

  const note = (p.note ?? '').trim()

  if (p.test.position === p.position) {
    return {
      ok: true,
      code: 'AGREES',
      says: `Recorded as ${p.position.toLowerCase()}, which is what the ${testLabel(p.test.test)} test concluded.`,
      reasons: note ? [...p.test.reasons, note] : p.test.reasons,
      reviewBy,
    }
  }

  if (note.length < MIN_REASON_CHARS) {
    return {
      ok: false,
      code: 'NEEDS_A_REASON',
      says:
        p.test.position === 'UNCLEAR'
          ? `The ${testLabel(p.test.test)} test did not reach a position — ${p.test.unknowns.length} ` +
            `question${p.test.unknowns.length === 1 ? ' is' : 's are'} unanswered. Recording ` +
            `${p.position.toLowerCase()} anyway is allowed, and it needs a written reason, because ` +
            `nothing on the file supports it.`
          : `The ${testLabel(p.test.test)} test concluded ${p.test.position.toLowerCase()}. ` +
            `You are recording ${p.position.toLowerCase()}. Your counsel may well be right — but ` +
            `the reason has to be written down, because on the day somebody asks, the note is the ` +
            `whole of the evidence.`,
      reasons: [],
      reviewBy,
    }
  }

  return {
    ok: true,
    code: 'DEPARTS_WITH_REASON',
    says:
      `Recorded as ${p.position.toLowerCase()} against a test that concluded ` +
      `${p.test.position.toLowerCase()}, with the reason on the file.`,
    // The departure first, because it is the thing anybody reading this
    // three years from now needs before the rest of it.
    reasons: [note, ...p.test.reasons],
    reviewBy,
  }
}

// ── The review sweep ──────────────────────────────────────────────────
//
// The same shape as the certificate bug: a date column nothing looks at
// is a date column that lies. A classification made in 2024 against an
// arrangement that has since become full-time, on-site and open-ended is
// not evidence any more — it is a document that contradicts the facts.

export const REVIEW_WITHIN_DAYS = 30

export type CallFreshness = 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'NO_REVIEW_DATE'

export interface RecordedCall {
  id: string
  personName: string
  position: string
  decidedAt: Date
  reviewBy: Date | null
}

export interface StaleCall {
  id: string
  personName: string
  position: string
  freshness: CallFreshness
  /** Days past the review date. Null where there was never one. */
  daysOverdue: number | null
  says: string
}

const DAY = 86_400_000

/**
 * Calls that need looking at again.
 *
 * Current ones are not returned. A sweep that reports everything is a
 * sweep nobody reads to the end of.
 */
export function reviewSweep(rows: RecordedCall[], now: Date): StaleCall[] {
  const out: StaleCall[] = []

  for (const r of rows) {
    if (!r.reviewBy) {
      out.push({
        id: r.id,
        personName: r.personName,
        position: r.position,
        freshness: 'NO_REVIEW_DATE',
        daysOverdue: null,
        says:
          `${r.personName}'s classification call has no review date. Nothing will ever bring ` +
          `it back — this is the state that made a 2017 expiry column useless.`,
      })
      continue
    }

    const days = Math.floor((now.getTime() - r.reviewBy.getTime()) / DAY)

    if (days > 0) {
      out.push({
        id: r.id,
        personName: r.personName,
        position: r.position,
        freshness: 'OVERDUE',
        daysOverdue: days,
        says:
          `${r.personName}'s classification call was due for review ${days} day${days === 1 ? '' : 's'} ago. ` +
          `Positions rot as arrangements drift.`,
      })
      continue
    }

    if (-days <= REVIEW_WITHIN_DAYS) {
      out.push({
        id: r.id,
        personName: r.personName,
        position: r.position,
        freshness: 'DUE_SOON',
        daysOverdue: days,
        says: `${r.personName}'s classification call is due for review in ${-days} day${days === -1 ? '' : 's'}.`,
      })
    }
  }

  const rank: Record<CallFreshness, number> = {
    OVERDUE: 0, NO_REVIEW_DATE: 1, DUE_SOON: 2, CURRENT: 3,
  }
  return out.sort((a, b) => {
    if (rank[a.freshness] !== rank[b.freshness]) return rank[a.freshness] - rank[b.freshness]
    return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0)
  })
}

// ── The contradiction ─────────────────────────────────────────────────

export interface LatestCall {
  position: string
  decidedAt: Date
  decidedByName: string | null
  reviewBy: Date | null
}

/**
 * A contract that contradicts the position on file.
 *
 * The one that blocks: a sole-trader contract for somebody the firm's own
 * latest classification call says is an employee. That is not a risk, it
 * is a document contradicting a determination the same company made and
 * wrote down. Nobody's counsel defends that, and there is no version of
 * it a reason makes acceptable — the fix is to remake the call, or to
 * engage them on payroll.
 *
 * Everything else warns and carries on. A corp-to-corp contract against
 * an employee call is weaker: there is a legal entity in between and it
 * absorbs some of the exposure. Paying somebody as an employee when the
 * call says independent is not an exposure at all — it is the
 * conservative direction, and refusing it would be a rule that costs
 * money and protects nobody.
 */
export function checkContractAgainstCall(
  contractType: WorkerType | null,
  call: LatestCall | null,
  now: Date
): ClassificationVerdict {
  if (!contractType) {
    return {
      outcome: 'WARN',
      reason: 'The contract does not say how this person is engaged',
      action: 'Set the contract type before the contract is signed',
    }
  }

  const when = (d: Date) => d.toISOString().slice(0, 10)

  if (!call) {
    if (contractType === 'IND_1099') {
      return {
        outcome: 'WARN',
        reason:
          'Nobody has tested this arrangement. A sole trader with no classification call ' +
          'on file is the exposure with nothing behind it',
        action: 'Run the classification test and record the position before the contract starts',
      }
    }
    return {
      outcome: 'PASS',
      reason: `Engaged as ${WORKER_TYPE_LABEL[contractType]}; no classification call has been made`,
      action: null,
    }
  }

  const by = call.decidedByName ? ` by ${call.decidedByName}` : ''
  const madeOn = `made${by} on ${when(call.decidedAt)}`

  if (call.position === 'EMPLOYEE') {
    if (contractType === 'IND_1099') {
      return {
        outcome: 'BLOCK',
        reason:
          `The latest classification call on this person says employee — ${madeOn}. ` +
          `A sole-trader contract contradicts a determination this company made itself`,
        action:
          'Engage them on payroll, or remake the classification call with a written reason first',
      }
    }
    if (contractType === 'C2C') {
      return {
        outcome: 'WARN',
        reason:
          `The latest classification call says employee — ${madeOn}. A corp-to-corp ` +
          `contract puts their company in between, which absorbs some of the exposure ` +
          `but does not answer it`,
        action: 'Record why the arrangement changed, or remake the call',
      }
    }
    return withStaleness({
      outcome: 'PASS',
      reason: `Engaged as ${WORKER_TYPE_LABEL[contractType]}, matching a classification call of employee ${madeOn}`,
      action: null,
    }, call, now, when)
  }

  if (call.position === 'INDEPENDENT') {
    if (contractType === 'W2' || contractType === 'C2H_W2') {
      return {
        outcome: 'PASS',
        reason:
          `The call says independent — ${madeOn} — and they are being engaged as ` +
          `${WORKER_TYPE_LABEL[contractType]}, which is the conservative direction and contradicts nothing`,
        action: null,
      }
    }
    return withStaleness({
      outcome: 'PASS',
      reason: `Engaged as ${WORKER_TYPE_LABEL[contractType]}, matching a classification call of independent ${madeOn}`,
      action: null,
    }, call, now, when)
  }

  return {
    outcome: 'WARN',
    reason: `The classification call on file reads "${call.position}", which is not a position`,
    action: 'Remake the call as employee or independent',
  }
}

/**
 * A call the contract stands on that is overdue for review.
 *
 * Surfaced here rather than only in the sweep, because the moment a
 * contract is raised against it is the moment somebody is in a position
 * to do something about it.
 */
function withStaleness(
  verdict: ClassificationVerdict,
  call: LatestCall,
  now: Date,
  when: (d: Date) => string
): ClassificationVerdict {
  if (!call.reviewBy || call.reviewBy >= now) return verdict
  const days = Math.floor((now.getTime() - call.reviewBy.getTime()) / DAY)
  return {
    outcome: 'WARN',
    reason:
      `${verdict.reason}, but that call was due for review on ${when(call.reviewBy)} — ` +
      `${days} day${days === 1 ? '' : 's'} ago`,
    action: 'Retest the arrangement and record a fresh call',
  }
}

// ══════════════════════════════════════════════════════════════════════
// EXEMPT OR NONEXEMPT — the second question, and why it has a different
// shape from the first
// ══════════════════════════════════════════════════════════════════════
//
// Everything above answers "is this person an employee at all". This
// answers the question that comes next, only for the ones who are: does
// the Fair Labor Standards Act entitle them to overtime pay, or are they
// exempt from it.
//
// It is a different question with a different answer and it is asked of
// a different party. Somebody can be plainly an employee and plainly
// exempt. Somebody can be an employee at Brightmoor and exempt there,
// and an employee at Vertex six months later and nonexempt there,
// because the job changed. The status belongs to the employment
// relationship, not to the person.
//
// ── Why Etyme may record it and may not decide it ────────────────────
//
// The employee-or-independent test above works because the facts it
// weighs are facts a platform genuinely sees: who directs the method,
// who supplies the laptop, whether they bill anybody else. Etyme can ask
// those nine questions and get answers.
//
// Exemption turns on three prongs, and the third is invisible from here:
//
//   **Salary basis** — a predetermined amount, paid whole for any week
//   in which any work is done, not reduced for the quantity or quality
//   of the work (29 CFR §541.602).
//
//   **Salary level** — at or above a stated floor (§541.600).
//
//   **Duties** — the employee's *primary duty* must actually fit one of
//   the exemptions in §541: executive, administrative, learned or
//   creative professional, computer employee, outside sales.
//
// A job title is not a duty. "Software Engineer" on a requirement is not
// "the application of systems analysis techniques and procedures". A
// platform that inferred exempt status from a title and a rate would be
// manufacturing the employer's case out of data that does not contain
// it — and exemption is an **affirmative defense**, which the employer
// bears the burden of proving. Get it wrong and the employer owes two
// years of back overtime, three if the violation was willful, plus
// liquidated damages equal again to the unpaid wages.
//
// So: record only. The employer asserts, Etyme holds the assertion with
// who made it, when, on what basis and in whose words.
//
// ── The asymmetry, which is the whole design ─────────────────────────
//
// Etyme can never conclude *exempt*. It can sometimes conclude *cannot
// be exempt*, and that is not the same act: it is arithmetic on two
// numbers this system already holds, against a floor written in the
// regulation. Somebody paid $22 an hour with no guaranteed salary
// fails the salary basis and the salary level of every exemption that
// has one, and fails the hourly floor of the one that does not. No
// duties knowledge is needed to say so, and no judgment about the person
// is made by saying it.
//
// That asymmetry is in the return type on purpose. `screenExemption`
// returns CANNOT_BE_EXEMPT or ETYME_CANNOT_SAY, and there is no third
// value. A reviewer reading the type sees the ruling without reading the
// code — the same reason `overallVerdict` throws instead of returning a
// boolean.
//
// ── Why this does not reuse ClassificationCall ───────────────────────
//
// It reuses the *pattern* — test first, record the position, a departure
// needs a written reason, a review date or it rots — and not the row.
// Four reasons, and the first is sufficient:
//
//   A `ClassificationCall` is keyed on (company, person). Exempt status
//   is a property of one employment relationship, and the same person
//   can honestly hold two different answers at two employers at once.
//   Hanging it off the person would make one of the two wrong.
//
//   Its `position` is EMPLOYEE or INDEPENDENT. Adding EXEMPT to that
//   union would let a row say "independent and exempt", which is not a
//   thing: an independent contractor has no exemption because they have
//   no entitlement to be exempt from.
//
//   Its `arrangement` holds the nine answers Etyme asked for. There is
//   no equivalent here, because the duties test is not a form Etyme is
//   entitled to score.
//
//   Its decider is anybody at the owning company. Here only the employer
//   on the buy leg may assert, and a client asserting exempt status for
//   its supplier's employee is asserting something about a relationship
//   it is not a party to.

/** The two answers, and there is no third. */
export type ExemptStatus = 'EXEMPT' | 'NONEXEMPT'

/** Which exemption is being claimed, in §541's own terms. */
export type ExemptionBasis =
  | 'EXECUTIVE'
  | 'ADMINISTRATIVE'
  | 'PROFESSIONAL'
  | 'COMPUTER'
  | 'OUTSIDE_SALES'
  | 'HIGHLY_COMPENSATED'

export const EXEMPTION_LABEL: Record<ExemptionBasis, string> = {
  EXECUTIVE: 'executive',
  ADMINISTRATIVE: 'administrative',
  PROFESSIONAL: 'learned or creative professional',
  COMPUTER: 'computer employee',
  OUTSIDE_SALES: 'outside sales',
  HIGHLY_COMPENSATED: 'highly compensated employee',
}

/** The exemptions that require pay on a salary basis. Two do not. */
const SALARIED_EXEMPTIONS: ExemptionBasis[] = [
  'EXECUTIVE', 'ADMINISTRATIVE', 'PROFESSIONAL', 'HIGHLY_COMPENSATED',
]

/**
 * What an employer told us, held as a fact about an event.
 *
 * Never a computed field, never defaulted. Absent means nobody has said,
 * which is a different thing from nonexempt and is treated as such
 * everywhere below.
 */
export interface ExemptAssertion {
  status: ExemptStatus
  /** Null is honest for NONEXEMPT — there is no exemption to name. */
  basis: ExemptionBasis | null
  /** The employer on the buy leg. Never Etyme, never the client. */
  assertedByCompanyId: string
  assertedByCompanyName: string | null
  assertedByName: string | null
  assertedAt: Date
  /** The employer's own words on the duties. The only evidence there is. */
  note: string | null
  reviewBy: Date | null
}

// ── The wage rules, as data, per jurisdiction ─────────────────────────
//
// Every number here is a number that moves, so each is stated with the
// provision it comes from and the date this build believed it. A change
// of law is a change of a line.

export type WageRuleName = 'US_FLSA' | 'UK' | 'DEFAULT'

interface WageRules {
  label: string
  /** Does statute price an overtime hour here at all? */
  statutoryPremium: boolean
  /** Basis points of the regular rate owed per overtime hour. */
  floorBps: number | null
  /** Hours in a fixed workweek past which the floor bites. */
  weeklyAfterHours: number | null
  /** Weekly salary floor, in cents, for the exemptions that require a salary. */
  salaryFloorCentsPerWeek: number | null
  /** Hourly floor, in cents, for the one exemption payable by the hour. */
  computerHourlyFloorCents: number | null
  /** May a private employer give time off instead of overtime pay? */
  compTimeLawfulForPrivateEmployer: boolean
  /** Where a state or region may require more than this table holds. */
  mayBeHigherLocally: string | null
}

const WAGE_RULES: Record<WageRuleName, WageRules> = {
  // 29 U.S.C. §207(a)(1): one and one-half times the regular rate for
  // hours over forty in a workweek.
  //
  // §207(o): compensatory time in lieu of overtime pay is available to
  // public agencies. A private employer may not do it, which is the
  // single fact that stops a client's TIME_OFF choice from ever
  // reaching a W2 pay line.
  //
  // §541.600: the salary level is $684 a week. The 2024 rule raising it
  // to $1,128 was vacated nationwide in November 2024, so $684 is what
  // is operative — and it is exactly the kind of figure that will move
  // again, which is why it is a line in a table rather than a constant
  // in a branch.
  //
  // §541.400(b): the computer employee exemption, and only that one, may
  // be paid hourly, at not less than $27.63 an hour.
  US_FLSA: {
    label: 'Fair Labor Standards Act',
    statutoryPremium: true,
    floorBps: 15_000,
    weeklyAfterHours: 40,
    salaryFloorCentsPerWeek: 68_400,
    computerHourlyFloorCents: 2_763,
    compTimeLawfulForPrivateEmployer: false,
    mayBeHigherLocally:
      'Several states require more than the federal floor — California prices a ninth ' +
      'hour in a day and a seventh consecutive day, and sets its own salary level. This ' +
      'build does not hold any state table, so the figure below is a floor and not the answer.',
  },

  // The Working Time Regulations cap average weekly hours and guarantee
  // rest. They do not price an overtime hour, and there is no statutory
  // premium in the UK at all — what an overtime hour is worth is
  // whatever the contract says. Quoting a time-and-a-half floor to a UK
  // employer would be inventing an entitlement.
  UK: {
    label: 'Working Time Regulations',
    statutoryPremium: false,
    floorBps: null,
    weeklyAfterHours: null,
    salaryFloorCentsPerWeek: null,
    computerHourlyFloorCents: null,
    compTimeLawfulForPrivateEmployer: true,
    mayBeHigherLocally: null,
  },

  // Everywhere we have not written a table for. Not a default of "no
  // overtime" — a default of "we do not know", which refuses rather than
  // permits, because permitting silently is the one thing never allowed.
  DEFAULT: {
    label: 'no wage rules on file',
    statutoryPremium: false,
    floorBps: null,
    weeklyAfterHours: null,
    salaryFloorCentsPerWeek: null,
    computerHourlyFloorCents: null,
    compTimeLawfulForPrivateEmployer: false,
    mayBeHigherLocally: null,
  },
}

export function wageRuleLabel(name: WageRuleName): string {
  return WAGE_RULES[name].label
}

/** True where this jurisdiction lets a private employer bank hours instead of paying them. */
export function compTimeLawful(name: WageRuleName): boolean {
  return WAGE_RULES[name].compTimeLawfulForPrivateEmployer
}

// ── What Etyme may say on its own ─────────────────────────────────────

/**
 * How this person is paid, which is the half of the test Etyme can see.
 *
 * `payModel` is `BuyContract.payModel`. Only FIXED_HOURLY with a stated
 * salary equivalent could ever be a salary; every share model varies
 * with what was billed, which is a reduction for the quantity of the
 * work and so is not a salary basis at all.
 */
export interface PayShape {
  /** FIXED_HOURLY · SHARE_OF_BILL · SHARE_OF_MARGIN · SHARE_OF_BILL_LESS_COSTS */
  payModel: string
  /** Cents per hour, as `BuyContractCandidate.payRate` holds it. */
  payRateCents: number
  /**
   * True where the employer pays a fixed weekly amount whatever the
   * hours. Nothing in the schema records this today, so a caller that
   * does not know passes false and gets the honest, conservative read.
   */
  paidOnSalaryBasis: boolean
  /** Where a salary is paid, what it is per week in cents. */
  weeklySalaryCents?: number | null
}

export interface ExemptionScreen {
  /** There is no third value, and that is the ruling. */
  outcome: 'CANNOT_BE_EXEMPT' | 'ETYME_CANNOT_SAY'
  /** The exemptions this pay shape rules out, named. */
  rulesOut: ExemptionBasis[]
  /** The ones it does not rule out, which is not the same as supporting. */
  leavesOpen: ExemptionBasis[]
  says: string
}

/**
 * What the arithmetic alone establishes.
 *
 * It can rule an exemption out. It can never rule one in, because the
 * duties test is not in this data and never will be. An employer whose
 * counsel disagrees may still assert exempt status — `checkAssertion`
 * takes that assertion and asks for the reason in writing, exactly as
 * `checkCall` does for the position above.
 */
export function screenExemption(pay: PayShape, rule: WageRuleName = 'US_FLSA'): ExemptionScreen {
  const r = WAGE_RULES[rule]

  if (!r.statutoryPremium || r.salaryFloorCentsPerWeek == null) {
    return {
      outcome: 'ETYME_CANNOT_SAY',
      rulesOut: [],
      leavesOpen: [],
      says:
        `There is no overtime exemption to test under ${r.label} — statute does not price ` +
        `an overtime hour here, so what these hours are worth is whatever the contract says.`,
    }
  }

  const rulesOut: ExemptionBasis[] = []

  // The salary basis. A share of the bill moves with the work, which is
  // a reduction for quantity, which is the definition of not a salary.
  const shareModel = pay.payModel.startsWith('SHARE_OF')
  const onSalary = pay.paidOnSalaryBasis && !shareModel

  if (!onSalary) {
    rulesOut.push(...SALARIED_EXEMPTIONS)
  } else if (
    pay.weeklySalaryCents != null &&
    pay.weeklySalaryCents < r.salaryFloorCentsPerWeek
  ) {
    rulesOut.push(...SALARIED_EXEMPTIONS)
  }

  // The computer employee exemption, the only one payable by the hour.
  if (!onSalary && r.computerHourlyFloorCents != null && pay.payRateCents < r.computerHourlyFloorCents) {
    rulesOut.push('COMPUTER')
  }

  const all: ExemptionBasis[] = [
    'EXECUTIVE', 'ADMINISTRATIVE', 'PROFESSIONAL', 'COMPUTER', 'OUTSIDE_SALES', 'HIGHLY_COMPENSATED',
  ]
  const leavesOpen = all.filter((e) => !rulesOut.includes(e))

  // Outside sales has no pay test at all, so it is never ruled out here
  // — and somebody filing a weekly timesheet for hours on a client site
  // is not an outside salesperson. It is left open rather than dismissed
  // because dismissing it would be Etyme reasoning about duties.
  if (rulesOut.length === 0) {
    return {
      outcome: 'ETYME_CANNOT_SAY',
      rulesOut,
      leavesOpen,
      says:
        `The way this person is paid does not rule out any exemption. Whether one applies ` +
        `turns on what they actually do day to day, which is the employer's to say and not ` +
        `Etyme's to guess.`,
    }
  }

  const money = (c: number) => `$${(c / 100).toFixed(2)}`

  if (leavesOpen.length <= 1) {
    return {
      outcome: 'CANNOT_BE_EXEMPT',
      rulesOut,
      leavesOpen,
      says:
        `Paid ${money(pay.payRateCents)} an hour with no guaranteed salary. That is below the ` +
        `${money(r.computerHourlyFloorCents ?? 0)} an hour the computer employee exemption requires ` +
        `and it is not a salary at all, so every exemption with a pay test fails on arithmetic ` +
        `alone — no view of the duties needed. These hours are nonexempt unless somebody can ` +
        `explain in writing why they are not.`,
    }
  }

  return {
    outcome: 'CANNOT_BE_EXEMPT',
    rulesOut,
    leavesOpen,
    says:
      `Not paid on a salary basis, so the ${rulesOut.map((e) => EXEMPTION_LABEL[e]).join(', ')} ` +
      `exemption${rulesOut.length === 1 ? '' : 's'} cannot apply — each requires a predetermined ` +
      `salary of at least ${money(r.salaryFloorCentsPerWeek)} a week. ` +
      `${leavesOpen.map((e) => EXEMPTION_LABEL[e]).join(' and ')} are untouched by the pay test ` +
      `and turn on the duties, which is the employer's to say.`,
  }
}

// ── Recording what the employer asserted ──────────────────────────────

export interface AssertionProposal {
  status: ExemptStatus | string
  basis: ExemptionBasis | string | null
  /** The screen, from screenExemption. */
  screen: ExemptionScreen
  /** The employer's written reason. Required where the screen contradicts. */
  note?: string | null
  /** The company asserting, and the employer on the leg. They must match. */
  assertedByCompanyId: string
  employerCompanyId: string
  assertedByCompanyName?: string | null
  assertedAt: Date
  reviewBy?: Date | null
}

export interface AssertionCheck {
  ok: boolean
  code:
    | 'AGREES'
    | 'DEPARTS_WITH_REASON'
    | 'NEEDS_A_REASON'
    | 'NOT_A_STATUS'
    | 'NOT_THE_EMPLOYER'
    | 'NO_BASIS_NAMED'
  says: string
  /** What belongs on the record. Evidence, never a verdict. */
  reasons: string[]
  reviewBy: Date
}

/**
 * Whether this assertion may be recorded as it stands.
 *
 * Three refusals, each in a sentence:
 *
 * **Not the employer.** Only the party carrying the wage-and-hour
 * liability may assert the defense to it. A client asserting exempt
 * status for its supplier's employee would be writing a defense into
 * somebody else's file, and the client is not the one a Wage and Hour
 * investigator bills.
 *
 * **No basis named.** "Exempt" with no exemption named is not an
 * assertion, it is a preference. §541 is a list, and the employer has
 * to say which entry it is standing on.
 *
 * **Against the arithmetic, with no reason.** Same rule as `checkCall`,
 * for the same reason: counsel may legitimately differ and silence may
 * not, and on the day somebody asks, the note is the whole of the file.
 */
export function checkAssertion(p: AssertionProposal): AssertionCheck {
  const reviewBy = p.reviewBy ?? defaultReviewBy(p.assertedAt)

  if (p.assertedByCompanyId !== p.employerCompanyId) {
    return {
      ok: false,
      code: 'NOT_THE_EMPLOYER',
      says:
        `Only the employer can say whether one of its own people is exempt from overtime. ` +
        `Exemption is a defense the employer has to prove, and the bill for getting it wrong ` +
        `goes to them — so the assertion has to come from them.`,
      reasons: [],
      reviewBy,
    }
  }

  if (p.status !== 'EXEMPT' && p.status !== 'NONEXEMPT') {
    return {
      ok: false,
      code: 'NOT_A_STATUS',
      says:
        `"${p.status}" is not an answer. Somebody is exempt from overtime or they are not. ` +
        `Where nobody knows yet, the honest record is no assertion at all — not a third ` +
        `value that reads as though somebody decided.`,
      reasons: [],
      reviewBy,
    }
  }

  const note = (p.note ?? '').trim()

  if (p.status === 'NONEXEMPT') {
    // Nobody ever has to justify the conservative answer. Asking for a
    // reason here would be a required field between a worker and their
    // overtime.
    return {
      ok: true,
      code: 'AGREES',
      says:
        'Recorded as nonexempt. Overtime is owed in money at the statutory rate, ' +
        'whatever the client decided about billing it.',
      reasons: note ? [note] : [],
      reviewBy,
    }
  }

  const basis = p.basis as ExemptionBasis
  if (!basis || !(basis in EXEMPTION_LABEL)) {
    return {
      ok: false,
      code: 'NO_BASIS_NAMED',
      says:
        `Exempt under which exemption? Executive, administrative, professional, computer ` +
        `employee, outside sales or highly compensated. "Exempt" on its own is a preference, ` +
        `not a position — the regulation is a list and the file has to say which entry it stands on.`,
      reasons: [],
      reviewBy,
    }
  }

  const contradicted =
    p.screen.outcome === 'CANNOT_BE_EXEMPT' && p.screen.rulesOut.includes(basis)

  if (!contradicted) {
    return {
      ok: true,
      code: 'AGREES',
      says:
        `Recorded as exempt on the ${EXEMPTION_LABEL[basis]} exemption. Etyme holds what ` +
        `you asserted and has taken no view on the duties, which are yours to establish.`,
      reasons: note ? [p.screen.says, note] : [p.screen.says],
      reviewBy,
    }
  }

  if (note.length < MIN_REASON_CHARS) {
    return {
      ok: false,
      code: 'NEEDS_A_REASON',
      says:
        `The ${EXEMPTION_LABEL[basis]} exemption needs a salary this contract does not pay. ` +
        `${p.screen.says} Recording it anyway is allowed and it needs a written reason, because ` +
        `exemption is a defense you have to prove and the note is the whole of the evidence ` +
        `on the day somebody asks.`,
      reasons: [],
      reviewBy,
    }
  }

  return {
    ok: true,
    code: 'DEPARTS_WITH_REASON',
    says:
      `Recorded as exempt on the ${EXEMPTION_LABEL[basis]} exemption, against a pay shape that ` +
      `does not support it, with the reason on the file.`,
    reasons: [note, p.screen.says],
    reviewBy,
  }
}

// ── What the pay side may do with a decided overtime week ─────────────
//
// The gap this closes, in one line: the client's overtime treatment is a
// **billing** fact on the sell leg, and pricing somebody's wages off it
// would be the same error as billing a client at its sub-vendor's rate.
//
// `SAME_RATE`, `PREMIUM` and `TIME_OFF` say what the client pays its
// supplier for hours over the line. None of them says what the supplier
// owes the person who worked them. For a nonexempt employee that second
// number is set by statute and cannot be moved by an agreement the
// employee is not party to — §207 rights cannot be waived or bargained
// away even by the employee themselves, let alone by their employer's
// customer.
//
// So the two legs are computed separately and the difference is a real
// commercial fact the supplier's margin has to carry. It is reported
// rather than buried, because a supplier that does not know a client's
// TIME_OFF choice costs it a half-rate premium in cash this period is a
// supplier that will agree to it cheerfully and be surprised twice.

/** What the client decided on the sell leg. Narrated here, never priced from. */
export interface ClientChoice {
  treatment: Treatment | null
  /** The basis points the client's own decision applied to its bill rate. */
  appliedBps: number | null
}

/** One week of a timesheet, already split by `lib/overtime`. */
export interface WeekOfHours {
  weekOf: string
  /** Worked hours at or under the contract's weekly line. */
  regularHours: number
  /** Paid leave drawn from the bank. Paid flat, never overtime. */
  leaveHours: number
  /** Worked hours over the line, however the client priced them. */
  overHours: number
}

export interface WagePosition {
  personName: string
  /** W2 · C2C · IND_1099 · C2H_W2 · FIXED_TERM · CDD */
  contractType: WorkerType | string
  /** False where somebody else employs them — a sub-vendor, or their own company. */
  weAreTheEmployer: boolean
  pay: PayShape
  rule: WageRuleName
  /** What the employer asserted. Null means nobody has said, which is not nonexempt. */
  assertion: ExemptAssertion | null
  client: ClientChoice
  /** The firm's own latest employee-or-independent call, for the sole-trader boundary. */
  call?: LatestCall | null
  employerName?: string | null
  clientName?: string | null
}

export interface WagePay {
  /** May payroll put this week on a file? */
  ok: boolean
  code:
    | 'NO_OVERTIME_THIS_WEEK'
    | 'OWED_IN_MONEY'
    | 'CONTRACT_GOVERNS'
    | 'NOT_A_WAGE'
    | 'CANNOT_SAY'
    | 'CONTRADICTED_BY_OWN_CALL'
  /** Regular and leave hours at the pay rate. Null where no figure stands. */
  regularCents: number | null
  /** What the hours over the line must be paid, at minimum. */
  overtimeCents: number | null
  /** The multiple actually applied to those hours. */
  appliedBps: number | null
  /**
   * The part of the statutory premium the client's own choice did not
   * price — computed at the **pay** rate, not the bill rate.
   *
   * It is not the margin hit. The margin needs the bill rate, which this
   * function deliberately does not take, and is `lib/profitability`'s to
   * compute. What this says is narrower and exactly true: had the
   * employer mirrored what the client decided, it would have paid this
   * much less than the law requires.
   */
  uncoveredPremiumCents: number | null
  says: string
  /** What somebody has to do. Null where nothing is outstanding. */
  action: string | null
  /** Things true of the figure that the figure cannot say for itself. */
  caveats: string[]
}

const DAY_NAME = (iso: string): string =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

const HRS = (n: number): string => `${n} ${n === 1 ? 'hour' : 'hours'}`

const USD = (c: number): string =>
  `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function multiple(bps: number): string {
  const x = bps / 10_000
  if (x === 1) return 'the usual rate'
  if (x === 1.5) return 'time and a half'
  if (x === 2) return 'double time'
  return `${x}×`
}

/**
 * What the employer owes for one week, given a known exempt status.
 *
 * Refuses rather than guesses. A payroll file becomes a bank transfer,
 * usually the same week, and nobody reads it first — so a week whose
 * status nobody has asserted is left out and named, never exported flat
 * with a note somebody was supposed to notice.
 */
export function weekWage(week: WeekOfHours, at: WagePosition): WagePay {
  const r = WAGE_RULES[at.rule]
  const rate = at.pay.payRateCents
  const flat = Math.round((week.regularHours + week.leaveHours) * rate)
  const employer = at.employerName ?? 'the employer'
  const client = at.clientName ?? 'the client'
  const who = at.personName

  const nothing = { regularCents: null, overtimeCents: null, appliedBps: null, uncoveredPremiumCents: null }

  // ── Not our wage to pay ────────────────────────────────────────────
  //
  // A corp-to-corp consultant is paid by their own company; a
  // sub-vendor's employee is paid by the sub-vendor. Both are settled by
  // invoice. Whatever wage-and-hour duty exists sits with whoever signs
  // their paycheck, and it is not visible from here and not ours.
  //
  // This refuses rather than paying flat, because a corporation on an
  // ADP file is a company being paid as a person — the same assertion
  // the 1099 rules already refuse to make about a C2C sub-vendor.
  const type = String(at.contractType).toUpperCase()
  if (!at.weAreTheEmployer || type === 'C2C' || type === 'CORP_TO_CORP') {
    return {
      ok: false,
      code: 'NOT_A_WAGE',
      ...nothing,
      says:
        type === 'C2C' || type === 'CORP_TO_CORP'
          ? `${who} works through their own company, so this is a bill to settle and not a ` +
            `wage to run. Whatever that company owes them is that company's to work out.`
          : `${who} is employed by somebody else, so ${employer} pays an invoice rather than a ` +
            `wage. Their employer's overtime duty is theirs and is not visible from here.`,
      action: 'Settle it through accounts payable, not payroll.',
      caveats: [],
    }
  }

  // ── A week under the line asks nobody anything ─────────────────────
  //
  // Checked before the status, on purpose. Refusing every payroll line
  // in the book because nobody has filled in an exempt flag is the rule
  // that gets switched off in week one, and almost every week is under
  // forty hours.
  if (week.overHours <= 0) {
    return {
      ok: true,
      code: 'NO_OVERTIME_THIS_WEEK',
      regularCents: flat,
      overtimeCents: 0,
      appliedBps: 10_000,
      uncoveredPremiumCents: null,
      says: `${HRS(week.regularHours + week.leaveHours)} at the usual rate. Nothing went over the line.`,
      action: null,
      caveats: [],
    }
  }

  // ── A sole trader raises no overtime duty, unless our own file disagrees ──
  if (type === 'IND_1099' || type === '1099' || type === 'C1099') {
    if (at.call?.position === 'EMPLOYEE') {
      return {
        ok: true,
        code: 'CONTRADICTED_BY_OWN_CALL',
        regularCents: flat,
        overtimeCents: Math.round(week.overHours * rate),
        appliedBps: 10_000,
        uncoveredPremiumCents: null,
        says:
          `${who} is engaged as a sole trader, so nothing here computes overtime for them — ` +
          `but ${employer}'s own latest classification call says they are an employee. Paying ` +
          `${HRS(week.overHours)} flat against your own written determination is the fact that ` +
          `turns a back-pay claim into a willful one, which doubles the damages and adds a year.`,
        action: `Remake the classification call, or engage ${who} on payroll and record an exempt status.`,
        caveats: [],
      }
    }
    return {
      ok: true,
      code: 'CONTRACT_GOVERNS',
      regularCents: flat,
      overtimeCents: Math.round(week.overHours * rate),
      appliedBps: 10_000,
      uncoveredPremiumCents: null,
      says:
        `${who} is engaged as a sole trader. Wage and hour law prices overtime for employees, ` +
        `so what these ${HRS(week.overHours)} are worth is whatever the contract says.`,
      action: null,
      caveats: [],
    }
  }

  // ── Somewhere we have no rules for ─────────────────────────────────
  if (at.rule === 'DEFAULT') {
    return {
      ok: false,
      code: 'CANNOT_SAY',
      ...nothing,
      says:
        `${who} worked ${HRS(week.overHours)} over the line in the week of ` +
        `${DAY_NAME(week.weekOf)}, and Etyme holds no wage rules for where they work. ` +
        `Rather than guess, it is left off the file.`,
      action: 'Tell Etyme which country these hours were worked in, then run payroll again.',
      caveats: [],
    }
  }

  // ── Nowhere statute prices an overtime hour ────────────────────────
  if (!r.statutoryPremium || r.floorBps == null) {
    return {
      ok: true,
      code: 'CONTRACT_GOVERNS',
      regularCents: flat,
      overtimeCents: Math.round(week.overHours * rate),
      appliedBps: 10_000,
      uncoveredPremiumCents: null,
      says:
        `Under the ${r.label} there is no statutory premium for an overtime hour, so what ` +
        `${who}'s ${HRS(week.overHours)} are worth is whatever their contract says. Paid flat ` +
        `because nothing on the buy contract says otherwise.`,
      action: null,
      caveats: [
        'This build holds no overtime terms on a buy contract, so a contractual premium the ' +
          'employer agreed with the worker is not applied here.',
      ],
    }
  }

  // ── Nobody has said, so nothing is exported ────────────────────────
  if (!at.assertion) {
    return {
      ok: false,
      code: 'CANNOT_SAY',
      ...nothing,
      says: saysCannotClassify(who, week.weekOf, week.overHours, employer, r),
      action: `Record on ${who}'s contract whether they are exempt from overtime, then run payroll again.`,
      caveats: [],
    }
  }

  // ── Exempt: the contract governs, and two things stay true ─────────
  if (at.assertion.status === 'EXEMPT') {
    const named = at.assertion.basis ? EXEMPTION_LABEL[at.assertion.basis] : 'an unnamed'
    const caveats = [
      `An exempt employee is owed their full salary for any week in which they do any work, ` +
        `whatever the hours (29 CFR §541.602). Deductions for a short week are what most ` +
        `often destroys the exemption after the fact.`,
    ]
    const shareModel = at.pay.payModel.startsWith('SHARE_OF')
    if (!at.pay.paidOnSalaryBasis || shareModel) {
      caveats.push(
        `${who} is paid by the hour rather than on a salary, which is the single fact that ` +
          `most often defeats a ${named} exemption on review. ${employer} asserted it anyway ` +
          `and the reason is on the file.`
      )
    }
    return {
      ok: true,
      code: 'CONTRACT_GOVERNS',
      regularCents: flat,
      overtimeCents: Math.round(week.overHours * rate),
      appliedBps: 10_000,
      uncoveredPremiumCents: null,
      says:
        `${employer} asserts ${who} is exempt under the ${named} exemption, so the ` +
        `${r.label} entitles them to no premium and their contract governs these ` +
        `${HRS(week.overHours)}. Paid flat.`,
      action: null,
      caveats,
    }
  }

  // ── Nonexempt: money, at the floor, whatever the client chose ──────
  const overtimeCents = Math.round(week.overHours * rate * (r.floorBps / 10_000))
  const clientBps = at.client.appliedBps
  const mirrored = clientBps == null ? null : Math.round(week.overHours * rate * (clientBps / 10_000))
  const uncovered = mirrored == null ? null : Math.max(0, overtimeCents - mirrored)

  const caveats = [
    `Computed on the pay rate as the regular rate. A nondiscretionary bonus, a shift ` +
      `differential or anything else paid for this week raises the regular rate and the ` +
      `premium with it (29 U.S.C. §207(e)), so this is a floor rather than the answer.`,
  ]
  if (r.mayBeHigherLocally) caveats.push(r.mayBeHigherLocally)

  let says: string
  if (at.client.treatment === 'TIME_OFF') {
    says =
      `${client} banked ${who}'s ${HRS(week.overHours)} from the week of ${DAY_NAME(week.weekOf)} ` +
      `as paid time off. That is how ${client} is billed and it does not reach the pay line: time ` +
      `off instead of overtime pay is lawful for public agencies only (29 U.S.C. §207(o)), and ` +
      `${employer} is not one. ${who} is owed ${HRS(week.overHours)} at ${multiple(r.floorBps)} ` +
      `— ${USD(overtimeCents)} — on this period's payroll.`
  } else if (at.client.treatment === 'SAME_RATE') {
    says =
      `${client} is billed ${who}'s ${HRS(week.overHours)} from the week of ${DAY_NAME(week.weekOf)} ` +
      `at the usual rate. ${who} is nonexempt, so ${employer} owes ${multiple(r.floorBps)} on them ` +
      `regardless — ${USD(overtimeCents)}. What a client agrees to pay its supplier does not set ` +
      `what the supplier owes its employee.`
  } else if (at.client.treatment === 'PREMIUM' && uncovered != null && uncovered > 0) {
    says =
      `${client} priced ${who}'s ${HRS(week.overHours)} at ${multiple(clientBps!)}, which is under ` +
      `the ${multiple(r.floorBps)} a nonexempt employee is owed. ${employer} pays ` +
      `${USD(overtimeCents)}.`
  } else {
    says =
      `${who} is nonexempt, so ${HRS(week.overHours)} over the line are owed in money at ` +
      `${multiple(r.floorBps)} — ${USD(overtimeCents)}.`
  }

  if (uncovered != null && uncovered > 0) {
    says +=
      ` ${USD(uncovered)} of that is premium ${client}'s own choice did not price, and ` +
      `${employer} carries it.`
  }

  // Banked hours are a timing difference until they are not. The leave
  // bills when it is taken, so the supplier is out of pocket this period
  // and whole later — unless the assignment ends first, or the leave is
  // never taken, in which case the whole premium was a real loss. Said
  // here because a supplier that agrees to TIME_OFF cheerfully is a
  // supplier that has been told none of this.
  if (at.client.treatment === 'TIME_OFF') {
    caveats.push(
      `${employer} pays this now. It bills ${client} when the banked leave is taken, so it is ` +
        `out of pocket in between — and out of pocket for good if the assignment ends before ` +
        `the leave is used.`
    )
  }

  return {
    ok: true,
    code: 'OWED_IN_MONEY',
    regularCents: flat,
    overtimeCents,
    appliedBps: r.floorBps,
    uncoveredPremiumCents: uncovered,
    says,
    action: null,
    caveats,
  }
}

/**
 * The refusal, said to a payroll clerk who has never seen this product.
 *
 * Names the person, the week, the hours, the line they went over, who
 * has to answer and what happens next. Never a code: a clerk who reads
 * FLSA_UNKNOWN has to find somebody who knows what it means before they
 * can do anything, and that person is usually on leave.
 */
export function saysCannotClassify(
  personName: string,
  weekOf: string,
  overHours: number,
  employerName: string,
  rules: WageRules = WAGE_RULES.US_FLSA
): string {
  const after = rules.weeklyAfterHours ?? 40
  return (
    `${personName} worked ${HRS(overHours)} over ${after} in the week of ${DAY_NAME(weekOf)}. ` +
    `${employerName} has not said whether ${personName} is exempt from overtime, so nobody can ` +
    `say what those hours are worth — time and a half if they are not, the contract rate if they ` +
    `are. The week is left off the payroll file rather than paid at the wrong one.`
  )
}
