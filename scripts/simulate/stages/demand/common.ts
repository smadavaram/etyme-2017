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
import type { Ctx, JobFact } from '../../stage'

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
