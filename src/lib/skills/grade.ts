/**
 * The grader (record 123, plan C2). The only writer of `unitsDone` and of
 * the Check row for a skill run. It hands the checker a read-only
 * database handle, never the agent's report, and records what the checker
 * found: PASS, FAIL, or UNKNOWN, which is "Not graded" and never a pass.
 *
 * Built on `lib/loop`: the finding is the loop's own `Finding`, the
 * outcome is its own `decide`, and the row is a Check written the way the
 * loop writes one (checker RULE, a verdict, a reason, the evidence). It
 * does not call `runLoop`, which would add run rows of its own for every
 * grade and inflate every run count.
 *
 * Actual: the checker's `unitsFound` on a PASS or a FAIL; left null where
 * the checker could not read its key, or could not count.
 */

import { prisma } from '@/lib/db'
import { decide, type Finding } from '@/lib/loop'
import { skillOf } from './registry'
import { CHECKERS } from './checkers'
import { READ_METHODS, unknownBecause, wellFormed, type CheckerResult, type RecordRef, type SkillChecker, type CheckWindow } from './checker'

export const skillCheckCode = (skillKey: string) => `SKILL_${skillKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`

/** A client that answers reads and throws on anything else, so a checker cannot write even by mistake. */
export function readOnlyDb<C extends object>(client: C): any {
  return new Proxy({}, {
    get: (_t, model) => {
      if (typeof model !== 'string' || model.startsWith('$')) {
        throw new Error('A checker only reads: no raw query, no transaction.')
      }
      return new Proxy({}, {
        get: (_m, method) => {
          if (typeof method !== 'string' || !(READ_METHODS as readonly string[]).includes(method)) {
            throw new Error(`A checker only reads: ${String(model)}.${String(method)} is not a read.`)
          }
          const delegate = (client as any)[model]
          return delegate[method].bind(delegate)
        },
      })
    },
  })
}

/**
 * The window a run's work falls in: from just before the step began to just
 * after its row was written. The row is written when the step ends.
 */
export function windowOf(run: { at: Date; ms: number }): CheckWindow {
  const slack = 1000
  return { from: new Date(run.at.getTime() - run.ms - slack), to: new Date(run.at.getTime() + slack) }
}

export interface GradeDeps {
  checkers?: Record<string, SkillChecker<any>>
  client?: any
}

export type GradeOutcome =
  | { graded: false; why: string }
  | { graded: true; verdict: CheckerResult['verdict']; unitsDone: number | null; reason: string }

export async function gradeSkillRun(runId: string, deps: GradeDeps = {}): Promise<GradeOutcome> {
  const checkers = deps.checkers ?? CHECKERS
  const client = deps.client ?? prisma
  const run = await client.agentRun.findUnique({ where: { id: runId } })
  if (!run || !run.skillKey) return { graded: false, why: 'That is not a skill run.' }
  const skill = skillOf(run.skillKey)
  if (!skill) return { graded: false, why: `${run.skillKey} is not a registered skill.` }
  const code = skillCheckCode(skill.key)
  const already = await client.check.findFirst({ where: { companyId: run.companyId, runId: run.id, code }, select: { id: true } })
  if (already) return { graded: false, why: 'This run was graded already.' }

  const checker = checkers[skill.answerKey.checker]
  let result: CheckerResult
  if (!checker) {
    result = unknownBecause(`No checker is built for ${skill.name} yet, so nobody has verified it.`)
  } else {
    const refs: RecordRef[] = [{ recordType: run.recordType, recordId: run.recordId }]
    try {
      result = wellFormed(await checker(run.companyId, skill.key, windowOf(run), refs, readOnlyDb(client)))
        ?? unknownBecause(`The checker for ${skill.name} gave an answer nobody can read, so nobody has verified it.`)
    } catch (e) {
      result = unknownBecause(`The checker for ${skill.name} could not read: ${String((e as Error)?.message ?? e).slice(0, 160)}`)
    }
  }

  // The loop's own words for it. UNKNOWN is unverified, never passed.
  const finding: Finding = result.verdict === 'UNKNOWN'
    ? { code, checker: 'RULE', verdict: 'PASS', unverified: true, reason: result.reason, evidence: result.evidence }
    : { code, checker: 'RULE', verdict: result.verdict, reason: result.reason, evidence: result.evidence }
  const outcome = decide([finding], 1, 1)
  const stored = result.verdict === 'UNKNOWN' ? 'UNKNOWN' : outcome.toFix.length ? 'FAIL' : 'PASS'
  const unitsDone = result.verdict === 'UNKNOWN' ? null : result.unitsFound

  await client.check.create({
    data: {
      companyId: run.companyId, runId: run.id, recordType: run.recordType, recordId: run.recordId,
      checker: 'RULE', code, verdict: stored, reason: result.reason, evidence: result.evidence,
    },
  })
  if (unitsDone !== null) await client.agentRun.update({ where: { id: run.id }, data: { unitsDone } })
  return { graded: true, verdict: result.verdict, unitsDone, reason: result.reason }
}
