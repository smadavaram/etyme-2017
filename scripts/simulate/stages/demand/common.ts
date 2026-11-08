/**
 * What the demand stations share: which jobs are in play, which seat a
 * person sits at, how well a person's skills fit a job, and a tally of
 * the sentences a batch route says inside a 200.
 *
 * Read-only, like every station's reads: these answer what a person at
 * a seat would already know (their own approvals queue, their own
 * bench, who their firm employs). Nothing here writes.
 */
import type { Actor, Res } from '../../actors'
import type { Ctx, JobFact, World } from '../../stage'

/** A client's seat for a role, or null where nobody sits there. */
export function clientSeat(ctx: Ctx, slug: string, ...roles: Array<'programme' | 'hiring' | 'procurement' | 'hr' | 'vp' | 'ap' | 'owner'>): Actor | null {
  for (const d of roles) {
    const a = ctx.cast.at(slug, d)
    if (a) return a
  }
  return null
}

/**
 * The seat a named person sits at, at a firm. A firm seat is preferred
 * over a person's own seat, because an approval is given at work.
 */
export function seatOfPerson(ctx: Ctx, personId: string, companyId?: string): Actor | null {
  const specs = ctx.cast.seats.filter((s) => s.personId === personId && (!companyId || s.company?.id === companyId))
  const firm = specs.find((s) => !s.key.startsWith('person/') && !s.key.startsWith('worker/') && s.key.split('/').length === 2)
  const any = firm ?? specs.find((s) => !s.key.startsWith('person/') && !s.key.startsWith('worker/')) ?? specs[0]
  return any ? ctx.cast.seat(any.key) : null
}

/** How many of a job's skills a person has, case and spacing aside. */
export function skillFit(jobSkills: string[], personSkills: string[] | null | undefined): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const have = new Set((personSkills ?? []).map(norm))
  return jobSkills.reduce((n, s) => n + (have.has(norm(s)) ? 1 : 0), 0)
}

/**
 * The jobs this station works on. The run's own where earlier stations
 * made them; otherwise the published jobs of the seeded clients that
 * seat a hiring manager, brought into the run's world so the stations
 * after this one start from the same facts.
 */
export async function jobsInPlay(ctx: Ctx, want: 'OPEN' | 'WAITING'): Promise<JobFact[]> {
  if (ctx.world.jobs.length > 0) {
    return ctx.world.jobs.filter((j) =>
      want === 'OPEN' ? j.status === 'OPEN' : j.approvalState === 'PENDING_APPROVAL'
    )
  }
  const clients = Object.values(ctx.world.companies).filter(
    (c) => c.kind === 'CLIENT' && c.seats.includes(`${c.slug}/hiring`)
  )
  const rows = await ctx.read.requirement.findMany({
    where: {
      companyId: { in: clients.map((c) => c.id) },
      payerCompanyId: null,
      ...(want === 'OPEN'
        ? { status: 'OPEN', approvalState: { in: ['APPROVED', 'AUTO_APPROVED'] } }
        : { approvalState: 'PENDING_APPROVAL' }),
    },
    select: { id: true, companyId: true, title: true, skills: true, billMin: true, billMax: true, status: true, approvalState: true },
    orderBy: { createdAt: 'asc' },
  })
  const bySlug = new Map(clients.map((c) => [c.id, c.slug]))
  const jobs: JobFact[] = rows.map((r) => ({
    id: r.id, by: 'seed', clientSlug: bySlug.get(r.companyId)!, title: r.title, skills: r.skills,
    billMin: r.billMin, billMax: r.billMax, status: r.status, approvalState: r.approvalState,
    extra: { fromSeed: true },
  }))
  ctx.world.jobs.push(...jobs)
  ctx.log(`no jobs from earlier stations; working on ${jobs.length} from the seeded world`)
  return jobs
}

/** Sentences said inside a 200 (a batch route answers per item), counted. */
export class Said {
  private readonly counts = new Map<string, number>()
  add(sentence: string | null | undefined): void {
    const s = (sentence ?? '(no sentence)').trim()
    this.counts.set(s, (this.counts.get(s) ?? 0) + 1)
  }
  get size(): number { return this.counts.size }
  /** "3× "sentence"; 1× "other"", the commonest first. */
  toString(limit = 6): string {
    return [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([s, n]) => `${n}× "${s}"`)
      .join('; ')
  }
  lines(): string[] {
    return [...this.counts.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${n}× ${s}`)
  }
}

/** A refusal's sentence or the status, for the console. */
export function said(res: Res): string {
  return res.sentence ?? `status ${res.status}`
}

/** Midnight UTC of the Sunday that starts the week `weeksAgo` weeks before this one. */
export function sundayWeeksAgo(weeksAgo: number, now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - 7 * weeksAgo)
  return d
}

/** The seat a supplier puts people forward from: its recruiting team, else its owner; a delivery manager for its own employees. */
export function supplierSeat(ctx: Ctx, slug: string, internal = false): Actor | null {
  for (const d of ['recruiter', 'account', 'resourcing', 'owner'] as const) {
    const a = ctx.cast.at(slug, d)
    if (a) return a
  }
  return internal ? ctx.cast.at(slug, 'delivery') : null
}

/**
 * A worker's own seat where the world gives them one, else null: a seat
 * the run opened with (a named door, a consultant or contract at a
 * seeded firm, a role at their employer), or a seat an earlier station
 * gave them (a consultant added to a bench holds one at that firm). A
 * person who is only a profile on somebody's bench holds no seat, and
 * the doors under /api/me refuse them (see `seatlessWorker`).
 */
export async function workerSeat(ctx: Ctx, email: string | null | undefined, personId?: string): Promise<Actor | null> {
  if (!email) return null
  const spec = ctx.cast.seats.find(
    (s) => (s.key.startsWith('person/') || s.key.startsWith('worker/') || s.key.startsWith('staff/')) && s.email === email
  )
  if (spec) return ctx.cast.seat(spec.key)
  if (!personId) return null
  const seated = await ctx.read.context.count({ where: { personId, revokedAt: null, suspendedAt: null } })
  return seated > 0 ? seatlessWorker(ctx, email) : null
}

/** The same person's session with no seat behind it: the door's answer to a profile-only candidate. */
export function seatlessWorker(ctx: Ctx, email: string | null | undefined): Actor | null {
  if (!email) return null
  try {
    return ctx.cast.worker(email)
  } catch {
    return null
  }
}

// ── The chain: a bench vendor's person, through a sub-vendor and a prime, to the client ──
//
// The founder, 2026-11-08: "Do bottom up down testing for 1000 jobs and
// 20 hires go through multiple levels." So at least `--chain-hires`
// awards (20) walk four rungs, both ways:
//   - top down: the client sends its job to a prime (send-to-suppliers'
//     own release); the prime writes its own record of the job and sends
//     it down to a sub-vendor it buys from; the sub-vendor does the same
//     to a bench vendor it buys from. Every send is the release route
//     (`POST /api/requisitions/[id]/distribute`), which `who-sends.ts`
//     governs at a firm that sells: the account manager or the owner.
//   - bottom up: the bench vendor puts forward a person who said yes to
//     it (a granted, marketed listing), the sub-vendor sends them on to
//     the prime, the prime sends them on to the client
//     (`POST /api/submissions/[id]/forward`), and the client awards.
//     Then the prime awards the sub-vendor's submission on its own
//     record, and the sub-vendor the bench vendor's, so every rung's buy
//     line is written: the bench vendor employs, the sub-vendor pays it,
//     the prime pays the sub-vendor, the client pays the prime.
//
// A chain is only ever made of links the world already holds: an active
// trade tie between each pair, from the register. Where the world holds
// fewer chains than asked for, the run walks the ones it has and says so;
// it never invents a link.

/** The twenty the founder asked for, unless the run said otherwise (`ctx.flags.chainHires`). */
export const CHAIN_HIRES_DEFAULT = 20

/** How many awards the run should walk through four rungs. */
export function chainHiresWanted(ctx: Ctx): number {
  const flags = (ctx as Ctx & { flags?: { chainHires?: unknown } }).flags
  const n = flags?.chainHires ?? (ctx.options as { chainHires?: unknown }).chainHires
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : CHAIN_HIRES_DEFAULT
}

/** One firm on the chain, as the stations need it. */
export interface ChainFirm { id: string; slug: string; name: string }

/** One four-rung chain on one job, filled in as the stations walk it. */
export interface ChainPlan {
  jobId: string
  client: ChainFirm
  prime: ChainFirm
  sub: ChainFirm
  bench: ChainFirm
  /** The prime's own record of the client's job, which it sends down. */
  primeJobId?: string
  /** The sub-vendor's own record of the prime's job, which it sends down. */
  subJobId?: string
  /** The person, chosen at submit from the bench vendor's own bench. */
  personId?: string
  personName?: string
  email?: string
  /** Bench vendor → sub-vendor, sub-vendor → prime, prime → client. */
  benchSubmissionId?: string
  subSubmissionId?: string
  topSubmissionId?: string
  /** Where it stopped, in a sentence, if it stopped. */
  stopped?: string
}

/** The chain a job carries, where send-to-suppliers chose one for it. */
export function chainOf(job: { extra?: Record<string, unknown> }): ChainPlan | null {
  const c = job.extra?.chain
  return c && typeof c === 'object' ? (c as ChainPlan) : null
}

/** "Talvern Medical ← Brightmoor ← Techpeple ← Halcyon Bench", read from the client down. */
export function chainWords(c: Pick<ChainPlan, 'client' | 'prime' | 'sub' | 'bench'>): string {
  return [c.client, c.prime, c.sub, c.bench].map((f) => f.name).join(' ← ')
}

/** Who sells to whom: one row per active trade tie, the seller first. */
export interface SellsTo { seller: string; buyer: string }

/**
 * The register read as "who sells to whom". A supplier's row names the
 * firm above it as its CLIENT or its PRIME; the buyer's row names the
 * seller as its SUPPLIER. Either side is enough, and a pair said both
 * ways is one tie. Pure.
 */
export function sellsToFrom(rows: Array<{ companyId: string; otherCompanyId: string; relationship: string; status?: string | null }>): SellsTo[] {
  const seen = new Set<string>()
  const out: SellsTo[] = []
  for (const r of rows) {
    if (r.status && r.status !== 'ACTIVE') continue
    const tie =
      r.relationship === 'CLIENT' || r.relationship === 'PRIME'
        ? { seller: r.companyId, buyer: r.otherCompanyId }
        : r.relationship === 'SUPPLIER'
          ? { seller: r.otherCompanyId, buyer: r.companyId }
          : null
    if (!tie || tie.seller === tie.buyer) continue
    const k = `${tie.seller}|${tie.buyer}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(tie)
  }
  return out
}

/** A firm that sells: the only kinds that may stand between a person and a client. */
const SELLS = new Set(['VENDOR', 'GSI'])

export interface ChainJob { id: string; clientId: string; skills: string[]; invited: string[] }
export interface ChainFirmFacts extends ChainFirm { kind: string }

/**
 * The four-rung chains to walk, at most one per job, at most `want`.
 *
 * For each job in order: a prime the client sent the job to; a firm that
 * sells to that prime; a firm that sells to that sub-vendor and holds at
 * least one person free on its bench. The four are four different firms,
 * and none of the three below the client is a client or an MSP. Among
 * the chains a job could take, the one whose bench fits the job's skills
 * best, then the one whose firms have walked the fewest chains so far, so
 * twenty chains are not twenty times the same three firms. Pure and
 * deterministic: the same world picks the same chains.
 */
export function pickChains(input: {
  jobs: ChainJob[]
  ties: SellsTo[]
  firms: Map<string, ChainFirmFacts>
  /** Skills of the people free on each firm's bench, by firm id. */
  benchSkills: Map<string, string[][]>
  want: number
}): Array<Pick<ChainPlan, 'jobId' | 'client' | 'prime' | 'sub' | 'bench'>> {
  const sellersTo = new Map<string, string[]>()
  for (const t of input.ties) sellersTo.set(t.buyer, [...(sellersTo.get(t.buyer) ?? []), t.seller])
  for (const list of sellersTo.values()) list.sort()
  const sells = (id: string) => SELLS.has(input.firms.get(id)?.kind ?? '')
  const used = new Map<string, number>()
  const out: Array<Pick<ChainPlan, 'jobId' | 'client' | 'prime' | 'sub' | 'bench'>> = []
  const firm = (id: string): ChainFirm => {
    const f = input.firms.get(id)!
    return { id: f.id, slug: f.slug, name: f.name }
  }
  for (const job of input.jobs) {
    if (out.length >= input.want) break
    const client = input.firms.get(job.clientId)
    if (!client) continue
    let best: { p: string; s: string; b: string; fit: number; worn: number } | null = null
    for (const p of [...new Set(job.invited)].sort()) {
      if (p === job.clientId || !sells(p)) continue
      for (const s of sellersTo.get(p) ?? []) {
        if (s === job.clientId || s === p || !sells(s)) continue
        for (const b of sellersTo.get(s) ?? []) {
          if (b === job.clientId || b === p || b === s || !sells(b)) continue
          const bench = input.benchSkills.get(b) ?? []
          if (bench.length === 0) continue
          const fit = Math.max(...bench.map((k) => skillFit(job.skills, k)))
          const worn = (used.get(p) ?? 0) + (used.get(s) ?? 0) + (used.get(b) ?? 0)
          if (!best || fit > best.fit || (fit === best.fit && worn < best.worn)) best = { p, s, b, fit, worn }
        }
      }
    }
    if (!best) continue
    for (const id of [best.p, best.s, best.b]) used.set(id, (used.get(id) ?? 0) + 1)
    out.push({ jobId: job.id, client: firm(job.clientId), prime: firm(best.p), sub: firm(best.s), bench: firm(best.b) })
  }
  return out
}

/** The seat at a firm that sells which sends a job down and awards onto its own record: the account manager, else the owner. */
export function sellerDesk(ctx: Ctx, slug: string): Actor | null {
  return ctx.cast.at(slug, 'account') ?? ctx.cast.at(slug, 'owner')
}

/** A band a rung offers the rung below, in whole dollars of cents: a share of its own. */
export function bandBelow(min: number | null, max: number | null, share: number): { payMin: number | null; payMax: number | null } {
  const at = (x: number | null) => (x == null ? null : Math.max(100, Math.round((x * share) / 100) * 100))
  return { payMin: at(min), payMax: at(max) }
}

// ── Rungs walked ───────────────────────────────────────────────────────

/**
 * How many rungs an award walked: every firm on the chain of submissions
 * under it, the client included. A supplier's person put straight in
 * front of the client is two rungs (the supplier and the client); a
 * prime sending on a sub-vendor's person is three; a bench vendor's
 * person through a sub-vendor and a prime to the client is four. Pure:
 * `parentOf` is the chain read off the record (submission → the one it
 * was sent on from).
 */
export function rungsWalked(submissionId: string, parentOf: Map<string, string | null>): number {
  let firms = 2
  let at = parentOf.get(submissionId) ?? null
  const seen = new Set([submissionId])
  while (at && !seen.has(at)) {
    seen.add(at)
    firms++
    at = parentOf.get(at) ?? null
  }
  return firms
}

/** Every award's chain of submissions, read in one batch per hop, for `rungsWalked`. */
export async function parentsOf(ctx: Ctx, submissionIds: string[]): Promise<Map<string, string | null>> {
  const parentOf = new Map<string, string | null>()
  let ask = [...new Set(submissionIds)]
  for (let hop = 0; hop < 8 && ask.length > 0; hop++) {
    const rows = await ctx.read.submission.findMany({ where: { id: { in: ask } }, select: { id: true, parentSubmissionId: true } })
    for (const r of rows) parentOf.set(r.id, r.parentSubmissionId)
    ask = rows.map((r) => r.parentSubmissionId).filter((x): x is string => !!x && !parentOf.has(x))
  }
  return parentOf
}

export type RungBucket = '1' | '2' | '3' | '4+'

/**
 * The run's awards counted by the rungs each walked, and the four-rung
 * ones named ("Ravi Kumar for Data engineer at Northbend Athletic
 * (Northbend Athletic ← Brightmoor ← Techpeple ← Tapin)"), for the
 * report (scripts/simulate/tallies.ts). An award with no `rungs` on it
 * was not counted and is left out, never read as one rung. Pure.
 */
export function awardsByRungs(world: World): { byRungs: Record<RungBucket, number>; chain: string[]; uncounted: number } {
  const byRungs: Record<RungBucket, number> = { '1': 0, '2': 0, '3': 0, '4+': 0 }
  const chain: string[] = []
  let uncounted = 0
  for (const a of world.awards) {
    const n = a.extra?.rungs
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      uncounted++
      continue
    }
    const b: RungBucket = n >= 4 ? '4+' : n <= 1 ? '1' : (String(n) as RungBucket)
    byRungs[b]++
    if (b === '4+') {
      const who = String(a.extra?.personName ?? 'Somebody')
      const job = typeof a.extra?.jobTitle === 'string' ? ` for ${a.extra.jobTitle}` : ''
      const path = typeof a.extra?.chainWords === 'string' ? ` (${a.extra.chainWords})` : ''
      chain.push(`${who}${job}${path}`)
    }
  }
  return { byRungs, chain, uncounted }
}
