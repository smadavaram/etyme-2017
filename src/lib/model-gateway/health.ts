/**
 * Whether the gateway can answer, for /api/health and /ready (record 125,
 * plan 9d). Read from the register and the environment; the provider is
 * never called. "Not configured" is a plain state and never a gate: nothing
 * about a release waits on it.
 */
import { MODEL_TIERS, REGISTER_ENV, admits, keyPresent, registerFrom, type ModelTier } from './register'

type Env = Record<string, string | undefined>

export interface GatewayModelLine {
  id: string
  label: string
  tier: ModelTier
  /** Named for the person reading it; never the key. */
  keyEnv: string | null
  keyed: boolean
  /** Whether tenant business data may be sent to it. */
  tenantData: boolean
  priced: boolean
}

export interface GatewayHealth {
  /** At least one registered model has its key. */
  configured: boolean
  models: GatewayModelLine[]
  /** Entries the register left out, each in a sentence. */
  problems: string[]
  /** Per tier: how many keyed models may answer tenant business data. */
  tenantReady: Record<ModelTier, number>
  says: string
}

export function gatewayHealth(env: Env = process.env): GatewayHealth {
  const { models, problems } = registerFrom(env)
  const lines: GatewayModelLine[] = models.map((m) => ({
    id: m.id, label: m.label, tier: m.tier, keyEnv: m.keyEnv, keyed: keyPresent(m, env),
    tenantData: admits(m, 'TENANT_BUSINESS').ok, priced: m.price !== undefined,
  }))
  const tenantReady = Object.fromEntries(
    MODEL_TIERS.map((t) => [t, lines.filter((l) => l.tier === t && l.keyed && l.tenantData).length]),
  ) as Record<ModelTier, number>
  const configured = lines.some((l) => l.keyed)
  const unkeyed = lines.filter((l) => !l.keyed)
  const parts: string[] = []
  if (lines.length === 0) {
    parts.push(`Not configured. No model is registered (${REGISTER_ENV}), so nothing is sent to a model; the rules answer.`)
  } else if (!configured) {
    parts.push(`Not configured. ${lines.length === 1 ? 'The registered model has' : 'The registered models have'} no key set (${unkeyed.map((l) => l.keyEnv ?? l.id).join(', ')}), so nothing is sent to a model; the rules answer.`)
  } else {
    parts.push(
      `${lines.filter((l) => l.keyed).length} model${lines.filter((l) => l.keyed).length === 1 ? '' : 's'} ready: ` +
      `${tenantReady.LOW} low-tier and ${tenantReady.HIGH} high-tier for tenant business data.`,
    )
    if (tenantReady.LOW === 0) parts.push('No low-tier model may be sent tenant business data, so those steps read Not configured.')
    if (unkeyed.length) parts.push(`No key set for ${unkeyed.map((l) => l.label).join(', ')}.`)
    if (lines.some((l) => l.keyed && !l.priced)) parts.push('Cost is recorded as not set for a model with no price.')
  }
  if (problems.length) parts.push(problems.join(' '))
  return { configured, models: lines, problems, tenantReady, says: parts.join(' ') }
}
