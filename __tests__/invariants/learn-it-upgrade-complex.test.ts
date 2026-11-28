import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  IT_UPGRADE_COMPLEX as LEVEL, COMPLEX_BUILDS_ON, COMPLEX_GLOSSARY, COMPLEX_TRY_SAMPLES, COMPLEX_PICTURES, IT_UPGRADE_RECAP,
} from '@/lib/training/courses/it-upgrade-complex'
import { IT_UPGRADE_SIMPLE, SIMPLE_GLOSSARY, IT_UPGRADE_GOOD_AT } from '@/lib/training/courses/it-upgrade-simple'
import { IT_UPGRADE_MEDIUM, MEDIUM_GLOSSARY } from '@/lib/training/courses/it-upgrade-medium'
import { lessonGaps, termGaps, shapeGaps, mentionsPrice, videoSlotWords } from '@/lib/training/courses/shape'
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
const flat = (s: string) => s.replace(/\s+/g, ' ')
const everything = flat(lessons.map(allOf).join('\n'))

describe('IT — Upgrade, the Complex level: its shape', () => {
  it('has three chapters, numbered seven to nine, each with lessons', () => {
    expect(LEVEL.key).toBe('complex')
    expect(LEVEL.title).toBe('Complex')
    expect(LEVEL.chapters.map((c) => c.key.slice(0, 6))).toEqual(['it-ch7', 'it-ch8', 'it-ch9'])
    for (const c of LEVEL.chapters) expect(c.lessons.length, c.title).toBeGreaterThanOrEqual(3)
  })
  it('every lesson has an intro, an example, a try-it with rules and an exercise with a one-line reason', () => {
    expect(lessonGaps(asTrack)).toEqual([])
    for (const l of lessons) {
      expect(l.exercise.choices.length, l.key).toBeGreaterThanOrEqual(3)
      expect(l.tryIt.prompt.trim(), l.key).not.toBe('')
    }
  })
  it('no two lessons share a key, and every key says level three', () => {
    const keys = lessons.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^it-3-[789]-\d$/)
  })
  it('the level closes with one hands-on project, ticked as a checklist', () => {
    expect(LEVEL.project.checklist.length).toBeGreaterThanOrEqual(6)
    expect(new Set(LEVEL.project.checklist).size).toBe(LEVEL.project.checklist.length)
  })
  it('every lesson works without a video, and its slot reads Video coming', () => {
    for (const l of lessons) expect(videoSlotWords(l.video), l.key).toBe('Video coming')
  })
  it('with the Simple and Medium levels it makes the whole track: nine chapters in three levels, no key twice, no term early', () => {
    const track: Track = { key: 'it-upgrade', title: 'IT — Upgrade', goodAt: IT_UPGRADE_GOOD_AT, levels: [IT_UPGRADE_SIMPLE, IT_UPGRADE_MEDIUM, LEVEL] }
    expect(shapeGaps(track)).toEqual([])
    expect(termGaps(track)).toEqual([])
    expect(lessonGaps(track)).toEqual([])
    const keys = track.levels.flatMap((lv) => lv.chapters.flatMap((c) => c.lessons.map((l) => l.key)))
    expect(new Set(keys).size).toBe(keys.length)
    const terms = [...SIMPLE_GLOSSARY, ...MEDIUM_GLOSSARY, ...COMPLEX_GLOSSARY]
    expect(new Set(terms.map((t) => t.toLowerCase())).size).toBe(terms.length)
  })
})

describe('IT — Upgrade, the Complex level: one new idea a step, in glossary order', () => {
  it('every lesson builds exactly one term, and the terms are built in the glossary’s order', () => {
    for (const l of lessons) expect(l.introduces.length, l.key).toBe(1)
    expect(lessons.map((l) => l.introduces[0])).toEqual([...COMPLEX_GLOSSARY])
  })
  it('what this level builds on was built by the Simple and Medium levels', () => {
    const earlier = [...SIMPLE_GLOSSARY, ...MEDIUM_GLOSSARY]
    for (const t of COMPLEX_BUILDS_ON) expect(earlier, t).toContain(t)
  })
  it('no lesson declares a term before the step that builds it, counting what the earlier levels built', () => {
    const before: Lesson = { ...lessons[0], key: 'earlier-levels-stand-in', introduces: [...COMPLEX_BUILDS_ON], uses: [] }
    const track: Track = { ...asTrack, levels: [{ ...LEVEL, chapters: [{ key: 'earlier', title: 'Earlier', lessons: [before] }, ...LEVEL.chapters] }] }
    expect(termGaps(track)).toEqual([])
  })
  it('no lesson’s words say a glossary term before the lesson that builds it', () => {
    const found: string[] = []
    lessons.forEach((l, i) => {
      for (const later of COMPLEX_GLOSSARY.slice(i + 1)) if (says(later).test(allOf(l))) found.push(`${l.key} says "${later}" early`)
    })
    expect(found).toEqual([])
  })
  it('a lesson says the term it builds, and declares every earlier term its words use', () => {
    const gaps: string[] = []
    lessons.forEach((l, i) => {
      if (!says(l.introduces[0]).test(l.intro)) gaps.push(`${l.key} never says "${l.introduces[0]}"`)
      for (const earlier of [...COMPLEX_BUILDS_ON, ...COMPLEX_GLOSSARY.slice(0, i)]) {
        if (says(earlier).test(allOf(l)) && !l.uses.includes(earlier)) gaps.push(`${l.key} says "${earlier}" and does not declare it`)
      }
    })
    expect(gaps).toEqual([])
  })
  it('the system steps come in order: an agent first, then its plan, its act and its check', () => {
    expect(COMPLEX_BUILDS_ON).toContain('describe, never act')
    expect(COMPLEX_GLOSSARY.slice(0, 5)).toEqual(['agent', 'task', 'plan', 'act', 'check'])
    expect(MEDIUM_GLOSSARY).toContain('document lookup')
    expect(SIMPLE_GLOSSARY).toContain('reply')
  })
})

describe('IT — Upgrade, the Complex level: try it and the exercise', () => {
  it('every try-it has a sample its rules accept and a wrong answer they refuse', () => {
    expect(Object.keys(COMPLEX_TRY_SAMPLES).sort()).toEqual(lessons.map((l) => l.key).sort())
    for (const l of lessons) {
      const s = COMPLEX_TRY_SAMPLES[l.key]
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

describe('IT — Upgrade, the Complex level: the words', () => {
  const closing = [LEVEL.project.title, ...LEVEL.project.checklist, ...LEVEL.chapters.map((c) => c.title), ...IT_UPGRADE_RECAP.flatMap((r) => [r.goodAt, r.youDid])]
  it('no sentence a learner reads is longer than twenty-five words', () => {
    const long: string[] = []
    for (const text of [...lessons.flatMap(proseOf), ...closing]) {
      for (const s of sentences(text)) if (s.split(/\s+/).length > 25) long.push(s)
    }
    expect(long).toEqual([])
  })
  it('an intro is short: five sentences at most', () => {
    expect(lessons.filter((l) => sentences(l.intro).length > 5).map((l) => l.key)).toEqual([])
  })
  it('nothing says a price, and nothing uses the two words nobody uses or a British spelling', () => {
    const all = [...lessons.map(allOf), ...closing, ...Object.values(COMPLEX_PICTURES).flatMap((p) => [p.alt, p.svg])].join('\n')
    expect(mentionsPrice(all)).toBe(false)
    expect(all).not.toMatch(/\b(desk|program office)\b/i)
    expect(all).not.toMatch(/\b(programme|authoris|colour|centre|organis|recognis|licence)\w*/i)
  })
  it('each lesson walks one screen: what is on the screen, then what happens behind it, then a technical note', () => {
    for (const l of lessons) {
      expect(l.intro, l.key).toMatch(/^On the screen, /)
      expect(l.intro, l.key).toMatch(/Behind the screen, /)
      expect(l.intro, l.key).toMatch(/Technical note: /)
    }
  })
  it('a picture is original inline SVG with a sentence for a reader who cannot see it, and belongs to a lesson', () => {
    expect(Object.keys(COMPLEX_PICTURES).length).toBeGreaterThanOrEqual(2)
    for (const [key, p] of Object.entries(COMPLEX_PICTURES)) {
      expect(lessons.some((l) => l.key === key), key).toBe(true)
      expect(p.svg).toMatch(/^<svg [^>]*role="img"/)
      expect(p.svg).not.toMatch(/<image|href=|<script|animate/i)
      expect(p.alt.trim().split(/\s+/).length).toBeGreaterThan(5)
    }
  })
})

describe('IT — Upgrade, the Complex level: what it says about Etyme is what Etyme does', () => {
  const page = (p: string) => readFileSync(join(process.cwd(), 'src/app/dashboard', p), 'utf8')

  it('the agent switch reads Off, Drafts only and On, and the table has the columns the lesson shows', async () => {
    const { SWITCH_WORDS, FIRM_AGENTS, agentRows } = await import('@/lib/decision-queue')
    expect(Object.values(SWITCH_WORDS)).toEqual(['Off', 'Drafts only', 'On'])
    for (const name of ['Timesheet chase', 'Match ranker', 'Payroll draft']) {
      expect(FIRM_AGENTS.map((a) => a.name)).toContain(name)
      expect(everything).toContain(name)
    }
    const agents = page('decisions/agents/page.tsx')
    for (const head of ['Agent control', '>Agent<', '>Switch<', '>Actions today<', '>Meter<', '>Cap<', 'title="Tasks"']) expect(agents).toContain(head)
    expect(agents).toContain('Each asks for one yes. One yes releases the whole task; a new task asks again.')
    expect(everything).toContain('Each asks for one yes. One yes releases the whole task; a new task asks again.')
    // A new firm has no switch rows: every agent reads Off.
    for (const r of agentRows([])) expect(r.switchState).toBe('OFF')
    const row = agentRows([{ agentKey: 'timesheet-chase', count: 3 }], [{ agentKey: 'timesheet-chase', state: 'ON', dailyCap: 10 }]).find((r) => r.key === 'timesheet-chase')!
    expect(row.cap).toBe('3 of 10 today')
    expect(everything).toContain('3 of 10 today')
    expect(agentRows([{ agentKey: 'match-ranker', count: 2 }]).find((r) => r.key === 'match-ranker')!.cap).toBe('2 today · no cap')
    expect(everything).toContain('2 today · no cap')
  })
  it('the plan a learner reads is the plan a task shows, word for word', async () => {
    const { planWords } = await import('@/lib/agents/tasks')
    const { PROPOSED_CHASE_PLAN } = await import('@/lib/agents/timesheet-chase-rules')
    expect(everything).toContain(planWords(PROPOSED_CHASE_PLAN))
    expect(PROPOSED_CHASE_PLAN.retries).toBe(2)
  })
  it('the lesson says the reminder numbers are defaults, not settled: the plan it quotes opens with "By default"', () => {
    expect(everything).toMatch(/By default, a plan reads:\s*If you say yes, the agent sends/)
  })
  it('the cap and the off switch say what the lessons quote', async () => {
    const { capReachedSays, offSays, mayChangeSwitch } = await import('@/lib/agents/switch')
    expect(everything).toContain(capReachedSays('timesheet-chase', 10))
    expect(offSays('timesheet-chase')).toContain('is off, so it did nothing')
    expect(mayChangeSwitch('Admin')).not.toBeNull()
  })
  it('the tools the lesson lists are the tools the agent has, and no tool moves money, signs or decides about a person', async () => {
    const { skillOf, SKILLS, FORBIDDEN_ACTS, paperMayReachModel } = await import('@/lib/skills/registry')
    expect(skillOf('chase.propose')!.acts).toEqual(['READ', 'WRITE_ROW', 'OPEN_CARD'])
    expect(skillOf('chase.send')!.acts).toEqual(['READ', 'SEND'])
    expect(skillOf('chase.close')!.acts).toEqual(['READ', 'WRITE_ROW'])
    for (const k of ['chase.propose', 'chase.send', 'chase.close']) expect(skillOf(k)!.usedBy).toContain('timesheet-chase')
    for (const s of SKILLS) for (const a of s.acts) expect(FORBIDDEN_ACTS, s.key).not.toContain(a)
    expect(FORBIDDEN_ACTS).toEqual(['MOVE_MONEY', 'SIGN', 'AWARD', 'EXTEND', 'END_PLACEMENT', 'DECIDE_ABOUT_PERSON', 'PUBLISH_COMPLIANCE_COPY'])
    // The model tier lesson: counting is rules, ranking starts low and may move once, and a W-9 or a voided check reaches no model.
    expect(skillOf('census.classify')!.tier).toBe('RULES')
    expect(skillOf('match.rank')).toMatchObject({ tier: 'LOW', mayEscalate: true })
    expect(paperMayReachModel('W9')).toBe(false)
    expect(paperMayReachModel('VOIDED_CHECK')).toBe(false)
  })
  it('the three columns of the role contract read as the page reads them', () => {
    const contract = page('twin/contract/page.tsx')
    expect(contract).toContain('What the twin may do')
    for (const line of [
      'Reversible or tell-only, inside the company, within a rule.',
      'Money, anything that leaves the company, anything that cannot be put back.',
      'Stays with a person. Some acts are here whatever the contract says.',
    ]) {
      expect(contract).toContain(line)
      expect(everything).toContain(line)
    }
  })
  it('the acts the lesson calls the floor are floor acts, sending a bill needs approval, and the refusals are the product’s own', async () => {
    const { TWIN_ACTS } = await import('@/lib/autonomy')
    const { checkContract, defaultContractFor, tierIn } = await import('@/lib/twin/role-contract')
    const { twinRefusal } = await import('@/lib/refusal-words')
    for (const act of ['payroll.release', 'agreement.sign', 'placement.award', 'submission.reject', 'placement.end', 'placement.extend', 'other_company.read']) {
      expect(TWIN_ACTS[act].floor, act).toBe(true)
      expect(everything).toContain(TWIN_ACTS[act].says)
    }
    const supplier = defaultContractFor('SUPPLIER')
    expect(tierIn(supplier, 'bill.send')).toBe('NEEDS_APPROVAL')
    expect(tierIn(supplier, 'bill.draft')).toBe('ACTS_ALONE')
    expect(tierIn(supplier, 'reminder.send')).toBe('ACTS_ALONE')
    // A saved contract that tries to loosen the floor is refused, and one that tries to loosen money too.
    const loosened = { ...supplier, actsAlone: [...supplier.actsAlone, 'payroll.release'], neverTouches: supplier.neverTouches.filter((a) => a !== 'payroll.release') }
    expect(checkContract(loosened, 'SUPPLIER')).toContain('Release a payroll run stays with a person, whatever the contract says.')
    expect(everything).toContain('Release a payroll run stays with a person, whatever the contract says.')
    expect(tierIn({ ...loosened, version: 2 }, 'payroll.release')).toBe('NEVER')
    const paysAlone = { ...supplier, actsAlone: [...supplier.actsAlone, 'invoice_receipt.pay'], needsApproval: supplier.needsApproval.filter((a) => a !== 'invoice_receipt.pay') }
    expect(checkContract(paysAlone, 'SUPPLIER').join(' ')).toContain('moves money, so a person approves it.')
    expect(everything).toContain(twinRefusal({ why: 'NEVER', doing: TWIN_ACTS['payroll.release'].says, twin: 'SUPPLIER' }))
    expect(everything).toContain(twinRefusal({ why: 'OWN_DRAFT', doing: TWIN_ACTS['bill.send'].says, twin: 'SUPPLIER' }))
  })
  it('the ledger’s words, the card’s words and the model gateway’s words are quoted as they are written', async () => {
    const { outcomeWord, tierWord } = await import('@/lib/twin/feed-words')
    for (const o of ['PERFORMED', 'AWAITING_APPROVAL', 'REFUSED', 'REJECTED', 'OVERTAKEN']) expect(everything).toContain(outcomeWord(o))
    expect(everything).toContain(tierWord('ACTS_ALONE'))
    const twin = page('twin/page.tsx')
    for (const head of ['What the twin did', "label: 'Outcome'", "label: 'Authority'", "label: 'Tier'", "label: 'Rule'", "label: 'Reason'"]) expect(twin).toContain(head)
    const ledger = readFileSync(join(process.cwd(), 'src/lib/twin/ledger.ts'), 'utf8')
    expect(ledger).toContain("'Somebody has already answered this.'")
    expect(everything).toContain('Somebody has already answered this.')
    const card = page('conversations/one-card.tsx')
    expect(card).toContain('Kept waiting. Nothing changed.')
    expect(card).toContain('>Not now<')
    expect(everything).toContain('Kept waiting. Nothing changed.')
    const { NOT_CONFIGURED_SAYS } = await import('@/lib/model-gateway/call')
    expect(everything).toContain(NOT_CONFIGURED_SAYS)
    const { COLUMNS, COUNT_LABELS, MISSING } = await import('@/lib/skills/performance-words')
    for (const w of [COLUMNS.planned, COLUMNS.actual, MISSING.notGraded, COUNT_LABELS.rules, COUNT_LABELS.low, COUNT_LABELS.high, COUNT_LABELS.fallback, COUNT_LABELS.escalated]) expect(everything).toContain(w)
  })
})

describe('IT — Upgrade: the recap that closes the track', () => {
  it('recaps every line of What you will be good at, in order, each with where the learner did it', () => {
    expect(IT_UPGRADE_RECAP.map((r) => r.goodAt)).toEqual(IT_UPGRADE_GOOD_AT)
    for (const r of IT_UPGRADE_RECAP) {
      expect(r.youDid, r.goodAt).toMatch(/^You /)
      expect(sentences(r.youDid).length, r.goodAt).toBeLessThanOrEqual(2)
    }
  })
  it('every line starts with a plain verb', () => {
    for (const r of IT_UPGRADE_RECAP) expect(r.goodAt).toMatch(/^(Explain|File|Write|Find|Say)\b/)
  })
})
