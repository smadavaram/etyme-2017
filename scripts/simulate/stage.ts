/**
 * What a stage is, and what it is handed.
 *
 * A stage is one station of the trade — post jobs, sign weeks, pay —
 * written by the domain that owns that station:
 *
 *   export default defineStage({
 *     name: 'post-jobs', domain: 'DEMAND',
 *     async run(ctx) {
 *       const hm = ctx.cast.seat('world-nike/hiring')
 *       const res = await hm.post('/api/requisitions', { title: 'Data engineer', skills: ['dbt'] })
 *       if (res.ok) ctx.world.jobs.push({ id: res.json.data.requisition.id, clientSlug: 'world-nike', … })
 *       return { closed: ctx.world.jobs.length, of: ctx.options.placements }
 *     },
 *   })
 *
 * The rules a stage keeps:
 *   - It acts only through `ctx.cast` (the routes, as a seat). It never
 *     writes a row. `ctx.read` is a read-only connection to the world,
 *     for finding out what a person at that seat would already know —
 *     which seeded skills a client hires for, which weeks are open — and
 *     the database refuses any write sent through it.
 *   - It records what it made in `ctx.world`, so the next stage starts
 *     from facts rather than from a query.
 *   - A refusal is not an error. It is recorded with its sentence and
 *     becomes a lesson in the report. Where a stage expects the rule to
 *     say no, it says so with `ctx.expectRefusal`, and the report shows
 *     whether the rule held.
 */
import type { PrismaClient } from '@prisma/client'
import type { DomainKey } from '@/lib/domains'
import { expecting, type Actor, type Cast, type Res } from './actors'
import type { Ledger } from './ledger'
import type { BenchFact } from './stages/supply/bench-facts'

// The shape is supply's (stages/supply/bench-facts.ts); the world carries it.
export type { BenchFact }

// ── The world the stages fill ──────────────────────────────────────────

export interface CompanyFact {
  id: string
  slug: string
  name: string
  kind: string
  /** Seat keys at this firm. */
  seats: string[]
}

/** Every fact carries the seat that made it and may carry anything else a later stage needs. */
interface Fact {
  id: string
  /** The seat key that made it. */
  by: string
  extra?: Record<string, unknown>
}

export interface JobFact extends Fact {
  clientSlug: string
  title: string
  skills: string[]
  billMin: number | null
  billMax: number | null
  /** OPEN, DRAFT… as the route answered. */
  status: string
  approvalState: string
}
export interface SubmissionFact extends Fact { jobId: string; supplierSlug: string; personId: string; kind?: string }
export interface AwardFact extends Fact { jobId: string; submissionId: string }
export interface ContractFact extends Fact { side: 'SELL' | 'BUY'; personId: string; sellerSlug: string; buyerSlug: string; orderId?: string }
export interface WeekFact extends Fact { contractId: string; personId: string; weekStart: string; hours: number; status: string }
export interface ExpenseFact extends Fact { contractId: string; personId: string; amountCents: number; status: string }
export interface BillFact extends Fact { fromSlug: string; toSlug: string; totalCents: number; status: string }
export interface ReceiptFact extends Fact { fromSlug: string; toSlug: string; totalCents: number; status: string }
export interface PaymentFact extends Fact { billId: string; amountCents: number }
export interface PayrollRunFact extends Fact { companySlug: string; periodStart: string; periodEnd: string; people: number }

export interface World {
  companies: Record<string, CompanyFact>
  jobs: JobFact[]
  submissions: SubmissionFact[]
  awards: AwardFact[]
  contracts: ContractFact[]
  weeks: WeekFact[]
  expenses: ExpenseFact[]
  bills: BillFact[]
  receipts: ReceiptFact[]
  payments: PaymentFact[]
  payrollRuns: PayrollRunFact[]
  /** Who is on whose bench, with whose consent (supply's stations write it, `benchOf`). */
  bench: BenchFact[]
}

export function emptyWorld(): World {
  return {
    companies: {}, jobs: [], submissions: [], awards: [], contracts: [], weeks: [],
    expenses: [], bills: [], receipts: [], payments: [], payrollRuns: [], bench: [],
  }
}

// ── What a stage is handed ─────────────────────────────────────────────

export interface Options {
  /** How many placements the run aims for. Default 50. */
  placements: number
  /** How many weeks each placement works. Default 12. */
  weeks: number
  /** How many calls run at once inside `parallel`. Default 20. */
  concurrency: number
  /** Only these stages run; empty means all. */
  only: string[]
}

export interface Ctx {
  cast: Cast
  world: World
  ledger: Ledger
  options: Options
  /** Read-only connection to the copied world. Any write is refused by the database. */
  read: PrismaClient
  /** The app under test, e.g. http://localhost:3412. */
  base: string
  /** Run `items` through `fn`, at most `n` at a time (default: the run's concurrency). Never throws: a failure is the item's result. */
  parallel<T, R>(items: T[], fn: (item: T, i: number) => Promise<R>, n?: number): Promise<Settled<R>[]>
  /**
   * Assert that a rule says no. `call` is made as usual, but marked
   * expected so it is not counted as a lesson; the report shows whether
   * the refusal came and whether its sentence carried `phrase`.
   */
  expectRefusal(seat: Actor, call: (a: Actor) => Promise<Res>, phrase: string | RegExp): Promise<Res>
  /** A line in the run's console, prefixed with the stage. */
  log(line: string): void
}

export type Settled<R> = { ok: true; value: R } | { ok: false; error: string }

export interface StageResult {
  /** How many things this station closed this run. */
  closed: number
  /** Out of how many it tried. */
  of?: number
  /** One plain sentence for the report. */
  says?: string
  /**
   * A table of the station's own, as markdown lines: the header row, the
   * divider, then one line per row. Printed in the report under the
   * station's name, so a station that counts things (papers by kind,
   * bytes stored) puts them in the one report rather than a file beside it.
   */
  table?: string[]
}

export interface Stage {
  name: string
  domain: DomainKey
  /** False for a stub: the report says "not built yet" and names the owner. */
  built: boolean
  run(ctx: Ctx): Promise<StageResult | void>
}

export function defineStage(s: Omit<Stage, 'built'> & { built?: boolean }): Stage {
  return { built: true, ...s }
}

/** A station nobody has built yet. The run passes through it and the report names the owner. */
export function stub(name: string, domain: DomainKey): Stage {
  return {
    name, domain, built: false,
    async run(ctx) {
      ctx.log(`not built yet — ${domain.toLowerCase()} owns this station`)
      return { closed: 0, says: `Not built yet. Owned by ${domain.toLowerCase()}.` }
    },
  }
}

/** The order of the trade, from a job to a paid week. */
export const STAGE_ORDER = [
  'post-jobs', 'approve-jobs', 'send-to-suppliers', 'bench-and-consent', 'submit', 'documents', 'match',
  'interview', 'award', 'contracts', 'paperwork-and-start', 'extend', 'file-weeks', 'sign-weeks',
  'accept-down-the-chain', 'expenses', 'bills', 'invoice-receipts', 'three-way-check', 'pay',
  'payroll',
  // The notices between parties, read as the handoffs (conversation).
  'handoffs',
] as const
export type StageName = (typeof STAGE_ORDER)[number]

// ── Helpers ────────────────────────────────────────────────────────────

/** At most `n` at a time, in order of `items`; every result settled. */
export async function parallel<T, R>(items: T[], fn: (item: T, i: number) => Promise<R>, n: number): Promise<Settled<R>[]> {
  const out: Settled<R>[] = new Array(items.length)
  let next = 0
  const width = Math.max(1, Math.min(n, items.length))
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < items.length) {
        const i = next++
        try {
          out[i] = { ok: true, value: await fn(items[i], i) }
        } catch (e: any) {
          out[i] = { ok: false, error: String(e?.message ?? e) }
        }
      }
    })
  )
  return out
}

/**
 * The refusals inside a batch answer, or null where the answer is not a
 * batch. `POST /api/submissions` answers 200 for the call and says, per
 * person, which were refused and why (`data.results[i].error`), so a rule
 * that held for every person in it is a refusal, said item by item.
 * Pure. Held only where every item was refused with a sentence: one
 * person through is the rule not holding for that call.
 */
export function batchRefusal(json: unknown): { allRefused: boolean; sentences: string[] } | null {
  const body = json as { data?: { results?: unknown }; results?: unknown } | null
  const results = body?.data?.results ?? body?.results
  if (!Array.isArray(results) || results.length === 0) return null
  const sentences = results
    .map((r: any) => (r && typeof r.error === 'string' && r.status !== 'created' ? r.error : null))
  return {
    allRefused: sentences.every((x) => x !== null),
    sentences: sentences.filter((x): x is string => x !== null),
  }
}

export async function expectRefusalOn(
  ledger: Ledger, seat: Actor, call: (a: Actor) => Promise<Res>, phrase: string | RegExp
): Promise<Res> {
  const res = await expecting.run({ expected: true }, () => call(seat))
  const last = [...ledger.calls].reverse().find((c) => c.seat === seat.key && c.expected)
  const batch = res.ok ? batchRefusal(res.json) : null
  const says = (x: string) => (typeof phrase === 'string' ? x.includes(phrase) : phrase.test(x))
  let sentence = res.sentence ?? null
  let refused = res.status >= 400 && res.status < 500
  let carries = sentence != null && says(sentence)
  if (batch) {
    // Refused person by person inside a 200: the sentence is the one that
    // carries the expected words, else the first.
    refused = batch.allRefused
    sentence = batch.sentences.find(says) ?? batch.sentences[0] ?? null
    carries = batch.sentences.length > 0 && batch.sentences.every(says)
  }
  ledger.expectations.push({
    stage: ledger.stage, seat: seat.key, route: last ? `${last.method} ${last.route}` : '(no call made)',
    phrase: String(phrase), status: res.status, sentence, held: refused && carries,
    ...(batch ? { perItem: true } : {}),
  })
  return res
}
