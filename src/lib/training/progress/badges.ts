import type { Track } from '../courses/types'
import type { LearnProgress } from '../learn-progress'

/**
 * Badges (record 133): one per level whose every lesson she finished, and
 * one for the whole course. The row is hers; nothing here is a balance.
 */
export interface BadgeKind { kind: 'LEVEL' | 'COURSE'; levelKey: string }

export function badgesEarned(track: Track, p: LearnProgress): BadgeKind[] {
  const done = new Set(p.done)
  const levelDone = track.levels.map((lv) => {
    const keys = lv.chapters.flatMap((c) => c.lessons.map((l) => l.key))
    return { key: lv.key, ok: keys.length > 0 && keys.every((k) => done.has(k)) }
  })
  const out: BadgeKind[] = levelDone.filter((l) => l.ok).map((l) => ({ kind: 'LEVEL' as const, levelKey: l.key }))
  if (levelDone.length > 0 && levelDone.every((l) => l.ok)) out.push({ kind: 'COURSE', levelKey: '' })
  return out
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const badgeWords = (b: BadgeKind, trackTitle: string): string =>
  b.kind === 'COURSE' ? `Finished ${trackTitle}` : `${cap(b.levelKey)} level of ${trackTitle}`
