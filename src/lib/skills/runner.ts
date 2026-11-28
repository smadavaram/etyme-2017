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

import { tenantIsReadOnly, READ_ONLY_SAYS } from '@/lib/tenant-state'
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
  if (await tenantIsReadOnly(ctx.companyId)) throw new SkillRefused(READ_ONLY_SAYS)
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
  // The tier is the registry's to say. A step may report a move from low to
  // high where its skill allows it, and nothing else; escalatedFrom is set
  // here from the registry tier, never taken from the step.
  const claimed = out.tier ?? skill.tier
  const moved = claimed !== skill.tier
  let tierRefusal: string | null = null
  if (moved) {
    if (skill.tier === 'RULES') tierRefusal = `${skill.name} is a rules skill and reported the ${claimed} tier.`
    else if (!skill.mayEscalate) tierRefusal = `${skill.name} may not change its tier and reported ${claimed}.`
    else if (!(skill.tier === 'LOW' && claimed === 'HIGH')) tierRefusal = `${skill.name} may only move from the low tier to the high tier, and reported ${claimed}.`
  }
  if (tierRefusal) {
    await record({
      ...base, tier: skill.tier, verdict: 'ERROR', ms: Date.now() - started, failReason: tierRefusal,
    })
    throw new SkillRefused(tierRefusal)
  }
  const tier: Tier = claimed
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
    escalatedFrom: moved ? skill.tier : null,
    ...(out.unitsPlanned !== undefined ? { unitsPlanned: out.unitsPlanned } : {}),
  })
  return { result: out.result, runId }
}
