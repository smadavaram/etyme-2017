import type { Track } from './types'
import { lessonsOf } from './index'

const PRICE = /(\$\s?\d|\busd\b|\bprice\b|\bcost\b|per seat|a seat|\bfee\b|\bcharge)/i

/** Pure. What a track still lacks of the agreed format (nine chapters in three levels of three, one project each, goodAt). */
export function shapeGaps(t: Track): string[] {
  const gaps: string[] = []
  if (t.goodAt.length < 3) gaps.push(`${t.title}: "What you will be good at" has fewer than three verbs.`)
  if (t.levels.length !== 3) gaps.push(`${t.title}: has ${t.levels.length} levels, not three.`)
  for (const lv of t.levels) {
    if (lv.chapters.length !== 3) gaps.push(`${t.title} / ${lv.title}: has ${lv.chapters.length} chapters, not three.`)
    if (!lv.project.checklist.length) gaps.push(`${t.title} / ${lv.title}: its project has no checklist.`)
    for (const ch of lv.chapters) if (!ch.lessons.length) gaps.push(`${t.title} / ${ch.title}: has no lessons.`)
  }
  return gaps
}

/** Pure. A term used before the step that builds it, or never built. */
export function termGaps(t: Track): string[] {
  const built = new Set<string>()
  const gaps: string[] = []
  for (const { lesson } of lessonsOf(t)) {
    for (const u of lesson.uses) if (!built.has(u)) gaps.push(`${lesson.key} uses "${u}" before any lesson builds it.`)
    for (const i of lesson.introduces) built.add(i)
  }
  return gaps
}

/** Pure. A lesson missing a part of the one-lesson-per-screen shape. */
export function lessonGaps(t: Track): string[] {
  const gaps: string[] = []
  for (const { lesson: l } of lessonsOf(t)) {
    if (!l.intro.trim() || !l.example.text.trim()) gaps.push(`${l.key}: needs an intro and an example.`)
    if (!l.tryIt.rules.length || !l.tryIt.expected.trim()) gaps.push(`${l.key}: its try-it has no rules or no expected result.`)
    const e = l.exercise
    if (e.choices.length < 2 || e.correctIndex < 0 || e.correctIndex >= e.choices.length) gaps.push(`${l.key}: its exercise has no right answer among its choices.`)
    if (!e.reason.trim() || /[\n]/.test(e.reason)) gaps.push(`${l.key}: its exercise needs a one-line reason.`)
  }
  return gaps
}

/** Pure. Every text a learner reads on the track, for the words guards. */
export function wordsOf(t: Track): string {
  const out: string[] = [t.title, ...t.goodAt]
  for (const lv of t.levels) {
    out.push(lv.title, lv.project.title, ...lv.project.checklist)
    for (const ch of lv.chapters) {
      out.push(ch.title)
      for (const l of ch.lessons) out.push(l.title, l.intro, l.example.text, l.tryIt.prompt, l.tryIt.starter, l.tryIt.expected, l.exercise.question, ...l.exercise.choices, l.exercise.reason, ...l.tryIt.rules.map((r) => r.says))
    }
  }
  return out.join('\n')
}

export const mentionsPrice = (text: string): boolean => PRICE.test(text)

/** The words a slot shows where a lesson has no video. */
export function videoSlotWords(v: { sourceUrl?: string; storedFileId?: string } | null | undefined): string {
  return v && (v.sourceUrl || v.storedFileId) ? 'Watch the video' : 'Video coming'
}
