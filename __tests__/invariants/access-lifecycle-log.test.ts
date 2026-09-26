import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIONS, automationCalls, actionExpressions } from '@/lib/autonomy'

/**
 * What the automation log calls a seat being paused, put back, or ended.
 *
 * The route used to build the name by interpolation — `ACCESS_` plus the
 * verb in capitals plus a `D` — which gives ACCESS_REVOKED and
 * ACCESS_REINSTATED by luck and ACCESS_SUSPENDD by the same arithmetic.
 * It wrote that misspelling to production for as long as the route has
 * existed, and no test saw it: the check that keeps every logged action
 * named reads literal names out of the `action` field, a template yields
 * none, and a file that yields no literal looks exactly like a file that
 * writes nothing.
 *
 * So the assertions here are about the expression itself. A name a reader
 * cannot search for is the defect; asserting the output of an expression
 * that is assembled at runtime would reproduce it.
 */

const ROUTE = join(process.cwd(), 'src/app/api/access/[contextId]/route.ts')
const SRC = readFileSync(ROUTE, 'utf8')

/**
 * The `action:` expression inside `automationLog.create`, as source text.
 *
 * Read by the ladder's own reader (`src/lib/autonomy.ts`) rather than by a
 * regex of this file's own, which took the expression to the end of its
 * line and so broke the moment the three names were given a line each.
 * A check that dictates the shape of the code it checks is the fault this
 * whole piece of work was about.
 */
function loggedActionExpression(src: string): string {
  const calls = automationCalls(src)
  expect(calls.length, 'this route no longer writes to the automation log at all').toBeGreaterThan(0)
  const [expr] = actionExpressions(calls[0])
  expect(expr, 'no action field on the automation-log row').toBeTruthy()
  return expr
}

/** What the route will actually file the row under, for one verb. */
function filedUnder(verb: 'suspend' | 'reinstate' | 'revoke'): unknown {
  const expr = loggedActionExpression(SRC)
  return new Function('action', `return (${expr})`)(verb)
}

describe('a seat paused, put back or ended is filed under a name somebody can find', () => {

  it('a suspended seat is recorded as suspended, spelled the way the ladder spells it', () => {
    expect(filedUnder('suspend')).toBe('ACCESS_SUSPENDED')
  })

  it('a seat put back is recorded as reinstated, and one ended is recorded as revoked', () => {
    expect(filedUnder('reinstate')).toBe('ACCESS_REINSTATED')
    expect(filedUnder('revoke')).toBe('ACCESS_REVOKED')
  })

  it('the name the route files a row under is never built out of pieces', () => {
    const expr = loggedActionExpression(SRC)
    expect(
      expr,
      'The action name is being assembled at runtime again. A name nobody can ' +
        'search for is how ACCESS_SUSPENDD reached production and stayed there: ' +
        `write each one out in full.\n  action: ${expr}`
    ).not.toMatch(/\$\{|\.toUpperCase\(|\.toLowerCase\(|\+/)
  })

  it('every name this route can file a row under is written in the file in full', () => {
    for (const verb of ['suspend', 'reinstate', 'revoke'] as const) {
      const name = filedUnder(verb) as string
      expect(typeof name, `${verb} does not produce a name at all`).toBe('string')
      expect(
        SRC.includes(`'${name}'`) || SRC.includes(`"${name}"`),
        `${name} is what a ${verb} is filed under and the string does not appear in the file`
      ).toBe(true)
    }
  })

  it('no verb this route accepts can file a row under the misspelling again', () => {
    for (const verb of ['suspend', 'reinstate', 'revoke'] as const) {
      expect(filedUnder(verb)).not.toBe('ACCESS_SUSPENDD')
    }
  })

  it('the three names this route writes each have a place in the autonomy ladder', () => {
    const homeless = (['suspend', 'reinstate', 'revoke'] as const)
      .map((v) => filedUnder(v) as string)
      .filter((name) => !ACTIONS[name])
    expect(
      homeless,
      'These names are written to the automation log by this route and have no ' +
        'entry in src/lib/autonomy.ts, so a reader of the row is told the act ' +
        '"has no place in the ladder yet". Pausing, restoring and ending a seat ' +
        'are all things a person with team.manage did, so each belongs in ' +
        `ATTRIBUTED beside ACCESS_GRANTED:\n  ${homeless.join('\n  ')}`
    ).toEqual([])
  })

  it('the rows already filed under the misspelling are accounted for where a reader will look', () => {
    // The correction is a script rather than a silent migration, and the
    // script is where the argument for correcting an audit log is written
    // down. If it goes, the argument goes with it.
    const script = join(process.cwd(), 'scripts/rename-suspend-action.mjs')
    expect(existsSync(script), 'nothing accounts for the rows already written').toBe(true)
    const text = readFileSync(script, 'utf8')
    expect(text).toContain('ACCESS_SUSPENDD')
    expect(text).toContain('ACCESS_SUSPENDED')
    // Dry-run by default, per scripts/retire-due-cycles.mjs: a step that only
    // ever writes eventually runs against the wrong database.
    expect(text).toContain("process.argv.includes('--apply')")
    // Nothing is erased — the row keeps what it was filed under before.
    expect(text).toContain('actionWas')
  })
})
