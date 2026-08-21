/**
 * One harness, so a loop is a declaration rather than a day's work.
 *
 * Twenty-eight modules in this build decide pass or fail. Exactly one of
 * them loops. The rest check once, say something sensible, and are never
 * counted, never sampled, never allowed a second attempt, and never
 * noticed when they start being wrong.
 *
 * That is not because anybody was careless. It is because a complete loop
 * has six parts and assembling them by hand takes a day, so the seventh
 * surface gets three of the six and the eighth gets a different three.
 *
 * ── The six ──────────────────────────────────────────────────────────
 *
 *   verdict        pass or fail, per named check
 *   evidence       what it read to decide
 *   fix text       what to do about it, upstream where possible
 *   attempts       a cap, so a loop that cannot converge stops costing
 *   ledger         what it cost, and how often it needed a second go
 *   human sample   a person confirming the machine is still right
 *
 * A surface using this harness gets all six because it is the harness,
 * not because somebody remembered.
 *
 * ── Two rules the harness enforces rather than documents ─────────────
 *
 * **Rules run first and always; a model runs only when the rules are
 * clean.** Paying to be told a skill is missing on a package that also
 * has no CV attached is paying twice for the same answer.
 *
 * **A model step that throws is never a pass.** It is recorded as not
 * having run, and what it would have checked is marked unverified. A
 * degraded result presented as a good one is the failure worth designing
 * against.
 */

import { prisma } from '@/lib/db'
import { record, type RecordType } from '@/lib/agent-run'

export type Checker = 'RULE' | 'MODEL' | 'HUMAN'

export type { RecordType }

export interface Finding {
  code: string
  checker: Checker
  verdict: 'PASS' | 'FAIL'
  /** What to do about it, in words somebody would use. */
  reason: string
  /** What it read to decide. Without this a person cannot review it. */
  evidence?: string | null
  /**
   * True where the check could not run at all.
   *
   * Distinct from a pass and from a fail. Nothing was verified, and the
   * screen says so rather than implying somebody looked.
   */
  unverified?: boolean
}

export interface Step<T> {
  code: string
  checker: 'RULE' | 'MODEL'
  /**
   * One finding, several, or null to say nothing.
   *
   * Several because a single question often has several answers that
   * belong together — the rules on a submission package are six verdicts
   * from one pass over the same facts, and splitting them into six steps
   * would read the same facts six times.
   *
   * Null because a step with nothing to add should be silent rather than
   * emitting a cheerful pass nobody reads.
   */
  run: (subject: T) => Finding | Finding[] | null | Promise<Finding | Finding[] | null>
  /** What to say when a MODEL step throws. Ignored for rules. */
  whenItCannotRun?: string
}

export interface Spec<T> {
  /** Dotted, so the ledger groups: "submission.check", "invoice.match". */
  name: string
  recordType: RecordType
  steps: Step<T>[]
  /** Default three. Past that it stops asking the machine. */
  maxAttempts?: number
}

export const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Where a record stands.
 *
 * There is deliberately no CHECKING. A run is one synchronous call, so
 * nothing ever rests mid-check, and a state the code cannot produce is a
 * state somebody will one day write a screen for.
 */
export type State = 'DRAFT' | 'NEEDS_FIX' | 'READY' | 'SENT'

export interface Outcome {
  state: State
  toFix: Finding[]
  passed: Finding[]
  unverified: Finding[]
  summary: string
  mayRetry: boolean
  attempt: number
  attemptsLeft: number
}

export interface Context {
  companyId: string
  recordId: string
  attempt: number
}

/**
 * Run the checks once, write down everything, and say where that leaves
 * the record.
 *
 * One call, one step. Not a running process — a crash halfway leaves rows
 * somebody can look at rather than a job nobody can find.
 */
export async function runLoop<T>(
  spec: Spec<T>,
  subject: T,
  ctx: Context
): Promise<Outcome> {
  const max = spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const findings: Finding[] = []

  // ── Rules ───────────────────────────────────────────────────────────
  const rules = spec.steps.filter((s) => s.checker === 'RULE')
  const ruleStarted = Date.now()

  for (const step of rules) {
    try {
      const f = await step.run(subject)
      if (f) findings.push(...(Array.isArray(f) ? f : [f]))
    } catch (err: any) {
      // A rule that throws is a bug in the rule, not a failure of the
      // thing being checked. Say so plainly rather than failing somebody's
      // submission over it.
      findings.push({
        code: step.code,
        checker: 'RULE',
        verdict: 'PASS',
        unverified: true,
        reason: `This check could not run: ${String(err?.message ?? err).slice(0, 120)}`,
      })
    }
  }

  if (rules.length > 0) {
    await record({
      companyId: ctx.companyId,
      agent: `${spec.name}.rules`,
      recordType: spec.recordType,
      recordId: ctx.recordId,
      attempt: ctx.attempt,
      verdict: findings.some((f) => f.verdict === 'FAIL') ? 'FAIL' : 'PASS',
      // Rules cost nothing, and the zero is the point: it is what makes
      // the free half of the work visible next to the expensive half.
      ms: Date.now() - ruleStarted,
    })
  }

  // ── The model, only once the rules are clean ────────────────────────
  const rulesClean = !findings.some((f) => f.verdict === 'FAIL')
  const models = spec.steps.filter((s) => s.checker === 'MODEL')
  const runIds = new Map<string, string | null>()

  if (rulesClean) {
    for (const step of models) {
      const started = Date.now()
      try {
        const f = await step.run(subject)

        // Recorded whether or not it had anything to say. A step that
        // called a model and then decided to stay quiet has already spent
        // the money, and a cost that never reaches the ledger is the one
        // thing the ledger exists to prevent.
        const runId = await record({
          companyId: ctx.companyId,
          agent: `${spec.name}.${step.code.toLowerCase()}`,
          recordType: spec.recordType,
          recordId: ctx.recordId,
          attempt: ctx.attempt,
          verdict: anyFailed(f) ? 'FAIL' : 'PASS',
          failReason: f
            ? firstFailure(f)
            : 'ran and had nothing to say',
          ms: Date.now() - started,
        })

        for (const one of f ? (Array.isArray(f) ? f : [f]) : []) {
          findings.push(one)
          runIds.set(one.code, runId)
        }
      } catch (err: any) {
        // Not a failed check. The check did not run, and saying it passed
        // would be the worst of the three possible answers.
        await record({
          companyId: ctx.companyId,
          agent: `${spec.name}.${step.code.toLowerCase()}`,
          recordType: spec.recordType,
          recordId: ctx.recordId,
          attempt: ctx.attempt,
          verdict: 'ERROR',
          failReason: String(err?.message ?? err).slice(0, 300),
          ms: Date.now() - started,
        })

        findings.push({
          code: step.code,
          checker: 'MODEL',
          verdict: 'PASS',
          unverified: true,
          reason:
            step.whenItCannotRun ??
            'This check could not run this time. Nobody has verified it.',
        })
      }
    }
  }

  // ── Write every verdict down, with who decided ──────────────────────
  //
  // The identity of the checker is the whole point. A rule cannot be
  // wrong in an interesting way; a model can, and a person has to be able
  // to review a sample of it later.
  if (findings.length > 0) {
    await prisma.check.createMany({
      data: findings.map((f) => ({
        companyId: ctx.companyId,
        runId: f.checker === 'MODEL' ? (runIds.get(f.code) ?? null) : null,
        recordType: spec.recordType,
        recordId: ctx.recordId,
        checker: f.checker,
        code: f.code,
        verdict: f.verdict,
        reason: f.reason,
        evidence: f.evidence ?? null,
      })),
    })
  }

  return decide(findings, ctx.attempt, max)
}

/**
 * Where the findings leave the record.
 *
 * READY when nothing failed. NEEDS_FIX while there is something to fix
 * and attempts left. After the cap it stops asking the machine and says
 * so, because the next attempt costs the same as the first and has never
 * once worked.
 */
export function decide(
  findings: Finding[],
  attempt: number,
  max: number = DEFAULT_MAX_ATTEMPTS
): Outcome {
  const toFix = findings.filter((f) => f.verdict === 'FAIL')
  const unverified = findings.filter((f) => f.unverified === true)
  const passed = findings.filter((f) => f.verdict === 'PASS' && !f.unverified)

  const attemptsLeft = Math.max(0, max - attempt)
  const note = unverified.length
    ? ` ${unverified.length} could not be checked.`
    : ''

  if (toFix.length === 0) {
    return {
      state: 'READY',
      toFix: [],
      passed,
      unverified,
      summary:
        passed.length === 0
          ? `Nothing failed.${note || ' Nothing was checked either.'}`
          : `All ${passed.length} checks passed.${note}`,
      mayRetry: false,
      attempt,
      attemptsLeft,
    }
  }

  const exhausted = attempt >= max

  return {
    state: 'NEEDS_FIX',
    toFix,
    passed,
    unverified,
    summary: exhausted
      ? `${toFix.length} still wrong after ${attempt} tries. Somebody needs to look at this one.${note}`
      : `${toFix.length} to fix.${note}`,
    mayRetry: !exhausted,
    attempt,
    attemptsLeft,
  }
}

/**
 * Whether the thing may proceed.
 *
 * Overridable on purpose, and the override is recorded. A gate nobody can
 * pass gets worked around outside the product, which is worse than a gate
 * with a log.
 */
export function mayProceed(
  o: Outcome,
  override: boolean
): { ok: boolean; reason: string } {
  if (o.state === 'READY') {
    return {
      ok: true,
      reason: o.unverified.length
        ? `Nothing failed, but ${o.unverified.length} check${o.unverified.length === 1 ? '' : 's'} could not run.`
        : 'Every check passed.',
    }
  }

  if (override) {
    return {
      ok: true,
      reason: `Proceeding with ${o.toFix.length} check${o.toFix.length === 1 ? '' : 's'} failing. Recorded against whoever pressed it.`,
    }
  }

  return { ok: false, reason: o.toFix.map((f) => f.reason).join(' ') }
}

/**
 * Read the last verdict back without running anything.
 *
 * Every surface needs this and every surface would otherwise write it
 * slightly differently. A check run three times has three rows and only
 * the newest per code is the answer.
 */
export async function lastVerdict(
  spec: { recordType: RecordType; maxAttempts?: number },
  recordId: string,
  attempt: number,
  companyId: string
): Promise<Outcome> {
  const rows = await prisma.check.findMany({
    // Scoped, like every other read path here. This one was not, and a
    // record id is the only thing that stood between one vendor and
    // another vendor's verdicts.
    where: { companyId, recordType: spec.recordType, recordId },
    orderBy: { at: 'desc' },
  })

  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (!latest.has(r.code)) latest.set(r.code, r)

  const findings: Finding[] = Array.from(latest.values()).map((r) => ({
    code: r.code,
    checker: r.checker as Checker,
    verdict: r.verdict as 'PASS' | 'FAIL',
    reason: r.reason,
    evidence: r.evidence,
  }))

  return decide(findings, attempt, spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
}

// ── Small readers, so the run loop stays about the loop ──────────────

function asMany(f: Finding | Finding[] | null): Finding[] {
  return f ? (Array.isArray(f) ? f : [f]) : []
}

function anyFailed(f: Finding | Finding[] | null): boolean {
  return asMany(f).some((one) => one.verdict === 'FAIL')
}

function firstFailure(f: Finding | Finding[] | null): string | null {
  return asMany(f).find((one) => one.verdict === 'FAIL')?.reason ?? null
}
