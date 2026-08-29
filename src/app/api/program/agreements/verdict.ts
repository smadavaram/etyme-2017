/**
 * What is wrong with the paper, said rather than blocked.
 *
 * ── Why this is not a gate ───────────────────────────────────────────
 *
 * Addendum E is explicit about where a block is allowed: tenure, break in
 * service, work authorisation, lapsed insurance, segregation of duties.
 * Everything else warns, captures a reason, and proceeds. A margin floor
 * and an unsigned statement of work are commercial facts, not legal ones —
 * refusing to let somebody trade because a scope document is unsigned
 * produces a deal done in email, which is the outcome the control existed
 * to prevent.
 *
 * So nothing here returns "no". Everything here returns a reason code and
 * a sentence, and the screen shows it next to the thing it is about.
 *
 * ── Why the reason is a code ─────────────────────────────────────────
 *
 * "Margin below floor" counted across two hundred agreements is a pricing
 * policy that does not work. The same thing typed into a notes box two
 * hundred different ways is nothing at all. Free text collects nothing,
 * so the list is closed and the sentence is generated from the code
 * rather than typed beside it.
 *
 * ── Where the numbers come from, and where they do not ───────────────
 *
 * Margin needs two rates. The bill rate is on the sell contract and the
 * pay rate is on the buy contract, and roughly half of all placements do
 * not have both on file at the moment somebody looks. Where the pay side
 * is unknown this returns null and says so, because a margin computed
 * against a missing cost is a number that always looks healthy.
 */

// ── The closed list ───────────────────────────────────────────────────

export type AgreementReason =
  /** People are on site and nobody has signed the master agreement. */
  | 'MSA_UNSIGNED'
  /** A contract is priced below the floor the agreement sets. */
  | 'MARGIN_FLOOR'
  /** Nobody knows the cost side, so no margin can be stated at all. */
  | 'MARGIN_UNKNOWN'
  /** Work is running under an engagement whose scope was never written. */
  | 'SOW_MISSING'
  /** The scope is written and nobody has signed it. */
  | 'SOW_UNSIGNED'
  /** More people under the agreement than it allows. */
  | 'CAPACITY_EXCEEDED'

/**
 * WARN is somebody should act. NOTE is a fact worth surfacing that nobody
 * has done anything wrong about — an unsigned agreement with nobody placed
 * under it is an ordinary negotiation, not a failure.
 */
export type Severity = 'WARN' | 'NOTE'

export interface ReasonSpec {
  code: AgreementReason
  label: string
  hint: string
}

export const AGREEMENT_REASONS: ReasonSpec[] = [
  { code: 'MSA_UNSIGNED', label: 'Unsigned agreement', hint: 'Work is running on a handshake' },
  { code: 'SOW_MISSING', label: 'No statement of work', hint: 'Nobody wrote down what the work is' },
  { code: 'MARGIN_FLOOR', label: 'Below the margin floor', hint: 'Priced under what this agreement allows' },
  { code: 'CAPACITY_EXCEEDED', label: 'Over capacity', hint: 'More people than the agreement permits' },
  { code: 'SOW_UNSIGNED', label: 'Unsigned statement of work', hint: 'Scope written, signature outstanding' },
  { code: 'MARGIN_UNKNOWN', label: 'Margin not knowable', hint: 'The cost side is not on file' },
]

/**
 * Worst first, and the order is fixed rather than alphabetical.
 *
 * A person opening this screen has about four seconds. What they should
 * see first is people working with no paper, not a rate whose cost side
 * has not been filled in.
 */
const RANK: AgreementReason[] = [
  'MSA_UNSIGNED',
  'SOW_MISSING',
  'MARGIN_FLOOR',
  'CAPACITY_EXCEEDED',
  'SOW_UNSIGNED',
  'MARGIN_UNKNOWN',
]

export function isAgreementReason(value: string): value is AgreementReason {
  return AGREEMENT_REASONS.some((r) => r.code === value)
}

export interface Finding {
  code: AgreementReason
  severity: Severity
  /** One sentence, generated from the code. Never typed by anybody. */
  says: string
  /** What it is about, so the screen can hang it on the right row. */
  subjectType: 'AGREEMENT' | 'ENGAGEMENT' | 'CONTRACT'
  subjectId: string
}

// ── Inputs ────────────────────────────────────────────────────────────

/**
 * A contract where somebody has actually started.
 *
 * DRAFT, PENDING_VERIFICATION and VERIFIED are all paper — the person has
 * not walked in yet, and an unsigned agreement above them is a negotiation
 * rather than an exposure. PAUSED counts because the work started and the
 * relationship exists; a suspended contractor still has a badge.
 */
export const WORK_STARTED_STATES = ['IN_PROGRESS', 'PAUSED']

export function workHasStarted(state: string): boolean {
  return WORK_STARTED_STATES.includes(state)
}

export interface ContractInput {
  id: string
  personName: string
  billRateCents: number
  /** What we pay. Null where the buy side is not on file. */
  payRateCents: number | null
  /** Whether the person is actually working, as opposed to papered. */
  live: boolean
}

export interface EngagementInput {
  id: string
  title: string
  /** The scope, as written. Null means nobody wrote one. */
  statementOfWork: string | null
  sowSignedAt: Date | null
  /** Contracts under this engagement that have started. */
  liveContracts: number
}

export interface AgreementInput {
  id: string
  counterpartyName: string
  signedAt: Date | null
  paymentTermsDays: number
  /** The floor a recruiter may not price below without approval. */
  minMarginPct: number | null
  currency: string
  /** Max people under the agreement. Null means uncapped. */
  capacity: number | null
  contracts: ContractInput[]
  engagements: EngagementInput[]
}

// ── Margin ────────────────────────────────────────────────────────────

/**
 * Gross margin as a percentage of the bill rate.
 *
 * Null rather than a guess in three cases, and each of them is real: no
 * pay rate on file, a bill rate of zero, and a pay rate of zero. The last
 * one is the interesting refusal — a zero pay rate is almost always a
 * field nobody filled in, and treating it as free labour reports a
 * hundred per cent margin on a placement that may be losing money.
 */
export function marginPct(billRateCents: number, payRateCents: number | null): number | null {
  if (payRateCents == null) return null
  if (billRateCents <= 0) return null
  if (payRateCents <= 0) return null
  return Math.round(((billRateCents - payRateCents) / billRateCents) * 1000) / 10
}

/**
 * Whether a contract sits under the floor its agreement sets.
 *
 * Returns null when there is nothing to say: no floor, or no margin that
 * can be computed against one.
 */
export function marginFloorFinding(
  contract: ContractInput,
  minMarginPct: number | null
): Finding | null {
  if (minMarginPct == null) return null

  const pct = marginPct(contract.billRateCents, contract.payRateCents)

  if (pct == null) {
    return {
      code: 'MARGIN_UNKNOWN',
      severity: 'NOTE',
      says:
        `${contract.personName} is billed at ${money(contract.billRateCents)}/hr and nothing ` +
        `says what we pay, so the ${minMarginPct}% floor cannot be checked.`,
      subjectType: 'CONTRACT',
      subjectId: contract.id,
    }
  }

  if (pct >= minMarginPct) return null

  return {
    code: 'MARGIN_FLOOR',
    severity: 'WARN',
    says:
      `${contract.personName} runs at ${pct}% against a floor of ${minMarginPct}% — ` +
      `${money(contract.billRateCents)}/hr in, ${money(contract.payRateCents!)}/hr out.`,
    subjectType: 'CONTRACT',
    subjectId: contract.id,
  }
}

// ── Statement of work ─────────────────────────────────────────────────

/**
 * Whether an engagement has the paper its work needs.
 *
 * The severity turns on whether anybody is working. An engagement set up
 * ahead of a signature is how every project starts; an engagement with
 * four people billing and no scope on file is the one that ends in an
 * argument about what was in and what was extra.
 */
export function sowFinding(engagement: EngagementInput): Finding | null {
  const scope = engagement.statementOfWork?.trim() ?? ''
  const working = engagement.liveContracts > 0
  const heads = `${engagement.liveContracts} ${engagement.liveContracts === 1 ? 'person' : 'people'}`

  if (scope.length === 0) {
    if (!working) return null
    return {
      code: 'SOW_MISSING',
      severity: 'WARN',
      says: `${heads} working on ${engagement.title} and no statement of work has been written.`,
      subjectType: 'ENGAGEMENT',
      subjectId: engagement.id,
    }
  }

  if (engagement.sowSignedAt) return null

  return {
    code: 'SOW_UNSIGNED',
    severity: working ? 'WARN' : 'NOTE',
    says: working
      ? `The statement of work for ${engagement.title} is written and unsigned, with ${heads} already working.`
      : `The statement of work for ${engagement.title} is written and not signed yet.`,
    subjectType: 'ENGAGEMENT',
    subjectId: engagement.id,
  }
}

/**
 * A signature over nothing.
 *
 * Recording a signed date against an empty scope makes the engagement look
 * papered on every screen that checks, which is worse than looking
 * unpapered — nobody chases what appears to be done.
 */
export function maySignSow(input: {
  statementOfWork: string | null
  signedAt: Date | null
}): { ok: boolean; says: string } {
  const scope = input.statementOfWork?.trim() ?? ''
  if (input.signedAt && scope.length === 0) {
    return {
      ok: false,
      says: 'Write what the work is before recording that somebody signed for it.',
    }
  }
  return { ok: true, says: scope.length === 0 ? 'Scope cleared.' : 'Scope recorded.' }
}

// ── Signature and capacity ────────────────────────────────────────────

export function signatureFinding(agreement: AgreementInput): Finding | null {
  if (agreement.signedAt) return null

  const live = agreement.contracts.filter((c) => c.live).length
  if (live === 0) {
    return {
      code: 'MSA_UNSIGNED',
      severity: 'NOTE',
      says: `Nothing signed with ${agreement.counterpartyName} yet, and nobody is placed under it.`,
      subjectType: 'AGREEMENT',
      subjectId: agreement.id,
    }
  }

  return {
    code: 'MSA_UNSIGNED',
    severity: 'WARN',
    says:
      `${live} ${live === 1 ? 'person is' : 'people are'} working at ` +
      `${agreement.counterpartyName} under an agreement nobody has signed.`,
    subjectType: 'AGREEMENT',
    subjectId: agreement.id,
  }
}

export function capacityFinding(agreement: AgreementInput): Finding | null {
  // Null is uncapped, which is the common case for a bilateral agreement.
  // Reading it as zero would report every agreement as full.
  if (agreement.capacity == null) return null

  const live = agreement.contracts.filter((c) => c.live).length
  if (live <= agreement.capacity) return null

  return {
    code: 'CAPACITY_EXCEEDED',
    severity: 'WARN',
    says: `${live} people under an agreement that allows ${agreement.capacity}.`,
    subjectType: 'AGREEMENT',
    subjectId: agreement.id,
  }
}

// ── Everything, worst first ───────────────────────────────────────────

export function agreementFindings(agreement: AgreementInput): Finding[] {
  const out: Finding[] = []

  const sig = signatureFinding(agreement)
  if (sig) out.push(sig)

  const cap = capacityFinding(agreement)
  if (cap) out.push(cap)

  for (const e of agreement.engagements) {
    const f = sowFinding(e)
    if (f) out.push(f)
  }

  for (const c of agreement.contracts) {
    if (!c.live) continue
    const f = marginFloorFinding(c, agreement.minMarginPct)
    if (f) out.push(f)
  }

  return worstFirst(out)
}

/**
 * Which side is reading.
 *
 * The margin floor is the vendor's own pricing policy and the margin under
 * it is their cost base. Addendum D puts rate visibility on a per-
 * requirement setting precisely so this is a decision rather than an
 * accident, and an agreements screen shared by both parties is exactly
 * where the accident would happen. So the two margin codes never leave
 * the vendor's side of the agreement.
 */
export function findingsFor(role: 'VENDOR' | 'CLIENT', findings: Finding[]): Finding[] {
  if (role === 'VENDOR') return findings
  return findings.filter((f) => f.code !== 'MARGIN_FLOOR' && f.code !== 'MARGIN_UNKNOWN')
}

export function worstFirst(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'WARN' ? -1 : 1
    return RANK.indexOf(a.code) - RANK.indexOf(b.code)
  })
}

/** One line for the top of the row. Null when there is nothing to say. */
export function summarise(findings: Finding[]): string | null {
  const warns = findings.filter((f) => f.severity === 'WARN')
  if (warns.length === 0) return null
  if (warns.length === 1) return warns[0].says
  return `${warns[0].says} And ${warns.length - 1} more.`
}

// ── Terms, said plainly ───────────────────────────────────────────────

/**
 * Payment days as a sentence.
 *
 * "Net 30" means nothing to somebody who has not worked in accounts, and
 * this screen is read by account managers as often as by finance.
 */
export function paymentDaysSays(days: number): string {
  if (days <= 0) return 'Due on receipt.'
  return `Net ${days} — an invoice falls due ${days} days after it is issued.`
}

/** The floor, said. Null where the agreement sets none. */
export function marginFloorSays(minMarginPct: number | null): string | null {
  if (minMarginPct == null) return null
  return `Nothing may be priced below ${minMarginPct}% margin without approval.`
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}
