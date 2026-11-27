/**
 * Which model a direct call uses, read from the model register (record 125,
 * plan step 12). No model id is written in code: the ids, their hosting,
 * their agreements and their prices are entries of one environment setting
 * (`ETYME_MODEL_REGISTER`, lib/model-gateway/register), and this file keeps
 * only the names of the roles and the tier each starts on.
 *
 *   SMALL  Ask Etyme's free-text answer
 *   READ   reading a paper, a sheet, a résumé or a firm's page into fields
 *   CHECK  the evidence check on a submission and the screening of a job
 *   MATCH  matching people to a job
 *
 * Every role starts on the low tier, as the skill registry has it; only the
 * gateway moves a step to the high tier. A role asks for tenant business
 * data, so only a model the register admits for it (US, signed agreement)
 * is ever returned. Where no model is registered and keyed the id is empty
 * and the role reads Not configured.
 *
 * Pure: no database, no network.
 */

import { candidatesFor, registerFrom, type ModelTier } from '@/lib/model-gateway/register'

export type ModelRole = 'SMALL' | 'READ' | 'CHECK' | 'MATCH'

export const MODEL_ROLES: readonly ModelRole[] = ['SMALL', 'READ', 'CHECK', 'MATCH']

/** The tier each role starts on. */
export const ROLE_TIER: Record<ModelRole, ModelTier> = { SMALL: 'LOW', READ: 'LOW', CHECK: 'LOW', MATCH: 'LOW' }

/** What a role reads when nothing is registered and keyed. */
export const NO_MODEL = ''

type Env = Record<string, string | undefined>

/** The id a call of this role sends: the first admitted, keyed model of its tier, in register order. */
export function modelFor(role: ModelRole, env: Env = process.env): string {
  return candidatesFor(ROLE_TIER[role], 'TENANT_BUSINESS', env)[0]?.id ?? NO_MODEL
}

export interface ModelIdCheck {
  /** True when the register read cleanly: no entry was left out. */
  ok: boolean
  /** Each role, its tier, and the id it sends (null where Not configured). */
  roles: { role: ModelRole; tier: ModelTier; id: string | null; configured: boolean }[]
  says: string
}

/** Whether the register read cleanly and what each role resolves to. Never calls a provider. */
export function checkModelIds(env: Env = process.env): ModelIdCheck {
  const { problems } = registerFrom(env)
  const roles = MODEL_ROLES.map((role) => {
    const id = modelFor(role, env)
    return { role, tier: ROLE_TIER[role], id: id || null, configured: id !== NO_MODEL }
  })
  return {
    ok: problems.length === 0,
    roles,
    says: problems.length === 0
      ? 'The model register read cleanly.'
      : `${problems.join(' ')} Fix the entry in ETYME_MODEL_REGISTER.`,
  }
}
