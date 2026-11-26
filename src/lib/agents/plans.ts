/**
 * Agents are plans of skills (record 123). A plan names the skills an agent
 * may run, in order, and the one skill whose line is the agent's own line
 * on the performance panel (`outputSkill`). Pure data and two small readers.
 *
 * The table starts empty: no agent is migrated by the framework. Each
 * agent's owner adds its plan in the commit that moves the agent onto
 * skills, after its golden snapshot.
 */

import { SKILLS, type Skill } from '@/lib/skills/registry'

export interface AgentPlan {
  agentKey: string
  /** In the order the agent runs them. */
  skills: readonly string[]
  /** The skill whose line stands for the agent. Must be one of `skills`. */
  outputSkill: string
}

const plans = new Map<string, AgentPlan>()
export function registerPlan(plan: AgentPlan) { plans.set(plan.agentKey, plan) }
export function unregisterPlan(agentKey: string) { plans.delete(agentKey) }
export const planOf = (agentKey: string): AgentPlan | null => plans.get(agentKey) ?? null
export const plannedAgents = (): string[] => [...plans.keys()]

/** What is wrong with a plan, one sentence each. Empty means it may stand. */
export function planGaps(plan: AgentPlan, skills: readonly Skill[] = SKILLS): string[] {
  const known = new Set(skills.map((s) => s.key))
  const gaps: string[] = []
  const at = `Agent ${plan.agentKey || '(no key)'}`
  if (!plan.agentKey) gaps.push('A plan has no agent key.')
  if (plan.skills.length === 0) gaps.push(`${at} names no skills.`)
  for (const k of plan.skills) if (!known.has(k)) gaps.push(`${at} names ${k}, which is not a registered skill.`)
  if (new Set(plan.skills).size !== plan.skills.length) gaps.push(`${at} names a skill twice.`)
  if (!plan.skills.includes(plan.outputSkill)) gaps.push(`${at} has an output skill, ${plan.outputSkill || '(none)'}, that is not in its own plan.`)
  return gaps
}
