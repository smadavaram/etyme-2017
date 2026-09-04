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
  // The IRS common-law test: behavioural control, financial control, the
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
        saysEmployee: 'part and parcel of the organisation — leave, training, reviews',
        saysIndependent: 'not part and parcel of the organisation' },
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
