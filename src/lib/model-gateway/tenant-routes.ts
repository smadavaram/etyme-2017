/**
 * A tenant's own model route (record 125, level 2: bring your own model
 * and keys). Pure: no database, no network.
 *
 * Enterprise edition only. The Owner sets a route after a fresh second
 * check. A key is never held here: a route carries `keyRef`, the NAME of a
 * secret in the platform's store, and the key is read from the store by
 * that name when a call is made. Until the platform has a store that can
 * take a tenant's key (`ETYME_TENANT_KEYS_READY`), a route is refused in a
 * sentence and nothing is stored, so nothing is faked.
 *
 * A route is admitted by the same data-class rules as a platform model
 * (`admits`): tenant business data only to a US-hosted route under a signed
 * agreement, declared on the route; Lane C data never. The key's name is
 * derived from the company's own id, so no company can name another's key.
 */

import type { ModelTier, RegisteredModel } from './register'
import { MODEL_TIERS } from './register'

type Env = Record<string, string | undefined>

/** The name of a tenant's key in the platform's secret store. A reference can never name any other variable. */
export const TENANT_KEY_REF_SHAPE = /^ETYME_TM_[A-Z0-9_]{1,60}$/

/** The one key reference a company may hold for a tier. The server derives it; nobody types it. */
export function tenantKeyRef(companyId: string, tier: string): string {
  return `ETYME_TM_${companyId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${tier}`
}

/** Set by the platform's operator once the secret store can take a tenant's key. */
export const TENANT_KEYS_READY_ENV = 'ETYME_TENANT_KEYS_READY'

export const SAYS = {
  notEnterprise: (edition: string) => `Bringing your own model is part of the Enterprise edition. This company is on ${edition === 'USER' ? 'the User' : edition === 'STARTER' ? 'the Starter' : edition} edition.`,
  notOwner: 'Only an Owner sets the company’s own model.',
  storeNotReady: 'Your keys can be added once the secret store is set up.',
  badRef: 'The key is named by Etyme from your company’s own place in the secret store. A key, or another company’s name for one, is never accepted here.',
  badTier: 'Choose the Low or the High tier.',
  needFields: 'A route needs a label, an adapter, a model and a region.',
  noProof: 'Check it is you first: a company’s own model is set only after a fresh second check.',
} as const

export interface RouteInput {
  tier: unknown; label: unknown; adapter: unknown; modelId: unknown; region: unknown
  dpaSignedOn?: unknown; keyRef?: unknown; allowPlatformFallback?: unknown
}

export interface CleanRoute {
  tier: ModelTier; label: string; adapter: string; modelId: string; region: string
  dpaSignedOn: string | null; keyRef: string; allowPlatformFallback: boolean
}

export type Verdict<T> = { ok: true; value: T } | { ok: false; says: string; status: number }

export function secretStoreReady(env: Env = process.env): boolean {
  return env[TENANT_KEYS_READY_ENV]?.trim() === 'yes'
}

/** Whether this company may hold a route of its own, and why not in a sentence. */
export function mayBringOwnModel(i: { edition: string; isOwner: boolean }): Verdict<true> {
  if (i.edition !== 'ENTERPRISE') return { ok: false, says: SAYS.notEnterprise(i.edition), status: 403 }
  if (!i.isOwner) return { ok: false, says: SAYS.notOwner, status: 403 }
  return { ok: true, value: true }
}

/**
 * Read what the Owner typed. A key value pasted into any field is refused,
 * never stored. The reference is derived from the saving company's id; one
 * typed that is not exactly that is refused.
 */
export function cleanRoute(i: RouteInput, companyId: string, env: Env = process.env): Verdict<CleanRoute> {
  if (!secretStoreReady(env)) return { ok: false, says: SAYS.storeNotReady, status: 409 }
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  if (!MODEL_TIERS.includes(i.tier as ModelTier)) return { ok: false, says: SAYS.badTier, status: 422 }
  const label = s(i.label), adapter = s(i.adapter), modelId = s(i.modelId), region = s(i.region)
  if (!label || !adapter || !modelId || !region) return { ok: false, says: SAYS.needFields, status: 422 }
  const keyRef = tenantKeyRef(companyId, i.tier as string)
  const typed = s(i.keyRef)
  if (typed !== null && typed !== keyRef) return { ok: false, says: SAYS.badRef, status: 422 }
  const day = s(i.dpaSignedOn)
  const dpaSignedOn = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) ? day : null
  return {
    ok: true,
    value: { tier: i.tier as ModelTier, label, adapter, modelId, region: region.toUpperCase(), dpaSignedOn, keyRef, allowPlatformFallback: i.allowPlatformFallback === true },
  }
}

export interface RouteRow {
  tier: string; label: string; adapter: string; modelId: string; region: string
  dpaSignedOn: Date | string | null; keyRef: string; allowPlatformFallback: boolean; enabled: boolean
}

/** A stored route as a register entry. It enters for tenant data and is admitted per call by `admits`. */
export function routeAsModel(r: RouteRow): RegisteredModel | null {
  if (!r.enabled || (r.tier !== 'LOW' && r.tier !== 'HIGH') || !TENANT_KEY_REF_SHAPE.test(r.keyRef)) return null
  const day = r.dpaSignedOn instanceof Date ? r.dpaSignedOn.toISOString().slice(0, 10) : r.dpaSignedOn
  return {
    id: r.modelId, label: r.label, adapter: r.adapter, tier: r.tier, classes: ['NON_SENSITIVE', 'TENANT_BUSINESS'],
    region: r.region.toUpperCase(), dpaSignedOn: day ?? null, keyEnv: r.keyRef, byTenant: true,
  }
}

/**
 * The models to try for one tier, in order: the company's own routes first,
 * then the platform's only where a route of the tenant's for this tier
 * allowed it, even where its own route cannot take this kind of data. A company
 * with no route for the tier reads the platform's alone.
 */
export function orderWithTenant(
  tenant: readonly RegisteredModel[], platform: readonly RegisteredModel[], rows: readonly RouteRow[], tier: ModelTier,
): RegisteredModel[] {
  const mine = rows.filter((r) => r.tier === tier && r.enabled)
  // A company with a route for this tier never has its data sent to the platform unless it allowed that,
  // even when its own route is not admitted for this kind of data.
  if (mine.length === 0) return [...platform]
  const allowed = mine.some((r) => r.allowPlatformFallback)
  return allowed ? [...tenant, ...platform] : [...tenant]
}
