/**
 * Every call the simulation made, and the arithmetic over them.
 *
 * One row per call: which seat, which route, what came back, how long
 * it took, and on a refusal the sentence the route said. Everything the
 * report says about timings and faults is computed from these rows and
 * nothing else, so the report cannot say something the run did not do.
 *
 * The arithmetic is pure (`routeStats`, `faultsOf`, `percentile`) so a
 * unit test can hold it without a server.
 */
import type { DomainKey } from '@/lib/domains'
import { routeOf } from './routes'

/** A route whose p95 is slower than this is a fault. Two seconds, the founder's line for "falls over". */
export const SLOW_P95_MS = 2000

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface Call {
  /** Order in the run, from 1. */
  n: number
  /** When the call started, ISO. */
  at: string
  /** The stage that made it, or "harness" for opening seats and running nightly jobs. */
  stage: string
  /** The seat key, e.g. `world-nike/hiring`, `person/helena-marsh`, `cron`. */
  seat: string
  method: Method
  /** The path called, without the query. */
  path: string
  /** The route pattern it reached. */
  route: string
  /** The domain that owns the route's file. */
  owner: DomainKey | null
  /** HTTP status; 0 where the server never answered. */
  status: number
  ms: number
  /** `error.message` on anything that was not a success. */
  sentence?: string
  /** `error.code`, kept beside the sentence, never instead of it. */
  code?: string
  /** True when the stage said it expected a refusal here (`expectRefusal`). */
  expected?: boolean
}

export interface RouteStat {
  method: Method
  route: string
  owner: DomainKey | null
  count: number
  p50: number
  p95: number
  max: number
  /** 5xx and calls nobody answered. */
  errors: number
  errorRate: number
  /** 4xx: a rule said no. Not an error; a lesson. */
  refusals: number
}

export interface Fault {
  method: Method
  route: string
  owner: DomainKey | null
  /** Why it is a fault, in a sentence. */
  why: string
  count: number
  p95: number
  errors: number
  /** The first sentence a failing call returned, where it returned one. */
  sample?: string
}

/** Nearest-rank percentile of an ascending list. Null for an empty list. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]
}

export function isError(status: number): boolean {
  return status === 0 || status >= 500
}

export function isRefusal(status: number): boolean {
  return status >= 400 && status < 500
}

/** Per route, slowest p95 first. */
export function routeStats(calls: Call[]): RouteStat[] {
  const groups = new Map<string, Call[]>()
  for (const c of calls) {
    const key = `${c.method} ${c.route}`
    const list = groups.get(key)
    if (list) list.push(c)
    else groups.set(key, [c])
  }
  const out: RouteStat[] = []
  for (const list of groups.values()) {
    const ms = list.map((c) => c.ms).sort((a, b) => a - b)
    const errors = list.filter((c) => isError(c.status)).length
    out.push({
      method: list[0].method,
      route: list[0].route,
      owner: list[0].owner,
      count: list.length,
      p50: percentile(ms, 50) ?? 0,
      p95: percentile(ms, 95) ?? 0,
      max: ms[ms.length - 1] ?? 0,
      errors,
      errorRate: errors / list.length,
      refusals: list.filter((c) => isRefusal(c.status)).length,
    })
  }
  return out.sort((a, b) => b.p95 - a.p95)
}

/** A route that answered any call with a 5xx, never answered, or whose p95 passed two seconds. */
export function faultsOf(calls: Call[], slowMs = SLOW_P95_MS): Fault[] {
  const out: Fault[] = []
  for (const s of routeStats(calls)) {
    const reasons: string[] = []
    if (s.errors > 0) {
      reasons.push(`${s.errors} of ${s.count} call${s.count === 1 ? '' : 's'} failed with a server error or no answer`)
    }
    if (s.p95 > slowMs) reasons.push(`95% of calls took up to ${(s.p95 / 1000).toFixed(1)}s, over the ${slowMs / 1000}s line`)
    if (reasons.length === 0) continue
    const failing = calls.find((c) => c.method === s.method && c.route === s.route && isError(c.status) && c.sentence)
    out.push({
      method: s.method, route: s.route, owner: s.owner,
      why: reasons.join('; ') + '.',
      count: s.count, p95: s.p95, errors: s.errors,
      sample: failing?.sentence,
    })
  }
  return out
}

/** The slowest single calls. */
export function slowest(calls: Call[], n = 10): Call[] {
  return [...calls].sort((a, b) => b.ms - a.ms).slice(0, n)
}

/**
 * The run's ledger. Stages never write to it directly: every call an
 * actor makes lands here, and the runner says which stage is speaking.
 */
export class Ledger {
  readonly calls: Call[] = []
  /** Expectations a stage declared with `expectRefusal`, and whether they held. */
  readonly expectations: Expectation[] = []
  stage = 'harness'

  record(input: Omit<Call, 'n' | 'route' | 'owner' | 'stage'> & { stage?: string }): Call {
    const ref = routeOf(input.path)
    const call: Call = {
      ...input,
      n: this.calls.length + 1,
      stage: input.stage ?? this.stage,
      route: ref.route,
      owner: ref.owner,
    }
    this.calls.push(call)
    return call
  }

  ofStage(stage: string): Call[] {
    return this.calls.filter((c) => c.stage === stage)
  }
}

export interface Expectation {
  stage: string
  seat: string
  route: string
  /** The words the stage expected in the refusal. */
  phrase: string
  status: number
  sentence: string | null
  held: boolean
  /** The call answered 200 and refused inside it, person by person (a batch). */
  perItem?: boolean
}
