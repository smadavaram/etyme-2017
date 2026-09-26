import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * One door to what the bench answered, and a sweep for the next screen
 * that walks round it.
 *
 * ── What went wrong ──────────────────────────────────────────────────
 *
 * `/api/bench` answers `{ data: { tiers, totals } }`. Two screens read
 * that answer and each worked the shape out for itself. The Bench page
 * read `data.tiers` and was right. The Training page read
 * `data.listings` — a key the route has never sent in its life — got
 * `undefined`, coalesced it to an empty array, and reported "Bench
 * consultants 0 with skills listed" over CloudEPA's five fully skilled
 * people. It then computed a skill gap from that nought against a real
 * demand side, so every skill a client had asked for read as an unfilled
 * deficit, on every supplier, for the life of the screen.
 *
 * Nothing caught it because the failure was silent and confident. A
 * missing key is `undefined`, `undefined ?? []` is `[]`, and `[]` counts
 * to nought without complaining.
 *
 * ── Why the sweep is the valuable half ───────────────────────────────
 *
 * Fixing two screens leaves the third free to write `data.listings`
 * again next month. The rule that matters is not "these two pages agree
 * today" — it is that **two screens on one menu cannot disagree about
 * the same firm's bench**, and the only way to hold that is for every
 * reader to ask the same code. So the rule is enforced over the tree
 * rather than over a list somebody keeps up to date.
 *
 * What is forbidden is reaching into the bench answer's own shape — its
 * tiers, or a key invented for it — anywhere but the door and the route
 * that writes it. Reading a row `readBench` handed back is not an
 * offense; it is the point.
 */

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/** The one file that turns what `/api/bench` said into rows. */
const THE_DOOR = 'src/lib/bench-filter.ts'

/** The route that writes the answer, and so is allowed to name its shape. */
const THE_ROUTE = /^src\/app\/api\/bench\//

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/**
 * Comments are stripped before the sweep reads a file.
 *
 * Both halves of this rule are documented in prose beside the code that
 * follows it, and the prose quotes the key that caused the bug. A sweep
 * that cannot tell an explanation from an offense punishes writing the
 * explanation down.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const files = walk(SRC).map((f) => ({
  path: relative(ROOT, f).replace(/\\/g, '/'),
  text: code(readFileSync(f, 'utf8')),
}))

/**
 * Reaching into the answer's shape rather than asking the door.
 *
 * `body.data.tiers`, `res.data.listings`, `benchRes.data?.listings` — any
 * of them, in a file that fetched `/api/bench`, is a screen deciding for
 * itself what the route sent.
 */
const READS_THE_SHAPE = /\bdata\s*(\?)?\.\s*(tiers|listings)\b/

/** A file that actually talks to `/api/bench`. */
const CALLS_THE_BENCH = /fetch\(\s*[`'"]\/api\/bench/

/**
 * Who still reads the answer by hand, and what it costs them today.
 *
 * Found by this sweep on 2026-09-26, which is the whole reason the rule
 * is enforced over the tree rather than over the two screens the bug was
 * reported on. **Three more pickers have the identical bug** — reading
 * `data.listings`, a key the route has never sent — and two of them are
 * not supply's to fix:
 *
 *   · `app/dashboard/compliance` (etyme-regulatory) — the Visas tab's
 *     "file a petition for" picker offers nobody, at every firm.
 *   · `app/dashboard/documents` (etyme-regulatory) — "ask this person
 *     for a document" offers nobody, at every firm.
 *
 * And three more re-derive the shape correctly, so they are right today
 * and one refactor from being wrong:
 *
 *   · `app/dashboard/page` (etyme-architect) — reads `data.tiers`.
 *   · `app/dashboard/reports` (etyme-money) — reads `data.tiers`.
 *   · `app/dashboard/submissions` (etyme-demand) — reads `data.tiers`.
 *
 * The list is a ceiling, never a floor. A file leaving it is the fix
 * landing and this test does not care. A file joining it means another
 * screen has started working out the bench's shape for itself, which is
 * exactly how a page came to report nought skilled people over a bench of
 * five — and that is a conversation with the bench desk.
 */
const STILL_READS_BY_HAND = [
  'src/app/dashboard/compliance/page.tsx',
  'src/app/dashboard/documents/page.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/dashboard/reports/page.tsx',
  'src/app/dashboard/submissions/page.tsx',
]

describe('the bench answer is read through one door', () => {
  it('no screen reads the bench answer’s own shape — the door does it once', () => {
    const offenders = files
      .filter((f) => f.path !== THE_DOOR && !THE_ROUTE.test(f.path))
      .filter((f) => CALLS_THE_BENCH.test(f.text))
      .filter((f) => READS_THE_SHAPE.test(f.text))
      .map((f) => f.path)
      .filter((p) => !STILL_READS_BY_HAND.includes(p))

    expect(
      offenders,
      'These files decide for themselves what /api/bench sent. Call readBench in ' +
        'lib/bench-filter instead: the Training page read data.listings — a key the ' +
        'route never sent — and reported nought skilled people over a full bench.'
    ).toEqual([])
  })

  it('every screen that asks the bench for its people asks the door what came back', () => {
    const callers = files
      .filter((f) => f.path !== THE_DOOR && !THE_ROUTE.test(f.path))
      .filter((f) => CALLS_THE_BENCH.test(f.text))

    // A caller may ask for the roster (scope=payroll) instead, which is a
    // different question with a different consent behind it and its own
    // shape. What no caller may do is read the listing side by hand.
    const byHand = callers
      .filter((f) => !f.text.includes('readBench') && /scope=(company|network|mine)/.test(f.text))
      .map((f) => f.path)
      .filter((p) => !STILL_READS_BY_HAND.includes(p))

    expect(
      byHand,
      'These files fetch bench listings and never call readBench. Two screens on one ' +
        'menu must not disagree about the same firm’s bench.'
    ).toEqual([])
  })

  it('the screens still reading it by hand are named, so the list cannot grow quietly', () => {
    // Every name on the list must still be a file that reads the shape.
    // A stale entry is a hole somebody could walk a new reader through.
    for (const path of STILL_READS_BY_HAND) {
      const f = files.find((x) => x.path === path)
      expect(f, `${path} is on the list and no longer exists. Take it off.`).toBeTruthy()
      expect(
        READS_THE_SHAPE.test(f!.text),
        `${path} no longer reads the bench answer by hand. Take it off the list.`
      ).toBe(true)
    }
  })

  it('the door refuses a shape it does not understand rather than counting it as nobody', () => {
    const door = code(readFileSync(join(ROOT, THE_DOOR), 'utf8'))
    // The guard that makes the rule worth having: a reading that failed
    // carries a sentence and nulls, never a zero.
    expect(door).toMatch(/retained: null/)
    expect(door).toMatch(/would be invented/)
  })

  it('the training page counts the firm’s own payroll as well as its listings', () => {
    const page = code(readFileSync(join(SRC, 'app/dashboard/training/page.tsx'), 'utf8'))
    expect(page).toMatch(/scope=payroll/)
    expect(page).toMatch(/readBench/)
    // The old key, which must never come back. Named in the prose above
    // this page's own code and nowhere in it.
    expect(page).not.toMatch(/data\s*\??\.\s*listings/)
  })
})
