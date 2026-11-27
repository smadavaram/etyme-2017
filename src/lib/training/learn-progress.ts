/**
 * Progress on the learner micro-site, pure. A visitor's progress lives in
 * her own browser only; a signed-in worker's is the same shape, stored on
 * her enrollment (record 133).
 */
export interface LearnProgress {
  /** Lesson keys finished (exercise answered right). */
  done: string[]
  /** Checklist items ticked, by project key. */
  ticks: Record<string, string[]>
}

export const EMPTY_PROGRESS: LearnProgress = { done: [], ticks: {} }

export function readProgress(raw: unknown): LearnProgress {
  const r = (raw ?? {}) as Partial<LearnProgress>
  const done = Array.isArray(r.done) ? r.done.filter((x): x is string => typeof x === 'string') : []
  const ticks: Record<string, string[]> = {}
  if (r.ticks && typeof r.ticks === 'object') for (const [k, v] of Object.entries(r.ticks)) if (Array.isArray(v)) ticks[k] = v.filter((x): x is string => typeof x === 'string')
  return { done: [...new Set(done)], ticks }
}

export function markDone(p: LearnProgress, lessonKey: string, known: string[]): LearnProgress {
  if (!known.includes(lessonKey) || p.done.includes(lessonKey)) return p
  return { ...p, done: [...p.done, lessonKey] }
}

export function setTick(p: LearnProgress, project: string, item: string, on: boolean): LearnProgress {
  const cur = new Set(p.ticks[project] ?? [])
  if (on) cur.add(item); else cur.delete(item)
  return { ...p, ticks: { ...p.ticks, [project]: [...cur] } }
}

export const percentDone = (p: LearnProgress, lessonKeys: string[]): number =>
  lessonKeys.length === 0 ? 0 : Math.round((lessonKeys.filter((k) => p.done.includes(k)).length / lessonKeys.length) * 100)

/** The first lesson not yet done, in reading order; null when all are. */
export const nextLessonKey = (p: LearnProgress, lessonKeys: string[]): string | null => lessonKeys.find((k) => !p.done.includes(k)) ?? null

export const isComplete = (p: LearnProgress, lessonKeys: string[]): boolean => lessonKeys.length > 0 && nextLessonKey(p, lessonKeys) === null

export const storageKey = (tenant: string, track: string): string => `learn:${tenant}:${track}`
