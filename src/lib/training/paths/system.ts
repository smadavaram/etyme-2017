import type { Track, TrackKey } from '../courses/types'
import { lessonsOf } from '../courses/index'

/** What the record says about a person, for a system path. Read by the route; this file reads no database. */
export interface PathSignals {
  role?: string | null
  skills?: string[]
  onBench?: boolean
  gaps?: string[]
  /** Lesson keys she finished before, on any track. */
  priorCompletions?: string[]
  requirementTrack?: TrackKey | null
}

export interface SystemPath { trackKey: TrackKey; steps: string[]; signals: PathSignals; why: string }

const ITWORDS = /(engineer|developer|data|software|devops|analyst|python|java|sql|cloud|qa|tester)/i

/** Pure. The track the record points to; the opening question is the learner's own choice and wins where she made one. */
export function trackFromSignals(s: PathSignals): TrackKey {
  if (s.requirementTrack) return s.requirementTrack
  const text = [s.role ?? '', ...(s.skills ?? [])].join(' ')
  if (ITWORDS.test(text)) return 'it-upgrade'
  if (!s.role && !(s.skills?.length)) return 'entry'
  return 'non-it'
}

/**
 * Pure, rules first. Every lesson of the track in reading order, less what
 * she finished before. Nothing is skipped by a guess: a gap only moves its
 * lessons first, in order.
 */
export function systemPath(track: Track, s: PathSignals): SystemPath {
  const all = lessonsOf(track).map((l) => l.lesson)
  const done = new Set(s.priorCompletions ?? [])
  const gapWords = (s.gaps ?? []).map((g) => g.toLowerCase())
  const rest = all.filter((l) => !done.has(l.key))
  const hits = (l: (typeof all)[number]) => gapWords.some((g) => l.introduces.some((i) => i.toLowerCase().includes(g)) || l.title.toLowerCase().includes(g))
  const first = rest.filter(hits)
  const candidate = [...first, ...rest.filter((l) => !hits(l))]
  // A term is never used before the step that builds it: a gap that would reorder past a use is not honored.
  const inOrder = (xs: typeof all) => {
    const built = new Set(all.filter((l) => done.has(l.key)).flatMap((l) => l.introduces))
    return xs.every((l) => { const ok = l.uses.every((u) => built.has(u)); l.introduces.forEach((t) => built.add(t)); return ok })
  }
  const ordered = (inOrder(candidate) ? candidate : rest).map((l) => l.key)
  return { trackKey: track.key, steps: ordered, signals: s, why: `Made from the record: ${s.role ? `role ${s.role}` : 'no role yet'}, ${done.size} lessons done before${first.length ? `, ${first.length} lessons first for gaps` : ''}.` }
}
