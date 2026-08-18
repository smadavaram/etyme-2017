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
