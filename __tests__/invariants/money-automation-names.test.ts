import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ACTIONS, actionsNamedIn, automationCalls, actionExpressions, namesIn,
} from '../../src/lib/autonomy'

/**
 * Money moves under a name somebody chose, or it does not move.
 *
 * ── The blind spot ───────────────────────────────────────────────────
 *
 * `__tests__/invariants/autonomy.test.ts` guarantees that every action
 * written to the automation log has a declared place in
 * `src/lib/autonomy.ts`. It reads the source for literal names, which is
 * the only way to know what a route can write without running it — and
 * an action assembled at runtime yields no literal, which is
 * indistinguishable from a route that logs nothing at all. So the check
 * skipped those calls silently, and four money routes were hiding in the
 * gap:
 *
 *   payroll/reserve      `RESERVE_${settlement.posting.kind}`
 *   expenses/actions     `expense.${action}`
 *   ar/collections       `COLLECTIONS_${step}`
 *   contracts/activate   `CONTRACT_${action.toUpperCase()}`
 *
 * Between them: money leaving a consultant's pot, a debt written off, a
 * client advised to stop work, and a placement started and ended — which
 * is what tenure and break in service are counted from. Sixteen names,
 * none of them declared anywhere, at rungs nobody had chosen.
 *
 * ── The scanner had two traps and this file used to copy them ────────
 *
 * It read to the first comma or the end of the line, so every name had to
 * sit on one line and a ternary broken over four lines showed one name
 * and hid three; and it took every SCREAMING_SNAKE literal after the
 * first `?`, so `step === 'FACTORED'` written inline entered the
 * inventory as an act nobody performs. Both are gone. The reader is one
 * function now, `actionsNamedIn` in `src/lib/autonomy.ts`, used by this
 * file and by `__tests__/invariants/autonomy.test.ts` both — because this
 * file held a second copy of it, and two copies of a check can disagree
 * about what the code writes while each passes on its own.
 *
 * These are the sentences that keep all four routes closed.
 */

const ROOT = process.cwd()

const RESERVE = 'src/app/api/payroll/reserve/route.ts'
const EXPENSES = 'src/app/api/expenses/actions/route.ts'
const COLLECTIONS = 'src/app/api/ar/collections/route.ts'
const ACTIVATE = 'src/app/api/contracts/[id]/activate/route.ts'
const ALL = [RESERVE, EXPENSES, COLLECTIONS, ACTIVATE]

const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** The `action:` expressions in a file, balanced however many lines they span. */
function actionExprs(rel: string): string[] {
  return automationCalls(src(rel)).flatMap((call) => actionExpressions(call))
}

/** The names a file can actually write, read by the ladder's own reader. */
function namesWritten(rel: string): string[] {
  return actionsNamedIn(src(rel)).names
}

function homeless(rel: string): string[] {
  return namesWritten(rel).filter((n) => !ACTIONS[n])
}

const MISSING = (rel: string) =>
  `${rel} writes these to the automation log and they have no place in ` +
  `src/lib/autonomy.ts, so every row reads back as “this action has no place ` +
  `in the ladder yet”:\n  ${homeless(rel).join('\n  ')}`

describe('what a money route records when it moves money', () => {
  it('a reserve movement is recorded under a name the governance ladder knows', () => {
    expect(namesWritten(RESERVE)).toEqual(['RESERVE_FORFEIT', 'RESERVE_PAY_OUT'])
    expect(homeless(RESERVE), MISSING(RESERVE)).toEqual([])
  })

  it('a reserve paid out and a reserve kept by the firm are told apart by name', () => {
    // The two outcomes of `exitPosting` are not the same act. One returns
    // somebody their own money; the other keeps it under terms that say
    // so. One name for both would make the second unauditable.
    const names = namesWritten(RESERVE)
    expect(names).toContain('RESERVE_PAY_OUT')
    expect(names).toContain('RESERVE_FORFEIT')
    expect(names.length).toBe(2)
  })

  it('a reserve settlement says how much in which currency, never a bare number', () => {
    const file = src(RESERVE)
    expect(file).toMatch(/summary:[\s\S]{0,400}amount\(/)
    expect(
      file,
      'A figure divided by a hundred by hand carries no currency, and a figure ' +
        'with no currency on it is one somebody later adds to a figure in another one.'
    ).not.toMatch(/amountCents\s*\)?\s*\/\s*100\s*\)\s*\.toFixed/)
  })

  it('an expense decision is recorded in the same voice as every other action', () => {
    expect(namesWritten(EXPENSES)).toEqual([
      'EXPENSE_APPROVED', 'EXPENSE_REJECTED', 'EXPENSE_SUBMITTED',
    ])
    expect(homeless(EXPENSES), MISSING(EXPENSES)).toEqual([])
  })

  it('an expense decision is never recorded in a voice of its own', () => {
    for (const expr of actionExprs(EXPENSES)) {
      expect(
        expr,
        'An automation log action is a machine name and every other one in the app ' +
          'is SCREAMING_SNAKE. A lowercase dotted name means a reader has to know ' +
          'two conventions to query one table.'
      ).not.toMatch(/['"`][a-z][a-z.]*['"`]\s*,?\s*$/)
      expect(expr).not.toContain('expense.')
    }
  })

  it('an expense submission nobody can take back is not recorded as reversible', () => {
    // Nothing in the app moves an expense to DRAFT, so a submission
    // cannot be undone, and nothing moves a REJECTED one anywhere, so a
    // rejection is the end of the line. Only an approval can be put
    // back, by rejecting it while it is still unbilled.
    const call = automationCalls(src(EXPENSES))[0]
    const flag = call.match(/reversible:\s*([^,\n]+)/)?.[1] ?? ''
    expect(flag).not.toContain("'submit'")
    expect(flag).not.toContain("'reject'")
    expect(flag).toContain("'approve'")
  })

  it('an expense decision reads as a sentence, not as the verb the API was called with', () => {
    const call = automationCalls(src(EXPENSES))[0]
    expect(
      call,
      '`${action} 3 expenses` produced “approve 3 expenses”, which is not a ' +
        'sentence and is not the word a person would use.'
    ).not.toMatch(/summary:\s*`\$\{/)
    expect(call).not.toMatch(/reason:\s*`Bulk/)
  })

  it('writing a debt off and advising a client to stop work each have a name of their own', () => {
    expect(namesWritten(COLLECTIONS)).toEqual([
      'COLLECTIONS_FACTORED', 'COLLECTIONS_OWNER_ASSIGNED', 'COLLECTIONS_PROMISE_MADE',
      'COLLECTIONS_STOP_WORK_ADVISED', 'COLLECTIONS_WRITTEN_OFF',
    ])
    expect(homeless(COLLECTIONS), MISSING(COLLECTIONS)).toEqual([])
  })

  it('a collections step names the five things it writes and nothing it only tests for', () => {
    // The scanner takes every capitalised literal after the first `?`, so
    // `step === 'FACTORED'` written inline would put FACTORED in the
    // inventory as an act nobody ever performs.
    for (const name of namesWritten(COLLECTIONS)) {
      expect(name, `${name} is a step, not an action name`).toMatch(/^COLLECTIONS_/)
    }
  })

  it('a placement started, paused or ended is recorded in the past tense like every other name in the ladder', () => {
    expect(namesWritten(ACTIVATE)).toEqual([
      'CONTRACT_ACTIVATED', 'CONTRACT_CANCELLED', 'CONTRACT_COMPLETED',
      'CONTRACT_PAUSED', 'CONTRACT_RESUMED', 'CONTRACT_VERIFICATION_REQUESTED',
    ])
    for (const name of namesWritten(ACTIVATE)) {
      expect(
        name,
        `${name} reads as an instruction. A log row records what happened, and the ` +
          `ladder beside it already says CONTRACT_CREATED and CONTRACT_EXTENDED.`
      ).toMatch(/(ED|REQUESTED)$/)
    }
    expect(homeless(ACTIVATE), MISSING(ACTIVATE)).toEqual([])
  })

  it('no money route builds its automation log action out of pieces', () => {
    for (const rel of ALL) {
      const exprs = actionExprs(rel)
      expect(exprs.length, `${rel} writes an automation log and names no action`).toBeGreaterThan(0)

      for (const expr of exprs) {
        // Every outcome the expression can take is a name stated whole. A
        // name built at runtime and a name looked up in a table both read
        // as no name at all, and no name used to read as "this route logs
        // nothing" — which is how four money routes hid.
        const read = namesIn(expr)
        expect(
          read.unnamed,
          `${rel} does not state every name it can write. These outcomes are ` +
            `assembled or looked up, and the ladder cannot see either:\n  ${read.unnamed.join('\n  ')}`
        ).toEqual([])
        expect(read.names.length, `${rel} names no action`).toBe(read.branches.length)
      }
    }
  })

  it('a money route may write its six names over six lines, because legibility and the check are no longer at odds', () => {
    // They were at odds. Until the reader took the balanced value, every
    // name had to share one line with every other, and the activation
    // route's action was a single 250-character line for no reason but
    // that. Six names on six lines, and all six still seen.
    const [expr] = actionExprs(ACTIVATE)
    expect(expr.split('\n').length, 'the six names are back on one line').toBeGreaterThan(5)
    expect(namesIn(expr).names).toHaveLength(6)
    expect(namesWritten(ACTIVATE)).toHaveLength(6)
  })
})
