import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * One door for a generated cycle date, and a sweep that finds the next
 * route to walk round it.
 *
 * ── What went wrong ──────────────────────────────────────────────────
 *
 * A company can now say which way its dates move when they land on a
 * weekend or a holiday — before it, after it, or leave them where they
 * fall (`lib/cycle-shift`, 2026-09-17). `writeCyclesFor` reads that
 * answer off the company holding the contract, so every caller that
 * goes through it is generated on the company's own calendar without
 * knowing the setting exists.
 *
 * `POST /api/submissions/:id/convert` did not go through it. It carried
 * its own copy of the six lines — split the pack, generate the sell
 * side, generate the buy side, write both — and so a placement created
 * by converting a submission was generated on the shipped default while
 * the identical placement created by an award was generated on the day
 * the company asked for. Two placements, two different pay days, and
 * nothing anywhere saying why.
 *
 * ── Why the sweep is the valuable half ───────────────────────────────
 *
 * The copy was the bug, not the missing argument. Fixing the one route
 * leaves the next route free to make the same copy, and a wrong pay day
 * is plausible, silent and about money — nobody audits a date that
 * looks like a date. So the rule is enforced over the tree rather than
 * over one file: a cycle date is never generated without an answer
 * about weekends and holidays, wherever the call is written.
 */

const SRC = join(process.cwd(), 'src')

/** Where the generator is defined. Not a caller. */
const GENERATOR = 'src/lib/cycle-generator.ts'

/**
 * The one file allowed to call the generator without being handed a
 * policy, because it is the file that loads one: `writeCyclesFor` reads
 * the shift columns off the company holding the sell contract and hands
 * them down. Adding a second name here is a decision about money and
 * belongs to the money desk, not to whoever is in a hurry.
 */
const LOADS_ITS_OWN_POLICY = 'src/lib/contract-cycles.ts'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** The text of every `generateCycles(...)` call in a file, parentheses balanced. */
function callsTo(name: string, source: string): string[] {
  const calls: string[] = []
  const needle = `${name}(`
  let at = source.indexOf(needle)
  while (at !== -1) {
    const before = source[at - 1] ?? ' '
    // `writeCyclesFor(` is not a call to `CyclesFor`; a call starts on a
    // character that cannot be part of an identifier.
    if (!/[A-Za-z0-9_$.]/.test(before)) {
      let depth = 0
      let i = at + name.length
      for (; i < source.length; i++) {
        if (source[i] === '(') depth++
        else if (source[i] === ')') {
          depth--
          if (depth === 0) break
        }
      }
      calls.push(source.slice(at, i + 1))
    }
    at = source.indexOf(needle, at + 1)
  }
  return calls
}

/**
 * Whether this call carries the company's answer.
 *
 * Named inline — `{ policy: policyFrom(company) }` — or passed as an
 * options object built a few lines above, which is how the money desk's
 * contract route writes it. An options variable counts only if its own
 * declaration in the same file sets a policy, so passing an empty
 * `options` does not buy a pass.
 */
function carriesAPolicy(call: string, source: string): boolean {
  if (/\bpolicy\b/.test(call)) return true
  const args = call.slice(call.indexOf('(') + 1, -1)
  return args
    .split(',')
    .map((a) => a.trim())
    .filter((a) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(a))
    .some((name) => new RegExp(`\\b(const|let|var)\\s+${name}\\s*=\\s*\\{[^}]*\\bpolicy\\b`).test(source))
}

/** Every file under src/ that calls the generator, and the calls it makes. */
function generatorCallers(): { file: string; calls: string[] }[] {
  return sourceFiles(SRC)
    .map((full) => ({
      file: relative(process.cwd(), full).replace(/\\/g, '/'),
      calls: callsTo('generateCycles', readFileSync(full, 'utf8')),
    }))
    .filter((f) => f.calls.length > 0 && f.file !== GENERATOR)
}

describe('a placement is generated on the company’s own calendar, whichever door it came through', () => {

  const convert = readFileSync(
    join(SRC, 'app/api/submissions/[id]/convert/route.ts'),
    'utf8'
  )

  it('a placement converted from a submission is generated on the company’s own calendar, like every other placement', () => {
    // Going through the helper is what makes that true: it reads the
    // three shift columns off the company holding the contract.
    expect(convert).toContain('writeCyclesFor(tx, {')
    expect(callsTo('generateCycles', convert)).toHaveLength(0)
  })

  it('converting a submission writes the buy side’s dates on the buy contract, not on the sell contract', () => {
    // The helper puts salary cycles on the buy contract, which is where
    // the payroll screen reads them. The route no longer decides.
    expect(convert).toMatch(/buy:\s*buyContract/)
    expect(convert).not.toContain('cycle.createMany')
  })

  it('converting a submission passes both companies’ holidays, because a pay day on the client’s holiday is as wrong as one on ours', () => {
    expect(convert).toContain('loadContractHolidays(')
    expect(convert).toMatch(/holidays,?\s*\n?\s*\}\)/)
  })
})

describe('no cycle date is generated without an answer about weekends and holidays', () => {

  it('every file that calls the cycle generator either loads the company’s answer or is handed one', () => {
    const offenders: string[] = []
    for (const { file, calls } of generatorCallers()) {
      if (file === LOADS_ITS_OWN_POLICY) continue
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      for (const call of calls) {
        if (!carriesAPolicy(call, source)) {
          offenders.push(`${file}: ${call.replace(/\s+/g, ' ').slice(0, 120)}`)
        }
      }
    }
    expect(
      offenders,
      'These calls generate cycle dates on the shipped default and ignore whatever the company set. ' +
        'Call writeCyclesFor instead, or pass { policy: policyFrom(company) }.'
    ).toEqual([])
  })

  it('a file that generates cycle dates itself also reads the company’s shift columns', () => {
    const missing = generatorCallers()
      .filter((f) => f.file !== LOADS_ITS_OWN_POLICY)
      .filter((f) => !readFileSync(join(process.cwd(), f.file), 'utf8').includes("from '@/lib/cycle-shift'"))
      .map((f) => f.file)
    expect(
      missing,
      'A file that reaches past writeCyclesFor must import policyFrom and load the company’s own answer.'
    ).toEqual([])
  })

  it('the helper that loads the company’s answer is the only file exempt, and it still loads one', () => {
    const helper = readFileSync(join(process.cwd(), LOADS_ITS_OWN_POLICY), 'utf8')
    expect(helper).toContain('policyFrom(')
    expect(helper).toContain('cycleShiftPay: true')
  })

  it('a route that generated cycles on the shipped default would be caught by this sweep', () => {
    // The sweep tested on itself: the exact line the convert route used
    // to carry, and the line that replaced it.
    const asItWas = 'const generatedCycles = generateCycles(start, end, split.sell, holidays)'
    expect(carriesAPolicy(callsTo('generateCycles', asItWas)[0], asItWas)).toBe(false)

    // Named inline, and named through an options object built above the
    // call — both are the company's answer arriving.
    const inline =
      'const cycles = generateCycles(start, end, split.sell, holidays, new Map(), { policy: policyFrom(company) })'
    expect(carriesAPolicy(callsTo('generateCycles', inline)[0], inline)).toBe(true)

    const viaOptions =
      'const options = { policy: policyFrom(company) }\n' +
      'const cycles = generateCycles(start, end, split.sell, holidays, new Map(), options)'
    expect(carriesAPolicy(callsTo('generateCycles', viaOptions)[0], viaOptions)).toBe(true)

    // An options object that carries everything except the one thing
    // this sweep is about does not buy a pass.
    const emptyOptions =
      'const options = { onlyPeriodsAfter: null }\n' +
      'const cycles = generateCycles(start, end, split.sell, holidays, new Map(), options)'
    expect(carriesAPolicy(callsTo('generateCycles', emptyOptions)[0], emptyOptions)).toBe(false)
  })

  it('the sweep reads the tree rather than a list somebody kept up to date', () => {
    // It found two callers on the day it was written — the money desk's
    // contract route, which passes a policy, and the helper. If that
    // number goes to zero the sweep has stopped looking at anything.
    expect(generatorCallers().length).toBeGreaterThan(0)
  })
})
