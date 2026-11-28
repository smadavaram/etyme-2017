import { describe, it, expect } from 'vitest'
import { IT_UPGRADE_MEDIUM as LEVEL, MEDIUM_BUILDS_ON, MEDIUM_GLOSSARY, MEDIUM_TRY_SAMPLES, MEDIUM_PICTURES } from '@/lib/training/courses/it-upgrade-medium'
import { lessonGaps, termGaps, mentionsPrice, videoSlotWords } from '@/lib/training/courses/shape'
import { evaluateTryIt, checkExercise } from '@/lib/training/courses/try-it'
import type { Lesson, Track } from '@/lib/training/courses/types'

const lessons: Lesson[] = LEVEL.chapters.flatMap((c) => c.lessons)
const asTrack: Track = { key: 'it-upgrade', title: 'IT — Upgrade', goodAt: [], levels: [LEVEL] }

/** What a learner reads as sentences on one lesson; the monospace example is lines, not prose. */
const proseOf = (l: Lesson): string[] => [
  l.title, l.intro, ...(l.example.mono ? [] : [l.example.text]), l.tryIt.prompt, l.tryIt.expected,
  ...l.tryIt.rules.map((r) => r.says), l.exercise.question, ...l.exercise.choices, l.exercise.reason,
]
const allOf = (l: Lesson): string => [...proseOf(l), l.example.text, l.tryIt.starter].join('\n')
const sentences = (text: string): string[] => text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean)
const says = (term: string) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i')

describe('IT — Upgrade, the Medium level: its shape', () => {
  it('has three chapters, numbered four to six, each with lessons', () => {
    expect(LEVEL.key).toBe('medium')
    expect(LEVEL.chapters.map((c) => c.key.slice(0, 6))).toEqual(['it-ch4', 'it-ch5', 'it-ch6'])
    for (const c of LEVEL.chapters) expect(c.lessons.length, c.title).toBeGreaterThanOrEqual(3)
  })
  it('every lesson has an intro, an example, a try-it with rules and an exercise with a one-line reason', () => {
    expect(lessonGaps(asTrack)).toEqual([])
    for (const l of lessons) {
      expect(l.exercise.choices.length, l.key).toBeGreaterThanOrEqual(3)
      expect(l.tryIt.prompt.trim(), l.key).not.toBe('')
    }
  })
  it('no two lessons share a key, and every key says level two', () => {
    const keys = lessons.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^it-2-[456]-\d$/)
  })
  it('the level closes with one hands-on project, ticked as a checklist', () => {
    expect(LEVEL.project.checklist.length).toBeGreaterThanOrEqual(6)
    expect(new Set(LEVEL.project.checklist).size).toBe(LEVEL.project.checklist.length)
  })
  it('every lesson works without a video, and its slot reads Video coming', () => {
    for (const l of lessons) expect(videoSlotWords(l.video), l.key).toBe('Video coming')
  })
})

describe('IT — Upgrade, the Medium level: one new idea a step, in glossary order', () => {
  it('every lesson builds exactly one term, and the terms are built in the glossary’s order', () => {
    for (const l of lessons) expect(l.introduces.length, l.key).toBe(1)
    expect(lessons.map((l) => l.introduces[0])).toEqual([...MEDIUM_GLOSSARY])
  })
  it('no lesson declares a term before the step that builds it, counting what the Simple level built', () => {
    const simple: Lesson = { ...lessons[0], key: 'simple-stands-in', introduces: [...MEDIUM_BUILDS_ON], uses: [] }
    const track: Track = { ...asTrack, levels: [{ ...LEVEL, chapters: [{ key: 'simple', title: 'Simple', lessons: [simple] }, ...LEVEL.chapters] }] }
    expect(termGaps(track)).toEqual([])
  })
  it('no lesson’s words say a glossary term before the lesson that builds it', () => {
    const found: string[] = []
    lessons.forEach((l, i) => {
      for (const later of MEDIUM_GLOSSARY.slice(i + 1)) if (says(later).test(allOf(l))) found.push(`${l.key} says "${later}" early`)
    })
    expect(found).toEqual([])
  })
  it('a lesson says the term it builds, and declares every earlier term its words use', () => {
    const gaps: string[] = []
    lessons.forEach((l, i) => {
      if (!says(l.introduces[0]).test(l.intro)) gaps.push(`${l.key} never says "${l.introduces[0]}"`)
      for (const earlier of MEDIUM_GLOSSARY.slice(0, i)) {
        if (says(earlier).test(allOf(l)) && !l.uses.includes(earlier)) gaps.push(`${l.key} says "${earlier}" and does not declare it`)
      }
    })
    expect(gaps).toEqual([])
  })
  it('the system steps come in order: the reply is already built, the document lookup is first here, and planning and acting are left to the next level', () => {
    expect(MEDIUM_BUILDS_ON).toContain('reply')
    expect(lessons[0].introduces).toEqual(['document lookup'])
    for (const t of MEDIUM_GLOSSARY.slice(0, -1)) expect(t).not.toMatch(/plan|agent|\bact\b/)
    expect(lessons[lessons.length - 1].introduces).toEqual(['describe, never act'])
  })
})

describe('IT — Upgrade, the Medium level: try it and the exercise', () => {
  it('every try-it has a sample its rules accept and a wrong answer they refuse', () => {
    expect(Object.keys(MEDIUM_TRY_SAMPLES).sort()).toEqual(lessons.map((l) => l.key).sort())
    for (const l of lessons) {
      const s = MEDIUM_TRY_SAMPLES[l.key]
      const right = evaluateTryIt(l, s.right)
      expect(right.passed, `${l.key} refuses: ${s.right}`).toBe(true)
      expect(right.output).toBe(l.tryIt.expected)
      const wrong = evaluateTryIt(l, s.wrong)
      expect(wrong.passed, `${l.key} accepts: ${s.wrong}`).toBe(false)
      expect(wrong.lines.some((x) => !x.ok && x.text.trim() !== '')).toBe(true)
    }
  })
  it('the text a try-it starts with does not pass before the learner has done anything', () => {
    for (const l of lessons) expect(evaluateTryIt(l, l.tryIt.starter).passed, l.key).toBe(false)
  })
  it('every exercise has one right answer, and a wrong pick reads the same one-line reason', () => {
    for (const l of lessons) {
      const picks = l.exercise.choices.map((_, n) => checkExercise(l, n))
      expect(picks.filter((p) => p.right).length, l.key).toBe(1)
      for (const p of picks) expect(p.reason).toBe(l.exercise.reason)
      expect(sentences(l.exercise.reason).length, l.key).toBe(1)
    }
  })
})

describe('IT — Upgrade, the Medium level: the words', () => {
  it('no sentence a learner reads is longer than twenty-five words', () => {
    const long: string[] = []
    for (const text of [...lessons.flatMap(proseOf), LEVEL.project.title, ...LEVEL.project.checklist, ...LEVEL.chapters.map((c) => c.title)]) {
      for (const s of sentences(text)) if (s.split(/\s+/).length > 25) long.push(s)
    }
    expect(long).toEqual([])
  })
  it('an intro is short: five sentences at most', () => {
    expect(lessons.filter((l) => sentences(l.intro).length > 5).map((l) => l.key)).toEqual([])
  })
  it('nothing says a price, and nothing uses the two words nobody uses or a British spelling', () => {
    const all = [...lessons.map(allOf), LEVEL.project.title, ...LEVEL.project.checklist, ...LEVEL.chapters.map((c) => c.title), ...Object.values(MEDIUM_PICTURES).flatMap((p) => [p.alt, p.svg])].join('\n')
    expect(mentionsPrice(all)).toBe(false)
    expect(all).not.toMatch(/\b(desk|program office)\b/i)
    expect(all).not.toMatch(/\b(programme|authoris|colour|centre|organis|recognis|licence)\w*/i)
  })
  it('each lesson walks one screen: what is on the screen, then what happens behind it', () => {
    for (const l of lessons) {
      expect(l.intro, l.key).toMatch(/^On the screen, /)
      expect(l.intro, l.key).toMatch(/Behind the screen, /)
    }
  })
  it('what the lessons quote from Ask Etyme is what Ask Etyme says', async () => {
    const ask = await import('@/app/api/conversations/twin/ask')
    const { ONLY_THE_RECORD } = await import('@/app/api/conversations/twin/transaction')
    const flat = (s: string) => s.replace(/\s+/g, ' ')
    const text = flat(lessons.map(allOf).join('\n'))
    expect(text).toContain(ask.NOT_YET)
    expect(text).toContain(ask.ASK_THE_DESK)
    expect(text).toContain(flat(ONLY_THE_RECORD))
    expect(text).toContain(ask.marginRefusal('CLIENT').says)
    expect(ask.boundarySays('OFF')).toContain('Your data stays in your company. Every read is logged.')
    expect(ask.modelState(true, {})).toBe('NO_KEY')
    expect(ask.modelState(false, {})).toBe('OFF')
    for (const q of ['What needs me today?', 'Which weeks are unsigned?', 'Who is near the time limit?', 'What did we spend by supplier this month?']) {
      expect(ask.readAsk(q).kind, q).not.toBe('ASK')
    }
  })
  it('a picture is original inline SVG with a sentence for a reader who cannot see it, and belongs to a lesson', () => {
    for (const [key, p] of Object.entries(MEDIUM_PICTURES)) {
      expect(lessons.some((l) => l.key === key), key).toBe(true)
      expect(p.svg).toMatch(/^<svg [^>]*role="img"/)
      expect(p.svg).not.toMatch(/<image|href=|<script|animate/i)
      expect(p.alt.trim().split(/\s+/).length).toBeGreaterThan(5)
    }
  })
})
