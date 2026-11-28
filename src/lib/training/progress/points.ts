import type { Track } from '../courses/types'
import { lessonsOf } from '../courses/index'
import type { LearnProgress } from '../learn-progress'

/**
 * Points for finishing work, read from the record every time (record 133).
 * A lesson is worth the least, an exercise more, a project the most. There
 * is no stored balance: the number is the arithmetic of what she finished,
 * so it cannot be spent, moved or given away, and nothing here offers a
 * way to.
 */
export const LESSON_POINTS = 5
export const EXERCISE_POINTS = 10
export const PROJECT_POINTS = 50

export interface Points { lessons: number; exercises: number; projects: number; total: number }

/** A finished lesson is its reading and its exercise answered right, so it counts both; a project counts once every item is ticked. */
export function pointsOf(track: Track, p: LearnProgress): Points {
  const known = new Set(lessonsOf(track).map((l) => l.lesson.key))
  const done = p.done.filter((k) => known.has(k)).length
  const projects = track.levels.filter((lv) => {
    const ticked = new Set(p.ticks[lv.project.key] ?? [])
    return lv.project.checklist.length > 0 && lv.project.checklist.every((i) => ticked.has(i))
  }).length
  const lessons = done * LESSON_POINTS, exercises = done * EXERCISE_POINTS, proj = projects * PROJECT_POINTS
  return { lessons, exercises, projects: proj, total: lessons + exercises + proj }
}
