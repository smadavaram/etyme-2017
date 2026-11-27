/**
 * The first course's content, as typed data (record 133). Lessons are never
 * rows in a table: a public page reads this file directly, and the signed-in
 * write-back stores lesson keys against it. The content writers fill the
 * track files; the shape tests in `shape.ts` say what is still missing.
 */

export type TrackKey = 'kids' | 'entry' | 'non-it' | 'it-upgrade'
export type LevelKey = 'simple' | 'medium' | 'complex'

/**
 * One check a try-it input is read against. Rules are plain data: nothing
 * here runs code, and no model is ever called for a visitor.
 */
export type TryRule =
  | { kind: 'contains'; value: string; says: string }
  | { kind: 'containsAny'; values: string[]; says: string }
  | { kind: 'minWords'; value: number; says: string }
  | { kind: 'maxWords'; value: number; says: string }
  | { kind: 'equals'; value: string; says: string }

export interface VideoAnchor {
  /** A link the learner's own browser opens. Never fetched by the server. */
  sourceUrl?: string
  /** A stored file of the tenant's own. */
  storedFileId?: string
  /** Moments in the video, each tied to the step it becomes. */
  stamps?: { atSec: number; step: string }[]
}

export interface Lesson {
  key: string
  title: string
  intro: string
  /** Terms this lesson builds. */
  introduces: string[]
  /** Terms this lesson uses; each must be introduced in an earlier lesson. */
  uses: string[]
  example: { text: string; mono?: boolean }
  tryIt: { prompt: string; starter: string; rules: TryRule[]; expected: string }
  exercise: { question: string; choices: string[]; correctIndex: number; reason: string }
  /** Null or absent: the slot reads "Video coming" and the lesson works without it. */
  video?: VideoAnchor | null
}

export interface Project { key: string; title: string; checklist: string[] }
export interface Chapter { key: string; title: string; lessons: Lesson[] }
export interface Level { key: LevelKey; title: string; chapters: Chapter[]; project: Project }

export interface Track {
  key: TrackKey
  title: string
  /** Plain verbs. Opens the track and is recapped at its end. */
  goodAt: string[]
  levels: Level[]
  /** True while the content writers have not filled the track. Shape tests skip a placeholder's counts, never its term order. */
  placeholder?: boolean
}

export interface CourseContent {
  key: string
  title: string
  version: string
  tracks: Track[]
}
