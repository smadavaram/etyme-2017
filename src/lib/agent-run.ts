/**
 * What every agent did, and what it cost.
 *
 * The build called a model and threw the usage away. `response.usage` was
 * read nowhere in the codebase, so nothing could answer the three
 * questions that decide whether any of the model work is worth doing:
 *
 *   what does one submission cost
 *   is that number falling
 *   which agent is the expensive one
 *
 * ── Why a row for rule-only work too ─────────────────────────────────
 *
 * Roughly half the useful work here is arithmetic and date comparison —
 * rate inside range, permit unexpired, document present, available in the
 * window. That is free, instant and right every time, and a ledger that
 * only records the expensive half makes the cheap half invisible. So a
 * rule check writes a row with no model and no cost, and the zero is
 * meaningful.
 *
 * ── Why the two counts ───────────────────────────────────────────────
 *
 * `consideredCount` and `scoredCount` are the margin. Scoring forty people
 * when fifteen were worth scoring is the difference between a 94% gross
 * margin and a 70% one. It is invisible unless both numbers are written
 * down on every run, so both are written down on every run.
 */

import { prisma } from '@/lib/db'

export type Verdict = 'PASS' | 'FAIL' | 'ERROR'

/**
 * What an agent can run on.
 *
 * One vocabulary, defined here because the ledger is the thing that has
 * to group by it. A second list somewhere else drifts, and then two
 * screens disagree about what a run was about.
 */
export type RecordType =
  | 'REQUIREMENT'
  | 'SUBMISSION'
  | 'CONSULTANT'
  | 'OPENING'
  | 'INVOICE'
  | 'TIMESHEET'
  | 'LEAD'

/**
 * Dollars per million tokens, as of the pricing table this was written
 * against. Model prices move; re-check quarterly, because the difference
 * between a good margin and a bad one lives here.
 *
 * Cache reads are a tenth of the input price and cache writes are a
 * quarter more — the reason the scoring prompt is built stable-first.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

/** What a model that is not in the table costs, per million tokens. */
const UNKNOWN = { in: 5, out: 25 }

export interface Usage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/**
 * What one call cost, in millionths of a dollar.
 *
 * Integer, like every other money column here. A scoring call lands around
 * 40,000 — four cents. Rounded up, because under-reporting your own cost
 * is the one direction that lets a bad margin hide.
 */
export function costMicrosOf(model: string, usage: Usage): number {
  const price = PRICES[model] ?? UNKNOWN

  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0

  // Per token, in micros: dollars-per-million ÷ 1,000,000 × 1,000,000 = dollars.
  // So micros per token is simply the per-million dollar price.
  const micros =
    input * price.in +
    output * price.out +
    // A cache read is a tenth of the input price; a write is a quarter more.
    cacheRead * price.in * 0.1 +
    cacheWrite * price.in * 1.25

  return Math.ceil(micros)
}

/** "$0.04" · "$1.20" — for a screen, not for arithmetic. */
export function showMicros(micros: number | null | undefined): string {
  if (micros == null) return '—'
  if (micros === 0) return 'free'
  const dollars = micros / 1_000_000
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`
  return `$${dollars.toFixed(2)}`
}

export interface RunInput {
  companyId: string
  agent: string
  recordType: RecordType
  recordId: string
  attempt?: number
  verdict: Verdict
  failReason?: string | null
  model?: string | null
  usage?: Usage | null
  ms: number
  consideredCount?: number | null
  scoredCount?: number | null
}

/**
 * Write one row.
 *
 * Never throws. A ledger that can take down the thing it is measuring is
 * worse than no ledger — a recruiter mid-submission should not lose the
 * submission because a write to an audit table failed.
 */
export async function record(input: RunInput): Promise<string | null> {
  try {
    const run = await prisma.agentRun.create({
      data: {
        companyId: input.companyId,
        agent: input.agent,
        recordType: input.recordType,
        recordId: input.recordId,
        attempt: input.attempt ?? 1,
        verdict: input.verdict,
        failReason: input.failReason ?? null,
        model: input.model ?? null,
        inputTokens: input.usage?.input_tokens ?? null,
        outputTokens: input.usage?.output_tokens ?? null,
        cacheReadTokens: input.usage?.cache_read_input_tokens ?? null,
        cacheWriteTokens: input.usage?.cache_creation_input_tokens ?? null,
        costMicros:
          input.model && input.usage
            ? costMicrosOf(input.model, input.usage)
            : input.model
              ? null
              : 0,
        ms: input.ms,
        consideredCount: input.consideredCount ?? null,
        scoredCount: input.scoredCount ?? null,
      },
      select: { id: true },
    })
    return run.id
  } catch (err) {
    console.error('agent-run: could not record', err)
    return null
  }
}

/**
 * Run something and write down what it did.
 *
 * The wrapper exists so that recording is not a thing anybody has to
 * remember. Every path out — returned, threw — writes a row, because the
 * runs that error are the ones worth counting.
 */
export async function runAgent<T>(
  meta: Omit<RunInput, 'verdict' | 'ms' | 'model' | 'usage' | 'failReason'>,
  fn: () => Promise<{
    result: T
    verdict?: Verdict
    failReason?: string | null
    model?: string | null
    usage?: Usage | null
    consideredCount?: number | null
    scoredCount?: number | null
  }>
): Promise<{ result: T; runId: string | null }> {
  const started = Date.now()

  try {
    const out = await fn()
    const runId = await record({
      ...meta,
      verdict: out.verdict ?? 'PASS',
      failReason: out.failReason ?? null,
      model: out.model ?? null,
      usage: out.usage ?? null,
      ms: Date.now() - started,
      consideredCount: out.consideredCount ?? meta.consideredCount ?? null,
      scoredCount: out.scoredCount ?? meta.scoredCount ?? null,
    })
    return { result: out.result, runId }
  } catch (err: any) {
    await record({
      ...meta,
      verdict: 'ERROR',
      failReason: String(err?.message ?? err).slice(0, 300),
      ms: Date.now() - started,
    })
    throw err
  }
}

// ── Reading it back ───────────────────────────────────────────────────

export interface Row {
  agent: string
  verdict: string
  attempt: number
  costMicros: number | null
  ms: number
  consideredCount: number | null
  scoredCount: number | null
  at: Date
}

/**
 * What one submission costs, and whether that is falling.
 *
 * The single number that says whether the product is working. Not model
 * accuracy, not requirements processed — the cost of the unit you sell.
 *
 * Divided by submissions rather than by runs on purpose: a change that
 * halves the calls per submission and a change that halves the price per
 * call are the same win, and both should show up here.
 */
export function costPerSubmission(
  runs: { costMicros: number | null }[],
  submissions: number
): number | null {
  if (submissions === 0) return null
  const total = runs.reduce((sum, r) => sum + (r.costMicros ?? 0), 0)
  return Math.round(total / submissions)
}

/** "down 38% on last week" · "up 12%" · "no change" · null when there is nothing to compare. */
export function trend(thisWeek: number | null, lastWeek: number | null): string | null {
  if (thisWeek === null || lastWeek === null || lastWeek === 0) return null

  const change = Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
  if (change === 0) return 'no change on last week'
  return change < 0
    ? `down ${Math.abs(change)}% on last week`
    : `up ${change}% on last week`
}

/**
 * How much of the bench the rules threw away before anything was paid for.
 *
 * Reported as a percentage because the absolute number means nothing
 * without the bench size behind it, and because a filter that has quietly
 * stopped filtering shows up here as a falling number long before it shows
 * up on the invoice.
 */
export function filterRate(runs: Row[]): { kept: number; considered: number; percent: number | null } {
  const scored = runs.filter((r) => r.consideredCount != null && r.scoredCount != null)
  if (scored.length === 0) return { kept: 0, considered: 0, percent: null }

  const considered = scored.reduce((s, r) => s + (r.consideredCount ?? 0), 0)
  const kept = scored.reduce((s, r) => s + (r.scoredCount ?? 0), 0)

  return {
    kept,
    considered,
    percent: considered === 0 ? null : Math.round((1 - kept / considered) * 100),
  }
}

/**
 * Which agent to fix first.
 *
 * Ranked by what it costs, not by how often it fails. An agent that fails
 * cheaply and retries is fine; one that succeeds expensively every time is
 * the bill.
 */
export function worstOffender(runs: Row[]): { agent: string; micros: number } | null {
  const byAgent = new Map<string, number>()
  for (const r of runs) {
    byAgent.set(r.agent, (byAgent.get(r.agent) ?? 0) + (r.costMicros ?? 0))
  }

  let worst: { agent: string; micros: number } | null = null
  for (const [agent, micros] of byAgent) {
    if (micros > 0 && (worst === null || micros > worst.micros)) worst = { agent, micros }
  }
  return worst
}

/**
 * How often an agent needs more than one go.
 *
 * A loop that habitually takes three attempts is not a loop, it is a
 * prompt that does not work being paid for three times.
 */
export function firstTimeRate(runs: Row[]): number | null {
  const finals = new Map<string, number>()
  for (const r of runs) {
    const key = `${r.agent}`
    finals.set(key, Math.max(finals.get(key) ?? 0, r.attempt))
  }
  if (finals.size === 0) return null

  const clean = Array.from(finals.values()).filter((a) => a === 1).length
  return Math.round((clean / finals.size) * 100)
}
