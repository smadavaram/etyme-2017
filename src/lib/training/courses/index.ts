import type { CourseContent, Lesson, Track, TrackKey } from './types'
import { IT_UPGRADE } from './it-upgrade'

/** One stamp, read by the opening screen, every track sidebar and the footer. */
export const VERSION = 'Version: Dec 2026'

export const COURSE_SLUG = 'working-in-the-ai-era'

export const COURSES: CourseContent[] = [
  { key: COURSE_SLUG, title: 'Working in the AI era — Tapin onboarding', version: 'Dec 2026', tracks: [IT_UPGRADE] },
]

export const course = (): CourseContent => COURSES[0]
export const trackOf = (key: string): Track | null => course().tracks.find((t) => t.key === key) ?? null

export interface FlatLesson { lesson: Lesson; level: string; chapter: string; index: number }

/** Every lesson of a track in reading order. */
export function lessonsOf(track: Track): FlatLesson[] {
  const out: FlatLesson[] = []
  for (const lv of track.levels) for (const ch of lv.chapters) for (const l of ch.lessons) out.push({ lesson: l, level: lv.title, chapter: ch.title, index: out.length })
  return out
}

export const lessonByKey = (track: Track, key: string): FlatLesson | null => lessonsOf(track).find((l) => l.lesson.key === key) ?? null
export const allLessonKeys = (): string[] => course().tracks.flatMap((t) => lessonsOf(t).map((l) => l.lesson.key))
export type { TrackKey }
