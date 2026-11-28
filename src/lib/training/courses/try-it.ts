import type { Lesson, TryRule } from './types'

export interface TryLine { ok: boolean; text: string }
export interface TryResult { passed: boolean; lines: TryLine[]; output: string }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

function oneRule(r: TryRule, input: string): boolean {
  const t = input.toLowerCase()
  switch (r.kind) {
    case 'contains': return t.includes(r.value.toLowerCase())
    case 'containsAny': return r.values.some((v) => t.includes(v.toLowerCase()))
    case 'minWords': return words(input) >= r.value
    case 'maxWords': return words(input) <= r.value
    case 'equals': return t.trim() === r.value.toLowerCase().trim()
  }
}

/**
 * Pure. Reads what the learner typed against the lesson's rules and answers
 * in words. No code is run and no model is called: a visitor never reaches one.
 */
export function evaluateTryIt(lesson: Pick<Lesson, 'tryIt'>, input: string): TryResult {
  if (!input.trim()) return { passed: false, lines: [{ ok: false, text: 'Type something first, then press Run.' }], output: 'Nothing to run yet.' }
  const lines = lesson.tryIt.rules.map((r) => ({ ok: oneRule(r, input), text: r.says }))
  const passed = lines.every((l) => l.ok)
  return { passed, lines, output: passed ? lesson.tryIt.expected : 'Not yet. Read the lines below and change your text.' }
}

/** Pure. Instant right or wrong, with the one-line reason. */
export function checkExercise(lesson: Pick<Lesson, 'exercise'>, choice: number): { right: boolean; reason: string } {
  return { right: choice === lesson.exercise.correctIndex, reason: lesson.exercise.reason }
}
