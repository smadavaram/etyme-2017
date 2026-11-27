/**
 * Whether the model can be asked on this deployment, read for /api/health
 * and /ready without calling the provider: the key is there (named, never
 * valued), the model register reads cleanly (lib/model-ids), and the
 * Ask Etyme allowance is set or not (lib/model-allowance).
 */
import { checkModelIds, type ModelIdCheck } from '@/lib/model-ids'
import { gatewayHealth, type GatewayHealth } from '@/lib/model-gateway/health'
import { allowanceLimits, limitsSet, OPEN_BEFORE_LIMITS_NAME, type AllowanceLimits } from '@/lib/model-allowance'

type Env = Record<string, string | undefined>

export interface ModelHealth {
  keyPresent: boolean
  idsSupported: boolean
  ids: ModelIdCheck['roles']
  allowanceSet: boolean
  /** The gateway's own state (record 125): the register, the keys, and whether tenant data has a model. */
  gateway: GatewayHealth
  /** Ready to answer: a registered model has its key and the register read cleanly. */
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
  const gateway = gatewayHealth(env)
  const keyPresent = gateway.configured
  const ids = checkModelIds(env)
  const allowanceSet = limitsSet(limits)
  const allowance = allowanceSet
    ? 'The Ask Etyme allowance is set.'
    : `No Ask Etyme allowance is set (both numbers, on the Superadmin screen or in the deployment's settings), so free text is open only for ${OPEN_BEFORE_LIMITS_NAME}.`
  const says = !keyPresent
    ? `${gateway.says} The CV evidence check is recorded as unverified, with the reason, never as a pass.`
    : !ids.ok
      ? `A model has its key, but ${ids.says}`
      : `${gateway.says} ${allowance}`
  return { keyPresent, idsSupported: ids.ok, ids: ids.roles, allowanceSet, gateway, ready: keyPresent && ids.ok, says }
}
