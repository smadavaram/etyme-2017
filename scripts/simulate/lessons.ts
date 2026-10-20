/**
 * A refusal is a lesson, not a stop (CLAUDE.md, 2026-10-20).
 *
 * When a rule refuses an actor, the sentence it said is the lesson. Two
 * hundred hiring managers refused with the same sentence are one lesson
 * learned two hundred times, so refusals are grouped by the sentence and
 * counted. The domain that owns the stage then decides one of two
 * things: the actor was wrong and learns (files the I-9 first), or the
 * rule was wrong and the route's owner changes it.
 *
 * Only refusals a stage did not expect are lessons. A refusal declared
 * with `expectRefusal` is the rule doing its job and is reported beside
 * them, as held or not held.
 *
 * Pure: reads the ledger's rows, writes nothing.
 */
import type { DomainKey } from '@/lib/domains'
import { isRefusal, type Call } from './ledger'

/** The statuses that mean "a rule said no", per the brief. */
export const RULE_REFUSALS = [403, 409, 422] as const

export interface Refusal {
  stage: string
  seat: string
  route: string
  sentence: string
}

export interface Lesson {
  /** The sentence the route said, or a note that it said none. */
  sentence: string
  /** False where the route refused without a sentence: that is a finding of its own. */
  said: boolean
  /** A rule refused (403, 409, 422), or the request itself was wrong (400, 401, 404, 405). */
  kind: 'RULE' | 'REQUEST'
  count: number
  statuses: number[]
  routes: string[]
  /** Owners of the routes that said it: who changes the rule. */
  routeOwners: DomainKey[]
  /** The stages that met it: whose actor learns. */
  stages: string[]
  /** Up to three seats that met it, for reading. */
  seats: string[]
}

export function refusalOf(c: Call): Refusal | null {
  if (!isRefusal(c.status) || c.expected) return null
  return { stage: c.stage, seat: c.seat, route: `${c.method} ${c.route}`, sentence: c.sentence ?? '' }
}

/** Every unexpected refusal, grouped by sentence, most frequent first. */
export function lessonsOf(calls: Call[]): Lesson[] {
  const groups = new Map<string, Lesson>()
  for (const c of calls) {
    const r = refusalOf(c)
    if (!r) continue
    const said = r.sentence.trim().length > 0
    const sentence = said ? r.sentence.trim() : `No sentence was given (status ${c.status}${c.code ? `, code ${c.code}` : ''}).`
    const kind: Lesson['kind'] = (RULE_REFUSALS as readonly number[]).includes(c.status) ? 'RULE' : 'REQUEST'
    const key = `${kind}|${sentence}`
    let g = groups.get(key)
    if (!g) {
      g = { sentence, said, kind, count: 0, statuses: [], routes: [], routeOwners: [], stages: [], seats: [] }
      groups.set(key, g)
    }
    g.count++
    if (!g.statuses.includes(c.status)) g.statuses.push(c.status)
    if (!g.routes.includes(r.route)) g.routes.push(r.route)
    if (c.owner && !g.routeOwners.includes(c.owner)) g.routeOwners.push(c.owner)
    if (!g.stages.includes(r.stage)) g.stages.push(r.stage)
    if (g.seats.length < 3 && !g.seats.includes(r.seat)) g.seats.push(r.seat)
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.sentence.localeCompare(b.sentence))
}
