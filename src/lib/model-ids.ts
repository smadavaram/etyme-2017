/**
 * Which model each kind of call uses: the one place a model id is written.
 *
 * Before 2026-11-11 the ids were typed at each call site, ten of them, and
 * several named ids the provider may no longer answer to, so the first
 * real call after the key went in would have failed where nobody looks.
 * Now every call site asks this file by role, a deployment may override a
 * role with one environment variable, and /api/health and /ready say
 * whether every role resolves to an id in the supported set, without
 * calling the provider.
 *
 *   SMALL  Ask Etyme's free-text answer (the founder: "we don't want a large model")
 *   READ   reading a paper, a sheet, a résumé or a firm's page into fields
 *   CHECK  the evidence check on a submission and the screening of a job
 *   MATCH  matching people to a job
 *
 * Pure: no database, no network.
 */

export type ModelRole = 'SMALL' | 'READ' | 'CHECK' | 'MATCH'

export const MODEL_ROLES: readonly ModelRole[] = ['SMALL', 'READ', 'CHECK', 'MATCH']

/** The ids this build is written and priced against. */
export const SUPPORTED_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const

export const DEFAULT_MODEL: Record<ModelRole, (typeof SUPPORTED_MODELS)[number]> = {
  SMALL: 'claude-haiku-5-5',
  READ: 'claude-sonnet-5-5',
  CHECK: 'claude-opus-5-5',
  MATCH: 'claude-opus-5-5',
}

/**
 * The environment variables that override a role, first one set wins.
 * `CHECK_MODEL` and `MATCH_MODEL` are the names the check and the match
 * engine read before this file existed, kept so a deployment that set
 * them keeps its choice.
 */
export const MODEL_ENV: Record<ModelRole, readonly string[]> = {
  SMALL: ['ETYME_MODEL_SMALL'],
  READ: ['ETYME_MODEL_READ'],
  CHECK: ['ETYME_MODEL_CHECK', 'CHECK_MODEL'],
  MATCH: ['ETYME_MODEL_MATCH', 'MATCH_MODEL'],
}

type Env = Record<string, string | undefined>

/** The id a call of this role sends. An override is used as given; health says whether it is supported. */
export function modelFor(role: ModelRole, env: Env = process.env): string {
  for (const name of MODEL_ENV[role]) {
    const v = env[name]?.trim()
    if (v) return v
  }
  return DEFAULT_MODEL[role]
}

export function isSupportedModel(id: string): boolean {
  return (SUPPORTED_MODELS as readonly string[]).includes(id)
}

export interface ModelIdCheck {
  /** True when every role resolves to a supported id. */
  ok: boolean
  /** Each role, the id it sends, and where that id came from. */
  roles: { role: ModelRole; id: string; from: string; supported: boolean }[]
  says: string
}

/** Whether every role resolves to a supported id. Never calls the provider. */
export function checkModelIds(env: Env = process.env): ModelIdCheck {
  const roles = MODEL_ROLES.map((role) => {
    const from = MODEL_ENV[role].find((n) => env[n]?.trim()) ?? 'default'
    const id = modelFor(role, env)
    return { role, id, from, supported: isSupportedModel(id) }
  })
  const bad = roles.filter((r) => !r.supported)
  return {
    ok: bad.length === 0,
    roles,
    says: bad.length === 0
      ? 'Every model id is one this build supports.'
      : `${bad.map((r) => `${r.from} names ${r.id}`).join('; ')}, which this build does not support. Remove the override or set it to one of ${SUPPORTED_MODELS.join(', ')}.`,
  }
}

/**
 * Dollars per million tokens, read by lib/agent-run's cost. Only ids whose
 * price was written down are here; an id that is not falls to the dearest
 * price there, because under-reporting cost is the direction that lets a
 * bad margin hide. The current ids are not priced yet: nobody has written
 * their price into this file from the provider's table.
 */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}
