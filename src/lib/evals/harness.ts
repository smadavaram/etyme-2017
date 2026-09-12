/**
 * Evals for everything a model touches.
 *
 * Four features here send text to a model and use what comes back: the
 * words on a company's public page, a consultant's bio, reading a document
 * somebody uploaded, and scoring a match. Between them they had no tests of
 * what the model actually returns — only tests of the code around it.
 *
 * That gap is the one that bites late. A prompt change that starts
 * inventing a number, a model version that drops a field, a parser that
 * silently returns null and falls back for a month before anybody
 * notices — none of it fails a unit test, and all of it reaches a customer.
 *
 * ── Three rules this encodes ─────────────────────────────────────────
 *
 * **Score properties, not strings.** Nobody can assert the exact sentence
 * a model writes. Everybody can assert that it invented no number, used no
 * unverifiable adjective, stayed inside a length, and mentioned the thing
 * it was given. Those are the properties that make the difference between
 * copy somebody ships and copy somebody quietly rewrites.
 *
 * **The fallback is a first-class subject.** With no API key configured —
 * which is the state this system is in today — every one of these surfaces
 * runs its rule-based path. That path is what customers see, so it is what
 * the evals must cover, and it runs in the ordinary test suite with no
 * network.
 *
 * **A new surface without an eval is a failure.** The registry below is
 * checked against the code: add a fifth thing that imports the model SDK
 * and the suite fails until it has cases.
 */

export type Mode = 'RULES' | 'MODEL'

/**
 * What a failed check says. Null means it passed.
 *
 * The input is handed back for graders that need to compare against what
 * went in, and is optional so the simple ones read as one argument.
 */
export type Grader<O, I = unknown> = (out: O, input?: I) => string | null

export interface Check<O, I = unknown> {
  /** Read aloud as a sentence, because that is how these are reviewed. */
  said: string
  grade: Grader<O, I>
}

export interface Case<I, O> {
  name: string
  input: I
  checks: Check<O, I>[]
  /** Skip on the rules path where the case only makes sense for a model. */
  modelOnly?: boolean
}

export interface Surface<I, O> {
  key: string
  /** Plain English, for the scorecard. */
  what: string
  /**
   * What happens with no API key.
   *
   * NONE is not forbidden, but it must be a decision somebody took rather
   * than something nobody noticed — a surface with no fallback simply does
   * not work until a key exists, and the scorecard says so.
   */
  fallback: 'RULES' | 'HEADERS' | 'NONE'
  run: (input: I, mode: Mode) => Promise<O> | O
  cases: Case<I, O>[]
}

export interface CaseResult {
  case: string
  passed: boolean
  failures: string[]
  error?: string
}

export interface Report {
  key: string
  what: string
  mode: Mode
  results: CaseResult[]
  passed: number
  total: number
}

/**
 * Any surface, whatever it takes and returns.
 *
 * The registry holds four surfaces with four different input and output
 * types, which is the point of it — one harness over things that have
 * nothing in common but the contract. The escape hatch is here, named,
 * rather than spread through every caller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySurface = Surface<any, any>

export async function runSurface<I, O>(s: Surface<I, O>, mode: Mode): Promise<Report> {
  const results: CaseResult[] = []

  for (const c of s.cases) {
    if (mode === 'RULES' && c.modelOnly) continue

    try {
      const out = await s.run(c.input, mode)
      const failures = c.checks
        .map((check) => {
          const said = check.grade(out, c.input)
          return said === null ? null : `${check.said} — ${said}`
        })
        .filter((x): x is string => x !== null)

      results.push({ case: c.name, passed: failures.length === 0, failures })
    } catch (err) {
      // A surface that throws is a failing surface, not a crashed test run.
      results.push({
        case: c.name,
        passed: false,
        failures: [],
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    key: s.key,
    what: s.what,
    mode,
    results,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
  }
}

/**
 * The scorecard, for somebody who does not read code.
 *
 * One line per surface, and the failing cases named underneath in the
 * sentence they were written as.
 */
export function scorecard(reports: Report[]): string {
  const lines: string[] = []
  const width = Math.max(...reports.map((r) => r.what.length), 20)

  for (const r of reports) {
    const ok = r.passed === r.total
    lines.push(
      `${ok ? '  ok  ' : ' FAIL '}${r.what.padEnd(width)}  ${r.passed}/${r.total}  (${r.mode.toLowerCase()})`
    )
    for (const c of r.results.filter((x) => !x.passed)) {
      lines.push(`        · ${c.case}`)
      if (c.error) lines.push(`          crashed: ${c.error}`)
      for (const f of c.failures) lines.push(`          ${f}`)
    }
  }

  const passed = reports.reduce((n, r) => n + r.passed, 0)
  const total = reports.reduce((n, r) => n + r.total, 0)
  lines.push('')
  lines.push(`${passed}/${total} cases pass.`)
  return lines.join('\n')
}

// ── Graders ───────────────────────────────────────────────────────────

/**
 * The single most important one.
 *
 * A model writing about a company will happily produce "over 50 placements"
 * from a company with seven. Every number in the output must be a number
 * that went in — and a claim that outlives its truth is worse than a plain
 * page.
 */
export function noInventedNumbers(allowed: number[]): Grader<string> {
  const ok = new Set(allowed.map(Number))
  return (text) => {
    const found = (text.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, '')))
    const invented = found.filter((n) => !ok.has(n))
    return invented.length === 0 ? null : `invented ${invented.join(', ')}`
  }
}

/** Words that make generated copy read as generated copy. */
export const FILLER =
  /\b(leading|trusted|premier|world-class|best-in-class|innovative|cutting-edge|empowering|seamless|robust|expert|seasoned|passionate|dynamic|results-driven|proven|highly|synergy|bespoke)\b/i

export function avoids(pattern: RegExp, label: string): Grader<string> {
  return (text) => {
    const m = text.match(pattern)
    return m ? `${label}: "${m[0]}"` : null
  }
}

export function mentions(needle: string): Grader<string> {
  return (text) =>
    text.toLowerCase().includes(needle.toLowerCase()) ? null : `never mentions ${needle}`
}

export function neverMentions(needle: string): Grader<string> {
  return (text) =>
    text.toLowerCase().includes(needle.toLowerCase()) ? `mentions ${needle}` : null
}

export function atMost(chars: number): Grader<string> {
  return (text) => (text.length <= chars ? null : `${text.length} characters, limit ${chars}`)
}

export function saysSomething(): Grader<string> {
  return (text) => (text.trim().length > 5 ? null : 'empty or nearly so')
}

/**
 * Confidence has to mean something.
 *
 * A field the extractor got wrong while claiming high confidence is worse
 * than one it flagged: the whole point of the number is to decide what a
 * person has to check.
 */
export function calibrated<T extends { confidence: number }>(
  correct: (f: T) => boolean,
  threshold = 0.8
): Grader<T[]> {
  return (fields) => {
    const confidentAndWrong = fields.filter((f) => f.confidence >= threshold && !correct(f))
    return confidentAndWrong.length === 0
      ? null
      : `${confidentAndWrong.length} field(s) confident and wrong`
  }
}
