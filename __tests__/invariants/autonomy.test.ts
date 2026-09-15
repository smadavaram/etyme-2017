import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  ACTIONS, ALL_ACTIONS, JOBS, ALL_JOBS, LADDER, RUNGS,
  rungOf, kindOf, decidedBy, undoSays, readRow, KIND_SAYS,
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

/** Every `automationLog.create(...)` call, as balanced source text. */
function automationCalls(src: string): string[] {
  const out: string[] = []
  const re = /automationLog\.create\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    let depth = 1
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      i++
    }
    out.push(src.slice(m.index, i))
  }
  return out
}

/**
 * The action names the code can actually write.
 *
 * Only literals after a `?` are taken, because `said === 'ACCEPT' ? 'X' :
 * 'Y'` writes X or Y and never ACCEPT — reading the condition as an
 * action is how an inventory acquires three rows nothing writes.
 */
function actionsWrittenBy(src: string): string[] {
  const found: string[] = []
  for (const call of automationCalls(src)) {
    for (const am of call.matchAll(/\baction\s*:\s*([^,\n]+)/g)) {
      let expr = am[1]
      const q = expr.indexOf('?')
      if (q !== -1) expr = expr.slice(q + 1)
      for (const lit of expr.matchAll(/['"`]([A-Z][A-Z0-9_]{2,})['"`]/g)) found.push(lit[1])
    }
  }
  return found
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
})
