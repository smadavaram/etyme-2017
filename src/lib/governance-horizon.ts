/**
 * What is about to go wrong, when, and whose job it is.
 *
 * The existing engine (src/lib/governance.ts) is reactive: something is
 * attempted, rules are evaluated, the answer is yes or no. That is correct
 * and it is not enough. By the time a tenure cap blocks a contract
 * extension, the manager has already promised the person another year and
 * the conversation is a fight rather than a plan.
 *
 * This projects forward instead. Given today's facts it produces dated,
 * owned consequences — the cap someone crosses in eleven weeks, the
 * insurance certificate lapsing while twelve people are on site, the
 * break-in-service that ENDS next month and makes a good alumnus hirable
 * again.
 *
 * Two things make it worth the code:
 *
 *   1. Everything is dated. "Approaching the cap" is not actionable;
 *      "crosses 18 months on 4 November" is.
 *   2. Everything is owned. A client is not one person — a tenure breach
 *      is HR's decision, a lapsed certificate is procurement's, a headcount
 *      overage belongs to whoever holds the budget. Governance addressed to
 *      nobody in particular becomes everybody's backlog.
 *
 * Addendum E: enforcement BLOCKS where legally grounded and WARNS
 * everywhere else. That distinction carries into the horizon — a coming
 * BLOCK is a deadline, a coming WARN is a heads-up, and they must not be
 * shown as though they carry the same weight.
 */

export type ClientTeam = 'HIRING_MANAGER' | 'PROCUREMENT' | 'HR' | 'LEGAL'

export type HorizonKind =
  | 'TENURE_CAP'
  | 'BREAK_IN_SERVICE_ENDS'
  | 'INSURANCE_EXPIRY'
  | 'WORK_AUTH_EXPIRY'
  | 'CONTRACT_END'

/**
 * Who adjudicates a breach of each rule type, absent a client override.
 *
 * These are not arbitrary. Each one follows the exposure: co-employment and
 * classification sit with HR because that is who answers for them; supplier
 * risk and price sit with procurement; the headcount plan sits with whoever
 * owns the budget line.
 */
export const DEFAULT_RULE_OWNER: Record<string, ClientTeam> = {
  TENURE_CAP: 'HR',
  BREAK_IN_SERVICE: 'HR',
  WORK_AUTHORIZATION: 'HR',
  SEGREGATION_OF_DUTIES: 'HR',
  INSURANCE_REQUIRED: 'PROCUREMENT',
  VENDOR_TIER: 'PROCUREMENT',
  RATE_BAND: 'PROCUREMENT',
  HEADCOUNT_PLAN: 'HIRING_MANAGER',
}

export function ownerFor(ruleType: string, override?: ClientTeam | null): ClientTeam {
  return override ?? DEFAULT_RULE_OWNER[ruleType] ?? 'HR'
}

export interface HorizonItem {
  kind: HorizonKind
  /** The team whose decision this is. */
  owner: ClientTeam
  /** BLOCK items are deadlines. WARN items are heads-up. */
  severity: 'BLOCK' | 'WARN'
  /** When it happens. */
  date: string
  /** Days from the reference date. Negative means it already happened. */
  daysAway: number
  /** Who or what it concerns. */
  subject: { kind: 'PERSON' | 'VENDOR'; id: string; name: string }
  /** One line, plain English, with the date in it. */
  headline: string
  /** What to do about it, if there is anything. */
  action: string | null
  /** True where waiting costs an option rather than merely arriving. */
  actionable: boolean
}

// ── Inputs ─────────────────────────────────────────────────

export interface TenureFact {
  personId: string
  personName: string
  /** Cumulative months at this client across ALL vendors (Addendum E). */
  monthsAccrued: number
  /** True while the person is currently on site accruing more. */
  accruing: boolean
  capMonths: number
}

export interface BreakInServiceFact {
  personId: string
  personName: string
  /** When they last came off site. */
  lastEndedAt: Date
  requiredBreakDays: number
}

export interface ExpiryFact {
  /** Verification or petition id. */
  id: string
  subjectKind: 'PERSON' | 'VENDOR'
  subjectId: string
  subjectName: string
  type: string
  expiresAt: Date
  /** How many people are on site relying on it — makes the stake concrete. */
  activeWorkers: number
}

export interface ContractEndFact {
  contractId: string
  personId: string
  personName: string
  endsAt: Date
  /** True when nobody has decided to extend or release yet. */
  undecided: boolean
}

// ── Projection ─────────────────────────────────────────────

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from)
  const targetMonth = d.getMonth() + Math.floor(months)
  d.setMonth(targetMonth)
  // Fractional months carry as days, so an 11.5-month projection lands
  // mid-month rather than being silently rounded to a boundary.
  const remainder = months - Math.floor(months)
  if (remainder > 0) d.setDate(d.getDate() + Math.round(remainder * 30))
  return d
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * When does this person cross the cap?
 *
 * Only someone currently on site is accruing. Somebody already off site is
 * frozen where they are — projecting a future breach for them would be
 * inventing exposure that does not exist.
 */
export function projectTenure(fact: TenureFact, now: Date, windowDays: number): HorizonItem | null {
  if (!fact.accruing) return null

  const monthsLeft = fact.capMonths - fact.monthsAccrued

  // Already over. This is not a projection, it is a live breach.
  if (monthsLeft <= 0) {
    return {
      kind: 'TENURE_CAP',
      owner: 'HR',
      severity: 'BLOCK',
      date: fmt(now),
      daysAway: 0,
      subject: { kind: 'PERSON', id: fact.personId, name: fact.personName },
      headline: `${fact.personName} is past the ${fact.capMonths}-month cap at ${Math.round(fact.monthsAccrued)} months`,
      action: 'End the engagement or record an exception',
      actionable: true,
    }
  }

  const crossesAt = addMonths(now, monthsLeft)
  const daysAway = daysBetween(now, crossesAt)
  if (daysAway > windowDays) return null

  return {
    kind: 'TENURE_CAP',
    owner: 'HR',
    severity: 'BLOCK',
    date: fmt(crossesAt),
    daysAway,
    subject: { kind: 'PERSON', id: fact.personId, name: fact.personName },
    headline: `${fact.personName} reaches the ${fact.capMonths}-month cap on ${fmt(crossesAt)}`,
    action: daysAway <= 60
      ? 'Plan the handover or convert them now — after this date an extension is blocked'
      : 'Decide whether this role continues past the cap',
    actionable: true,
  }
}

/**
 * When does a break in service END?
 *
 * The one piece of good news governance produces. Addendum E requires that
 * alumni re-engagement checks the ledger BEFORE the action is offered, and
 * that inside a break period the eligibility date is shown instead of a
 * button. This is that date, surfaced early enough to plan around.
 */
export function projectBreakInService(
  fact: BreakInServiceFact,
  now: Date,
  windowDays: number
): HorizonItem | null {
  const eligibleAt = new Date(fact.lastEndedAt)
  eligibleAt.setDate(eligibleAt.getDate() + fact.requiredBreakDays)
  const daysAway = daysBetween(now, eligibleAt)

  // Already eligible, or too far out to plan around.
  if (daysAway < 0 || daysAway > windowDays) return null

  return {
    kind: 'BREAK_IN_SERVICE_ENDS',
    owner: 'HR',
    severity: 'WARN',
    date: fmt(eligibleAt),
    daysAway,
    subject: { kind: 'PERSON', id: fact.personId, name: fact.personName },
    headline: `${fact.personName} becomes eligible to return on ${fmt(eligibleAt)}`,
    action: daysAway === 0 ? 'Eligible now — you can ask them back' : 'Line up a role for when the break ends',
    actionable: true,
  }
}

/**
 * A certificate or authorisation running out.
 *
 * The stake is the number of people relying on it. "Insurance expires in
 * 21 days" is administrative; "expires in 21 days, twelve people on site"
 * is a decision.
 */
export function projectExpiry(fact: ExpiryFact, now: Date, windowDays: number): HorizonItem | null {
  const daysAway = daysBetween(now, fact.expiresAt)
  if (daysAway > windowDays) return null

  const isInsurance = fact.type.startsWith('INSURANCE')
  const kind: HorizonKind = isInsurance ? 'INSURANCE_EXPIRY' : 'WORK_AUTH_EXPIRY'
  const owner: ClientTeam = isInsurance ? 'PROCUREMENT' : 'HR'
  const lapsed = daysAway < 0

  const stake = fact.activeWorkers === 1
    ? '1 person on site'
    : `${fact.activeWorkers} people on site`

  return {
    kind,
    owner,
    // Both are BLOCK gates in the schema; a lapsed one is already blocking.
    severity: 'BLOCK',
    date: fmt(fact.expiresAt),
    daysAway,
    subject: { kind: fact.subjectKind, id: fact.subjectId, name: fact.subjectName },
    headline: lapsed
      ? `${fact.subjectName}: ${label(fact.type)} lapsed on ${fmt(fact.expiresAt)} — ${stake}`
      : `${fact.subjectName}: ${label(fact.type)} expires ${fmt(fact.expiresAt)} — ${stake}`,
    action: lapsed
      ? 'Already lapsed. New starts are blocked until it is renewed.'
      : 'Chase the renewal before it lapses',
    actionable: fact.activeWorkers > 0 || lapsed,
  }
}

function label(type: string): string {
  const map: Record<string, string> = {
    INSURANCE_GL: 'general liability cover',
    INSURANCE_WC: "workers' compensation cover",
    INSURANCE_EO: 'errors & omissions cover',
    INSURANCE_CYBER: 'cyber liability cover',
    I9_EVERIFY: 'work authorisation',
    BACKGROUND_CHECK: 'background check',
  }
  return map[type] ?? type.toLowerCase().replace(/_/g, ' ')
}

/**
 * An engagement ending with nobody having decided what happens next.
 *
 * A decided ending is a plan. An undecided one is the thing that becomes a
 * panic in week eleven, so only the undecided ones surface here.
 */
export function projectContractEnd(
  fact: ContractEndFact,
  now: Date,
  windowDays: number
): HorizonItem | null {
  if (!fact.undecided) return null
  const daysAway = daysBetween(now, fact.endsAt)
  if (daysAway < 0 || daysAway > windowDays) return null

  return {
    kind: 'CONTRACT_END',
    owner: 'HIRING_MANAGER',
    severity: 'WARN',
    date: fmt(fact.endsAt),
    daysAway,
    subject: { kind: 'PERSON', id: fact.personId, name: fact.personName },
    headline: `${fact.personName} rolls off on ${fmt(fact.endsAt)} with no decision recorded`,
    action: 'Extend, convert, or let them go — but decide',
    actionable: true,
  }
}

/**
 * Order the horizon the way somebody would actually work it: what blocks
 * first, then what merely warns. Within a severity, soonest first.
 *
 * Sorting by date alone buries a contract ending in nine days under a cap
 * that lapsed yesterday; sorting by severity alone buries next week under
 * next quarter.
 */
export function sortHorizon(items: HorizonItem[]): HorizonItem[] {
  return [...items].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'BLOCK' ? -1 : 1
    return a.daysAway - b.daysAway
  })
}

/** Group by owning team, so each team sees its own work and not everyone's. */
export function byTeam(items: HorizonItem[]): Record<ClientTeam, HorizonItem[]> {
  const out: Record<ClientTeam, HorizonItem[]> = {
    HIRING_MANAGER: [], PROCUREMENT: [], HR: [], LEGAL: [],
  }
  for (const i of items) out[i.owner].push(i)
  for (const k of Object.keys(out) as ClientTeam[]) out[k] = sortHorizon(out[k])
  return out
}
