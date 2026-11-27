/**
 * A lesson's video anchor and the animation that steps through it (record
 * 133, Phase 1). Pure: no database and no network. The server never fetches
 * a video: the tenant types a link, and the learner's own browser opens it.
 * A step of a lesson is one of four sections; each may be tied to a span of
 * the video, and each may have frames, the small drawings-in-words the slot
 * plays one after another.
 */
export const LESSON_STEPS = ['intro', 'example', 'try-it', 'exercise'] as const
export type LessonStep = (typeof LESSON_STEPS)[number]

export type VideoSpan = { step: LessonStep; startSec: number; endSec: number }
export type VideoFrame = { step: LessonStep; text: string }
export interface LessonVideoView {
  sourceUrl: string
  startSec: number | null
  endSec: number | null
  steps: VideoSpan[]
  frames: VideoFrame[]
}

/** A frame fades in over this long. The animation sits in the 150-300 ms band the micro-site keeps; reduced motion turns it off. */
export const FRAME_FADE_MS = 200
/** How long a played frame stays before the next one. */
export const FRAME_HOLD_MS = 2500

const MAX_SEC = 86_400
const MAX_FRAMES = 12
const MAX_FRAME_WORDS = 25
const isStep = (s: unknown): s is LessonStep => typeof s === 'string' && (LESSON_STEPS as readonly string[]).includes(s)
const isSec = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_SEC

type Said = { ok: true; video: LessonVideoView } | { ok: false; message: string; field: string }

/** A link the learner's browser may open: https, no password in it, a sane length. */
export function cleanLink(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 500) return null
  try {
    const u = new URL(v.trim())
    if (u.protocol !== 'https:' || u.username || u.password) return null
    return u.toString()
  } catch { return null }
}

/** The video a tenant enters, read whole or refused in a sentence. */
export function cleanVideo(o: { sourceUrl?: unknown; storedFileId?: unknown; startSec?: unknown; endSec?: unknown; steps?: unknown; frames?: unknown }): Said {
  if (o.storedFileId != null && o.storedFileId !== '') return { ok: false, field: 'storedFileId', message: 'Stored files are not offered yet. Paste the link to the video.' }
  const sourceUrl = cleanLink(o.sourceUrl)
  if (!sourceUrl) return { ok: false, field: 'sourceUrl', message: 'Paste a link that starts with https://.' }
  const startSec = o.startSec == null ? null : o.startSec
  const endSec = o.endSec == null ? null : o.endSec
  if ((startSec !== null && !isSec(startSec)) || (endSec !== null && !isSec(endSec))) return { ok: false, field: 'startSec', message: 'Start and end are whole seconds from the start of the video.' }
  if (startSec !== null && endSec !== null && endSec <= startSec) return { ok: false, field: 'endSec', message: 'The end must come after the start.' }
  const lo = (startSec as number | null) ?? 0
  const hi = (endSec as number | null) ?? MAX_SEC

  const steps: VideoSpan[] = []
  if (o.steps != null) {
    if (!Array.isArray(o.steps)) return { ok: false, field: 'steps', message: 'Send each step with its start and end.' }
    for (const s of o.steps as Record<string, unknown>[]) {
      if (!s || !isStep(s.step)) return { ok: false, field: 'steps', message: `A step is one of: ${LESSON_STEPS.join(', ')}.` }
      if (!isSec(s.startSec) || !isSec(s.endSec) || s.endSec <= s.startSec) return { ok: false, field: 'steps', message: 'Each step needs a start and a later end, in whole seconds.' }
      if (s.startSec < lo || s.endSec > hi) return { ok: false, field: 'steps', message: 'A step has to sit inside the span of the video you chose.' }
      if (steps.some((x) => x.step === s.step)) return { ok: false, field: 'steps', message: 'Each step is anchored once.' }
      steps.push({ step: s.step, startSec: s.startSec, endSec: s.endSec })
    }
  }
  const frames: VideoFrame[] = []
  if (o.frames != null) {
    if (!Array.isArray(o.frames) || o.frames.length > MAX_FRAMES) return { ok: false, field: 'frames', message: `Send at most ${MAX_FRAMES} frames.` }
    for (const f of o.frames as Record<string, unknown>[]) {
      const text = typeof f?.text === 'string' ? f.text.trim() : ''
      if (!f || !isStep(f.step) || !text) return { ok: false, field: 'frames', message: 'Each frame names its step and says one short line.' }
      if (text.split(/\s+/).length > MAX_FRAME_WORDS) return { ok: false, field: 'frames', message: `A frame is at most ${MAX_FRAME_WORDS} words.` }
      frames.push({ step: f.step, text })
    }
  }
  return { ok: true, video: { sourceUrl, startSec, endSec, steps, frames } }
}

/** A stored row's Json read back safely; anything that does not fit reads as none, never as a crash. */
export function readVideo(row: { sourceUrl: string | null; startSec: number | null; endSec: number | null; steps: unknown; frames: unknown } | null | undefined): LessonVideoView | null {
  if (!row?.sourceUrl) return null
  const r = cleanVideo({ sourceUrl: row.sourceUrl, startSec: row.startSec, endSec: row.endSec, steps: row.steps, frames: row.frames })
  return r.ok ? r.video : { sourceUrl: row.sourceUrl, startSec: row.startSec, endSec: row.endSec, steps: [], frames: [] }
}

/** Whether the browser can play the link itself, with a seek to a step. Anything else opens as a link. */
export const playsInPage = (url: string): boolean => /\.(mp4|webm|ogg)(\?|#|$)/i.test(url)

/** m:ss for a count of seconds. */
export const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** The frames of one step, in the order written. */
export const framesOf = (v: LessonVideoView | null | undefined, step?: LessonStep): VideoFrame[] => (v?.frames ?? []).filter((f) => !step || f.step === step)

/** The next frame to show, wrapping to the first. */
export const nextFrame = (i: number, total: number): number => (total <= 0 ? 0 : (i + 1) % total)
