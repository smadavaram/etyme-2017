import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  ACTIONS, ALL_ACTIONS, JOBS, ALL_JOBS, LADDER, RUNGS, TALLY,
  PLANNED, ALL_PLANNED,
  rungOf, kindOf, decidedBy, undoSays, readRow, KIND_SAYS,
  actionsNamedIn, branchesOf, namesIn,
} from '../../src/lib/autonomy'

/**
 * We do a lot unprompted, and now there is a word for how much.
 *
 * The ladder is SAP's, on purpose — L0 Observe through L5 Fully
 * autonomous — because every enterprise buyer is being taught that
 * vocabulary right now and inventing our own would cost us the only
 * thing this naming buys.
 *
 * This file is the thing that keeps it true. An inventory in a document
 * is wrong within a month; a test is wrong for exactly one commit. A new
 * automated action or a new scheduled job with no place in the ladder
 * fails here, on the commit that added it.
 */

const ROOT = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

/**
 * The names a file can write, read by the ladder's own reader.
 *
 * This used to be a copy of the scanner living in this file, and the copy
 * had two faults that decided how five routes were written. It read the
 * `action:` value to the first comma or the end of the line, so a ternary
 * broken over four lines showed one name and hid the rest — which is how
 * `REQUISITION_REJECTED` and `REQUISITION_CHANGES_REQUESTED` were written
 * to production for as long as that route existed with no rung and no
 * complaint. And it took every SCREAMING_SNAKE literal after the first
 * `?`, tests included, so an author had to hoist a boolean out of the
 * expression per branch to keep `step === 'FACTORED'` from entering the
 * inventory as an act nobody performs.
 *
 * The reader now lives in `src/lib/autonomy.ts` beside the ladder it
 * serves, takes the balanced value however many lines it spans, and reads
 * names from branch positions only. Two copies of a scanner is one copy
 * too many: the money routes were written against a second copy of the
 * old one, and the two could disagree about what the code writes.
 */
function actionsWrittenBy(src: string): string[] {
  return actionsNamedIn(src).names
}

const FILES = walk(ROOT)
const WRITTEN = new Map<string, string[]>()
for (const f of FILES) {
  for (const a of actionsWrittenBy(readFileSync(f, 'utf8'))) {
    const rel = f.replace(process.cwd() + '/', '')
    if (!WRITTEN.has(a)) WRITTEN.set(a, [])
    if (!WRITTEN.get(a)!.includes(rel)) WRITTEN.get(a)!.push(rel)
  }
}

const CRON_DIR = join(ROOT, 'app/api/cron')
const CRON_JOBS = readdirSync(CRON_DIR).filter((d) => statSync(join(CRON_DIR, d)).isDirectory())

describe('how much we do unprompted, as a level and a log', () => {
  it('every automated action has a level, and a new one without a level fails this test', () => {
    const homeless = [...WRITTEN.keys()].filter((a) => !ACTIONS[a]).sort()
    expect(
      homeless,
      'These actions are written to the automation log and have no place in ' +
        'src/lib/autonomy.ts. Decide whether each is something the system did ' +
        'unprompted (give it a rung), a decision about what a person was ' +
        'allowed to do (ENFORCEMENT), or a record of a person’s own act ' +
        `(ATTRIBUTED):\n  ${homeless.map((a) => `${a}  — ${WRITTEN.get(a)!.join(', ')}`).join('\n  ')}`
    ).toEqual([])
  })

  it('the ladder claims nothing the code does not actually write', () => {
    const phantom = ALL_ACTIONS.filter((a) => !WRITTEN.has(a))
    expect(
      phantom,
      `These are named in the ladder and nothing writes them. An inventory ` +
        `that lists actions nobody performs overstates what we do:\n  ${phantom.join('\n  ')}`
    ).toEqual([])
  })

  it('a scheduled job that nobody asked for is named at the level it actually acts at', () => {
    const homeless = CRON_JOBS.filter((j) => !JOBS[j]).sort()
    expect(
      homeless,
      `These scheduled jobs do work nobody asked for and have no level:\n  ${homeless.join('\n  ')}`
    ).toEqual([])

    const phantom = ALL_JOBS.filter((j) => !CRON_JOBS.includes(j))
    expect(phantom, `These jobs are named in the ladder and do not exist`).toEqual([])

    // A job's declared level has to match what it really writes, or the
    // level is a claim about a different program.
    for (const j of CRON_JOBS) {
      const src = readFileSync(join(CRON_DIR, j, 'route.ts'), 'utf8')
      const really = [...new Set(actionsWrittenBy(src))].sort()
      expect(
        [...JOBS[j].writes].sort(),
        `The job "${j}" is declared as writing ${JSON.stringify(JOBS[j].writes)} and really writes ${JSON.stringify(really)}`
      ).toEqual(really)
    }
  })

  it('a scheduled job acts at or below the level of the loudest thing it does', () => {
    // A job that ends contracts cannot be described as one that only looks.
    for (const j of ALL_JOBS) {
      for (const action of JOBS[j].writes) {
        const rung = rungOf(action)
        if (!rung) continue
        expect(
          RUNGS.indexOf(JOBS[j].rung),
          `The job "${j}" writes ${action}, which is ${rung}, but the job is named ${JOBS[j].rung}`
        ).toBeGreaterThanOrEqual(RUNGS.indexOf(rung))
      }
    }
  })

  it('a level says what it means in a sentence, not as a code', () => {
    for (const rung of RUNGS) {
      const level = LADDER[rung]
      expect(level.name.length, `${rung} has no name`).toBeGreaterThan(3)
      // A sentence: prose, ending in a full stop, not an identifier.
      expect(level.says.length, `${rung} has no sentence`).toBeGreaterThan(40)
      expect(level.says.trim().endsWith('.'), `${rung} does not read as a sentence`).toBe(true)
      expect(level.says, `${rung} says its own code back`).not.toContain(rung)
      expect(level.says, `${rung} uses a machine name`).not.toMatch(/[A-Z]{3,}_[A-Z]/)
    }

    // And everything that is not a person's own act explains itself too.
    for (const action of ALL_ACTIONS) {
      const act = ACTIONS[action]
      if (act.kind === 'ATTRIBUTED') continue
      expect(act.says.length, `${action} has no sentence`).toBeGreaterThan(40)
      expect(act.says, `${action} says its own code back`).not.toContain(action)
    }

    for (const kind of Object.keys(KIND_SAYS) as (keyof typeof KIND_SAYS)[]) {
      expect(KIND_SAYS[kind], `${kind} says its own code back`).not.toContain(kind)
    }
  })

  it('an autonomy level describes what the system did on its own, never what it refused a person', () => {
    // A BLOCK on a tenure limit is aimed at somebody who asked for
    // something. It is governance, and governance has no rung.
    expect(kindOf('AWARD_BLOCKED')).toBe('ENFORCEMENT')
    expect(rungOf('AWARD_BLOCKED')).toBeNull()
    expect(rungOf('SUBMISSION_OFF_BAND')).toBeNull()

    for (const action of ALL_ACTIONS) {
      const act = ACTIONS[action]
      if (act.kind === 'UNPROMPTED') {
        expect(rungOf(action), `${action} is unprompted and has no rung`).not.toBeNull()
      } else {
        expect(rungOf(action), `${action} is ${act.kind} and must not carry a level`).toBeNull()
      }
    }

    // A person's own act is not automation either, however it is logged.
    expect(kindOf('PAYMENT_RECORDED')).toBe('ATTRIBUTED')
    expect(rungOf('PAYMENT_RECORDED')).toBeNull()

    // Pressing a button and the system choosing to act are different
    // things, and the same capability can be both.
    expect(kindOf('MATCH_RUN')).toBe('ATTRIBUTED')
    expect(rungOf('PROACTIVE_MATCH')).toBe('L1')
  })

  it('a row that can still be undone says so, and one that cannot says that instead', () => {
    expect(undoSays(true, null)).toBe('This can still be undone.')
    expect(undoSays(false, null)).toBe('This cannot be undone.')
    expect(undoSays(true, new Date('2026-09-01'))).toBe('Already undone.')

    const row = readRow({ action: 'CONTRACTS_ENDED', reversible: false, reversedAt: null })
    expect(row.undo).toBe('This cannot be undone.')
    expect(row.levelName).toBe('Fully autonomous (within policy)')
  })

  it('a rule is not described as judgment', () => {
    // Ending a contract on its last day is fully autonomous and is also a
    // date comparison. Both are true, and a ladder that let the first
    // imply the second would not survive one technical buyer.
    expect(rungOf('CONTRACTS_ENDED')).toBe('L5')
    expect(decidedBy('CONTRACTS_ENDED').by).toBe('RULE')
    expect(decidedBy('CONTRACTS_ENDED').says).toContain('No model was involved')

    for (const action of ALL_ACTIONS) {
      if (ACTIONS[action].basis !== 'RULE') continue
      expect(decidedBy(action, { writtenBy: 'MODEL' }).by, `${action} is a rule`).toBe('RULE')
    }

    // Where a model may have done the work, the row decides, not this file.
    expect(decidedBy('SITE_WRITTEN', { writtenBy: 'MODEL' }).by).toBe('MODEL')
    expect(decidedBy('SITE_WRITTEN', { writtenBy: 'RULE' }).by).toBe('RULE')
  })

  it('where a model may have done the work and the row does not say, we say we do not know', () => {
    // A guess here is a claim about how much of this product is AI, made
    // to the one person who is evaluating exactly that.
    const unknown = decidedBy('MATCH_RUN', { matchCount: 4 })
    expect(unknown.by).toBe('UNRECORDED')
    expect(unknown.says).toContain('does not say')
  })

  it('most of what is in the automation log is a person acting, and the ladder says so rather than claiming it', () => {
    const unprompted = ALL_ACTIONS.filter((a) => ACTIONS[a].kind === 'UNPROMPTED')
    const attributed = ALL_ACTIONS.filter((a) => ACTIONS[a].kind === 'ATTRIBUTED')
    expect(attributed.length).toBeGreaterThan(unprompted.length)
    expect(unprompted.length).toBeGreaterThan(0)
  })

  it('how many there are of each kind is counted from the ladder, never written into the sentence beside it', () => {
    // The paragraph at the top of the file said thirteen, three and
    // eighty-two; a heading below it said eighty-four; the jobs heading
    // said fourteen where there were fifteen. Each was true when it was
    // typed and none was reread when the next row went in. A count that
    // is computed cannot go stale.
    expect(TALLY.UNPROMPTED + TALLY.ENFORCEMENT + TALLY.ATTRIBUTED).toBe(ALL_ACTIONS.length)
    expect(TALLY.ATTRIBUTED).toBeGreaterThan(TALLY.UNPROMPTED + TALLY.ENFORCEMENT)
    expect(TALLY.UNPROMPTED).toBe(ALL_ACTIONS.filter((a) => ACTIONS[a].kind === 'UNPROMPTED').length)
    expect(ALL_JOBS.length).toBe(CRON_JOBS.length)
  })

  it('every action name is written out in full, because a name assembled at runtime is one no reader and no check can find', () => {
    // This is the rule the whole file rests on. Until it existed, a route
    // that built its action name out of pieces wrote no literal, and no
    // literal was indistinguishable from writing no log at all — so the
    // check above simply skipped it. Five routes sat in that gap: money
    // leaving a consultant's pot, a debt written off, a client advised to
    // stop work, a placement started and ended, and a seat suspended,
    // every one of them under a name nothing in the ladder had heard of.
    // One of those names, ACCESS_SUSPENDD, was a typo nobody could see.
    const assembled: string[] = []
    for (const f of FILES) {
      const read = actionsNamedIn(readFileSync(f, 'utf8'))
      const rel = f.replace(process.cwd() + '/', '')
      for (const u of read.unnamed) assembled.push(`${rel}\n    ${u.replace(/\s+/g, ' ')}`)
    }
    expect(
      assembled,
      'These write an automation log action that is not a name stated whole — built ' +
        'by interpolation, or looked up in a table. Either way the ladder cannot see ' +
        'it, and what the ladder cannot see it cannot hold a rung for. Write the name ' +
        `out, once per branch:\n  ${assembled.join('\n  ')}`
    ).toEqual([])
  })

  it('a name written across four lines is a name the check can see', () => {
    // It could not be, and that cost two rungs. `requisitions/[id]/approve`
    // writes three names over four lines; the old reader stopped at the
    // first line and the other two were unknown to the ladder for as long
    // as the route existed.
    const names = namesIn(`
      action === 'approve' ? 'REQUISITION_APPROVED'
      : action === 'changes' ? 'REQUISITION_CHANGES_REQUESTED'
      : 'REQUISITION_REJECTED'
    `).names
    expect(names).toEqual([
      'REQUISITION_APPROVED', 'REQUISITION_CHANGES_REQUESTED', 'REQUISITION_REJECTED',
    ])
  })

  it('what a branch tests for is not what it writes', () => {
    // `step === 'FACTORED' ? …` names a step, not an act. Reading the
    // test as an action is how an inventory acquires rows nothing writes,
    // and an inventory that overstates is the one thing this file exists
    // to prevent.
    const read = namesIn(`step === 'FACTORED' ? 'COLLECTIONS_FACTORED' : 'COLLECTIONS_WRITTEN_OFF'`)
    expect(read.names).toEqual(['COLLECTIONS_FACTORED', 'COLLECTIONS_WRITTEN_OFF'])
    expect(read.branches).toHaveLength(2)
  })

  it('a name assembled out of pieces, and a name looked up in a table, are both reported rather than passed over', () => {
    expect(namesIn('`ACCESS_${verb.toUpperCase()}D`').names).toEqual([])
    expect(namesIn('`ACCESS_${verb.toUpperCase()}D`').unnamed).toHaveLength(1)
    // A lookup table reads well and is invisible here, which is the one
    // shape that is worse than a long ternary.
    expect(namesIn('NAMES[step]').names).toEqual([])
    expect(namesIn('NAMES[step]').unnamed).toEqual(['NAMES[step]'])
  })

  it('a question mark that is not a branch is not read as one', () => {
    // `??` and `?.` are operators. Reading either as a ternary would
    // split an expression in the middle and lose the name after it.
    expect(branchesOf(`chosen ?? 'PAYMENT_RECORDED'`)).toEqual([`chosen ?? 'PAYMENT_RECORDED'`])
    expect(namesIn(`a?.b ? 'INVOICE_SUBMITTED' : 'INVOICE_GENERATED'`).names)
      .toEqual(['INVOICE_GENERATED', 'INVOICE_SUBMITTED'])
  })
})

describe('an action designed before it is built is named as planned, and cannot stay that way', () => {
  /**
   * Two promises this file already holds pull against each other the
   * moment a schema lands ahead of the behavior built on it: an action
   * written with no rung fails, and a rung with no writer fails too.
   * `PLANNED` is how a designed-but-unwritten action is named without
   * the ladder claiming the product does it. These three keep that
   * honest.
   */

  it('nothing planned is counted as something we actually do', () => {
    const claimed = ALL_PLANNED.filter((a) => ACTIONS[a])
    expect(
      claimed,
      'These sit in PLANNED and in the inventory at once, so the ladder both ' +
        'claims them and does not:\n  ' + claimed.join('\n  ')
    ).toEqual([])
    for (const a of ALL_PLANNED) expect(ALL_ACTIONS).not.toContain(a)
    expect(TALLY.UNPROMPTED + TALLY.ENFORCEMENT + TALLY.ATTRIBUTED).toBe(ALL_ACTIONS.length)
  })

  it('the day something writes a planned action, it has to move onto the ladder', () => {
    // This is the whole point of the list. A planned name that code has
    // started writing is an act with no level, and leaving it here would
    // route around the check that catches exactly that.
    const written = ALL_PLANNED.filter((a) => WRITTEN.has(a))
    expect(
      written,
      'These are written under src/ and are still only planned. Move each ' +
        'into UNPROMPTED, ENFORCEMENT or ATTRIBUTED in src/lib/autonomy.ts, ' +
        'in this commit:\n  ' +
        written.map((a) => `${a}  — ${WRITTEN.get(a)!.join(', ')}`).join('\n  ')
    ).toEqual([])
  })

  it('every planned action already says what it will do, in a sentence', () => {
    // Deciding the rung and the words when the record is designed is the
    // reason to write one down at all. An entry with no sentence is a
    // name, and a name is what the next agent would have invented anyway.
    for (const a of ALL_PLANNED) {
      const p = PLANNED[a]
      expect(p.says.length, a).toBeGreaterThan(40)
      expect(p.willBeWrittenBy, a).toMatch(/^etyme-[a-z]+$/)
      if (p.kind === 'UNPROMPTED') expect(RUNGS, a).toContain(p.rung)
      if (p.kind === 'ENFORCEMENT') expect(['BLOCK', 'WARN', 'PERMIT'], a).toContain(p.outcome)
    }
  })

  it('a deletion or an anonymization nobody asked for sits at the top of the ladder', () => {
    // Nothing puts a deleted record back, so nothing that deletes one may
    // read as low risk. L3 says "it can be put back" in so many words.
    for (const a of ALL_PLANNED) {
      // The three the nightly sweep performs, not the acts a person
      // takes around them — asking to be forgotten is a request, and
      // requests have no rung.
      if (!/^(RETENTION_DELETE|RETENTION_ANONYMIZE|ERASURE_COMPLETE)$/.test(a)) continue
      const p = PLANNED[a]
      expect(p.kind, a).toBe('UNPROMPTED')
      if (p.kind === 'UNPROMPTED') expect(p.rung, a).toBe('L5')
    }
  })
})
