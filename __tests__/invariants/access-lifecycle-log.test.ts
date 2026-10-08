import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
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

// ── A refused read is written before the refusal goes out ──────────────
//
// `logAccess` and `logBulkAccess` do not wait for their write. On a
// serverless host the function can be frozen the moment the response is
// sent, so a 403 that went out ahead of its row could leave no row at all
// — and CLAUDE.md's invariant is that refusals are logged too. A refusal
// is written with `recordRefusal`, awaited, before the 403.

const createMany = vi.fn()
const reportError = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { accessLog: { createMany: (...a: unknown[]) => createMany(...a) } } }))
vi.mock('@/lib/alerts', () => ({ reportError: (...a: unknown[]) => reportError(...a) }))

const SRC_ROOT = join(process.cwd(), 'src')
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? filesUnder(full) : /\.tsx?$/.test(name) ? [full] : []
  })
}

/** Every fire-and-forget log call whose row says the read was refused, as `file` per call. */
function fireAndForgetRefusals(): string[] {
  const found: string[] = []
  for (const file of filesUnder(SRC_ROOT)) {
    if (file.endsWith(join('lib', 'access-log.ts'))) continue
    const src = readFileSync(file, 'utf8')
    const re = /\blog(?:Bulk)?Access\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      const end = src.indexOf('})', m.index)
      if (src.slice(m.index, end < 0 ? undefined : end).includes('allowed: false')) {
        found.push(relative(process.cwd(), file))
      }
    }
  }
  return found.sort()
}

/**
 * Refusals still logged without waiting, in files this domain does not own.
 * Each is the owner's to move to `recordRefusal`; the list may only shrink.
 * Nothing is added here to make a new route pass.
 */
const STILL_FIRE_AND_FORGET: readonly string[] = [
].slice().sort()

describe('a refused read is in the trail before the refusal is sent', () => {
  beforeEach(() => {
    createMany.mockReset()
    reportError.mockReset()
  })

  it('a refused read\u2019s access-log row is written before the refusal is sent, so a serverless host cannot drop it', async () => {
    const { recordRefusal } = await import('@/lib/access-log')
    let land!: (v: { count: number }) => void
    createMany.mockReturnValue(new Promise((r) => { land = r }))
    let done = false
    const p = recordRefusal(['p1'], { action: 'TIMESHEET_VIEW', actorPersonId: 'a1', reason: 'refused' }).then((n) => { done = true; return n })
    await new Promise((r) => setTimeout(r, 10))
    expect(done, 'the refusal could be sent while its row was still in flight').toBe(false)
    land({ count: 1 })
    expect(await p).toBe(1)
    expect(done).toBe(true)
  })

  it('a refusal row is filed as refused, whatever the caller leaves out', async () => {
    const { recordRefusal } = await import('@/lib/access-log')
    createMany.mockResolvedValue({ count: 1 })
    await recordRefusal(['p1'], { action: 'TENURE_VIEW', reason: 'no desk' })
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ subjectId: 'p1', allowed: false, action: 'TENURE_VIEW', reason: 'no desk' })
  })

  it('a person a refused read would have shown twice is recorded once', async () => {
    const { recordRefusal } = await import('@/lib/access-log')
    createMany.mockResolvedValue({ count: 2 })
    await recordRefusal(['p1', 'p2', 'p1'], { action: 'TENURE_VIEW' })
    expect(createMany.mock.calls[0][0].data.map((d: { subjectId: string }) => d.subjectId)).toEqual(['p1', 'p2'])
  })

  it('a refusal that would have shown nobody writes nothing', async () => {
    const { recordRefusal } = await import('@/lib/access-log')
    expect(await recordRefusal([], { action: 'TENURE_VIEW' })).toBe(0)
    expect(createMany).not.toHaveBeenCalled()
  })

  it('a refusal whose row cannot be written is still a refusal, and the failure is reported to staff rather than thrown', async () => {
    const { recordRefusal } = await import('@/lib/access-log')
    createMany.mockRejectedValue(new Error('connection lost'))
    reportError.mockResolvedValue(undefined)
    await expect(recordRefusal(['p1'], { action: 'ERASURE', actorPersonId: 'a1' })).resolves.toBe(0)
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(String(reportError.mock.calls[0][1])).toMatch(/refused ERASURE .* not in the trail.*connection lost/)
  })

  it('the tenure ledger, timesheets, the compliance page and the door for a seat with no desk each wait for the refusal\u2019s row before the 403', () => {
    const sites: [string, string][] = [
      ['src/app/api/tenure/route.ts', 'if (!seat && isDeskless'],
      ['src/app/api/timesheets/route.ts', 'if (!whose.ok)'],
      ['src/app/api/timesheets/route.ts', 'if (hasOwn === 0)'],
      ['src/app/api/compliance/route.ts', 'const refusedRead'],
      ['src/lib/api-context.ts', 'if (verdict.readsPeople)'],
    ]
    for (const [file, from] of sites) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      const start = src.indexOf(from)
      expect(start, `${file}: cannot find the refusal at "${from}"`).toBeGreaterThan(-1)
      const block = src.slice(start, src.indexOf('status: 403', start))
      expect(block, `${file}: the refusal at "${from}" does not wait for its row`).toContain('await recordRefusal(')
    }
  })

  it('no route logs a refusal without waiting for it, except the ones still named here with the domain that owns them', () => {
    expect(
      fireAndForgetRefusals(),
      'A refusal is logged with logAccess or logBulkAccess, which do not wait for the write, so a ' +
        'serverless host can drop the row once the 403 is sent. Use `await recordRefusal(...)` from ' +
        'lib/access-log. If you moved one of the named ones, take it off the list.'
    ).toEqual(STILL_FIRE_AND_FORGET)
  })
})

// ── Every access-log row goes through one door ─────────────────────────
//
// A row written by hand in a route is invisible to the check above, which
// reads calls to lib/access-log, and it can swallow its own failure: the
// file route ended its write in `.catch(() => {})` until 2026-10-08, so a
// refused attempt on somebody's passport could leave no row and nobody
// would hear. Every row now goes through `logAccess`, `logBulkAccess`,
// `recordAccess` or `recordRefusal`, which report a failed write to staff.

const API_ROOT = join(process.cwd(), 'src/app/api')
// A library writes rows on a route's behalf, so it is read too: the
// week-approval service's four hand-written rows sat in src/lib, each
// ending in `.catch(() => {})`, where a check of src/app/api alone could
// not see them. lib/access-log is the door itself and is skipped.
const LIB_ROOT = join(process.cwd(), 'src/lib')

/** Every file under src/app/api or src/lib that writes an access-log row itself, as `file` per write. */
function handWrittenAccessLogRows(): string[] {
  const found: string[] = []
  for (const file of [...filesUnder(API_ROOT), ...filesUnder(LIB_ROOT)]) {
    if (file.endsWith(join('lib', 'access-log.ts'))) continue
    const src = readFileSync(file, 'utf8')
    const writes = src.match(/\baccessLog\s*\.\s*create(?:Many)?\s*\(/g) ?? []
    for (let i = 0; i < writes.length; i++) found.push(relative(process.cwd(), file))
  }
  return found.sort()
}

/**
 * Routes that still write their row by hand, each in a domain this one
 * does not own, one entry per write. Each is the owner's to move; the
 * list may only shrink, and nothing is added to it to make a new route
 * pass. Where a write sits inside a transaction (`tx.accessLog`) the
 * row commits or rolls back with the act it records, which is a real
 * reason, and the owner moves it when lib/access-log takes a client.
 */
const STILL_BY_HAND: readonly string[] = [
  // etyme-architect — one seam, awaited, a failure reported to staff. Its
  // six action names are in AccessAction since 2026-10-08; the seam's body
  // becomes recordRefusal/recordAccess in the architect's own change, and
  // this line goes with it.
  'src/lib/week-approval.ts',
].slice().sort()

describe('every access-log row goes through one door', () => {
  it('no route and no library writes an access-log row by hand; every one goes through lib/access-log, so the refusal rule can see it', () => {
    expect(
      handWrittenAccessLogRows(),
      'A route writes prisma.accessLog.create or createMany itself. The check that a refusal is ' +
        'awaited cannot see it, and a hand-written write can swallow its own failure. Use logAccess ' +
        'or logBulkAccess for a read, `await recordRefusal(...)` for a refusal, or `await ' +
        'recordAccess(...)` where the read must not proceed unlogged. If you moved one of the named ' +
        'ones, take it off the list.'
    ).toEqual(STILL_BY_HAND)
  })

  it('the file behind a document and the three share routes write their rows through lib/access-log', () => {
    for (const file of [
      'src/app/api/documents/[id]/file/route.ts',
      'src/app/api/document-shares/route.ts',
      'src/app/api/document-shares/[id]/revoke/route.ts',
      'src/app/api/shared/[token]/route.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src, file).toContain("from '@/lib/access-log'")
      expect(src, file).not.toMatch(/accessLog\s*\.\s*create/)
    }
  })
})
