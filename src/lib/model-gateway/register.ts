/**
 * The model register and the admission rules (record 125, plan 9a).
 * Pure: no database, no network, no provider's name.
 *
 * The register is one environment setting, `ETYME_MODEL_REGISTER`, a JSON
 * list. Each entry is one model for one tier, with the data classes it is
 * admitted for, where it is hosted, whether a data processing agreement
 * covers it, the NAME of the variable that holds its key (never the key),
 * and optionally the price Etyme pays for it. A provider's name is at most
 * the `label`, which is text on a setting.
 *
 * Admission, by data class:
 *   NON_SENSITIVE    any model entered for it.
 *   TENANT_BUSINESS  only a model hosted in the US and under a data
 *                    processing agreement. A tenant's own model is the same,
 *                    or else the tenant's recorded opt-in (record 96).
 *   LANE_C           none, ever.
 * Fallback and escalation read the same function, so neither can reach a
 * model the first call could not.
 */

import type { DataClass } from '@/lib/skills/registry'

export type ModelTier = 'LOW' | 'HIGH'
export const MODEL_TIERS: readonly ModelTier[] = ['LOW', 'HIGH']
export const REGISTER_ENV = 'ETYME_MODEL_REGISTER'

/** A class a model can be entered for. Lane C is not one. */
export type AdmittableClass = Exclude<DataClass, 'LANE_C'>

export interface ModelPrice { in: number; out: number; cacheRead?: number }

export interface RegisteredModel {
  /** What the provider calls it. Written only in the environment. */
  id: string
  /** A name for a person to read on a setting. */
  label: string
  /** Which adapter speaks to it. */
  adapter: string
  tier: ModelTier
  classes: AdmittableClass[]
  /** ISO country code of where it runs, upper case. */
  region: string
  /** The day a data processing agreement was signed, or null. */
  dpaSignedOn: string | null
  /** The NAME of the environment variable that holds the key. Null for a model that needs none. */
  keyEnv: string | null
  /** Dollars per million tokens. Absent means no price is set, and cost is recorded as null. */
  price?: ModelPrice
  /** A tenant's own model. Such a model may be admitted for tenant data on the tenant's opt-in. */
  byTenant?: boolean
}

type Env = Record<string, string | undefined>

const validDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/** Whether the model sits in the US and a signed agreement covers it. */
export function usWithDpa(m: Pick<RegisteredModel, 'region' | 'dpaSignedOn'>): boolean {
  return m.region.trim().toUpperCase() === 'US' && validDay(m.dpaSignedOn)
}

export type Admission = { ok: true } | { ok: false; reason: string }

/**
 * May this model be sent data of this class? `tenantOptIn` counts only for
 * a tenant's own model; nothing else is admitted by it.
 */
export function admits(m: RegisteredModel, dataClass: DataClass, opts: { tenantOptIn?: boolean } = {}): Admission {
  if (dataClass === 'LANE_C') return { ok: false, reason: 'No model is admitted for tax IDs, bank details or social security numbers.' }
  if (!m.classes.includes(dataClass)) return { ok: false, reason: `${m.label} is not entered for this kind of data.` }
  if (dataClass === 'NON_SENSITIVE') return { ok: true }
  if (usWithDpa(m)) return { ok: true }
  if (m.byTenant && opts.tenantOptIn === true) return { ok: true }
  return {
    ok: false,
    reason: m.region.trim().toUpperCase() !== 'US'
      ? `${m.label} is hosted outside the US, so it is not sent tenant business data.`
      : `${m.label} has no signed data processing agreement, so it is not sent tenant business data.`,
  }
}

export interface ParsedRegister { models: RegisteredModel[]; problems: string[] }

/**
 * Read the register from its setting. An entry that is malformed, or that
 * enters a model for tenant data without the US and the agreement, is left
 * out and named in `problems`: a model enters for one data class at a time,
 * and only on the terms for that class (a tenant's own model may enter on
 * the opt-in, so it is kept and admitted per call).
 */
export function parseRegister(raw: string | undefined): ParsedRegister {
  const problems: string[] = []
  const text = raw?.trim()
  if (!text) return { models: [], problems: [] }
  let list: unknown
  try { list = JSON.parse(text) } catch { return { models: [], problems: [`${REGISTER_ENV} is not valid JSON, so no model is registered.`] } }
  if (!Array.isArray(list)) return { models: [], problems: [`${REGISTER_ENV} must be a list, so no model is registered.`] }
  const models: RegisteredModel[] = []
  list.forEach((e, i) => {
    const o = (e ?? {}) as Record<string, unknown>
    const where = `Entry ${i + 1}${typeof o.id === 'string' ? ` (${o.id})` : ''}`
    const str = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : null)
    const id = str('id'), adapter = str('adapter'), region = str('region')
    const tier = o.tier
    if (!id || !adapter || !region) return void problems.push(`${where} needs an id, an adapter and a region.`)
    if (tier !== 'LOW' && tier !== 'HIGH') return void problems.push(`${where} must name the tier LOW or HIGH.`)
    const classes = Array.isArray(o.classes) ? o.classes.filter((c): c is AdmittableClass => c === 'NON_SENSITIVE' || c === 'TENANT_BUSINESS') : []
    if (classes.length === 0) return void problems.push(`${where} must name at least one data class it is entered for.`)
    const dpa = validDay(o.dpaSignedOn) ? o.dpaSignedOn : null
    const p = o.price as Partial<ModelPrice> | undefined
    const price = p && typeof p.in === 'number' && typeof p.out === 'number' && p.in >= 0 && p.out >= 0
      ? { in: p.in, out: p.out, ...(typeof p.cacheRead === 'number' && p.cacheRead >= 0 ? { cacheRead: p.cacheRead } : {}) }
      : undefined
    const m: RegisteredModel = {
      id, label: str('label') ?? id, adapter, tier, classes, region: region.toUpperCase(), dpaSignedOn: dpa,
      keyEnv: str('keyEnv'), ...(price ? { price } : {}), ...(o.byTenant === true ? { byTenant: true } : {}),
    }
    if (classes.includes('TENANT_BUSINESS') && !usWithDpa(m) && !m.byTenant) {
      return void problems.push(`${where} is entered for tenant business data but is not hosted in the US under a signed data processing agreement, so it is left out.`)
    }
    models.push(m)
  })
  return { models, problems }
}

/** The register in force. */
export function registerFrom(env: Env = process.env): ParsedRegister {
  return parseRegister(env[REGISTER_ENV])
}

/** Whether the model's key is there. A model that needs no key is always keyed. */
export function keyPresent(m: RegisteredModel, env: Env = process.env): boolean {
  return m.keyEnv === null || Boolean(env[m.keyEnv]?.trim())
}

/**
 * The models that may answer this tier for this data class, in register
 * order (which is the fallback order), with a key present. Empty means
 * "Not configured" and nothing falls through to another tier or class.
 */
export function candidatesFor(
  tier: ModelTier,
  dataClass: DataClass,
  env: Env = process.env,
  opts: { tenantOptIn?: boolean; models?: readonly RegisteredModel[] } = {},
): RegisteredModel[] {
  const models = opts.models ?? registerFrom(env).models
  return models.filter((m) => m.tier === tier && admits(m, dataClass, opts).ok && keyPresent(m, env))
}

/** The price of a registered model id, or null where none is set. Never a guess. */
export function priceFromRegister(id: string, env: Env = process.env): ModelPrice | null {
  return registerFrom(env).models.find((m) => m.id === id)?.price ?? null
}
