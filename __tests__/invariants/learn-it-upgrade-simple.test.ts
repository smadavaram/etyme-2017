import { describe, it, expect } from 'vitest'
import { IT_UPGRADE_SIMPLE as LEVEL, IT_UPGRADE_GOOD_AT, SIMPLE_GLOSSARY, SIMPLE_TRY_SAMPLES, SIMPLE_PICTURES } from '@/lib/training/courses/it-upgrade-simple'
import { trackOf, lessonsOf } from '@/lib/training/courses/index'
import { lessonGaps, termGaps, mentionsPrice, videoSlotWords } from '@/lib/training/courses/shape'
import { evaluateTryIt, checkExercise } from '@/lib/training/courses/try-it'
import type { Lesson, Track } from '@/lib/training/courses/types'
import { WORKER_QUESTIONS, WORKER_FOOTER, FILE_IT_YOURSELF, NOT_ANOTHER_PERSON, readWorkerAsk } from '@/app/api/conversations/twin/worker'
import { STAY_CHOICES } from '@/lib/bench-stay'
import { britishSpellings, wordsNobodyUses } from '@/lib/positioning'

const lessons: Lesson[] = LEVEL.chapters.flatMap((c) => c.lessons)
const asTrack: Track = { key: 'it-upgrade', title: 'IT — Upgrade', goodAt: IT_UPGRADE_GOOD_AT, levels: [LEVEL] }

/** What a learner reads as sentences on one lesson; the monospace example is lines, not prose. */
const proseOf = (l: Lesson): string[] => [
  l.title, l.intro, ...(l.example.mono ? [] : [l.example.text]), l.tryIt.prompt, l.tryIt.expected,
  ...l.tryIt.rules.map((r) => r.says), l.exercise.question, ...l.exercise.choices, l.exercise.reason,
]
const allOf = (l: Lesson): string => [...proseOf(l), l.example.text, l.tryIt.starter].join('\n')
const sentences = (text: string): string[] => text.split(/(?<=[.?!]|[.?!]”)\s+/).map((s) => s.trim()).filter(Boolean)
const says = (term: string) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i')
const everyWord = [...IT_UPGRADE_GOOD_AT, LEVEL.project.title, ...LEVEL.project.checklist, ...LEVEL.chapters.map((c) => c.title), ...lessons.map(allOf)].join('\n')

/** How each glossary term shows up in a sentence, where the plain plural is not enough. */
const SAID: Record<string, RegExp> = {
  approval: /\bapprov/i,
  reply: /\brepl(y|ies|ied)\b/i,
  'routine step': /\broutine\b/i,
}
/** Terms the Medium and Complex levels build. The Simple level never says them. */
const BUILT_LATER = ['rule', 'lookup', 'chunk', 'citation', 'ledger', 'placeholder', 'permission', 'agent', 'tool']

describe('IT — Upgrade, the Simple level: its shape', () => {
  it('has three chapters, numbered one to three, each with lessons', () => {
    expect(LEVEL.key).toBe('simple')
    expect(LEVEL.chapters.map((c) => c.key.slice(0, 6))).toEqual(['it-ch1', 'it-ch2', 'it-ch3'])
    for (const c of LEVEL.chapters) expect(c.lessons.length, c.title).toBeGreaterThanOrEqual(3)
  })
  it('every lesson has an intro, an example, a try-it with rules and an exercise with a one-line reason', () => {
    expect(lessonGaps(asTrack)).toEqual([])
    for (const l of lessons) {
      expect(l.exercise.choices.length, l.key).toBeGreaterThanOrEqual(2)
      expect(l.tryIt.prompt.trim(), l.key).not.toBe('')
    }
  })
  it('every lesson is a screen: it says what is on the screen, what happens behind it, and a technical note', () => {
    for (const l of lessons) {
      expect(l.intro, l.key).toContain('On the screen, ')
      expect(l.intro, l.key).toContain('Behind the screen, ')
      expect(l.intro, l.key).toContain('Technical note: ')
    }
  })
  it('no two lessons share a key, and every key says level one', () => {
    const keys = lessons.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^it-1-[123]-\d$/)
  })
  it('the level closes with one hands-on project, ticked as a checklist', () => {
    expect(LEVEL.project.checklist.length).toBeGreaterThanOrEqual(6)
    expect(new Set(LEVEL.project.checklist).size).toBe(LEVEL.project.checklist.length)
  })
  it('every lesson works without a video, and its slot reads Video coming', () => {
    for (const l of lessons) expect(videoSlotWords(l.video), l.key).toBe('Video coming')
  })
  it('the track opens with what you will be good at, each line starting with a plain verb', () => {
    expect(IT_UPGRADE_GOOD_AT.length).toBeGreaterThanOrEqual(3)
    for (const g of IT_UPGRADE_GOOD_AT) expect(g, g).toMatch(/^(Explain|File|Write|Find|Say|Check|Read|Plan) /)
    expect(trackOf('it-upgrade')!.goodAt).toEqual(IT_UPGRADE_GOOD_AT)
  })
  it('the track’s first level is this one, and its first lesson is the first lesson a learner opens', () => {
    const track = trackOf('it-upgrade')!
    expect(track.levels[0]).toBe(LEVEL)
    expect(lessonsOf(track)[0].lesson.key).toBe('it-1-1-1')
  })
})

describe('IT — Upgrade, the Simple level: one new idea a step, in glossary order', () => {
  it('every lesson builds exactly one term, and the terms are built in the glossary’s order', () => {
    for (const l of lessons) expect(l.introduces.length, l.key).toBe(1)
    expect(lessons.map((l) => l.introduces[0])).toEqual([...SIMPLE_GLOSSARY])
  })
  it('no lesson declares a term before the step that builds it', () => {
    expect(termGaps(asTrack)).toEqual([])
  })
  it('no lesson’s words say a glossary term before the lesson that builds it', () => {
    const found: string[] = []
    lessons.forEach((l, i) => {
      for (const later of SIMPLE_GLOSSARY.slice(i + 1)) if ((SAID[later] ?? says(later)).test(allOf(l))) found.push(`${l.key} says "${later}" early`)
    })
    expect(found).toEqual([])
  })
  it('the lesson that builds a term says the term', () => {
    lessons.forEach((l) => expect((SAID[l.introduces[0]] ?? says(l.introduces[0])).test(l.intro), l.key).toBe(true))
  })
  it('the level never says a term that a later level builds', () => {
    const found = BUILT_LATER.filter((t) => says(t).test(everyWord))
    expect(found).toEqual([])
  })
  it('the system steps come in order: the chatbot, the prompt, the model, the reply, then its limits', () => {
    expect(LEVEL.chapters[2].lessons.map((l) => l.introduces[0])).toEqual(['chatbot', 'prompt', 'model', 'reply', 'limit'])
  })
  it('the level builds every term the Medium level says it builds on', () => {
    for (const t of ['chatbot', 'model', 'prompt', 'reply']) expect(SIMPLE_GLOSSARY).toContain(t)
  })
})

describe('IT — Upgrade, the Simple level: try it and the exercise', () => {
  it('every try-it has a sample its rules accept and a sample they refuse', () => {
    expect(Object.keys(SIMPLE_TRY_SAMPLES).sort()).toEqual(lessons.map((l) => l.key).sort())
    for (const l of lessons) {
      const s = SIMPLE_TRY_SAMPLES[l.key]
      const right = evaluateTryIt(l, s.right)
      expect(right.passed, `${l.key}: ${JSON.stringify(right.lines)}`).toBe(true)
      expect(right.output, l.key).toBe(l.tryIt.expected)
      const wrong = evaluateTryIt(l, s.wrong)
      expect(wrong.passed, l.key).toBe(false)
      expect(wrong.lines.some((x) => !x.ok && x.text.trim() !== ''), l.key).toBe(true)
    }
  })
  it('no try-it is passed by the text it starts with, or by an empty box', () => {
    for (const l of lessons) {
      expect(evaluateTryIt(l, '').passed, l.key).toBe(false)
      if (l.tryIt.starter.trim()) expect(evaluateTryIt(l, l.tryIt.starter).passed, l.key).toBe(false)
    }
  })
  it('every exercise has one right answer, and a wrong answer gets the same one-line reason', () => {
    for (const l of lessons) {
      expect(new Set(l.exercise.choices).size, l.key).toBe(l.exercise.choices.length)
      expect(checkExercise(l, l.exercise.correctIndex).right, l.key).toBe(true)
      const wrong = checkExercise(l, (l.exercise.correctIndex + 1) % l.exercise.choices.length)
      expect(wrong.right, l.key).toBe(false)
      expect(sentences(wrong.reason).length, l.key).toBe(1)
    }
  })
})

describe('IT — Upgrade, the Simple level: the words', () => {
  it('no sentence a learner reads is longer than twenty-five words', () => {
    const long: string[] = []
    const prose = [...IT_UPGRADE_GOOD_AT, LEVEL.project.title, ...LEVEL.project.checklist, ...lessons.flatMap(proseOf)]
    for (const s of prose.flatMap(sentences)) if (s.split(/\s+/).length > 25) long.push(s)
    expect(long).toEqual([])
  })
  it('the level says no price, no real firm’s name, neither of the two words nobody uses, and no British spelling', () => {
    expect(mentionsPrice(everyWord)).toBe(false)
    expect(wordsNobodyUses(everyWord)).toEqual([])
    expect(britishSpellings(everyWord)).toEqual([])
    // The only firms named are the course's own and the product.
    const named = everyWord.match(/\b(?:Inc|LLC|Ltd|Corp)\b/g) ?? []
    expect(named).toEqual([])
  })
  it('a public page of the course never says the firm trains or places anybody, and never whose firm it is', () => {
    expect(everyWord).not.toMatch(/\bTapin (trains|places|teaches)\b|\bfounder\b|\bEtyme’s own\b/i)
  })
})

describe('IT — Upgrade, the Simple level: what it says of Etyme is what the code does', () => {
  const text = (key: string) => allOf(lessons.find((l) => l.key === key)!)
  it('the ready questions it lists are the ones a worker’s Ask Etyme shows', () => {
    for (const q of WORKER_QUESTIONS) expect(text('it-1-3-1'), q).toContain(q)
  })
  it('the two replies it quotes are Ask Etyme’s own sentences for those prompts', () => {
    expect(readWorkerAsk('File my week.')).toBe('FILE')
    expect(text('it-1-3-4')).toContain(FILE_IT_YOURSELF)
    expect(readWorkerAsk('What is another consultant’s pay?')).toBe('ANOTHER')
    expect(text('it-1-3-5')).toContain(NOT_ANOTHER_PERSON)
  })
  it('the limit it quotes under the box is in the line a worker reads there', () => {
    expect(WORKER_FOOTER).toContain('It never files, signs or sends anything for you.')
    expect(text('it-1-3-5')).toContain('It never files, signs or sends anything for you.')
  })
  it('the bench stay in its example is a length a worker can really choose', () => {
    expect(STAY_CHOICES as readonly number[]).toContain(60)
    expect(text('it-1-2-4')).toContain('60 days')
  })
  it('the week in its filing example starts on a Sunday', () => {
    const start = text('it-1-2-2').match(/"periodStart": "(\d{4}-\d{2}-\d{2})"/)![1]
    expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(0)
  })
})

describe('IT — Upgrade, the Simple level: the pictures', () => {
  it('each picture belongs to a lesson, has words for a screen reader, and is drawn here with no outside file and no motion', () => {
    const keys = lessons.map((l) => l.key)
    for (const [key, p] of Object.entries(SIMPLE_PICTURES)) {
      expect(keys, key).toContain(key)
      expect(p.alt.trim(), key).not.toBe('')
      expect(p.svg, key).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+"/)
      expect(p.svg, key).not.toMatch(/href=|<image|<script|<animate|url\(/)
    }
  })
})
