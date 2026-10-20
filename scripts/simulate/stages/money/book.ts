/**
 * What the money stations share: the placements they work on, the seats
 * that act on them, and the arithmetic a person at each seat would do in
 * their head before pressing a button.
 *
 * Not a station. Every station in this folder reads the same answer from
 * here, so file-weeks, sign-weeks and bills agree on which rung is the
 * worker's, who signs first and who pays whom.
 *
 * ── Where the placements come from ───────────────────────────────────
 *
 * Contracts the run's own awards wrote come first (`ctx.world.awards`),
 * then the seeded world's live placements. The app has no clock
 * override, so a placement awarded today starts in the future and has no
 * past week a worker could file; the seeded placements are the ones with
 * weeks behind them, and they are where the load is. Every fact is read
 * through `ctx.read`, the read-only connection: what a person at the
 * seat would already know (their own contract, their own filed weeks,
 * their firm's agreement). Nothing here writes.
 *
 * ── The ladder ───────────────────────────────────────────────────────
 *
 * A worker files once, on the rung of the firm that employs them (the
 * bottom). Each rung above bills the same week at its own rate. A rung's
 * parent is the sell line whose buy line names it as the supplier's own
 * contract (`BuyContract.supplierSellContractId`), else the same
 * person's line sold by the firm that bought this one.
 */
import type { Ctx, World } from '../../stage'
import type { Actor, SeatSpec, Res } from '../../actors'
import { DEMO_COOKIE, sign } from '@/lib/demo-session'
import { performance } from 'node:perf_hooks'

export const DAY = 86_400_000

// ── Dates, in UTC days ────────────────────────────────────────────────

export function iso(ms: number | Date): string {
  return new Date(typeof ms === 'number' ? ms : ms.getTime()).toISOString().slice(0, 10)
}
export function dayMs(isoDay: string): number {
  const [y, m, d] = isoDay.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export function todayIso(): string {
  return iso(Date.now())
}
/** The Sunday on or before a day: a week runs Sunday to Saturday. */
export function sundayOf(isoDay: string): string {
  const t = dayMs(isoDay)
  return iso(t - new Date(t).getUTCDay() * DAY)
}
export function addDays(isoDay: string, n: number): string {
  return iso(dayMs(isoDay) + n * DAY)
}

/** Cents as dollars, for a sentence in the report. Two currencies are never added here: every placement in the seed bills in USD, and a total says which. */
export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
/** A whole-currency Decimal (Invoice.total, Expense.total) as integer cents. */
export function centsOf(whole: unknown): number {
  return Math.round(Number(whole) * 100)
}

// ── Placements ────────────────────────────────────────────────────────

export interface Rung {
  sellId: string
  sellerId: string
  sellerSlug: string
  sellerName: string
  buyerId: string
  buyerSlug: string
  buyerName: string
  /** The site where the work is, where it differs from the buyer. */
  endClientId: string | null
  engagementId: string | null
  workOrderId: string | null
  billRate: number
  billCurrency: string
  state: string
  startDate: string
  endDate: string | null
}

export interface Placement {
  /** The bottom rung's sell line id: where the worker files. */
  id: string
  personId: string
  personName: string
  email: string
  /** Top first; the last is the worker's employer's rung. */
  ladder: Rung[]
  bottom: Rung
  /** Who signs first: the end client on the top rung. */
  clientId: string
  clientSlug: string
  /** The employer's W2 pay line, where it pays the worker by payroll. */
  w2BuyId: string | null
  /** The role's hours, which a week is flagged against. */
  hoursPerWeek: number | null
  /** Where the placement came from. */
  source: 'AWARD' | 'SEED'
}

interface Built {
  placements: Placement[]
  /** Every rung read, for the contracts station. */
  all: Map<string, Rung>
  /** Karthik Menon's case and its like: a bottom rung that has ended with signed weeks nobody billed. */
  endedUnbilled: Placement[]
  /** Workers on a live placement who hold no seat anywhere, so the server refuses them at every door. */
  unseated: string[]
  /** Live placements in the world, before the run's cap. */
  live: number
}

const built = new WeakMap<World, Promise<Built>>()

/** The placements this run works on, read once per run. */
export function placementsOf(ctx: Ctx): Promise<Built> {
  let p = built.get(ctx.world)
  if (!p) {
    p = build(ctx)
    built.set(ctx.world, p)
  }
  return p
}

async function build(ctx: Ctx): Promise<Built> {
  const db = ctx.read
  const sells = await db.sellContract.findMany({
    where: { company: { slug: { startsWith: 'world-' } }, state: { in: ['IN_PROGRESS', 'ENDED'] } },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true, endClientCompanyId: true,
      engagementId: true, workOrderId: true, billRate: true, billCurrency: true, state: true,
      startDate: true, endDate: true, requirementId: true,
      requirement: { select: { hoursPerWeek: true } },
      person: { select: { name: true, primaryEmail: true } },
      company: { select: { slug: true, name: true } },
      clientCompany: { select: { slug: true, name: true } },
      endClientCompany: { select: { slug: true } },
    },
  })
  const buys = await db.buyContract.findMany({
    where: { company: { slug: { startsWith: 'world-' } } },
    select: {
      id: true, companyId: true, vendorCompanyId: true, contractType: true, supplierSellContractId: true,
      sellLinks: { select: { sellContractId: true } },
      candidates: { select: { personId: true } },
    },
  })

  const all = new Map<string, Rung>()
  for (const s of sells) {
    all.set(s.id, {
      sellId: s.id, sellerId: s.companyId, sellerSlug: s.company.slug, sellerName: s.company.name,
      buyerId: s.clientCompanyId, buyerSlug: s.clientCompany.slug, buyerName: s.clientCompany.name,
      endClientId: s.endClientCompanyId, engagementId: s.engagementId, workOrderId: s.workOrderId,
      billRate: s.billRate, billCurrency: s.billCurrency, state: s.state,
      startDate: iso(s.startDate), endDate: s.endDate ? iso(s.endDate) : null,
    })
  }

  // A rung's parent: the line whose buy line names this one as the supplier's.
  const parentOf = new Map<string, string>()
  for (const b of buys) {
    if (!b.supplierSellContractId) continue
    for (const l of b.sellLinks) parentOf.set(b.supplierSellContractId, l.sellContractId)
  }
  const byPerson = new Map<string, typeof sells>()
  for (const s of sells) {
    const list = byPerson.get(s.personId) ?? []
    list.push(s)
    byPerson.set(s.personId, list)
  }
  for (const s of sells) {
    if (parentOf.has(s.id)) continue
    const up = (byPerson.get(s.personId) ?? []).find(
      (o) => o.id !== s.id && o.companyId === s.clientCompanyId && o.state === s.state
    )
    if (up) parentOf.set(s.id, up.id)
  }
  const parents = new Set(parentOf.values())

  // The W2 pay line behind a bottom rung: the employer's own buy line,
  // no supplier, linked to that rung, with this person on it.
  const w2Of = new Map<string, string>()
  for (const b of buys) {
    if (b.contractType !== 'W2' || b.vendorCompanyId) continue
    for (const l of b.sellLinks) w2Of.set(l.sellContractId, b.id)
  }

  const toPlacement = (s: (typeof sells)[number], source: Placement['source']): Placement => {
    const ladder: Rung[] = [all.get(s.id)!]
    let at = s.id
    for (let guard = 0; guard < 8 && parentOf.has(at); guard++) {
      at = parentOf.get(at)!
      ladder.unshift(all.get(at)!)
    }
    const top = ladder[0]
    const client = sells.find((x) => x.id === top.sellId)!
    return {
      id: s.id,
      personId: s.personId,
      personName: s.person.name,
      email: s.person.primaryEmail,
      ladder,
      bottom: ladder[ladder.length - 1],
      clientId: top.endClientId ?? top.buyerId,
      clientSlug: client.endClientCompany?.slug ?? client.clientCompany.slug,
      w2BuyId: w2Of.get(s.id) ?? null,
      hoursPerWeek: s.requirement?.hoursPerWeek ?? null,
      source,
    }
  }

  // A bottom rung is one no other rung supplies: the worker's employer.
  const bottoms = sells.filter((s) => !parents.has(s.id))

  // Awards first: the lines the run's own awards wrote, where any have weeks behind them.
  const awarded = new Set<string>()
  for (const a of ctx.world.awards) {
    const sub = await db.submission.findUnique({ where: { id: a.submissionId }, select: { personId: true, requirementId: true } })
    if (!sub) continue
    for (const s of sells) if (s.personId === sub.personId && s.requirementId === sub.requirementId) awarded.add(s.id)
  }

  // A worker the server seats at all: somebody with a live seat somewhere.
  // A worker with none is refused at every door before their week is
  // read ("nobody has given you a seat yet"), so their placements go last
  // and are counted, never silently dropped.
  const seatedRows = await db.context.findMany({
    where: { personId: { in: [...new Set(sells.map((s) => s.personId))] }, revokedAt: null },
    select: { personId: true },
  })
  const seated = new Set(seatedRows.map((r) => r.personId))
  const live = bottoms.filter((s) => s.state === 'IN_PROGRESS')
  const ordered = [
    ...live.filter((s) => awarded.has(s.id)).map((s) => toPlacement(s, 'AWARD')),
    // Workers who can sign in first, then the oldest start: the placements with the most past weeks.
    ...live
      .filter((s) => !awarded.has(s.id))
      .sort(
        (a, b) =>
          Number(seated.has(b.personId)) - Number(seated.has(a.personId)) ||
          a.startDate.getTime() - b.startDate.getTime() ||
          a.id.localeCompare(b.id)
      )
      .map((s) => toPlacement(s, 'SEED')),
  ]
  const endedUnbilled = bottoms.filter((s) => s.state === 'ENDED').map((s) => toPlacement(s, 'SEED'))
  const unseated = live.filter((s) => !seated.has(s.personId)).map((s) => s.person.name)
  return { placements: ordered.slice(0, ctx.options.placements), all, endedUnbilled, unseated, live: live.length }
}

// ── Seats ─────────────────────────────────────────────────────────────

const rolePerms = new WeakMap<World, Promise<Map<string, string[]>>>()

async function permsOf(ctx: Ctx): Promise<Map<string, string[]>> {
  let p = rolePerms.get(ctx.world)
  if (!p) {
    p = ctx.read.role
      .findMany({ where: { company: { slug: { startsWith: 'world-' } } }, select: { companyId: true, name: true, permissions: true } })
      .then((rows) => new Map(rows.map((r) => [`${r.companyId}/${r.name}`, r.permissions])))
    rolePerms.set(ctx.world, p)
  }
  return p
}

/**
 * The seat at a firm that does this job: one whose role holds the
 * permission, a named role before the Owner (the Owner holds everything
 * and is the last person a firm asks), and never somebody in `avoid`
 * (the worker, or whoever made the thing being decided).
 */
export async function seatWith(ctx: Ctx, companyId: string, permission: string, avoid: string[] = []): Promise<Actor | null> {
  const perms = await permsOf(ctx)
  const holds = (s: SeatSpec) => {
    const p = perms.get(`${companyId}/${s.role}`) ?? []
    return p.includes('*') || p.includes(permission)
  }
  const at = ctx.cast.seats.filter((s) => s.company?.id === companyId && !s.key.startsWith('worker/') && !avoid.includes(s.personId) && holds(s))
  const ranked = [...at].sort((a, b) => rank(a, perms, companyId) - rank(b, perms, companyId) || a.key.localeCompare(b.key))
  return ranked.length ? ctx.cast.seat(ranked[0].key) : null
}

function rank(s: SeatSpec, perms: Map<string, string[]>, companyId: string): number {
  const p = perms.get(`${companyId}/${s.role}`) ?? []
  if (p.includes('*')) return 3
  if (s.key.startsWith('staff/') || s.key.startsWith('person/')) return 2
  return 1
}

/** The worker's own seat. */
export function workerSeat(ctx: Ctx, p: Placement): Actor | null {
  try {
    return ctx.cast.worker(p.email)
  } catch {
    return null
  }
}

/**
 * A form posted as a seat, for the one door that takes a file
 * (`POST /api/week-approvals` with evidence). The actors send JSON only,
 * so this signs the same session the demo door sets for that person
 * (`sign` in lib/demo-session) and puts the call on the run's ledger like
 * any other.
 */
export async function postForm(ctx: Ctx, seat: Actor, path: string, form: FormData): Promise<Res> {
  const started = new Date()
  const t0 = performance.now()
  let status = 0
  let json: any = null
  let sentence: string | null = null
  try {
    const res = await fetch(ctx.base + path, {
      method: 'POST',
      headers: { accept: 'application/json', cookie: `${DEMO_COOKIE}=${sign(seat.spec.email)}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
    status = res.status
    const text = await res.text()
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text.slice(0, 500) }
    }
  } catch (e: any) {
    sentence = `The server did not answer: ${String(e?.message ?? e)}`
  }
  const ms = Math.round(performance.now() - t0)
  const ok = status >= 200 && status < 300
  if (!ok && !sentence) {
    const err = json?.error
    sentence = typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : null
  }
  ctx.ledger.record({ at: started.toISOString(), seat: seat.key, method: 'POST', path, status, ms, ...(sentence ? { sentence } : {}) })
  return { status, json, ms, ok, sentence }
}

// ── The weeks a worker can still file ─────────────────────────────────

/**
 * Whole Sunday-to-Saturday weeks on this placement that have happened,
 * sit inside it, and no week on file covers, newest first.
 */
export async function openWeeksOf(ctx: Ctx, p: Placement, n: number): Promise<string[]> {
  const filed = await ctx.read.timesheet.findMany({
    where: { sellContractId: p.id },
    select: { periodStart: true, periodEnd: true },
  })
  const taken = filed.map((f) => [dayMs(iso(f.periodStart)), dayMs(iso(f.periodEnd))] as const)
  const start = dayMs(p.bottom.startDate)
  const end = p.bottom.endDate ? dayMs(p.bottom.endDate) : Infinity
  const today = dayMs(todayIso())
  const out: string[] = []
  // The last whole week is the one whose Saturday is before today.
  let sun = dayMs(sundayOf(todayIso())) - 7 * DAY
  while (out.length < n && sun >= start) {
    const sat = sun + 6 * DAY
    const inside = sun >= start && sat <= end && sat < today
    const free = !taken.some(([a, b]) => a <= sat && b >= sun)
    if (inside && free) out.push(iso(sun))
    sun -= 7 * DAY
  }
  return out
}

/** Facts this folder keeps on a week, beside the harness's own. */
export interface WeekExtra {
  placementId: string
  periodEnd: string
  variant: 'PLAIN' | 'OVER' | 'FORTY_FOUR' | 'WEEKEND'
  days: Record<string, number>
  /** Over the role's hours, so the signer gives a reason. */
  flagged: boolean
  /** Left unsigned on purpose: what a bill and a receipt are refused on. */
  unsigned?: boolean
  /** Signed by evidence of an approval given by email, naming the approver. */
  byEmail?: string
  /** Hours each firm accepted, by company id. */
  accepted?: Record<string, number>
  /** Who signed it at the top. */
  clientSignedBy?: string
}

export function weekExtra(w: { extra?: Record<string, unknown> }): WeekExtra {
  return w.extra as unknown as WeekExtra
}

/** A tally that prints itself. */
export function says(parts: (string | null | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Placements whose sub-vendor sends its invoice by email rather than
 * raising it here: every other chain. The firm above keys that invoice
 * in as a receipt, line by line; the sub-vendor raises nothing on the
 * platform for those weeks, because one week is billed once.
 */
export function keyedByEmail(placements: Placement[], p: Placement): boolean {
  if (p.ladder.length < 2) return false
  const chains = placements.filter((x) => x.ladder.length >= 2)
  return chains.indexOf(p) % 2 === 1
}

/** Whether the firm that pays a rung has signed or accepted this week, so the rung may bill it. */
export function payerSigned(p: Placement, rungIndex: number, x: WeekExtra): boolean {
  if (rungIndex === 0) return Boolean(x.clientSignedBy)
  return x.accepted?.[p.ladder[rungIndex].buyerId] != null
}
