/**
 * `runSkill`: how an agent runs one skill (record 123).
 *
 * - Refuses a skill the agent's plan does not name, and a skill nobody
 *   registered, in a sentence, before anything runs.
 * - Hands the step the agent's own context, so every act goes through
 *   `ctx.act` and the record ledger, as before. Nothing here writes a
 *   ledger row of its own.
 * - Writes exactly one AgentRun row per call, whatever the outcome: the
 *   skill, the agent, the tier, Planned. A rules call is cost zero and has
 *   no model. A model call carries its tokens, and a model with no price
 *   records cost as not set.
 * - Never writes `unitsDone`. Actual is the grader's alone, from what a
 *   checker re-read (`lib/skills/grade`).
 */

import { record, type RecordType, type Usage, type Verdict } from '@/lib/agent-run'
import { CapReached, type AgentContext } from '@/lib/agents/runner'
import { planOf } from '@/lib/agents/plans'
import { skillOf, type Tier } from './registry'

export class SkillRefused extends Error {}

export interface SkillCall {
  /** What the skill ran on; the checker reads it back from the run row. */
  recordType: string
  recordId: string
  /** How many units this call had in scope. The agent's own count, shown as Planned. */
  unitsPlanned?: number | null
  consideredCount?: number | null
  scoredCount?: number | null
}

export interface SkillOutcome<T> {
  result: T
  verdict?: Verdict
  failReason?: string | null
  /** A model call only. A rules skill returns none of these. */
  model?: string | null
  usage?: Usage | null
  tier?: Tier
  byTenantModel?: boolean
  fallbackFrom?: string | null
  escalatedFrom?: string | null
  unitsPlanned?: number | null
}

export async function runSkill<T>(
  ctx: AgentContext,
  skillKey: string,
  call: SkillCall,
  step: (ctx: AgentContext) => Promise<SkillOutcome<T>>,
): Promise<{ result: T; runId: string | null }> {
  const skill = skillOf(skillKey)
  if (!skill) throw new SkillRefused(`${skillKey} is not a registered skill, so it did not run.`)
  const plan = planOf(ctx.agentKey)
  if (!plan || !plan.skills.includes(skillKey)) {
    throw new SkillRefused(`${skill.name} is not in the plan of ${ctx.agentKey}, so it did not run.`)
  }
  const base = {
    companyId: ctx.companyId,
    agent: skill.key,
    recordType: call.recordType as RecordType,
    recordId: call.recordId,
    skillKey: skill.key,
    agentKey: ctx.agentKey,
    unitsPlanned: call.unitsPlanned ?? null,
    consideredCount: call.consideredCount ?? null,
    scoredCount: call.scoredCount ?? null,
  }
  const started = Date.now()
  let out: SkillOutcome<T>
  try {
    out = await step(ctx)
  } catch (e) {
    await record({
      ...base, tier: skill.tier, verdict: 'ERROR', ms: Date.now() - started,
      failReason: e instanceof CapReached ? 'Stopped at the day’s cap.' : String((e as Error)?.message ?? e).slice(0, 300),
    })
    throw e
  }
  if (skill.tier === 'RULES' && (out.model || out.usage)) {
    await record({
      ...base, tier: 'RULES', verdict: 'ERROR', ms: Date.now() - started,
      failReason: `${skill.name} is a rules skill and called a model.`,
    })
    throw new SkillRefused(`${skill.name} is a rules skill and may not call a model.`)
  }
  const tier: Tier = skill.tier === 'RULES' ? 'RULES' : (out.tier ?? skill.tier)
  const runId = await record({
    ...base,
    tier,
    verdict: out.verdict ?? 'PASS',
    failReason: out.failReason ?? null,
    model: out.model ?? null,
    usage: out.usage ?? null,
    ms: Date.now() - started,
    byTenantModel: out.byTenantModel ?? false,
    fallbackFrom: out.fallbackFrom ?? null,
    escalatedFrom: out.escalatedFrom ?? null,
    ...(out.unitsPlanned !== undefined ? { unitsPlanned: out.unitsPlanned } : {}),
  })
  return { result: out.result, runId }
}
