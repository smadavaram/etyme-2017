import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { OPENING_CARDS, OPENING_QUESTION, routeFor } from '@/lib/training/courses/opening'
import { COURSES, VERSION, trackOf, lessonsOf } from '@/lib/training/courses/index'
import { shapeGaps, termGaps, lessonGaps, wordsOf, mentionsPrice, videoSlotWords } from '@/lib/training/courses/shape'
import { evaluateTryIt, checkExercise } from '@/lib/training/courses/try-it'
import type { Lesson, Track } from '@/lib/training/courses/types'
import { EMPTY_PROGRESS, markDone, setTick, percentDone, nextLessonKey, isComplete, readProgress } from '@/lib/training/learn-progress'
import { learnOpen } from '@/lib/training/learn-gate'
import { systemPath, trackFromSignals } from '@/lib/training/paths/system'
import { parseSteps, promptPath } from '@/lib/training/paths/prompt'
import { pathNext, mayDecide, pathIsLive } from '@/lib/training/paths/state'
import { mayAdopt, creatorReading, fromSource } from '@/lib/training/adoption'
import { coursesShown } from '@/lib/training/courses-shown'

const root = process.cwd()
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) walk(f, out); else if (/\.tsx?$/.test(e)) out.push(f)
  }
  return out
}
const learnFiles = [
  ...walk(join(root, 'src/app/learn')), ...walk(join(root, 'src/app/api/learn')),
  ...walk(join(root, 'src/lib/training/courses')), ...walk(join(root, 'src/lib/training/paths')),
  ...['learn-db', 'learn-gate', 'learn-progress', 'learn-read', 'adoption'].map((n) => join(root, `src/lib/training/${n}.ts`)),
]
const src = (f: string) => readFileSync(f, 'utf8')

const lesson = (key: string, over: Partial<Lesson> = {}): Lesson => ({
  key, title: key, intro: 'An intro.', introduces: [], uses: [], example: { text: 'An example.' },
  tryIt: { prompt: 'Try.', starter: '', rules: [{ kind: 'contains', value: 'cat', says: 'It names the cat.' }], expected: 'Good.' },
  exercise: { question: 'Which?', choices: ['a', 'b'], correctIndex: 1, reason: 'Because b.' }, video: null, ...over,
})
const fullTrack = (): Track => ({
  key: 'it-upgrade', title: 'Full', goodAt: ['Write', 'Read', 'Check'],
  levels: (['simple', 'medium', 'complex'] as const).map((k) => ({
    key: k, title: k, project: { key: `p-${k}`, title: 'Project', checklist: ['one'] },
    chapters: [1, 2, 3].map((c) => ({ key: `${k}${c}`, title: `Chapter ${c}`, lessons: [lesson(`${k}-${c}`)] })),
  })),
})

describe('the opening screen', () => {
  it('asks "What are you?" with four tap cards and no catalog', () => {
    expect(OPENING_QUESTION).toBe('What are you?')
    expect(OPENING_CARDS.map((c) => c.label)).toEqual(['Kids / student', 'Entry Level', 'Non-IT', 'IT — Upgrade'])
  })
  it('an answer routes to its track and an unknown answer goes nowhere', () => {
    expect(routeFor('tapin', 'it-upgrade')).toBe('/learn/tapin/it-upgrade')
    expect(routeFor('tapin', 'everything')).toBeNull()
  })
  it('the version stamp reads Dec 2026 and is shown on the opening screen, the track sidebar and the footer', () => {
    expect(VERSION).toBe('Version: Dec 2026')
    expect(src(join(root, 'src/app/learn/[tenant]/page.tsx'))).toContain('VERSION')
    expect(src(join(root, 'src/app/learn/[tenant]/layout.tsx'))).toContain('VERSION')
    expect(src(join(root, 'src/app/learn/_components/lesson-shell.tsx'))).toContain('{version}')
  })
})

describe('the course content format', () => {
  it('a track with nine chapters in three levels of three, and plain verbs, has no gaps', () => {
    expect(shapeGaps(fullTrack())).toEqual([])
  })
  it('a track that is short of chapters names what is missing', () => {
    const t = fullTrack(); t.levels[0].chapters.pop(); t.levels.pop()
    expect(shapeGaps(t)).toEqual(['Full: has 2 levels, not three.', 'Full / simple: has 2 chapters, not three.'])
  })
  it('a term used before the lesson that builds it is named', () => {
    const t = fullTrack()
    t.levels[0].chapters[0].lessons[0] = lesson('a', { uses: ['prompt'] })
    t.levels[0].chapters[1].lessons[0] = lesson('b', { introduces: ['prompt'] })
    expect(termGaps(t)).toEqual(['a uses "prompt" before any lesson builds it.'])
  })
  it('no lesson of the track written so far uses a term before the step that builds it', () => {
    for (const t of COURSES[0].tracks) expect(termGaps(t), t.key).toEqual([])
  })
  it('every lesson written so far has an intro, an example, a try-it and an exercise with a one-line reason', () => {
    for (const t of COURSES[0].tracks) expect(lessonGaps(t), t.key).toEqual([])
  })
  it('the track still being written says so, and no track that claims to be finished has a gap', () => {
    for (const t of COURSES[0].tracks) if (!t.placeholder) expect(shapeGaps(t), t.key).toEqual([])
    expect(trackOf('it-upgrade')!.placeholder).toBe(true)
    expect(shapeGaps(trackOf('it-upgrade')!).length).toBeGreaterThan(0)
  })
  it('no lesson says a price, a fee or a charge', () => {
    for (const t of COURSES[0].tracks) expect(mentionsPrice(wordsOf(t)), t.key).toBe(false)
    expect(mentionsPrice('It costs $50 a seat')).toBe(true)
  })
  it('a lesson with no video reads Video coming and one with a video says to watch it', () => {
    expect(videoSlotWords(null)).toBe('Video coming')
    expect(videoSlotWords(undefined)).toBe('Video coming')
    expect(videoSlotWords({ sourceUrl: 'https://example.invalid/v' })).toBe('Watch the video')
    expect(lessonsOf(trackOf('it-upgrade')!)[0].lesson.video ?? null).toBeNull()
  })
})

describe('the try-it panel and the exercise', () => {
  const l = lesson('x', { tryIt: { prompt: '', starter: '', expected: 'Well done.', rules: [{ kind: 'minWords', value: 3, says: 'Three words or more.' }, { kind: 'containsAny', values: ['for', 'to'], says: 'Says who it is for.' }] } })
  it('a try-it that meets every rule passes, and the output updates with the expected result', () => {
    const r = evaluateTryIt(l, 'Write steps for a new hire')
    expect(r.passed).toBe(true)
    expect(r.output).toBe('Well done.')
  })
  it('a try-it that misses a rule says which one in words', () => {
    const r = evaluateTryIt(l, 'Write steps now')
    expect(r.passed).toBe(false)
    expect(r.lines.filter((x) => !x.ok).map((x) => x.text)).toEqual(['Says who it is for.'])
  })
  it('an empty try-it asks for something typed and runs nothing', () => {
    expect(evaluateTryIt(l, '  ').lines[0].text).toBe('Type something first, then press Run.')
  })
  it('the evaluator never runs the learner’s text and never reaches a model', () => {
    const code = src(join(root, 'src/lib/training/courses/try-it.ts'))
    expect(code).not.toMatch(/\beval\(|new Function|callModel|fetch\(|child_process/)
  })
  it('an exercise answer is right or wrong at once, with the one-line reason', () => {
    expect(checkExercise(l, 1)).toEqual({ right: true, reason: 'Because b.' })
    expect(checkExercise(l, 0).right).toBe(false)
  })
})

describe('progress kept in the browser', () => {
  const keys = ['a', 'b']
  it('finishing a lesson moves the percent and the next lesson, and a key the track does not hold is ignored', () => {
    let p = markDone(EMPTY_PROGRESS, 'a', keys)
    expect(percentDone(p, keys)).toBe(50)
    expect(nextLessonKey(p, keys)).toBe('b')
    expect(markDone(p, 'zzz', keys)).toBe(p)
    p = markDone(p, 'b', keys)
    expect(isComplete(p, keys)).toBe(true)
  })
  it('a project checklist item is ticked and unticked', () => {
    const on = setTick(EMPTY_PROGRESS, 'p', 'one', true)
    expect(on.ticks.p).toEqual(['one'])
    expect(setTick(on, 'p', 'one', false).ticks.p).toEqual([])
  })
  it('a stored value that is not progress reads as none', () => {
    expect(readProgress('junk')).toEqual(EMPTY_PROGRESS)
  })
})

describe('who may reach the learning site', () => {
  it('the site is open only where the plugin is on, and hiding courses on the storefront does not close it', () => {
    expect(learnOpen({ pluginsOn: [] })).toBe(false)
    expect(learnOpen(null)).toBe(false)
    expect(learnOpen({ pluginsOn: ['TRAIN_TO_BENCH'] })).toBe(true)
    expect(coursesShown({ pluginsOn: ['TRAIN_TO_BENCH'], coursesHiddenOnStorefront: true })).toBe(false)
    expect(learnOpen({ pluginsOn: ['TRAIN_TO_BENCH'] })).toBe(true)
  })
})

describe('paths', () => {
  const track = fullTrack()
  it('a path is made from the record by rules: an engineer’s role points to the IT track, nothing stated points to entry level', () => {
    expect(trackFromSignals({ role: 'Data engineer' })).toBe('it-upgrade')
    expect(trackFromSignals({})).toBe('entry')
    expect(trackFromSignals({ role: 'Nurse' })).toBe('non-it')
  })
  it('a system path leaves out lessons she finished before and keeps reading order', () => {
    const p = systemPath(track, { priorCompletions: ['simple-1'] })
    expect(p.steps).not.toContain('simple-1')
    expect(p.steps[0]).toBe('simple-2')
    expect(p.why).toContain('1 lessons done before')
  })
  it('a gap moves its lessons first, but never past a lesson that builds a term they use', () => {
    const t = fullTrack()
    t.levels[0].chapters[0].lessons[0] = lesson('first', { introduces: ['request'] })
    t.levels[0].chapters[1].lessons[0] = lesson('second', { title: 'Documents', uses: ['request'] })
    expect(systemPath(t, { gaps: ['documents'] }).steps.slice(0, 2)).toEqual(['first', 'second'])
  })
  it('a model answer that is not a list of known lessons is not used, and the rules path stands', async () => {
    const known = ['a', 'b']
    expect(parseSteps('sure! [1,2]', known)).toBeNull()
    expect(parseSteps('x ["b","zzz","b","a"] y', known)).toEqual(['b', 'a'])
    expect(await promptPath('goal', known, async () => ({ ok: false }), ['a', 'b'])).toEqual({ steps: ['a', 'b'], by: 'RULES' })
    expect(await promptPath('goal', known, async () => { throw new Error('slow') }, ['a'])).toEqual({ steps: ['a'], by: 'RULES' })
    expect(await promptPath('goal', known, null, ['a'])).toEqual({ steps: ['a'], by: 'RULES' })
    expect(await promptPath('goal', known, async () => ({ ok: true, text: '["b"]' }), ['a'])).toEqual({ steps: ['b'], by: 'MODEL' })
  })
  it('a proposed path is not live until its mentor says yes', () => {
    expect(pathIsLive('PROPOSED')).toBe(false)
    expect(pathNext('PROPOSED', 'start')).toMatchObject({ ok: false, message: 'This path waits for its mentor’s yes.' })
    expect(pathNext('PROPOSED', 'approve')).toEqual({ ok: true, state: 'APPROVED' })
    expect(pathIsLive('APPROVED')).toBe(true)
  })
  it('only the named mentor says yes, never the learner and never a path with no mentor', () => {
    expect(mayDecide({ deciderPersonId: 'm', mentorPersonId: 'm', learnerPersonId: 'l' })).toEqual({ ok: true })
    expect(mayDecide({ deciderPersonId: 'l', mentorPersonId: 'l', learnerPersonId: 'l' })).toMatchObject({ ok: false, message: 'Nobody approves their own path.' })
    expect(mayDecide({ deciderPersonId: 'o', mentorPersonId: 'm', learnerPersonId: 'l' })).toMatchObject({ ok: false })
    expect(mayDecide({ deciderPersonId: 'm', mentorPersonId: null, learnerPersonId: 'l' })).toMatchObject({ ok: false })
  })
  it('a path that has started is not adjusted, and a mentor’s adjustment asks for a yes again', () => {
    expect(pathNext('ACTIVE', 'adjust')).toMatchObject({ ok: false })
    expect(pathNext('APPROVED', 'adjust')).toEqual({ ok: true, state: 'PROPOSED' })
  })
})

describe('adoption', () => {
  const rows = [
    { personId: 'p1', name: 'Ines', status: 'COMPLETED', completedAt: null },
    { personId: 'p2', name: 'Omar', status: 'IN_PROGRESS', completedAt: null },
  ]
  it('the creator reads counts only, with no name and no id, unless the adoption grants named evidence', () => {
    const counts = creatorReading(rows, false)
    expect(counts).toEqual({ named: false, started: 2, completed: 1 })
    expect(JSON.stringify(counts)).not.toMatch(/Ines|p1/)
    const named = creatorReading(rows, true)
    expect(named.named && named.learners.map((l) => l.name)).toEqual(['Ines', 'Omar'])
  })
  it('a firm cannot adopt its own course, a course twice, or one that is not offered', () => {
    const ok = { creatorCompanyId: 'a', adopterCompanyId: 'b', alreadyAdopted: false, creatorPluginOn: true }
    expect(mayAdopt(ok)).toEqual({ ok: true })
    expect(mayAdopt({ ...ok, adopterCompanyId: 'a' })).toMatchObject({ ok: false })
    expect(mayAdopt({ ...ok, alreadyAdopted: true })).toMatchObject({ ok: false })
    expect(mayAdopt({ ...ok, creatorPluginOn: false })).toMatchObject({ ok: false })
  })
  it('a course made from another supplier’s keeps the source course and the supplier, and never from one’s own', () => {
    expect(fromSource({ sourceCourseId: 'c', sourceCompanyId: 'x', ownCompanyId: 'y' })).toEqual({ ok: true, sourceCourseId: 'c', sourceCompanyId: 'x' })
    expect(fromSource({ sourceCourseId: 'c', sourceCompanyId: 'x', ownCompanyId: 'x' })).toMatchObject({ ok: false })
  })
})

describe('what the learning site never does', () => {
  it('no screen, route or content file under the learning site reads or says a price', () => {
    // shape.ts holds the detector itself, and is read by the content test above.
    for (const f of learnFiles.filter((x) => !x.endsWith('courses/shape.ts'))) {
      const code = src(f)
      expect(code, f).not.toMatch(/\.price\b|\bprice:|currency|\bper seat\b|\$\s?\d/i)
    }
  })
  it('no page or component of the learning site writes to the database, so a visitor writes nothing', () => {
    for (const f of walk(join(root, 'src/app/learn'))) expect(src(f), f).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete)/)
  })
  it('no model is called from anything a visitor can reach', () => {
    for (const f of [...walk(join(root, 'src/app/learn')), ...walk(join(root, 'src/lib/training/courses')), ...walk(join(root, 'src/lib/training/paths'))]) {
      expect(src(f), f).not.toMatch(/callModel\(/)
    }
  })
  it('no file of the learning site names a real company or uses the two words nobody uses', () => {
    for (const f of learnFiles) expect(src(f), f).not.toMatch(/\b(desk|program office)\b/i)
  })
  it('every route of the learning site goes through a door and never switches a plugin', () => {
    for (const f of walk(join(root, 'src/app/api/learn'))) {
      const code = src(f)
      expect(code, f).toContain('getCallerContext')
      expect(code, f).not.toMatch(/pluginsOn:\s*\[|pluginSwitch/)
    }
  })
})
