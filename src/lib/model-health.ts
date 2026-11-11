/**
 * Whether the model can be asked on this deployment, read for /api/health
 * and /ready without calling the provider: the key is there (named, never
 * valued), every role resolves to a supported id (lib/model-ids), and the
 * Ask Etyme allowance is set or not (lib/model-allowance).
 */
import { checkModelIds, type ModelIdCheck } from '@/lib/model-ids'
import { allowanceLimits, limitsSet, OPEN_BEFORE_LIMITS_SLUG, type AllowanceLimits } from '@/lib/model-allowance'

type Env = Record<string, string | undefined>

export interface ModelHealth {
  keyPresent: boolean
  idsSupported: boolean
  ids: ModelIdCheck['roles']
  allowanceSet: boolean
  /** Ready to answer: the key is there and every id is supported. */
  ready: boolean
  says: string
}

/**
 * `limits` is what is in force, read by the caller through
 * `currentAllowanceLimits` (the Superadmin screen first, the environment
 * second); without it the environment alone is read, which is what a pure
 * caller with no database gets.
 */
export function modelHealth(env: Env = process.env, limits: AllowanceLimits = allowanceLimits(env)): ModelHealth {
  const keyPresent = Boolean(env.ANTHROPIC_API_KEY?.trim())
  const ids = checkModelIds(env)
  const allowanceSet = limitsSet(limits)
  const allowance = allowanceSet
    ? 'The Ask Etyme allowance is set.'
    : `No Ask Etyme allowance is set (both numbers, on the Superadmin screen or in the deployment's settings), so free text is open only for ${OPEN_BEFORE_LIMITS_SLUG}.`
  const says = !keyPresent
    ? 'No ANTHROPIC_API_KEY, so nothing is sent to a model; the rules answer and the CV evidence check reports itself as unverified.'
    : !ids.ok
      ? `The key is set, but ${ids.says}`
      : `The key is set and every model id is supported. ${allowance}`
  return { keyPresent, idsSupported: ids.ok, ids: ids.roles, allowanceSet, ready: keyPresent && ids.ok, says }
}
